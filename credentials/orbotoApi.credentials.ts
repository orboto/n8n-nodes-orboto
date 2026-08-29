import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * JavaScript expression applied to the user-entered base URL inside the
 * declarative credential test. Mirrors ApiClient.normalizeBaseUrl: trim
 * whitespace, strip trailing slashes, strip a trailing /api (re-added by
 * the URL template) - so both `https://orboto.example.com` and
 * `https://orboto.example.com/api` work.
 */
const BASE_URL_NORMALIZE_EXPR =
	'$credentials.baseUrl.trim().replace(/\\/+$/, "").replace(/\\/api$/, "")';

/** Declarative connection-test URL (GET /users/me, authenticated read). */
export const WHOAMI_TEST_URL_TEMPLATE = `={{ ${BASE_URL_NORMALIZE_EXPR} }}/api/users/me`;

/** The raw expression, exported for unit tests (executed against sample base URLs). */
export const BASE_URL_NORMALIZE_EXPRESSION = BASE_URL_NORMALIZE_EXPR;

export class orbotoApi implements ICredentialType {
	name = 'orbotoApi';

	displayName = 'orboto API';

	documentationUrl = 'https://github.com/orboto/n8n-nodes-orboto#readme';

	/** Injects the bearer token every orboto REST call needs. */
	authenticate = {
		type: 'generic' as const,
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://orboto.example.com',
			placeholder: 'e.g. https://orboto.example.com',
			required: true,
			description:
				'Base URL of your orboto instance, with or without the /api suffix (e.g. https://orboto.example.com or https://orboto.example.com/api)',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'API key for the orboto instance - create one under Settings > API Keys in orboto',
		},
	];

	/** Connection test: an authenticated GET /users/me - cheap, read-only, works on every instance. */
	test = {
		request: {
			method: 'GET' as const,
			url: WHOAMI_TEST_URL_TEMPLATE,
		},
		rules: [
			{
				type: 'responseCode' as const,
				properties: {
					value: 401,
					message:
						'orboto rejected the API key (HTTP 401). Check the key in Settings > API Keys and try again.',
				},
			},
			{
				type: 'responseCode' as const,
				properties: {
					value: 403,
					message:
						'orboto accepted the key but denied access (HTTP 403). The key may lack the permissions this credential needs.',
				},
			},
		],
	};
}
