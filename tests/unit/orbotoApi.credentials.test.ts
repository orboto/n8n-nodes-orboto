import { describe, expect, it } from 'vitest';
import { BASE_URL_NORMALIZE_EXPRESSION, orbotoApi } from '../../credentials/orbotoApi.credentials';
import { ApiClient } from '../../nodes/orboto/shared/ApiClient';

/** Executes the n8n expression body against a sample credentials object, like n8n's expression engine does. */
function evalExpression(expression: string, baseUrl: string): string {
	// eslint-disable-next-line no-new-func
	return new Function('$credentials', `"use strict"; return (${expression});`)({
		baseUrl,
	}) as string;
}

describe('orbotoApi credential', () => {
	const credential = new orbotoApi();

	it('follows the n8n credential naming convention', () => {
		expect(credential.name).toBe('orbotoApi');
		expect(credential.displayName).toBe('orboto API');
		expect(credential.documentationUrl).toMatch(/^https:\/\//);
	});

	it('hides the API key behind a password field', () => {
		const apiKey = credential.properties.find((p) => p.name === 'apiKey');
		expect(apiKey?.typeOptions?.password).toBe(true);
		expect(apiKey?.required).toBe(true);
	});

	it('defaults the base URL to the public host and requires it', () => {
		const baseUrl = credential.properties.find((p) => p.name === 'baseUrl');
		expect(baseUrl?.default).toBe('https://orboto.example.com');
		expect(baseUrl?.required).toBe(true);
	});

	it('injects the bearer token via the authenticate block', () => {
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: {
				headers: {
					Authorization: '=Bearer {{$credentials.apiKey}}',
				},
			},
		});
	});

	it('tests with an authenticated GET /users/me', () => {
		expect(credential.test).toMatchObject({
			request: { method: 'GET', url: expect.stringContaining('/api/users/me') },
		});
	});

	it('maps 401 and 403 to actionable error messages', () => {
		const rules = credential.test?.rules ?? [];
		expect(rules).toHaveLength(2);
		expect(rules.find((r) => r.properties.value === 401)?.properties.message).toContain(
			'API key',
		);
		expect(rules.find((r) => r.properties.value === 403)?.properties.message).toContain(
			'denied access',
		);
	});

	describe('base URL normalization expression', () => {
		const cases: Array<[string, string]> = [
			['https://orboto.example.com', 'https://orboto.example.com'],
			['https://orboto.example.com', 'https://orboto.example.com'],
			['https://orboto.example.com/', 'https://orboto.example.com'],
			['https://orboto.example.com/api', 'https://orboto.example.com'],
			['https://orboto.example.com/api/', 'https://orboto.example.com'],
			['  https://orboto.example.com/api/  ', 'https://orboto.example.com'],
		];

		it.each(cases)('normalizes %s', (input, expected) => {
			expect(evalExpression(BASE_URL_NORMALIZE_EXPRESSION, input)).toBe(expected);
		});

		it('agrees with ApiClient.normalizeBaseUrl (same normalization, plus the /api suffix)', () => {
			for (const [input, expected] of cases) {
				expect(`${evalExpression(BASE_URL_NORMALIZE_EXPRESSION, input)}/api/users/me`).toBe(
					`${ApiClient.normalizeBaseUrl(input)}/users/me`,
				);
			}
		});
	});
});
