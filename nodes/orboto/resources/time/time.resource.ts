import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { getClient, jsonOutput, resolveTicketId, toNodeError } from '../../shared/GenericFunctions';

const SHOW = { resource: ['time'] };

const TIME_OPERATIONS = ['delete', 'getAll', 'log', 'update'];

export const timeOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: SHOW },
		required: true,
		default: 'getAll',
		options: [
			{ name: 'Delete', value: 'delete' },
			{ name: 'Edit', value: 'update' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Log', value: 'log' },
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
		displayOptions: { show: { ...SHOW, operation: TIME_OPERATIONS } },
		default: '',
		description:
			'The orboto project of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Ticket',
		name: 'ticket',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: TIME_OPERATIONS } },
		default: '',
		description: 'Ticket key (ONN-42), number (42) or ID',
	},
	{
		displayName: 'Entry ID',
		name: 'entryId',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['delete', 'update'] } },
		default: '',
		description: 'ID of the time entry',
	},
	{
		displayName: 'Duration (Minutes)',
		name: 'durationMinutes',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		displayOptions: { show: { ...SHOW, operation: ['log', 'update'] } },
		default: 30,
		description: 'Logged duration in minutes',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		displayOptions: { show: { ...SHOW, operation: ['log', 'update'] } },
		default: '',
		description: 'What the time was spent on',
	},
	{
		displayName: 'Logged At',
		name: 'loggedAt',
		type: 'dateTime',
		displayOptions: { show: { ...SHOW, operation: ['log'] } },
		default: '',
		description: 'When the work happened (defaults to now)',
	},
];

export async function executeTimeOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);
		const project = String(context.getNodeParameter('project', itemIndex, '') ?? '');
		const ticket = String(context.getNodeParameter('ticket', itemIndex, '') ?? '');
		const ticketId = await resolveTicketId(client, project, ticket);

		switch (operation) {
			case 'log': {
				const body: Record<string, unknown> = {
					durationMinutes: context.getNodeParameter('durationMinutes', itemIndex) as number,
				};
				const description = context.getNodeParameter('description', itemIndex, '') as string;
				if (description !== '') body.description = description;
				const loggedAt = context.getNodeParameter('loggedAt', itemIndex, '') as string;
				if (loggedAt !== '') body.loggedAt = loggedAt;
				const created = await client.request(`/tickets/${ticketId}/time-entries`, {
					method: 'POST',
					body,
				});
				return [jsonOutput(created)];
			}
			case 'getAll': {
				const entries = await client.request(`/tickets/${ticketId}/time-entries`);
				const items = Array.isArray(entries)
					? entries
					: ((entries as { items?: unknown[] })?.items ?? []);
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}
			case 'update': {
				const entryId = context.getNodeParameter('entryId', itemIndex) as string;
				const body: Record<string, unknown> = {
					durationMinutes: context.getNodeParameter('durationMinutes', itemIndex) as number,
				};
				const description = context.getNodeParameter('description', itemIndex, '') as string;
				if (description !== '') body.description = description;
				const updated = await client.request(`/tickets/${ticketId}/time-entries/${entryId}`, {
					method: 'PATCH',
					body,
				});
				return [jsonOutput(updated)];
			}
			case 'delete': {
				const entryId = context.getNodeParameter('entryId', itemIndex) as string;
				await client.request(`/tickets/${ticketId}/time-entries/${entryId}`, { method: 'DELETE' });
				return [jsonOutput({ success: true, ticketId, entryId })];
			}
			default:
				throw new Error(`Unknown time operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
