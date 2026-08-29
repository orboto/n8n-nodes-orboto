import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { getLoadOptionsClient, pageItems } from './GenericFunctions';

interface Project {
	id: string;
	name: string;
	projectKey?: string;
}

interface Milestone {
	id: string;
	name: string;
	milestoneKey?: string;
}

interface Status {
	id: string;
	name: string;
	category: string;
}

interface Member {
	userId: string;
	user?: { id?: string; fullName?: string; email?: string };
}

interface Label {
	id: string;
	name: string;
}

interface Version {
	id: string;
	name: string;
}

interface Space {
	id: string;
	name: string;
	key?: string;
}

function option(value: string, name: string): INodePropertyOptions {
	return { value, name };
}

/** Projects the credential's account can see. */
export async function getProjects(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const client = await getLoadOptionsClient(this);
	const projects = await client.request<Project[]>('/projects/');
	return pageItems<any>(projects).map((p) => option(p.id, p.projectKey ? `${p.projectKey} - ${p.name}` : p.name));
}

/** Open (plus optionally closed) milestones of the project chosen in the node. */
export async function getMilestones(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const milestones = await client.request<Milestone[]>(
		`/projects/${encodeURIComponent(projectId)}/milestones`,
	);
	return pageItems<any>(milestones).map((m) =>
		option(m.id, m.milestoneKey ? `${m.milestoneKey} - ${m.name}` : m.name),
	);
}

/** Ticket statuses of the project, labeled with their category. */
export async function getStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const statuses = await client.request<Status[]>(
		`/projects/${encodeURIComponent(projectId)}/ticket-statuses`,
	);
	return pageItems<any>(statuses).map((s) => option(s.id, `${s.name} (${s.category})`));
}

/** Project members (assignee picker). */
export async function getMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const members = await client.request<Member[]>(`/projects/${encodeURIComponent(projectId)}/members`);
	return pageItems<any>(members).map((m) => {
		const userId = m.user?.id ?? m.userId;
		const name = m.user?.fullName ?? m.user?.email ?? userId;
		return option(userId, name);
	});
}

/** Labels of the project (ids - for the add/remove label routes). */
export async function getLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const labels = await client.request<Label[]>(`/projects/${encodeURIComponent(projectId)}/labels`);
	return pageItems<any>(labels).map((l) => option(l.id, l.name));
}

/** Labels of the project by name - create/update take labelNames, not ids. */
export async function getLabelNames(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const labels = await client.request<Label[]>(`/projects/${encodeURIComponent(projectId)}/labels`);
	return pageItems<any>(labels).map((l) => option(l.name, l.name));
}

/** Versions of the project. */
export async function getVersions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const projectId = this.getCurrentNodeParameter('project', { extractValue: true }) as string;
	if (!projectId) return [];
	const client = await getLoadOptionsClient(this);
	const versions = await client.request<Version[]>(`/projects/${encodeURIComponent(projectId)}/versions`);
	return pageItems<any>(versions).map((v) => option(v.id, v.name));
}

/** Wiki spaces (for the doc resource). */
export async function getSpaces(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const client = await getLoadOptionsClient(this);
	const spaces = await client.request<Space[]>('/spaces');
	return pageItems<any>(spaces).map((s) => option(s.id, s.key ? `${s.key} - ${s.name}` : s.name));
}
