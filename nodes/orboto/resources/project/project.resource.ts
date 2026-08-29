import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { getClient, isUuid, jsonOutput, resolveProjectId, toNodeError } from '../../shared/GenericFunctions';

const SHOW = { resource: ['project'] };

export const projectOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: SHOW },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Create', value: 'create' },
			{ name: 'Get', value: 'get' },
			{ name: 'Get AI Primer', value: 'getAiPrimer' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Get Primer Facts', value: 'getPrimerFacts' },
			{ name: 'Update', value: 'update' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	{
		displayName: 'Project Key or ID',
		name: 'project',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['get', 'getAiPrimer', 'getPrimerFacts', 'update'] } },
		default: '',
		description: 'Project key (ONN) or ID',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['create'] } },
		default: '',
		description: 'Project name',
	},
	{
		displayName: 'Key',
		name: 'key',
		type: 'string',
		typeOptions: { password: true },
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		placeholder: 'ONN',
		description: 'Short uppercase project key (2-10 characters, A-Z and digits)',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 6 },
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Project description (Markdown)',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'options',
		options: ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'ru', 'pl', 'tr', 'cs', 'da', 'sv', 'no', 'fi', 'ja', 'zh', 'ko'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: 'en',
		description: 'Ticket language enforced for this project',
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: ['draft', 'active', 'archived', 'closed'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW, operation: ['update'] } },
		default: 'active',
		description: 'Project status',
	},
];

export async function executeProjectOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);

		switch (operation) {
			case 'create': {
				const body: Record<string, unknown> = {
					name: context.getNodeParameter('name', itemIndex) as string,
				};
				for (const field of ['key', 'description', 'language'] as const) {
					const value = context.getNodeParameter(field, itemIndex, '') as string;
					if (value !== '') body[field] = value;
				}
				const created = await client.request('/projects/', { method: 'POST', body });
				return [jsonOutput(created)];
			}
			case 'get': {
				const project = String(context.getNodeParameter('project', itemIndex));
				const found = isUuid(project.trim())
					? await client.request(`/projects/${project.trim()}`)
					: await client.request(`/projects/by-key/${encodeURIComponent(project.trim())}`);
				return [jsonOutput(found)];
			}
			case 'getAll': {
				const projects = await client.request('/projects/');
				const items = Array.isArray(projects) ? projects : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'update': {
				const project = String(context.getNodeParameter('project', itemIndex));
				const id = await resolveProjectId(client, project);
				const body: Record<string, unknown> = {};
				for (const field of ['name', 'key', 'description', 'language', 'status'] as const) {
					const value = context.getNodeParameter(field, itemIndex, '') as string;
					if (value !== '') body[field] = value;
				}
				const updated = await client.request(`/projects/${id}`, { method: 'PATCH', body });
				return [jsonOutput(updated)];
			}
			case 'getPrimerFacts': {
				const project = String(context.getNodeParameter('project', itemIndex));
				const id = await resolveProjectId(client, project);
				const facts = await client.request(`/projects/${id}/primer-facts`);
				const items = Array.isArray(facts) ? facts : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'getAiPrimer': {
				const project = String(context.getNodeParameter('project', itemIndex));
				const id = await resolveProjectId(client, project);
				const primer = await client.request(`/projects/${id}/ai-primer`);
				return [jsonOutput(primer)];
			}
			default:
				throw new Error(`Unknown project operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
