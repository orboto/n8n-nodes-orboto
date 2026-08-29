import { describe, expect, it, vi } from 'vitest';
import { ApiError, ApiClient, n8nTransport } from '../../nodes/orboto/shared/ApiClient';
import type { ApiPage, Transport, TransportRequest } from '../../nodes/orboto/shared/Types';

const CREDENTIALS = { baseUrl: 'https://orboto.example.com', apiKey: 'secret-token' };

/** Transport fake: resolves 2xx bodies, throws structured errors for non-2xx. */
function fakeTransport(respond: (request: TransportRequest) => unknown): Transport {
	return (request) => {
		const result = respond(request);
		if (result instanceof Error) return Promise.reject(result);
		return Promise.resolve(result);
	};
}

function httpError(status: number, body: unknown): Error {
	const error = new Error(`Request failed with status code ${status}`) as Error & {
		statusCode: number;
		response: { body: unknown };
	};
	error.statusCode = status;
	error.response = { body };
	return error;
}

function page<T>(items: T[], nextCursor: string | null = null): ApiPage<T> {
	return { items, nextCursor };
}

describe('ApiClient.normalizeBaseUrl', () => {
	it('appends /api when missing', () => {
		expect(ApiClient.normalizeBaseUrl('https://orboto.example.com')).toBe(
			'https://orboto.example.com/api',
		);
	});

	it('keeps an existing /api suffix', () => {
		expect(ApiClient.normalizeBaseUrl('https://orboto.example.com/api')).toBe(
			'https://orboto.example.com/api',
		);
	});

	it('trims trailing slashes and whitespace', () => {
		expect(ApiClient.normalizeBaseUrl(' https://orboto.example.com/api/ ')).toBe(
			'https://orboto.example.com/api',
		);
		expect(ApiClient.normalizeBaseUrl('https://orboto.example.com///')).toBe(
			'https://orboto.example.com/api',
		);
	});

	it('rejects an empty base URL', () => {
		expect(() => ApiClient.normalizeBaseUrl('   ')).toThrow('baseUrl must not be empty');
	});
});

describe('ApiClient construction', () => {
	it('requires a baseUrl', () => {
		expect(() => new ApiClient({ baseUrl: '', apiKey: 'k' }, fakeTransport(() => ({})))).toThrow(
			'missing a baseUrl',
		);
	});

	it('requires an apiKey', () => {
		expect(() => new ApiClient({ baseUrl: 'https://x.example.com', apiKey: '' }, fakeTransport(() => ({})))).toThrow(
			'missing an apiKey',
		);
	});
});

describe('ApiClient.request', () => {
	it('sends bearer auth and JSON accept headers', async () => {
		const transport = vi.fn(fakeTransport(() => ({ ok: true })));
		const client = new ApiClient(CREDENTIALS, transport);
		await client.request('/health');
		expect(transport).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				method: 'GET',
				url: 'https://orboto.example.com/api/health',
				headers: {
					accept: 'application/json',
					authorization: 'Bearer secret-token',
				},
			}),
		);
	});

	it('builds query strings and skips empty values', async () => {
		const transport = vi.fn(fakeTransport(() => ({})));
		const client = new ApiClient(CREDENTIALS, transport);
		await client.request('/projects/ONN/tickets', {
			query: { statusCategory: 'todo', assigneeId: undefined, search: null, limit: 5 },
		});
		const url = transport.mock.calls[0][0].url as string;
		expect(url).toBe('https://orboto.example.com/api/projects/ONN/tickets?statusCategory=todo&limit=5');
	});

	it('passes method and body through to the transport', async () => {
		const transport = vi.fn(fakeTransport(() => ({ id: 't1' })));
		const client = new ApiClient(CREDENTIALS, transport);
		await client.request('/projects/ONN/tickets', { method: 'POST', body: { title: 'New ticket' } });
		expect(transport.mock.calls[0][0]).toMatchObject({
			method: 'POST',
			body: { title: 'New ticket' },
		});
	});

	it('returns the parsed body', async () => {
		const client = new ApiClient(CREDENTIALS, fakeTransport(() => ({ items: [], nextCursor: null })));
		await expect(client.request('/projects/ONN/tickets')).resolves.toEqual({ items: [], nextCursor: null });
	});
});

describe('ApiError mapping', () => {
	it('maps domain errors with errorKey and errorParams', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => {
				throw httpError(400, {
					error: 'body/title Required',
					errorKey: 'errors.validation.invalid_field',
					errorParams: { field: 'title', detail: 'Required' },
				});
			}),
		);
		const error = await client.request('/projects/ONN/tickets').catch((e: ApiError) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(400);
		expect(error.code).toBe('errors.validation.invalid_field');
		expect(error.field).toBe('title');
		expect(error.detail).toBe('Required');
		expect(error.message).toContain('errors.validation.invalid_field');
		expect(error.message).toContain('body/title Required');
	});

	it('maps not-found domain errors without params', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => {
				throw httpError(404, { error: 'Ticket not found', errorKey: 'errors.tickets.not_found' });
			}),
		);
		const error = await client.request('/projects/ONN/tickets/xyz').catch((e: ApiError) => e);
		expect(error.status).toBe(404);
		expect(error.code).toBe('errors.tickets.not_found');
		expect(error.field).toBeNull();
		expect(error.isAuthError()).toBe(false);
	});

	it('maps framework fallback errors (message/error/statusCode)', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => {
				throw httpError(404, {
					message: 'Route GET:/nope not found',
					error: 'Not Found',
					statusCode: 404,
				});
			}),
		);
		const error = await client.request('/nope').catch((e: ApiError) => e);
		expect(error.status).toBe(404);
		expect(error.code).toBeNull();
		expect(error.message).toContain('Route GET:/nope not found');
	});

	it('maps missing-authorization errors and flags them as auth errors', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => {
				throw httpError(401, { error: 'No Authorization was found in request.headers' });
			}),
		);
		const error = await client.request('/projects').catch((e: ApiError) => e);
		expect(error.isAuthError()).toBe(true);
	});

	it('wraps network failures with status 0 and code network_error', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => {
				throw new Error('connect ECONNREFUSED 127.0.0.1:443');
			}),
		);
		const error = await client.request('/projects').catch((e: ApiError) => e);
		expect(error.status).toBe(0);
		expect(error.code).toBe('network_error');
		expect(error.message).toContain('ECONNREFUSED');
	});

	it('rethrows ApiError untouched', () => {
		const original = new ApiError({ status: 409, code: 'errors.duplicate', message: 'dup' });
		expect(ApiError.fromTransportError(original)).toBe(original);
	});

	it('extracts the status from n8n-style errors (httpCode, cause.response.status, message pattern)', () => {
		const make = (props: Record<string, unknown>): Error =>
			Object.assign(new Error('boom'), props);

		const fromHttpCode = ApiError.fromTransportError(make({ httpCode: '422' })) as ApiError;
		expect(fromHttpCode.status).toBe(422);

		const fromCause = ApiError.fromTransportError(
			make({ message: 'Request failed', cause: { response: { status: 429 } } }),
		) as ApiError;
		expect(fromCause.status).toBe(429);

		const fromMessage = ApiError.fromTransportError(
			make({ message: 'Request failed with status code 423' }),
		) as ApiError;
		expect(fromMessage.status).toBe(423);
	});

	it('maps the body from cause.response.body when present', () => {
		const error = Object.assign(new Error('bad'), {
			cause: { response: { status: 409, body: { error: 'Duplicate', errorKey: 'errors.tickets.duplicate' } } },
		});
		const mapped = ApiError.fromTransportError(error) as ApiError;
		expect(mapped.status).toBe(409);
		expect(mapped.code).toBe('errors.tickets.duplicate');
	});
});

describe('ApiClient.paginate', () => {
	it('returns page items and stops when nextCursor is null', async () => {
		const client = new ApiClient(CREDENTIALS, fakeTransport(() => page(['a', 'b'])));
		await expect(client.paginate('/projects/ONN/tickets')).resolves.toEqual(['a', 'b']);
	});

	it('follows cursors across pages', async () => {
		const responses = [page(['a'], 'c1'), page(['b'], 'c2'), page(['c'])];
		const transport = vi.fn(fakeTransport(() => responses.shift()));
		const client = new ApiClient(CREDENTIALS, transport);
		await expect(client.paginate('/projects/ONN/tickets')).resolves.toEqual(['a', 'b', 'c']);
		expect(transport).toHaveBeenCalledTimes(3);
		const calls = transport.mock.calls as unknown as [TransportRequest[]][];
		expect(calls[0][0].url).not.toContain('cursor=');
		expect(calls[1][0].url).toContain('cursor=c1');
		expect(calls[2][0].url).toContain('cursor=c2');
	});

	it('stops at limit without extra requests', async () => {
		const transport = vi.fn(
			fakeTransport(() => page(['a', 'b', 'c', 'd', 'e'], 'more')),
		);
		const client = new ApiClient(CREDENTIALS, transport);
		await expect(client.paginate('/projects/ONN/tickets', { limit: 3 })).resolves.toEqual(['a', 'b', 'c']);
		expect(transport).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ url: expect.stringContaining('limit=3') }),
		);
	});

	it('slices oversize pages down to the requested limit', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => page(['a', 'b', 'c', 'd'], 'ignored')),
		);
		await expect(client.paginate('/x', { limit: 2 })).resolves.toEqual(['a', 'b']);
	});

	it('requests a smaller page size when fewer items remain', async () => {
		const responses = [page(Array.from({ length: 100 }, (_, i) => `t${i}`), 'c1'), page(Array.from({ length: 50 }, (_, i) => `u${i}`))];
		const transport = vi.fn(fakeTransport(() => responses.shift()));
		const client = new ApiClient(CREDENTIALS, transport);
		const items = await client.paginate('/projects/ONN/tickets', { limit: 150 });
		expect(items).toHaveLength(150);
		const calls = transport.mock.calls as unknown as [TransportRequest[]][];
		expect(calls[0][0].url).toContain('limit=100');
		expect(calls[1][0].url).toContain('limit=50');
	});

	it('keeps extra query filters on every page request', async () => {
		const responses = [page(['a'], 'c1'), page(['b'])];
		const transport = vi.fn(fakeTransport(() => responses.shift()));
		const client = new ApiClient(CREDENTIALS, transport);
		await client.paginate('/projects/ONN/tickets', { query: { statusCategory: 'todo' } });
		const calls = transport.mock.calls as unknown as [TransportRequest[]][];
		for (const [request] of calls) {
			expect(request.url).toContain('statusCategory=todo');
			expect(request.url).toContain('limit=');
		}
	});

	it('fails on a repeated cursor instead of looping forever', async () => {
		const client = new ApiClient(
			CREDENTIALS,
			fakeTransport(() => page(['a'], 'stuck')),
		);
		await expect(client.paginate('/projects/ONN/tickets')).rejects.toMatchObject({
			code: 'pagination_loop',
		});
	});

	it('fails on a non-envelope response', async () => {
		const client = new ApiClient(CREDENTIALS, fakeTransport(() => ({ nope: true })));
		await expect(client.paginate('/projects/ONN/tickets')).rejects.toMatchObject({
			code: 'invalid_response',
		});
	});

	it('returns an empty array for limit 0 without calling the API', async () => {
		const transport = vi.fn(fakeTransport(() => page(['a'])));
		const client = new ApiClient(CREDENTIALS, transport);
		await expect(client.paginate('/projects/ONN/tickets', { limit: 0 })).resolves.toEqual([]);
		expect(transport).not.toHaveBeenCalled();
	});
});

describe('n8nTransport adapter', () => {
	it('maps request options onto helpers.httpRequest and returns its result', async () => {
		const httpRequest = vi.fn().mockResolvedValue({ ok: true });
		const transport = n8nTransport({ httpRequest });
		await expect(
			transport({
				method: 'POST',
				url: 'https://orboto.example.com/api/x?limit=1',
				headers: { authorization: 'Bearer k' },
				body: { a: 1 },
			}),
		).resolves.toEqual({ ok: true });
		expect(httpRequest).toHaveBeenCalledExactlyOnceWith({
			method: 'POST',
			url: 'https://orboto.example.com/api/x?limit=1',
			headers: { authorization: 'Bearer k' },
			body: { a: 1 },
		});
	});

	it('propagates helper errors so ApiClient can map them', async () => {
		const httpRequest = vi.fn().mockRejectedValue(
			httpError(423, { error: 'Legal hold', errorKey: 'errors.tickets.legal_hold' }),
		);
		const transport = n8nTransport({ httpRequest });
		const client = new ApiClient(CREDENTIALS, transport);
		const error = await client.request('/projects/ONN/tickets/T-1/move').catch((e: ApiError) => e);
		expect(error.status).toBe(423);
		expect(error.code).toBe('errors.tickets.legal_hold');
	});
});
