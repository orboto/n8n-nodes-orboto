import type { IExecuteFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { getClient, jsonOutput, toNodeError } from '../../shared/GenericFunctions';

/**
 * Agent resource - the n8n-to-AI-agent bridge (added in the 2026-08-29 design
 * review): notify an agent identity, fetch its inbox, acknowledge messages.
 */
export const agentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['agent'] } },
		required: true,
		default: 'notify',
		options: [
			{ name: 'Ack Messages', value: 'ack' },
			{ name: 'Get Messages', value: 'getMessages' },
			{ name: 'Notify', value: 'notify' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	{
		displayName: 'Target Email',
		name: 'targetEmail',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: '',
		placeholder: 'agent@orboto.io',
		description: 'Email of the agent identity to notify',
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: '',
		description: 'Subject line (max 200 characters)',
	},
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		options: [
			{ name: 'Info', value: 'info' },
			{ name: 'Request', value: 'request' },
			{ name: 'Complete', value: 'complete' },
			{ name: 'Error', value: 'error' },
		],
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: 'info',
		description: 'Info is FYI, request expects an answer, complete closes a request, error reports failure',
	},
	{
		displayName: 'Payload (JSON)',
		name: 'payloadJson',
		type: 'json',
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: '',
		description: 'Structured payload for the agent to read',
	},
	{
		displayName: 'Thread ID',
		name: 'threadId',
		type: 'string',
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: '',
		description: 'Thread ID to chain a conversation',
	},
	{
		displayName: 'Project Scope',
		name: 'project',
		type: 'string',
		displayOptions: { show: { resource: ['agent'], operation: ['notify', 'getMessages'] } },
		default: '',
		placeholder: 'ONN',
		description: 'Project key so the message routes to the right session',
	},
	{
		displayName: 'Sender Reference',
		name: 'senderRef',
		type: 'string',
		displayOptions: { show: { resource: ['agent'], operation: ['notify'] } },
		default: '',
		description: 'Stable reference of the sender (e.g. the workflow name)',
	},
	{
		displayName: 'Include Already-Delivered',
		name: 'all',
		type: 'boolean',
		displayOptions: { show: { resource: ['agent'], operation: ['getMessages'] } },
		default: false,
		description: 'Whether to include messages the agent already received',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		displayOptions: { show: { resource: ['agent'], operation: ['getMessages'] } },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Exclude Reference',
		name: 'excludeRef',
		type: 'string',
		displayOptions: { show: { resource: ['agent'], operation: ['getMessages'] } },
		default: '',
		description: 'Skip messages sent from this sender reference',
	},
	{
		displayName: 'Message IDs',
		name: 'ids',
		type: 'string',
		required: true,
		displayOptions: { show: { resource: ['agent'], operation: ['ack'] } },
		default: '',
		description: 'Comma-separated message IDs to acknowledge',
	},
];

export async function executeAgentOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);

		switch (operation) {
			case 'notify': {
				const body: Record<string, unknown> = {
					targetEmail: context.getNodeParameter('targetEmail', itemIndex) as string,
					subject: context.getNodeParameter('subject', itemIndex) as string,
					kind: context.getNodeParameter('kind', itemIndex, 'info') as string,
				};
				const payloadJson = context.getNodeParameter('payloadJson', itemIndex, '') as unknown;
				if (payloadJson !== '' && payloadJson !== undefined && payloadJson !== null) {
					body.payload = typeof payloadJson === 'string' ? JSON.parse(payloadJson) : payloadJson;
				}
				const threadId = context.getNodeParameter('threadId', itemIndex, '') as string;
				if (threadId !== '') body.threadId = threadId;
				const project = context.getNodeParameter('project', itemIndex, '') as string;
				if (project !== '') body.project = project;
				const senderRef = context.getNodeParameter('senderRef', itemIndex, '') as string;
				if (senderRef !== '') body.senderRef = senderRef;
				const sent = await client.request('/v1/agent/notify', { method: 'POST', body });
				return [jsonOutput(sent)];
			}
			case 'getMessages': {
				const messages = await client.request('/v1/agent/messages', {
					query: {
						all: (context.getNodeParameter('all', itemIndex, false) as boolean) || undefined,
						limit: context.getNodeParameter('limit', itemIndex, 20) as number,
						project: (context.getNodeParameter('project', itemIndex, '') as string) || undefined,
						excludeRef: (context.getNodeParameter('excludeRef', itemIndex, '') as string) || undefined,
					},
				});
				return [jsonOutput(messages)];
			}
			case 'ack': {
				const ids = String(context.getNodeParameter('ids', itemIndex) ?? '')
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean);
				const result = await client.request('/v1/agent/messages/ack', {
					method: 'POST',
					body: { ids },
				});
				return [jsonOutput(result)];
			}
			default:
				throw new Error(`Unknown agent operation: ${operation}`);
		}
	} catch (error) {
		throw toNodeError(context.getNode(), error, itemIndex);
	}
}
