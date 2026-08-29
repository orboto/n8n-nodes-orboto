import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { IExecuteFunctions, IHttpRequestOptions, INode, INodeExecutionData, JsonObject } from 'n8n-workflow';
import { ApiClient, ApiError, n8nTransport } from './ApiClient';
import type { ApiPage, QueryValue } from './Types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Credential names the nodes accept (API key or OAuth2). */
export const CREDENTIAL_TYPES = ['orbotoApi', 'orbotoOAuth2Api'] as const;

/**
 * Reads whichever orboto credential the node is configured with. For OAuth2
 * credentials the bearer token comes from n8n's oauthTokenData (refreshed by
 * n8n via the offline_access scope); for API-key credentials it is the key.
 */
async function getCredentialsData(
	context: { getCredentials(name: string): Promise<Record<string, unknown>>; getNode(): { credentials?: Record<string, unknown> } },
): Promise<{ baseUrl: string; apiKey: string }> {
	const configured = context.getNode().credentials ?? {};
	const type = CREDENTIAL_TYPES.find((name) => Boolean(configured[name])) ?? 'orbotoApi';
	const credentials = await context.getCredentials(type);
	const oauthToken = credentials.oauthTokenData as { access_token?: string } | undefined;
	return {
		baseUrl: String(credentials.baseUrl ?? ''),
		apiKey: String(oauthToken?.access_token ?? credentials.apiKey ?? ''),
	};
}

/** Builds the shared API client from the node's orboto credential (API key or OAuth2). */
export async function getClient(executeContext: IExecuteFunctions): Promise<ApiClient> {
	const configured = executeContext.getNode().credentials ?? {};
	const type = CREDENTIAL_TYPES.find((name) => Boolean(configured[name])) ?? 'orbotoApi';
	const credentials = await executeContext.getCredentials(type);
	if (type === 'orbotoOAuth2Api') {
		// OAuth: let n8n inject and refresh the bearer token - an empty apiKey
		// keeps ApiClient from setting its own Authorization header.
		return new ApiClient({ baseUrl: String(credentials.baseUrl ?? '') }, (request) =>
			executeContext.helpers.httpRequestWithAuthentication.call(executeContext, 'orbotoOAuth2Api', {
				method: request.method,
				url: request.url,
				headers: request.headers,
				body: request.body,
			} as IHttpRequestOptions),
		);
	}
	return new ApiClient(
		{
			baseUrl: String(credentials.baseUrl ?? ''),
			apiKey: String(credentials.apiKey ?? ''),
		},
		(request) =>
			executeContext.helpers.httpRequest({
				method: request.method,
				url: request.url,
				headers: request.headers,
				body: request.body,
			} as IHttpRequestOptions),
	);
}

/** Client for loadOptions methods (same transport, different context type). */
export async function getLoadOptionsClient(
	context: { getCredentials(name: string): Promise<Record<string, unknown>> } & {
		helpers: { httpRequest(options: IHttpRequestOptions): Promise<unknown> };
		getNode?(): { credentials?: Record<string, unknown> };
	},
): Promise<ApiClient> {
	const credentials = await getCredentialsData(
		context as unknown as Parameters<typeof getCredentialsData>[0],
	);
	return new ApiClient(
		{
			baseUrl: String(credentials.baseUrl ?? ''),
			apiKey: String(credentials.apiKey ?? ''),
		},
		(request) =>
			context.helpers.httpRequest({
				method: request.method,
				url: request.url,
				headers: request.headers,
				body: request.body,
			} as IHttpRequestOptions),
	);
}

/**
 * Some orboto routes return bare JSON arrays (projects, milestones, statuses,
 * members, labels, versions, attachments) while list routes paginate with
 * `{items, nextCursor}`. This helper normalizes both to an item array.
 */
export function pageItems<T = unknown>(body: unknown): T[] {
	if (Array.isArray(body)) return body as T[];
	const page = body as ApiPage<T> | null;
	if (page && Array.isArray(page.items)) return page.items;
	return [];
}

export function isUuid(value: string): boolean {
	return UUID_RE.test(value.trim());
}

/**
 * Resolves a user-supplied ticket reference (UUID, key like `ONN-42`,
 * or bare number `42`) to the ticket id. UUIDs pass through untouched;
 * keys/numbers resolve via the project-scoped by-key route.
 */
export async function resolveTicketId(
	client: ApiClient,
	projectId: string,
	ticket: string,
): Promise<string> {
	const value = ticket.trim();
	if (isUuid(value)) return value;
	if (!projectId) {
		throw new Error('A project is required to resolve a ticket key or number to an id');
	}
	const found = await client.request<{ id: string }>(
		`/projects/${encodeURIComponent(projectId)}/tickets/by-key/${encodeURIComponent(value)}`,
	);
	return found.id;
}

/**
 * Resolves a project key (ONN) or id to the project id. Some routes
 * (/projects/{id}/members) only accept ids, unlike the ticket routes.
 */
export async function resolveProjectId(
	client: ApiClient,
	project: string,
): Promise<string> {
	const value = project.trim();
	if (isUuid(value)) return value;
	const found = await client.request<{ id: string }>(`/projects/by-key/${encodeURIComponent(value)}`);
	return found.id;
}

/**
 * Resolves a user-supplied milestone reference (UUID or key like `M-3`)
 * to the milestone id. UUIDs pass through untouched.
 */
export async function resolveMilestoneId(
	client: ApiClient,
	projectId: string,
	milestone: string,
): Promise<string> {
	const value = milestone.trim();
	if (isUuid(value)) return value;
	if (!projectId) {
		throw new Error('A project is required to resolve a milestone key to an id');
	}
	const found = await client.request<{ id: string }>(
		`/projects/${encodeURIComponent(projectId)}/milestones/by-key/${encodeURIComponent(value)}`,
	);
	return found.id;
}

/** Wraps API failures into n8n errors with actionable descriptions. */
export function toNodeError(node: INode, error: unknown, itemIndex: number): Error {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	if (error instanceof ApiError) {
		const description = appendWarningHints(describeApiError(error), error);
		return new NodeApiError(node, error as unknown as JsonObject, {
			message: error.message,
			description,
			itemIndex,
		});
	}
	return new NodeApiError(node, error as unknown as JsonObject, { itemIndex });
}

/**
 * orboto attaches structured hints to some error bodies - a languageWarning
 * on 422 and similarWarnings on 409. They must reach the workflow author,
 * not vanish inside a generic failure (binding error-semantics design).
 */
function appendWarningHints(description: string, error: ApiError): string {
	const raw = (error.raw ?? {}) as Record<string, unknown>;
	const hints: string[] = [];
	const languageWarning = raw.languageWarning as Record<string, unknown> | undefined;
	if (languageWarning && typeof languageWarning === 'object') {
		hints.push(
			`Language warning: text detected as ${String(languageWarning.detected)} but the project expects ${String(languageWarning.expected)}.`,
		);
	}
	const similar = raw.similarWarnings;
	if (Array.isArray(similar) && similar.length > 0) {
		const first = (similar[0] as Record<string, unknown>) ?? {};
		hints.push(
			`${similar.length} similar ticket(s) flagged as possible duplicates (e.g. ${String(
				first.title ?? first.id ?? 'unknown',
			)}).`,
		);
	}
	return hints.length > 0 ? `${description} ${hints.join(' ')}` : description;
}

function describeApiError(error: ApiError): string {
	switch (error.status) {
		case 401:
			return 'orboto rejected the API key. Check the credential (Settings > API Keys in orboto).';
		case 403:
			return 'The API key lacks permission for this call. Check its scopes in orboto.';
		case 409:
			return 'orboto blocked this as a duplicate. Inspect similarWarnings in the error output, then retry with "Allow Duplicate" and a justification if it really is distinct work.';
		case 422:
			return 'orboto rejected the ticket language. Retry with "Allow Language Mismatch" if the deviation is intended.';
		case 423:
			return 'The ticket is under legal hold and cannot be modified or deleted.';
		case 429:
			return 'Rate limit exceeded (default 600 requests/minute per instance). Batch operations, slow down, or enable "Continue On Fail" to skip throttled items.';
		default:
			if (error.status === 0) return 'Could not reach the orboto instance. Check the Base URL credential field.';
			return error.detail ?? `The request failed with HTTP ${error.status}.`;
	}
}

/** Success output helper. */
export function jsonOutput(body: unknown): INodeExecutionData {
	return { json: body as INodeExecutionData['json'] };
}

/** Reads a query-string-style filter set from node parameters. */
export function collectQuery(
	entries: Array<[string, unknown]>,
): Record<string, QueryValue | undefined> {
	const query: Record<string, QueryValue | undefined> = {};
	for (const [key, value] of entries) {
		if (value === undefined || value === null || value === '') continue;
		if (typeof value === 'object') continue;
		query[key] = typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
	}
	return query;
}
