import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/** Base-URL expression shared by the authorize/token URL defaults. */
const BASE_URL_EXPR = '=$self["baseUrl"].replace(/\\/+$/, "")';

export class orbotoOAuth2Api implements ICredentialType {
	name = 'orbotoOAuth2Api';

	displayName = 'orboto OAuth2 API';

	documentationUrl = 'https://github.com/orboto/n8n-nodes-orboto#readme';

	/** Static OAuth client path (design review 2026-08-29): the admin creates a
	 * client under Admin > OAuth clients in orboto and pastes id/secret here. */
	extends = ['oAuth2Api'];

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://orboto.example.com',
			required: true,
			placeholder: 'e.g. https://orboto.example.com',
			description:
				'Base URL of your orboto instance (without /api - the OAuth endpoints live at the instance root). The authorization and token URLs are derived from it automatically.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'options',
			displayOptions: {
				show: { useDynamicClientRegistration: [false] },
			},
			options: [
				{ name: 'Authorization Code', value: 'authorizationCode' },
				{ name: 'PKCE', value: 'pkce' },
			],
			default: 'pkce',
			description: 'PKCE is recommended; orboto supports S256',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'string',
			displayOptions: {
				show: { grantType: ['authorizationCode', 'pkce'], useDynamicClientRegistration: [false] },
			},
			default: `={{${BASE_URL_EXPR}}}/oauth/authorize`,
			required: true,
			description: 'Derived from the Base URL (discovered at /.well-known/oauth-authorization-server)',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'string',
			typeOptions: { password: true },
			displayOptions: {
				show: { useDynamicClientRegistration: [false] },
			},
			default: `={{${BASE_URL_EXPR}}}/oauth/token`,
			required: true,
			description: 'Derived from the Base URL (discovered at /.well-known/oauth-authorization-server)',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			displayOptions: {
				show: { grantType: ['authorizationCode', 'pkce'], useDynamicClientRegistration: [false] },
			},
			default: 'api offline_access',
			description: 'The api scope grants REST access; offline_access enables token refresh. Separate multiple scopes with spaces.',
		},
	];
}
