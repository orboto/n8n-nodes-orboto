import type { IDataObject, IExecuteFunctions, INode, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { ApiError } from '../../shared/ApiClient';
import type { ApiPage } from '../../shared/Types';
import { collectQuery, getClient, isUuid, jsonOutput, resolveTicketId, toNodeError } from '../../shared/GenericFunctions';

const SHOW_TICKET = { resource: ['ticket'] };

/** Operations that need a project parameter (everything except OQL query). */
const PROJECT_OPERATIONS = [
	'assign',
	'addAttachment',
	'addChecklistItem',
	'addDependency',
	'addLabel',
	'bulkUpdate',
	'checkChecklistItem',
	'clearMilestone',
	'clearVersion',
	'comment',
	'create',
	'delete',
	'get',
	'getAll',
	'getAttachments',
	'getDependencies',
	'logTime',
	'move',
	'removeDependency',
	'removeLabel',
	'setMilestone',
	'setVersion',
	'setStatus',
	'unassign',
	'uncheckChecklistItem',
	'update',
];

/** Operations that reference one ticket. */
const TICKET_OPERATIONS = PROJECT_OPERATIONS.filter(
	(o) => o !== 'getAll' && o !== 'create' && o !== 'bulkUpdate',
);

/** Shared 'Project' parameter - the scope for almost every ticket operation. */
const projectParam: INodeProperties = {
	displayName: 'Project Name or ID',
	name: 'project',
	type: 'options',
	typeOptions: {
		loadOptionsMethod: 'getProjects',
	},
	required: true,
	displayOptions: {
		show: { ...SHOW_TICKET, operation: PROJECT_OPERATIONS },
	},
	default: '',
	description: 'The orboto project the ticket belongs to. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
};

/** Shared 'Ticket' parameter - accepts a UUID, a key like ONN-42 or a bare number. */
const ticketParam: INodeProperties = {
	displayName: 'Ticket',
	name: 'ticket',
	type: 'string',
	required: true,
	displayOptions: {
		show: { ...SHOW_TICKET, operation: TICKET_OPERATIONS },
	},
	default: '',
	description: 'Ticket key (ONN-42), number (42) or ID',
};

export const ticketOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: SHOW_TICKET },
		required: true,
		default: 'create',
		options: [
			{ name: 'Add Attachment', value: 'addAttachment' },
			{ name: 'Add Checklist Item', value: 'addChecklistItem' },
			{ name: 'Add Dependency', value: 'addDependency' },
			{ name: 'Add Label', value: 'addLabel' },
			{ name: 'Assign', value: 'assign' },
			{ name: 'Bulk Update', value: 'bulkUpdate' },
			{ name: 'Check Checklist Item', value: 'checkChecklistItem' },
			{ name: 'Clear Milestone', value: 'clearMilestone' },
			{ name: 'Clear Version', value: 'clearVersion' },
			{ name: 'Comment', value: 'comment' },
			{ name: 'Create', value: 'create' },
			{ name: 'Delete', value: 'delete' },
			{ name: 'Get', value: 'get' },
			{ name: 'Get Many', value: 'getAll' },
			{ name: 'Get Attachments', value: 'getAttachments' },
			{ name: 'Get Dependencies', value: 'getDependencies' },
			{ name: 'Log Time', value: 'logTime' },
			{ name: 'Move (Change Status)', value: 'move' },
			{ name: 'OQL Query', value: 'query' },
			{ name: 'Remove Dependency', value: 'removeDependency' },
			{ name: 'Remove Label', value: 'removeLabel' },
			{ name: 'Set Milestone', value: 'setMilestone' },
			{ name: 'Set Version', value: 'setVersion' },
			{ name: 'Unassign', value: 'unassign' },
			{ name: 'Uncheck Checklist Item', value: 'uncheckChecklistItem' },
			{ name: 'Update', value: 'update' },
		].sort((a, b) => a.value.localeCompare(b.value)),
	},
	projectParam,
	ticketParam,
	// -- create / update fields -------------------------------------------------
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create'] } },
		default: '',
		description: 'Ticket title',
	},
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 6 },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: '',
		description: 'Ticket description (Markdown)',
	},
	{
		displayName: 'Type',
		name: 'type',
		type: 'options',
		options: ['epic', 'story', 'task', 'bug'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: 'task',
		description: 'Ticket type',
	},
	{
		displayName: 'Priority',
		name: 'priority',
		type: 'options',
		options: ['blocker', 'high', 'normal', 'low', 'trivial'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: 'normal',
		description: 'Ticket priority',
	},
	{
		displayName: 'Status Name or ID',
		name: 'statusId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getStatuses' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update', 'move'] } },
		default: '',
		description: 'Status to set (statuses come from the project). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Milestone Name or ID',
		name: 'milestoneId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMilestones' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update', 'setMilestone'] } },
		default: '',
		description: 'Milestone of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Version Name or ID',
		name: 'versionId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVersions' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update', 'setVersion'] } },
		default: '',
		description: 'Version of the ticket. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Label Names or IDs',
		name: 'labelNames',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getLabelNames' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: [],
		description: 'Labels to attach. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Assignee Emails',
		name: 'assigneeEmails',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: '',
		description: 'Comma-separated email addresses to assign',
	},
	{
		displayName: 'Parent Ticket',
		name: 'parentTicketId',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: '',
		description: 'Parent ticket key or ID for sub-tickets',
	},
	{
		displayName: 'Start Date',
		name: 'startDate',
		type: 'string',
		placeholder: 'YYYY-MM-DD',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: '',
		description: 'Planned start date (YYYY-MM-DD)',
	},
	{
		displayName: 'Due Date',
		name: 'dueDate',
		type: 'string',
		placeholder: 'YYYY-MM-DD',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: '',
		description: 'Due date (YYYY-MM-DD)',
	},
	{
		displayName: 'Estimated Time (Minutes)',
		name: 'estimatedTimeMinutes',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: 0,
		description: 'Estimated effort in minutes',
	},
	{
		displayName: 'Private',
		name: 'isPrivate',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: false,
		description: 'Whether the ticket is only visible to team members with access',
	},
	{
		displayName: 'Delivery Mode',
		name: 'deliveryMode',
		type: 'options',
		options: ['implementation', 'docs', 'review', 'admin', 'epic'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: 'implementation',
		description: 'Delivery mode of the ticket',
	},
	{
		displayName: 'Skip Auto-Translate',
		name: 'skipAutoTranslate',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: false,
		description: 'Whether to skip the automatic translation of the ticket',
	},
	// -- language + duplicate semantics (binding error-handling design) ----------
	{
		displayName: 'Allow Language Mismatch',
		name: 'allowLanguageMismatch',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create', 'update'] } },
		default: false,
		description:
			'Whether to accept a 422 language-enforcement block and create/update anyway (sends allowLanguageMismatch=true). Without this, orboto enforces the project language.',
	},
	{
		displayName: 'Allow Duplicate',
		name: 'allowDuplicate',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create'] } },
		default: false,
		description:
			'Whether to create anyway when orboto blocks a hard duplicate (409 with similarWarnings). Requires a justification.',
	},
	{
		displayName: 'Duplicate Justification',
		name: 'duplicateJustification',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['create'], allowDuplicate: [true] } },
		default: '',
		description: 'Why this ticket is distinct from the flagged similar ones (required with Allow Duplicate)',
	},
	// -- get many filters --------------------------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll', 'query'] } },
		default: false,
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll', 'query'], returnAll: [false] } },
		default: 50,
		description: 'Max number of results to return',
	},
	{
		displayName: 'Status Category',
		name: 'statusCategory',
		type: 'options',
		options: ['todo', 'in_progress', 'in_review', 'done', 'wont_fix'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: '',
		description: 'Filter by status category',
	},
	{
		displayName: 'Assignee Name or ID',
		name: 'assigneeId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMembers' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: '',
		description: 'Filter by assignee. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Milestone Filter Name or ID',
		name: 'milestoneFilterId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMilestones' },
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: '',
		description: 'Filter by milestone. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Parent Ticket Filter',
		name: 'parentFilterId',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: '',
		description: 'Filter by parent ticket key or ID',
	},
	{
		displayName: 'Search',
		name: 'search',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: '',
		description: 'Full-text search term',
	},
	{
		displayName: 'Include Closed Milestones',
		name: 'includeClosedMilestones',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['getAll'] } },
		default: false,
		description: 'Whether to include tickets of closed milestones',
	},
	{
		displayName: 'Delete Is Permanent',
		name: 'deleteNotice',
		type: 'notice',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['delete'] } },
		default: '',
		description:
			'Deleting is permanent unless the ticket is under legal hold (HTTP 423). Move to wont_fix instead of deleting when in doubt.',
	},
	// -- assign / comment / time / label -----------------------------------------
	{
		displayName: 'User Name or ID',
		name: 'userId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMembers' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['assign', 'unassign'] } },
		default: '',
		description: 'Project member to assign or unassign. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Comment',
		name: 'content',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['comment'] } },
		default: '',
		description: 'Comment text (Markdown)',
	},
	{
		displayName: 'Internal',
		name: 'isInternal',
		type: 'boolean',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['comment'] } },
		default: false,
		description: 'Whether the comment is internal (not visible to customers)',
	},
	{
		displayName: 'Duration (Minutes)',
		name: 'durationMinutes',
		type: 'number',
		typeOptions: { numberPrecision: 0 },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['logTime'] } },
		default: 30,
		description: 'Time to log in minutes',
	},
	{
		displayName: 'Time Description',
		name: 'timeDescription',
		type: 'string',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['logTime'] } },
		default: '',
		description: 'What the time was spent on',
	},
	{
		displayName: 'Logged At',
		name: 'loggedAt',
		type: 'dateTime',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['logTime'] } },
		default: '',
		description: 'When the work happened (defaults to now)',
	},
	{
		displayName: 'Label Name or ID',
		name: 'labelId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getLabels' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['addLabel', 'removeLabel'] } },
		default: '',
		description: 'Label to add or remove. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	// -- OQL query ---------------------------------------------------------------
	{
		displayName: 'Query',
		name: 'oql',
		type: 'string',
		typeOptions: { rows: 6 },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['query'] } },
		default: '',
		description:
			'OQL query, for example: project = ONN and status = todo and assignee = me order by priority',
	},
	{
		displayName: 'Syntax',
		name: 'syntax',
		type: 'options',
		options: [
			{ name: 'OQL', value: 'oql' },
			{ name: 'JQL', value: 'jql' },
		],
		displayOptions: { show: { ...SHOW_TICKET, operation: ['query'] } },
		default: 'oql',
		description: 'Query syntax to use',
	},
	// -- dependencies ------------------------------------------------------------
	{
		displayName: 'Depends On Ticket',
		name: 'dependsOn',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['addDependency', 'removeDependency'] } },
		default: '',
		description: 'The ticket this one depends on (key or ID)',
	},
	// -- checklists --------------------------------------------------------------
	{
		displayName: 'Checklist ID',
		name: 'listId',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['addChecklistItem'] } },
		default: '',
		description: 'ID of the checklist to append to',
	},
	{
		displayName: 'Item Text',
		name: 'itemContent',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['addChecklistItem'] } },
		default: '',
		description: 'Checklist item text',
	},
	{
		displayName: 'Item ID',
		name: 'itemId',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['checkChecklistItem', 'uncheckChecklistItem'] } },
		default: '',
		description: 'ID of the checklist item',
	},
	// -- attachments --------------------------------------------------------------
	{
		displayName: 'Binary Property',
		name: 'binaryProperty',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { ...SHOW_TICKET, operation: ['addAttachment'] } },
		description: 'Name of the binary property holding the file to upload',
	},
	// -- bulk ----------------------------------------------------------------------
	{
		displayName: 'Ticket IDs',
		name: 'bulkIds',
		type: 'string',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'] } },
		default: '',
		description: 'Comma-separated ticket IDs to update',
	},
	{
		displayName: 'Action',
		name: 'bulkAction',
		type: 'options',
		required: true,
		options: [
			{ name: 'Assignee', value: 'assignee' },
			{ name: 'Due Date', value: 'due_date' },
			{ name: 'Milestone', value: 'milestone' },
			{ name: 'Priority', value: 'priority' },
			{ name: 'Status', value: 'status' },
			{ name: 'Version', value: 'version' },
		],
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'] } },
		default: 'status',
		description: 'Field to change on every listed ticket',
	},
	{
		displayName: 'Value Name or ID',
		name: 'bulkValueStatus',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getStatuses' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['status'] } },
		default: '',
		description: 'Status to set. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Value Name or ID',
		name: 'bulkValueMilestone',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMilestones' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['milestone'] } },
		default: '',
		description: 'Milestone to set. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Value Name or ID',
		name: 'bulkValueAssignee',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getMembers' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['assignee'] } },
		default: '',
		description: 'Member to assign. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Value Name or ID',
		name: 'bulkValueVersion',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVersions' },
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['version'] } },
		default: '',
		description: 'Version to set. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Value',
		name: 'bulkValuePriority',
		type: 'options',
		required: true,
		options: ['blocker', 'high', 'normal', 'low', 'trivial'].map((v) => ({ name: v, value: v })),
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['priority'] } },
		default: 'normal',
		description: 'Priority to set',
	},
	{
		displayName: 'Value',
		name: 'bulkValueDueDate',
		type: 'string',
		placeholder: 'YYYY-MM-DD',
		required: true,
		displayOptions: { show: { ...SHOW_TICKET, operation: ['bulkUpdate'], bulkAction: ['due_date'] } },
		default: '',
		description: 'Due date to set',
	},
];

/** Reads an optional string parameter, returning undefined when empty. */
function optionalString(context: IExecuteFunctions, name: string, itemIndex: number): string | undefined {
	const value = context.getNodeParameter(name, itemIndex, '') as string;
	return value === '' ? undefined : value;
}

/** Collects the create/update body from the optional fields present in the form. */
function collectTicketBody(
	context: IExecuteFunctions,
	itemIndex: number,
	fields: Array<'title' | 'description' | 'type' | 'priority' | 'statusId' | 'milestoneId' | 'versionId' | 'startDate' | 'dueDate' | 'estimatedTimeMinutes' | 'isPrivate' | 'deliveryMode' | 'skipAutoTranslate'>,
): IDataObject {
	const body: IDataObject = {};
	for (const field of fields) {
		if (field === 'description') {
			const value = optionalString(context, 'description', itemIndex);
			if (value !== undefined) body.description = value;
		} else if (field === 'startDate' || field === 'dueDate') {
			const value = optionalString(context, field, itemIndex);
			if (value !== undefined) body[field] = value;
		} else if (field === 'estimatedTimeMinutes') {
			const value = context.getNodeParameter('estimatedTimeMinutes', itemIndex, 0) as number;
			if (value > 0) body.estimatedTimeMinutes = value;
		} else if (field === 'isPrivate' || field === 'skipAutoTranslate') {
			const value = context.getNodeParameter(field, itemIndex, false) as boolean;
			if (value) body[field] = value;
		} else if (field === 'title') {
			body.title = context.getNodeParameter('title', itemIndex) as string;
		} else {
			const value = optionalString(context, field, itemIndex);
			if (value !== undefined) body[field] = value;
		}
	}
	const labelNames = context.getNodeParameter('labelNames', itemIndex, []) as string[];
	if (Array.isArray(labelNames) && labelNames.length > 0) body.labelNames = labelNames;
	const assigneeEmails = optionalString(context, 'assigneeEmails', itemIndex);
	if (assigneeEmails) {
		body.assigneeEmails = assigneeEmails
			.split(',')
			.map((email) => email.trim())
			.filter(Boolean);
	}
	return body;
}

export async function executeTicketOperation(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const node = context.getNode();
	const operation = context.getNodeParameter('operation', itemIndex) as string;
	try {
		const client = await getClient(context);
		const project = String(context.getNodeParameter('project', itemIndex, '') ?? '');
		const ticket = String(context.getNodeParameter('ticket', itemIndex, '') ?? '');
		const ticketBase = `/projects/${encodeURIComponent(project)}/tickets`;

		switch (operation) {
			case 'create': {
				const allowLanguageMismatch = context.getNodeParameter('allowLanguageMismatch', itemIndex, false) as boolean;
				const allowDuplicate = context.getNodeParameter('allowDuplicate', itemIndex, false) as boolean;
				const duplicateJustification = optionalString(context, 'duplicateJustification', itemIndex);
				if (allowDuplicate && !duplicateJustification) {
					throw new NodeOperationError(node, 'Duplicate Justification is required when Allow Duplicate is enabled', { itemIndex });
				}
				const body = collectTicketBody(context, itemIndex, [
					'title',
					'description',
					'type',
					'priority',
					'statusId',
					'milestoneId',
					'versionId',
					'startDate',
					'dueDate',
					'estimatedTimeMinutes',
					'isPrivate',
					'deliveryMode',
					'skipAutoTranslate',
				]);
				const parent = optionalString(context, 'parentTicketId', itemIndex);
				if (parent) body.parentTicketId = await resolveTicketId(client, project, parent);
				if (allowDuplicate && duplicateJustification) body.duplicateJustification = duplicateJustification;
				// The created ticket includes languageWarning and similarWarnings so
				// workflows can branch on them (binding error-semantics design).
				const created = await client.request(`/projects/${encodeURIComponent(project)}/tickets`, {
					method: 'POST',
					body,
					query: {
						allowLanguageMismatch: allowLanguageMismatch || undefined,
						allowDuplicate: allowDuplicate || undefined,
					},
				});
				return [jsonOutput(created)];
			}

			case 'get': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const found = await client.request(`${ticketBase}/${ticketId}`);
				return [jsonOutput(found)];
			}

			case 'getAll': {
				const parentFilter = optionalString(context, 'parentFilterId', itemIndex);
				const query = collectQuery([
					['statusCategory', optionalString(context, 'statusCategory', itemIndex)],
					['assigneeId', optionalString(context, 'assigneeId', itemIndex)],
					['milestoneId', optionalString(context, 'milestoneFilterId', itemIndex)],
					['parentTicketId', parentFilter && !isUuid(parentFilter) ? await resolveTicketId(client, project, parentFilter) : parentFilter],
					['search', optionalString(context, 'search', itemIndex)],
					['includeClosedMilestones', context.getNodeParameter('includeClosedMilestones', itemIndex, false) as boolean],
				]);
				const returnAll = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
				const limit = returnAll ? undefined : (context.getNodeParameter('limit', itemIndex, 50) as number);
				const tickets = await client.paginate<Record<string, unknown>>(`${ticketBase}`, { query, limit });
				return tickets.map(jsonOutput);
			}

			case 'update': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const allowLanguageMismatch = context.getNodeParameter('allowLanguageMismatch', itemIndex, false) as boolean;
				const body = collectTicketBody(context, itemIndex, [
					'description',
					'type',
					'priority',
					'statusId',
					'milestoneId',
					'versionId',
					'startDate',
					'dueDate',
					'estimatedTimeMinutes',
					'isPrivate',
					'deliveryMode',
					'skipAutoTranslate',
				]);
				const parent = optionalString(context, 'parentTicketId', itemIndex);
				if (parent) body.parentTicketId = await resolveTicketId(client, project, parent);
				const updated = await client.request(`${ticketBase}/${ticketId}`, {
					method: 'PATCH',
					body,
					query: { allowLanguageMismatch: allowLanguageMismatch || undefined },
				});
				return [jsonOutput(updated)];
			}

			case 'delete': {
				const ticketId = await resolveTicketId(client, project, ticket);
				await client.request(`${ticketBase}/${ticketId}`, { method: 'DELETE' });
				return [jsonOutput({ success: true, ticketId })];
			}

			case 'move': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const statusId = context.getNodeParameter('statusId', itemIndex) as string;
				const moved = await client.request(`${ticketBase}/${ticketId}`, {
					method: 'PATCH',
					body: { statusId },
				});
				return [jsonOutput(moved)];
			}

			case 'assign':
			case 'unassign': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const userId = context.getNodeParameter('userId', itemIndex) as string;
				await client.request(`${ticketBase}/${ticketId}/assignees/${encodeURIComponent(userId)}`, {
					method: operation === 'assign' ? 'POST' : 'DELETE',
				});
				return [jsonOutput({ success: true, ticketId, userId, assigned: operation === 'assign' })];
			}

			case 'comment': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const content = context.getNodeParameter('content', itemIndex) as string;
				const isInternal = context.getNodeParameter('isInternal', itemIndex, false) as boolean;
				const created = await client.request(`/tickets/${ticketId}/comments`, {
					method: 'POST',
					body: { content, isInternal },
				});
				return [jsonOutput(created)];
			}

			case 'logTime': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const durationMinutes = context.getNodeParameter('durationMinutes', itemIndex) as number;
				const body: IDataObject = { durationMinutes };
				const description = optionalString(context, 'timeDescription', itemIndex);
				if (description) body.description = description;
				const loggedAt = optionalString(context, 'loggedAt', itemIndex);
				if (loggedAt) body.loggedAt = loggedAt;
				const created = await client.request(`/tickets/${ticketId}/time-entries`, {
					method: 'POST',
					body,
				});
				return [jsonOutput(created)];
			}

			case 'addLabel':
			case 'removeLabel': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const labelId = context.getNodeParameter('labelId', itemIndex) as string;
				await client.request(`/projects/tickets/${ticketId}/labels/${encodeURIComponent(labelId)}`, {
					method: operation === 'addLabel' ? 'POST' : 'DELETE',
				});
				return [jsonOutput({ success: true, ticketId, labelId, added: operation === 'addLabel' })];
			}

			case 'query': {
				// /query paginates via the request BODY (cursor + limit), so this
				// walks pages manually instead of using the query-param helper.
				const oql = context.getNodeParameter('oql', itemIndex) as string;
				const syntax = context.getNodeParameter('syntax', itemIndex, 'oql') as string;
				const returnAll = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
				const limit = returnAll ? undefined : (context.getNodeParameter('limit', itemIndex, 50) as number);
				const collected: Record<string, unknown>[] = [];
				const seenCursors = new Set<string>();
				let cursor: string | undefined;
				while (limit === undefined || collected.length < limit) {
					const remaining = limit === undefined ? 200 : Math.min(200, limit - collected.length);
					const page = await client.request<ApiPage<Record<string, unknown>>>('/query', {
						method: 'POST',
						body: { oql, syntax, limit: remaining, cursor },
					});
					if (!Array.isArray(page?.items)) break;
					collected.push(...page.items.slice(0, remaining));
					if (!page.nextCursor) break;
					if (seenCursors.has(page.nextCursor)) {
						throw new ApiError({ status: 200, code: 'pagination_loop', message: 'The /query endpoint returned a repeated cursor' });
					}
					seenCursors.add(page.nextCursor);
					cursor = page.nextCursor;
				}
				return collected.map(jsonOutput);
			}

			case 'setMilestone':
			case 'clearMilestone': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const milestoneId = operation === 'setMilestone' ? (context.getNodeParameter('milestoneId', itemIndex) as string) : null;
				const updated = await client.request(`${ticketBase}/${ticketId}`, {
					method: 'PATCH',
					body: { milestoneId },
				});
				return [jsonOutput(updated)];
			}

			case 'setVersion':
			case 'clearVersion': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const versionId = operation === 'setVersion' ? (context.getNodeParameter('versionId', itemIndex) as string) : null;
				const updated = await client.request(`${ticketBase}/${ticketId}`, {
					method: 'PATCH',
					body: { versionId },
				});
				return [jsonOutput(updated)];
			}

			case 'addDependency': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const dependsOn = context.getNodeParameter('dependsOn', itemIndex) as string;
				const dependsOnId = await resolveTicketId(client, project, dependsOn);
				const created = await client.request(`${ticketBase}/${ticketId}/dependencies`, {
					method: 'POST',
					body: { dependsOnId },
				});
				return [jsonOutput(created)];
			}

			case 'removeDependency': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const dependsOn = context.getNodeParameter('dependsOn', itemIndex) as string;
				const dependsOnId = await resolveTicketId(client, project, dependsOn);
				await client.request(`${ticketBase}/${ticketId}/dependencies/${dependsOnId}`, { method: 'DELETE' });
				return [jsonOutput({ success: true, ticketId, dependsOnId })];
			}

			case 'getDependencies': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const dependencies = await client.request(`${ticketBase}/${ticketId}/dependencies`);
				return [jsonOutput(dependencies)];
			}

			case 'addChecklistItem': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const listId = context.getNodeParameter('listId', itemIndex) as string;
				const itemContent = context.getNodeParameter('itemContent', itemIndex) as string;
				const created = await client.request(`/tickets/${ticketId}/checklists/${listId}/items`, {
					method: 'POST',
					body: { content: itemContent },
				});
				return [jsonOutput(created)];
			}

			case 'checkChecklistItem':
			case 'uncheckChecklistItem': {
				const itemId = context.getNodeParameter('itemId', itemIndex) as string;
				const updated = await client.request(`/checklist-items/${itemId}`, {
					method: 'PATCH',
					body: { isCompleted: operation === 'checkChecklistItem' },
				});
				return [jsonOutput(updated)];
			}

			case 'getAttachments': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const attachments = await client.request(`/tickets/${ticketId}/attachments`);
				const items = Array.isArray(attachments) ? attachments : [];
				return (items as Record<string, unknown>[]).map(jsonOutput);
			}

			case 'addAttachment': {
				const ticketId = await resolveTicketId(client, project, ticket);
				const binaryProperty = String(context.getNodeParameter('binaryProperty', itemIndex, 'data'));
				const binaryData = context.getInputData(0)[itemIndex].binary?.[binaryProperty];
				if (!binaryData) {
					throw new NodeOperationError(node, `No binary data found in property "${binaryProperty}"`, { itemIndex });
				}
				const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
				const form = new FormData();
				form.append(
					'file',
					new Blob([new Uint8Array(buffer)], { type: binaryData.mimeType || 'application/octet-stream' }),
					binaryData.fileName || 'attachment',
				);
				const uploaded = await client.request(`/tickets/${ticketId}/attachments`, {
					method: 'POST',
					body: form,
				});
				return [jsonOutput(uploaded)];
			}

			case 'bulkUpdate': {
				const ids = String(context.getNodeParameter('bulkIds', itemIndex) ?? '')
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean);
				if (ids.length === 0) {
					throw new NodeOperationError(node, 'Provide at least one ticket id', { itemIndex });
				}
				const action = context.getNodeParameter('bulkAction', itemIndex) as string;
				const valueParams: Record<string, string> = {
					status: 'bulkValueStatus',
					milestone: 'bulkValueMilestone',
					assignee: 'bulkValueAssignee',
					version: 'bulkValueVersion',
					priority: 'bulkValuePriority',
					due_date: 'bulkValueDueDate',
				};
				const valueParam = valueParams[action];
				const value = String(context.getNodeParameter(valueParam, itemIndex) ?? '');
				const result = await client.request(`/projects/${encodeURIComponent(project)}/tickets/bulk`, {
					method: 'POST',
					body: { ids, action, value },
				});
				return [jsonOutput(result)];
			}

			default:
				throw new NodeOperationError(node, `Unknown ticket operation: ${operation}`, { itemIndex });
		}
	} catch (error) {
		throw toNodeError(node, error, itemIndex);
	}
}
