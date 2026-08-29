import { createHmac, timingSafeEqual } from 'node:crypto';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IHookFunctions,
	IWebhookDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getLoadOptionsClient } from './shared/GenericFunctions';

/** The orboto webhook event catalog (16 events), versioned with this package. */
export const ORBOTO_WEBHOOK_EVENTS = [
	'ticket.created',
	'ticket.updated',
	'ticket.deleted',
	'ticket.ready',
	'ticket.checklist_item.completed',
	'comment.created',
	'comment.updated',
	'comment.deleted',
	'project.member_added',
	'project.member_removed',
	'milestone.created',
	'milestone.updated',
	'version.released',
	'symphony.candidates_changed',
	'inbound.signal.received',
	'agent.escalation_raised',
] as const;

function selectedEvents(context: { getNodeParameter(name: string, itemIndex?: number, fallback?: unknown): unknown }): string[] {
	const chosen = (context.getNodeParameter('events', 0, []) as string[]) ?? [];
	const extra = String(context.getNodeParameter('additionalEvents', 0, '') ?? '');
	const extras = extra
		.split(',')
		.map((e) => e.trim())
		.filter(Boolean);
	return [...new Set([...chosen, ...extras])];
}

/** Constant-time hex comparison; length-mismatched input is rejected outright. */
export function signatureMatches(received: string | undefined, expectedHex: string): boolean {
	if (!received) return false;
	const match = /^sha256=([0-9a-fA-F]{64})$/.exec(received.trim());
	if (!match) return false;
	const receivedBuf = Buffer.from(match[1].toLowerCase(), 'utf8');
	const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'utf8');
	return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

export class orbotoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'orboto Trigger',
		name: 'orbotoTrigger',
		icon: 'file:orbotoTrigger.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts a workflow when events happen in orboto (ticket created/updated/deleted/ready, comments, milestones, agent escalations and more). Deliveries are HMAC-verified.',
		defaults: {
			name: 'orboto Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'orbotoApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				path: 'webhook',
				responseMode: 'onReceived',
			} satisfies IWebhookDescription,
		],
		properties: [
			{
				displayName: 'Project Name or ID',
				name: 'project',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getProjects',
				},
				required: true,
				default: '',
				description:
					'The orboto project whose events to listen to (webhooks are project-scoped). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: ORBOTO_WEBHOOK_EVENTS.map((value) => ({ name: value, value })),
				default: ['ticket.created'],
				description: 'The events that fire this trigger',
			},
			{
				displayName: 'Additional Events',
				name: 'additionalEvents',
				type: 'string',
				default: '',
				placeholder: 'some.future.event, another.event',
				description:
					'Comma-separated event types beyond the catalog above, for orboto versions newer than this package',
			},
		],
	};

	webhookMethods = {
		default: {
			/** n8n calls this on activation: is a matching webhook already registered? */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const client = await getLoadOptionsClient(this);
				const projectId = String(this.getNodeParameter('project', 0));
				const registered = (await client.request<unknown[]>(
					`/projects/${encodeURIComponent(projectId)}/webhooks`,
				)) as Array<Record<string, unknown>>;
				const list = Array.isArray(registered) ? registered : [];
				const match = list.find((w) => w.url === webhookUrl);
				if (!match) return false;
				// A matching registration is only reusable when we still hold its
				// secret (it is returned once, at creation). Otherwise delete the
				// orphan so create() can register a fresh one with a new secret.
				const wanted = selectedEvents(this);
				const eventsMatch =
					Array.isArray(match.events) &&
					match.events.length === wanted.length &&
					wanted.every((e) => (match.events as string[]).includes(e));
				if (webhookData.webhookId === match.id && webhookData.secret && eventsMatch) {
					return true;
				}
				await client.request(`/webhooks/${match.id}`, { method: 'DELETE' });
				delete webhookData.webhookId;
				delete webhookData.secret;
				return false;
			},

			/** n8n calls this on activation when checkExists returned false. */
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'No webhook URL available - set the WEBHOOK_URL environment variable in n8n');
				}
				const client = await getLoadOptionsClient(this);
				const projectId = String(this.getNodeParameter('project', 0));
				const events = selectedEvents(this);
				if (events.length === 0) {
					throw new NodeOperationError(this.getNode(), 'Select at least one event for the trigger');
				}
				const created = await client.request<{ id: string; secret: string }>(
					`/projects/${encodeURIComponent(projectId)}/webhooks`,
					{
						method: 'POST',
						body: {
							// The default (orboto-shaped) payload format is the only one
							// that is HMAC-signed - vendor shapes skip the signature.
							payloadFormat: 'generic',
							name: `n8n workflow ${this.getWorkflow().id} - ${this.getNode().name}`.slice(0, 100),
							url: webhookUrl,
							events,
						},
					},
				);
				webhookData.webhookId = created.id;
				webhookData.secret = created.secret;
				return true;
			},

			/** n8n calls this on deactivation. */
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const client = await getLoadOptionsClient(this);
				if (webhookData.webhookId) {
					await client.request(`/webhooks/${webhookData.webhookId}`, { method: 'DELETE' });
				}
				delete webhookData.webhookId;
				delete webhookData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData() as IDataObject;
		const req = this.getRequestObject();
		const headerData = this.getHeaderData();
		const webhookData = this.getWorkflowStaticData('node');

		const secret = webhookData.secret as string | undefined;
		if (!secret) {
			throw new NodeOperationError(this.getNode(), 'The stored webhook secret is missing', {
				description:
					'Deactivate and re-activate the workflow so n8n can re-register the webhook with orboto.',
			});
		}

		const received = headerData['x-orboto-signature'];
		const raw = req.rawBody as Buffer | undefined;
		if (!raw || !signatureMatches(received as string | undefined, createHmac('sha256', secret).update(raw).digest('hex'))) {
			throw new NodeApiError(this.getNode(), new Error('Invalid webhook signature') as never, {
				description:
					'Delivery rejected: the X-Orboto-Signature header does not match the body (missing, forged, or wrong secret).',
				httpCode: '401',
			});
		}

		const event = String(headerData['x-orboto-event'] ?? '');
		const subscribed = selectedEvents(this);
		if (event && !subscribed.includes(event)) {
			// orboto should only deliver subscribed events; ignore anything else.
			return {};
		}

		const payload: IDataObject =
			bodyData && typeof bodyData === 'object' && Object.keys(bodyData).length > 0
				? { ...bodyData }
				: { raw: raw.toString('utf8') };
		if (event && payload.event === undefined) payload.event = event;

		return {
			workflowData: [[{ json: payload }]],
		};
	}
}
