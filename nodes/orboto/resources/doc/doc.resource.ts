import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { ApiError } from '../../shared/ApiClient';
import { getClient, isUuid, jsonOutput, toNodeError } from '../../shared/GenericFunctions';

const SHOW = { resource: ['doc'] };

export const docOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: SHOW },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Ask Docs (RAG)', value: 'askDocs' },
			{ name: 'Create', value: 'create' },
			{ name: 'Get', value: 'get' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Ingest URL', value: 'ingestUrl' },
			{ name: 'Update', value: 'update' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	{
		displayName: 'Space Name or ID',
		name: 'space',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getSpaces',
		},
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['create', 'getAll', 'ingestUrl'] } },
		default: '',
		description:
			'The wiki space. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Doc Key or ID',
		name: 'doc',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['get', 'update'] } },
		default: '',
		description: 'Doc key (DOC-42) or ID',
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['create'] } },
		default: '',
		description: 'Doc title',
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 8 },
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Doc content (Markdown)',
	},
	{
		displayName: 'Visibility',
		name: 'visibility',
		type: 'options',
		options: ['public', 'workspace', 'members', 'specific'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: 'workspace',
		description: 'Who can read the doc',
	},
	{
		displayName: 'Question',
		name: 'question',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['askDocs'] } },
		default: '',
		description: 'Question to answer from the docs (RAG)',
	},
	{
		displayName: 'Limit Results',
		name: 'limit',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		displayOptions: { show: { ...SHOW, operation: ['askDocs'] } },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['ingestUrl'] } },
		default: '',
		placeholder: 'https://example.com/article',
		description: 'URL to ingest as a new doc in the space',
	},
	{
		displayName: 'Raw HTML',
		name: 'html',
		type: 'string',
		displayOptions: { show: { ...SHOW, operation: ['ingestUrl'] } },
		default: '',
		description: 'Optional pre-fetched HTML to ingest instead of letting orboto fetch the URL',
	},
];

async function resolveDocId(
	client: import('../../shared/ApiClient').ApiClient,
	doc: string,
): Promise<string> {
	const value = doc.trim();
	if (isUuid(value)) return value;
	const found = await client.request<{ id: string }>(`/docs/by-key/${encodeURIComponent(value)}`);
	return found.id;
}

export async function executeDocOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);

		switch (operation) {
			case 'create': {
				const space = String(context.getNodeParameter('space', itemIndex));
				const body: Record<string, unknown> = {
					title: context.getNodeParameter('title', itemIndex) as string,
				};
				const content = context.getNodeParameter('content', itemIndex, '') as string;
				if (content !== '') body.content = content;
				const visibility = context.getNodeParameter('visibility', itemIndex, '') as string;
				if (visibility !== '') body.visibility = visibility;
				const created = await client.request(`/spaces/${encodeURIComponent(space)}/docs`, {
					method: 'POST',
					body,
				});
				return [jsonOutput(created)];
			}
			case 'get': {
				const doc = String(context.getNodeParameter('doc', itemIndex));
				const id = await resolveDocId(client, doc);
				const found = await client.request(`/docs/${id}`);
				return [jsonOutput(found)];
			}
			case 'getAll': {
				const space = String(context.getNodeParameter('space', itemIndex));
				const docs = await client.request(`/spaces/${encodeURIComponent(space)}/docs`);
				const items = Array.isArray(docs) ? docs : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'update': {
				const doc = String(context.getNodeParameter('doc', itemIndex));
				const id = await resolveDocId(client, doc);
				const body: Record<string, unknown> = {};
				for (const field of ['title', 'content', 'visibility'] as const) {
					const value = context.getNodeParameter(field, itemIndex, '') as string;
					if (value !== '') body[field] = value;
				}
				const updated = await client.request(`/docs/${id}`, { method: 'PATCH', body });
				return [jsonOutput(updated)];
			}
			case 'askDocs': {
				const question = context.getNodeParameter('question', itemIndex) as string;
				const limit = context.getNodeParameter('limit', itemIndex, 5) as number;
				const body: Record<string, unknown> = { question, limit };
				try {
					const answer = await client.request('/ai/ask-docs', { method: 'POST', body });
					return [jsonOutput(answer)];
				} catch (error) {
					// Surface an embeddings/configuration problem as a clear message
					// instead of a bare 400 (ticket: ask-docs must degrade gracefully).
					if (error instanceof ApiError && error.status === 400) {
						throw new NodeOperationError(
							node,
							`Ask Docs failed: ${error.message}. If the error mentions embeddings, the instance has no embedding provider configured - ask-docs requires one.`,
							{ itemIndex },
						);
					}
					throw error;
				}
			}
			case 'ingestUrl': {
				const space = String(context.getNodeParameter('space', itemIndex));
				const body: Record<string, unknown> = {
					url: context.getNodeParameter('url', itemIndex) as string,
				};
				const html = context.getNodeParameter('html', itemIndex, '') as string;
				if (html !== '') body.html = html;
				const ingested = await client.request(`/spaces/${encodeURIComponent(space)}/docs/ingest-url`, {
					method: 'POST',
					body,
				});
				return [jsonOutput(ingested)];
			}
			default:
				throw new Error(`Unknown doc operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
