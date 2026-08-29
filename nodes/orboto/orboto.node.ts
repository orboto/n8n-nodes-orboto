import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { executeTicketOperation, ticketOperations } from './resources/ticket/Ticket.resource';
import { executeMilestoneOperation, milestoneOperations } from './resources/milestone/milestone.resource';
import { executeProjectOperation, projectOperations } from './resources/project/project.resource';
import { executeDocOperation, docOperations } from './resources/doc/doc.resource';
import { executeTimeOperation, timeOperations } from './resources/time/time.resource';
import {
	executeLabelOperation,
	executeSavedSearchOperation,
	executeUserOperation,
	labelOperations,
	savedSearchOperations,
	userOperations,
} from './resources/misc/misc.resources';
import { executeAgentOperation, agentOperations } from './resources/agent/agent.resource';
import {
	getLabels,
	getLabelNames,
	getMembers,
	getMilestones,
	getProjects,
	getSpaces,
	getStatuses,
	getVersions,
} from './shared/loadOptions';

export class orboto implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'orboto',
		name: 'orboto',
		icon: 'file:orboto.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description:
			'Automate tickets, milestones, projects, docs and more on an orboto instance. Rate limit: 600 requests/minute per instance - prefer bulk operations and enable Continue On Fail for large batches.',
		defaults: {
			name: 'orboto',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'orbotoApi',
				required: true,
				displayOptions: {
					show: {
						authType: ['apiKey'],
					},
				},
			},
			{
				name: 'orbotoOAuth2Api',
				required: true,
				displayOptions: {
					show: {
						authType: ['oauth'],
					},
				},
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authType',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'API Key',
						value: 'apiKey',
					},
					{
						name: 'OAuth2',
						value: 'oauth',
					},
				],
				default: 'apiKey',
				description: 'Which orboto credential style this node uses',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
				{
					name: 'Agent',
					value: 'agent',
				},
{
					name: 'Doc',
					value: 'doc',
				},
{
					name: 'Label',
					value: 'label',
				},
{
					name: 'Milestone',
					value: 'milestone',
				},
{
					name: 'Project',
					value: 'project',
				},
{
					name: 'Saved Search',
					value: 'savedSearch',
				},
{
					name: 'Ticket',
					value: 'ticket',
				},
{
					name: 'Time Entry',
					value: 'time',
				},
{
					name: 'User',
					value: 'user',
				},
			],

				default: 'ticket',
				required: true,
			},
			...ticketOperations,
			...milestoneOperations,
			...projectOperations,
			...docOperations,
			...timeOperations,
			...userOperations,
			...labelOperations,
			...savedSearchOperations,
			...agentOperations,
		],
	};

	methods = {
		loadOptions: {
			getProjects,
			getMilestones,
			getStatuses,
			getMembers,
			getLabels,
			getLabelNames,
			getVersions,
			getSpaces,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData(0);
		const resource = this.getNodeParameter('resource', 0) as string;
		const responseData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				if (resource === 'ticket') {
					responseData.push(...(await executeTicketOperation(this, itemIndex)));
				} else if (resource === 'milestone') {
					responseData.push(...(await executeMilestoneOperation(this, itemIndex)));
				} else if (resource === 'project') {
					responseData.push(...(await executeProjectOperation(this, itemIndex)));
				} else if (resource === 'doc') {
					responseData.push(...(await executeDocOperation(this, itemIndex)));
				} else if (resource === 'time') {
					responseData.push(...(await executeTimeOperation(this, itemIndex)));
				} else if (resource === 'user') {
					responseData.push(...(await executeUserOperation(this, itemIndex)));
				} else if (resource === 'label') {
					responseData.push(...(await executeLabelOperation(this, itemIndex)));
				} else if (resource === 'savedSearch') {
					responseData.push(...(await executeSavedSearchOperation(this, itemIndex)));
				} else if (resource === 'agent') {
					responseData.push(...(await executeAgentOperation(this, itemIndex)));
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, {
						itemIndex,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					responseData.push({
						json: {
							error:
								error instanceof Error
									? error.message
									: 'The operation failed - check the node output for details',
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [responseData];
	}
}
