import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { collectQuery, getClient, jsonOutput, resolveMilestoneId, toNodeError } from '../../shared/GenericFunctions';

const SHOW = { resource: ['milestone'] };

const MILESTONE_PROJECT_OPERATIONS = ['close', 'create', 'get', 'getAll', 'update'];

export const milestoneOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: SHOW },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Close', value: 'close' },
			{ name: 'Create', value: 'create' },
			{ name: 'Get', value: 'get' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Update', value: 'update' },
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
		displayOptions: { show: { ...SHOW, operation: MILESTONE_PROJECT_OPERATIONS } },
		default: '',
		description:
			'The orboto project the milestone belongs to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Milestone Key or ID',
		name: 'milestone',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['close', 'get', 'update'] } },
		default: '',
		description: 'Milestone key (M-3) or ID',
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['create'] } },
		default: '',
		description: 'Milestone name',
	},
	{
		displayName: 'Milestone Key',
		name: 'milestoneKey',
		type: 'string',
		typeOptions: { password: true },
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Optional custom key for the milestone (uppercase, unique per project)',
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'string',
		placeholder: 'YYYY-MM-DD',
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Start date (YYYY-MM-DD)',
	},
	{
		displayName: 'End Date',
		name: 'endDate',
		type: 'string',
		placeholder: 'YYYY-MM-DD',
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'End date (YYYY-MM-DD)',
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: ['active', 'completed', 'archived'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW, operation: ['update'] } },
		default: 'active',
		description: 'Milestone status',
	},
	{
		displayName: 'Budget Amount',
		name: 'budgetAmount',
		type: 'string',
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Planned budget amount',
	},
	{
		displayName: 'Budget Hours',
		name: 'budgetHours',
		type: 'string',
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: '',
		description: 'Planned budget hours',
	},
	{
		displayName: 'Private',
		name: 'isPrivate',
		type: 'boolean',
		displayOptions: { show: { ...SHOW, operation: ['create', 'update'] } },
		default: false,
		description: 'Whether the milestone is private',
	},
	{
		displayName: 'Include Closed',
		name: 'includeClosed',
		type: 'boolean',
		displayOptions: { show: { ...SHOW, operation: ['getAll'] } },
		default: false,
		description: 'Whether to include completed milestones',
	},
];

function collectBody(context: IExecuteFunctions, itemIndex: number, isCreate: boolean): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (isCreate) body.name = context.getNodeParameter('name', itemIndex) as string;
	const strings = ['milestoneKey', 'startDate', 'endDate', 'budgetAmount', 'budgetHours'] as const;
	for (const field of strings) {
		const value = context.getNodeParameter(field, itemIndex, '') as string;
		// budgetAmount/budgetHours are string-typed in the orboto API - pass through untouched.
		if (value !== '') body[field] = value;
	}
	if (!isCreate) {
		const status = context.getNodeParameter('status', itemIndex, '') as string;
		if (status !== '') body.status = status;
	}
	const isPrivate = context.getNodeParameter('isPrivate', itemIndex, false) as boolean;
	if (isPrivate) body.isPrivate = isPrivate;
	return body;
}

export async function executeMilestoneOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);
		const project = String(context.getNodeParameter('project', itemIndex, '') ?? '');
		const base = `/projects/${encodeURIComponent(project)}/milestones`;

		switch (operation) {
			case 'create': {
				const created = await client.request(base, { method: 'POST', body: collectBody(context, itemIndex, true) });
				return [jsonOutput(created)];
			}
			case 'get': {
				const milestone = String(context.getNodeParameter('milestone', itemIndex));
				const id = await resolveMilestoneId(client, project, milestone);
				const found = await client.request(`${base}/${id}`);
				return [jsonOutput(found)];
			}
			case 'getAll': {
				const includeClosed = context.getNodeParameter('includeClosed', itemIndex, false) as boolean;
				const milestones = await client.request(base, {
					query: collectQuery([['includeClosed', includeClosed || undefined]]),
				});
				const items = Array.isArray(milestones) ? milestones : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'update': {
				const milestone = String(context.getNodeParameter('milestone', itemIndex));
				const id = await resolveMilestoneId(client, project, milestone);
				const updated = await client.request(`${base}/${id}`, {
					method: 'PATCH',
					body: collectBody(context, itemIndex, false),
				});
				return [jsonOutput(updated)];
			}
			case 'close': {
				const milestone = String(context.getNodeParameter('milestone', itemIndex));
				const id = await resolveMilestoneId(client, project, milestone);
				const closed = await client.request(`${base}/${id}`, {
					method: 'PATCH',
					body: { status: 'completed' },
				});
				return [jsonOutput(closed)];
			}
			default:
				throw new Error(`Unknown milestone operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
