import type {
	ApiCredentials,
	ApiPage,
	HttpMethod,
	N8nHttpHelper,
	QueryValue,
	Transport,
	TransportRequest,
} from './Types';

/**
 * Typed error for every non-2xx (or non-JSON / network) response from the
 * orboto API.
 *
 * orboto error bodies come in two shapes; both are mapped onto this class:
 *
 * 1. Domain errors:
 *    `{"error": "Ticket not found", "errorKey": "errors.tickets.not_found"}`
 *    optionally with
 *    `{"errorParams": {"field": "title", "detail": "Required"}}`
 *
 * 2. Framework fallback (unknown routes etc.):
 *    `{"message": "Route GET:/x not found", "error": "Not Found", "statusCode": 404}`
 */
export class ApiError extends Error {
	readonly status: number;
	/** Machine-readable error code from `errorKey`, e.g. `errors.tickets.not_found`. Null for framework errors. */
	readonly code: string | null;
	/** Offending field for validation errors (`errorParams.field`). */
	readonly field: string | null;
	/** Extra detail (`errorParams.detail`), when present. */
	readonly detail: string | null;
	/** The raw parsed error body (or the original thrown error for network failures). */
	readonly raw: unknown;

	constructor(options: {
		status: number;
		code: string | null;
		message: string;
		field?: string | null;
		detail?: string | null;
		raw?: unknown;
		cause?: unknown;
	}) {
		const suffix = options.field ? ` (field: ${options.field})` : '';
		super(`[${options.code ?? `http_${options.status}`}] ${options.message}${suffix}`, {
			cause: options.cause,
		});
		this.name = 'ApiError';
		this.status = options.status;
		this.code = options.code;
		this.field = options.field ?? null;
		this.detail = options.detail ?? null;
		this.raw = options.raw ?? null;
	}

	static fromErrorBody(status: number, body: unknown): ApiError {
		const record = (body ?? {}) as Record<string, unknown>;
		const errorKey = typeof record.errorKey === 'string' ? record.errorKey : null;
		const params = (record.errorParams ?? {}) as Record<string, unknown>;
		const field = typeof params.field === 'string' ? params.field : null;
		const detail = typeof params.detail === 'string' ? params.detail : null;
		// Framework fallback bodies carry the informative text in `message`
		// (`error` is just the generic status text there); domain errors only
		// have `error`.
		const message =
			(typeof record.message === 'string' && record.message) ||
			(typeof record.error === 'string' && record.error) ||
			`Request failed with HTTP ${status}`;
		return new ApiError({ status, code: errorKey, message, field, detail, raw: body });
	}

	/** Maps anything a transport throws (n8n helper errors, fetch errors) to an ApiError. */
	static fromTransportError(error: unknown): ApiError {
		if (error instanceof ApiError) return error;
		const record = (error ?? {}) as Record<string, unknown>;
		// n8n's httpRequest attaches the parsed body as `response.body` on thrown
		// errors; plain transports may use `body` or `description` instead.
		const response = (record.response ?? {}) as Record<string, unknown>;
		const body = (response.body ?? record.body ?? record.description) as unknown;
		const explicitStatus = typeof record.statusCode === 'number' ? record.statusCode : undefined;
		const statusCode =
			typeof record.code === 'number' && record.code >= 400 && record.code <= 599
				? record.code
				: undefined;
		const status = explicitStatus ?? statusCode ?? 0;
		if (status > 0 && body && typeof body === 'object') {
			return ApiError.fromErrorBody(status, body);
		}
		if (status > 0) {
			return new ApiError({
				status,
				code: null,
				message: typeof record.message === 'string' ? record.message : `HTTP ${status}`,
				raw: error,
				cause: error,
			});
		}
		const reason = typeof record.message === 'string' ? record.message : String(error);
		return new ApiError({
			status: 0,
			code: 'network_error',
			message: reason,
			raw: error,
			cause: error,
		});
	}

	isAuthError(): boolean {
		return this.status === 401 || this.status === 403;
	}
}

export interface RequestOptions {
	method?: HttpMethod;
	query?: Record<string, QueryValue | undefined | null>;
	body?: unknown;
	headers?: Record<string, string>;
}

export interface PaginateOptions extends RequestOptions {
	/** Maximum total number of items to collect; omit for all. */
	limit?: number;
	/** Server-side page size requested per call (orboto caps at 100). */
	pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

/**
 * Shared REST client for the orboto API.
 *
 * - Auth: `Authorization: Bearer <apiKey>` on every call.
 * - Errors: every failure surfaces as an {@link ApiError}.
 * - Pagination: {@link ApiClient.paginate} follows the `nextCursor`
 *   envelope (`{items, nextCursor}`) until exhausted or `limit` is reached.
 *
 * The HTTP call itself is delegated to an injected {@link Transport}, which
 * keeps this class unit-testable and lets n8n's own HTTP helper handle
 * proxies, custom CAs and timeouts in production (see {@link n8nTransport}).
 */
export class ApiClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly transport: Transport;

	constructor(credentials: ApiCredentials, transport: Transport) {
		if (!credentials?.baseUrl) {
			throw new Error('orboto credentials are missing a baseUrl');
		}
		if (!credentials?.apiKey) {
			throw new Error('orboto credentials are missing an apiKey');
		}
		this.baseUrl = ApiClient.normalizeBaseUrl(credentials.baseUrl);
		this.apiKey = credentials.apiKey;
		this.transport = transport;
	}

	/**
	 * Normalizes a user-entered base URL.
	 *
	 * Accepts both `https://orboto.example.com` and
	 * `https://orboto.example.com/api` (the orboto API is always mounted
	 * under `/api`), trims trailing slashes and whitespace.
	 */
	static normalizeBaseUrl(input: string): string {
		const trimmed = input.trim().replace(/\/+$/, '');
		if (!trimmed) throw new Error('baseUrl must not be empty');
		return /\/api$/.test(trimmed) ? trimmed : `${trimmed}/api`;
	}

	/** Builds the request URL including query string, dropping empty query values. */
	buildUrl(path: string, query?: Record<string, QueryValue | undefined | null>): string {
		const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
		const params = Object.entries(query ?? {}).filter(
			(entry): entry is [string, QueryValue] => entry[1] !== undefined && entry[1] !== null,
		);
		if (params.length === 0) return url;
		const search = new URLSearchParams();
		for (const [key, value] of params) search.append(key, String(value));
		return `${url}?${search.toString()}`;
	}

	/** Performs a single API call and returns the parsed response body. */
	async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
		const request: TransportRequest = {
			method: options.method ?? 'GET',
			url: this.buildUrl(path, options.query),
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${this.apiKey}`,
				...options.headers,
			},
		};
		if (options.body !== undefined) request.body = options.body;

		try {
			return (await this.transport(request)) as T;
		} catch (error) {
			throw ApiError.fromTransportError(error);
		}
	}

	/**
	 * Collects all items from a cursor-paginated list route.
	 *
	 * Follows `nextCursor` until the route reports no further pages, or until
	 * `limit` items have been collected. A cursor that repeats is treated as
	 * a server-side pagination bug and fails loudly instead of looping.
	 */
	async paginate<T = unknown>(path: string, options: PaginateOptions = {}): Promise<T[]> {
		const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
		const maxItems = options.limit ?? Number.POSITIVE_INFINITY;
		const collected: T[] = [];
		const seenCursors = new Set<string>();
		let cursor: string | undefined;

		while (collected.length < maxItems) {
			const remaining = maxItems - collected.length;
			const pageLimit = Math.min(pageSize, remaining);
			const page = await this.request<ApiPage<T>>(path, {
				...options,
				query: { ...options.query, limit: pageLimit, cursor },
			});
			if (!Array.isArray(page?.items)) {
				throw new ApiError({
					status: 200,
					code: 'invalid_response',
					message: `Expected cursor-paginated envelope {items, nextCursor} from ${path}`,
					raw: page,
				});
			}
			collected.push(...page.items.slice(0, remaining));
			if (page.nextCursor === null || page.nextCursor === undefined) break;
			if (seenCursors.has(page.nextCursor)) {
				throw new ApiError({
					status: 200,
					code: 'pagination_loop',
					message: `API returned a repeated cursor while paginating ${path}`,
					raw: page.nextCursor,
				});
			}
			seenCursors.add(page.nextCursor);
			cursor = page.nextCursor;
		}
		return collected;
	}
}

/**
 * Adapts n8n's `helpers.httpRequest` (as available in IExecuteFunctions) to
 * the {@link Transport} signature used by {@link ApiClient}.
 *
 * n8n's helper already throws on non-2xx responses and parses JSON bodies,
 * which is exactly the contract ApiClient expects from a transport.
 */
export function n8nTransport(helper: Pick<N8nHttpHelper, 'httpRequest'>): Transport {
	return (request) =>
		helper.httpRequest({
			method: request.method,
			url: request.url,
			headers: request.headers,
			body: request.body,
		});
}
