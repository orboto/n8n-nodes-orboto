/**
 * Shared type definitions for the orboto n8n nodes.
 *
 * These types are intentionally decoupled from n8n's own type system: the
 * shared REST client (ApiClient) is a plain module that can be unit-tested
 * without an n8n runtime. Nodes adapt n8n helpers to these shapes.
 */

/** Data coming from an orboto credential (API key credential, ONN-3; OAuth2, ONN-4). */
export interface ApiCredentials {
	/** Base URL of the orboto API, e.g. `https://orboto.example.com/api`. */
	baseUrl: string;
	/** Bearer token used for the `Authorization` header. Empty when the transport owns auth (OAuth via n8n). */
	apiKey?: string;
}

/** Cursor-paginated list envelope returned by every orboto list route. */
export interface ApiPage<T> {
	items: T[];
	nextCursor: string | null;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryValue = string | number | boolean;

/** Request shape handed to the transport function. */
export interface TransportRequest {
	method: HttpMethod;
	/** Fully qualified URL, including query string. */
	url: string;
	headers: Record<string, string>;
	/** Parsed request body; serialized as JSON by the transport. */
	body?: unknown;
}

/**
 * Transport performs the actual HTTP call and returns the parsed JSON body.
 *
 * This is structurally compatible with n8n's `this.helpers.httpRequest`
 * (IHttpRequestHelper): the n8n adapter in `n8nTransport` maps our options
 * onto it, so proxies, custom CA certificates and timeouts configured in n8n
 * keep working for every orboto call.
 */
export type Transport = (request: TransportRequest) => Promise<unknown>;

/**
 * Minimal structural type for n8n's HTTP helper.
 *
 * Kept loose on purpose so this module does not need a hard compile-time
 * dependency on `n8n-core` (the host provides it at runtime).
 */
export interface N8nHttpHelper {
	httpRequest(options: {
		method: TransportRequest['method'];
		url: string;
		headers?: Record<string, string>;
		body?: unknown;
		skipReadBody?: boolean;
	}): Promise<unknown>;
}
