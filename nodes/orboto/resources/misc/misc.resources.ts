import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { getClient, jsonOutput, resolveProjectId, toNodeError } from '../../shared/GenericFunctions';

/** Users resource - there is no global /users route; directory reads are project-scoped. */
export const userOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['user'] } },
		required: true,
		default: 'getMembers',
		options: [
			{
				name: 'Get Project Members',
				value: 'getMembers',
				action: 'Get the project members of a user',
			},
		],
	},
	{
		displayName: 'Project Name or ID',
		name: 'project',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getProjects',
		},
		required: true,
		displayOptions: { show: { resource: ['user'], operation: ['getMembers'] } },
		default: '',
		description:
			'Project whose members to list. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
];

export const labelOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['label'] } },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Create', value: 'create' },
			{ name: 'Get Many', value: 'getAll' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	{
		displayName: 'Project Name or ID',
		name: 'project',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getProjects',
		},
		required: true,
		displayOptions: { show: { resource: ['label'], operation: ['create', 'getAll'] } },
		default: '',
		description:
			'Project of the labels. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['label'], operation: ['create'] } },
		default: '',
		description: 'Label name',
	},
	{
		displayName: 'Color',
		name: 'color',
		type: 'color',
		displayOptions: { show: { resource: ['label'], operation: ['create'] } },
		default: '#4f46e5',
		description: 'Label color',
	},
];

export const savedSearchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['savedSearch'] } },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Create', value: 'create' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Run', value: 'run' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['savedSearch'], operation: ['create'] } },
		default: '',
		description: 'Saved search name',
	},
	{
		displayName: 'Query Type',
		name: 'queryType',
		type: 'options',
		options: [
			{ name: 'OQL', value: 'oql' },
			{ name: 'JQL', value: 'jql' },
			{ name: 'Legacy', value: 'legacy' },
		],
		displayOptions: { show: { resource: ['savedSearch'], operation: ['create'] } },
		default: 'oql',
		description: 'Syntax of the saved query',
	},
	{
		displayName: 'OQL Query',
		name: 'oql',
		type: 'string',
		typeOptions: { rows: 4 },
		displayOptions: { show: { resource: ['savedSearch'], operation: ['create'], queryType: ['oql', 'jql'] } },
		default: '',
		description: 'The OQL/JQL query text',
	},
	{
		displayName: 'Search Name or ID',
		name: 'savedSearch',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['savedSearch'], operation: ['run'] } },
		default: '',
		description: 'Name or ID of the saved search to run',
	},
];

export async function executeUserOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	try {
		const client = await getClient(context);
		const project = String(context.getNodeParameter('project', itemIndex));
		const projectId = await resolveProjectId(client, project);
		const members = await client.request(`/projects/${projectId}/members`);
		const items = Array.isArray(members) ? members : [];
		return (items as Record<string, unknown>[]).map(jsonOutput);
	} catch (error) {
		throw toNodeError(context.getNode(), error, itemIndex);
	}
}

export async function executeLabelOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);
		const project = String(context.getNodeParameter('project', itemIndex));
		switch (operation) {
			case 'getAll': {
				const labels = await client.request(`/projects/${encodeURIComponent(project)}/labels`);
				const items = Array.isArray(labels) ? labels : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'create': {
				const created = await client.request(`/projects/${encodeURIComponent(project)}/labels`, {
					method: 'POST',
					body: {
						name: context.getNodeParameter('name', itemIndex) as string,
						color: context.getNodeParameter('color', itemIndex, '#4f46e5') as string,
					},
				});
				return [jsonOutput(created)];
			}
			default:
				throw new Error(`Unknown label operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(context.getNode(), error, itemIndex);
	}
}

export async function executeSavedSearchOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);
		switch (operation) {
			case 'getAll': {
				const searches = await client.request('/saved-searches');
				const items = Array.isArray(searches) ? searches : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'create': {
				const queryType = context.getNodeParameter('queryType', itemIndex, 'oql') as string;
				const body: Record<string, unknown> = {
					name: context.getNodeParameter('name', itemIndex) as string,
					queryType,
				};
				if (queryType === 'oql' || queryType === 'jql') {
					body.oql = context.getNodeParameter('oql', itemIndex) as string;
				}
				const created = await client.request('/saved-searches', { method: 'POST', body });
				return [jsonOutput(created)];
			}
			case 'run': {
				const reference = String(context.getNodeParameter('savedSearch', itemIndex)).trim();
				const searches = (await client.request<unknown[]>('/saved-searches')) as Array<
					Record<string, unknown>
				>;
				const list = Array.isArray(searches) ? searches : [];
				const match =
					list.find((s) => s.id === reference) ?? list.find((s) => s.name === reference);
				if (!match) {
					throw new Error(`Saved search not found: ${reference}`);
				}
				const oql = typeof match.oql === 'string' ? match.oql : '';
				const queryType = (match.queryType as string) ?? 'legacy';
				if (!oql || queryType === 'legacy') {
					throw new Error(
						`Saved search "${String(match.name)}" uses a legacy query; only OQL/JQL saved searches can be run from n8n`,
					);
				}
				const results = await client.request('/query', {
					method: 'POST',
					body: { oql, syntax: queryType },
				});
				const page = results as { items?: Record<string, unknown>[] };
				return (page?.items ?? []).map(jsonOutput);
			}
			default:
				throw new Error(`Unknown saved search operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
