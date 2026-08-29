import { describe, expect, it } from 'vitest';
import { orbotoOAuth2Api } from '../../credentials/orbotoOAuth2Api.credentials';

describe('orbotoOAuth2Api credential', () => {
	const credential = new orbotoOAuth2Api();

	it('follows the n8n OAuth2 conventions', () => {
		expect(credential.name).toBe('orbotoOAuth2Api');
		expect(credential.extends).toEqual(['oAuth2Api']);
		expect(credential.documentationUrl).toMatch(/^https:\/\//);
	});

	it('defaults to PKCE with the api scope and refresh', () => {
		const grantType = credential.properties.find((p) => p.name === 'grantType');
		expect(grantType?.default).toBe('pkce');
		const scope = credential.properties.find((p) => p.name === 'scope');
		expect(scope?.default).toBe('api offline_access');
	});

	it('derives authorize and token URLs from the base URL', () => {
		const authUrl = credential.properties.find((p) => p.name === 'authUrl');
		const accessTokenUrl = credential.properties.find((p) => p.name === 'accessTokenUrl');
		expect(String(authUrl?.default)).toContain('$self["baseUrl"]');
		expect(String(authUrl?.default)).toContain('/oauth/authorize');
		expect(String(accessTokenUrl?.default)).toContain('$self["baseUrl"]');
		expect(String(accessTokenUrl?.default)).toContain('/oauth/token');
	});

	it('derives the same URLs the discovery document advertises', () => {
		// mirror of n8n's $self expression evaluation for sample base URLs
		const evalExpr = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
		expect(`${evalExpr('https://orboto.example.com/')}/oauth/authorize`).toBe(
			'https://orboto.example.com/oauth/authorize',
		);
		expect(`${evalExpr('https://orboto.example.com')}/oauth/token`).toBe(
			'https://orboto.example.com/oauth/token',
		);
	});

	it('ships no declarative test block (OAuth2 credentials are validated by the connect flow, matching n8n core conventions)', () => {
		expect(credential.test).toBeUndefined();
	});
});
