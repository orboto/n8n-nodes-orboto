import { describe, expect, it } from 'vitest';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { credentialTypeOf, getLoadOptionsClient } from '../../nodes/orboto/shared/GenericFunctions';

function parameterContext(authType: string | undefined, credentials: Record<string, Record<string, unknown>>) {
	const requests: IHttpRequestOptions[] = [];
	return {
		requests,
		context: {
			getNodeParameter: (name: string, _itemIndex?: number, fallback?: unknown) =>
				name === 'authType' ? (authType ?? fallback) : fallback,
			getCredentials: (name: string) => Promise.resolve(credentials[name] ?? {}),
			helpers: {
				httpRequest: (options: IHttpRequestOptions) => {
					requests.push(options);
					return Promise.resolve({ ok: true });
				},
			},
		},
	};
}

describe('credentialTypeOf', () => {
	it('maps the Authentication parameter to the credential type', () => {
		const ctx = (authType: string | undefined) => parameterContext(authType, {}).context;
		expect(credentialTypeOf(ctx('apiKey'))).toBe('orbotoApi');
		expect(credentialTypeOf(ctx('oauth'))).toBe('orbotoOAuth2Api');
		expect(credentialTypeOf(ctx(undefined))).toBe('orbotoApi');
	});
});

describe('getLoadOptionsClient', () => {
	it('uses the API key for the apiKey auth type', async () => {
		const { context, requests } = parameterContext('apiKey', {
			orbotoApi: { baseUrl: 'https://orboto.example.com', apiKey: 'key-123' },
		});
		const client = await getLoadOptionsClient(context);
		await client.request('/projects');
		expect(String(requests[0].headers?.authorization)).toBe('Bearer key-123');
	});

	it('uses the OAuth access token, never a stale apiKey field, for the oauth auth type', async () => {
		const { context, requests } = parameterContext('oauth', {
			orbotoOAuth2Api: {
				baseUrl: 'https://orboto.example.com',
				apiKey: 'stale',
				oauthTokenData: { access_token: 'oauth-token-456' },
			},
		});
		const client = await getLoadOptionsClient(context);
		await client.request('/projects');
		expect(String(requests[0].headers?.authorization)).toBe('Bearer oauth-token-456');
	});
});
