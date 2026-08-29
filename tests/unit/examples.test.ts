import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { orboto } from '../../nodes/orboto/orboto.node';
import { orbotoTrigger, ORBOTO_WEBHOOK_EVENTS } from '../../nodes/orboto/orbotoTrigger.node';

const EXAMPLES_DIR = join(__dirname, '..', '..', 'examples');

interface WorkflowNode {
	name: string;
	type: string;
	parameters?: Record<string, unknown>;
	credentials?: Record<string, unknown>;
}

interface WorkflowFile {
	name: string;
	nodes: WorkflowNode[];
	connections: Record<string, { main?: Array<Array<{ node: string }>> }>;
}

function exampleFiles(): string[] {
	return readdirSync(EXAMPLES_DIR).filter((file) => file.endsWith('.json'));
}

function loadExample(file: string): WorkflowFile {
	return JSON.parse(readFileSync(join(EXAMPLES_DIR, file), 'utf8')) as WorkflowFile;
}

function nodeDescription(type: string) {
	if (type === 'n8n-nodes-orboto.orboto') return new orboto().description;
	if (type === 'n8n-nodes-orboto.orbotoTrigger') return new orbotoTrigger().description;
	return undefined;
}

function optionValues(property: INodeProperties): string[] {
	return (property.options ?? [])
		.filter((option): option is { name: string; value: string } => typeof (option as { value?: unknown }).value === 'string')
		.map((option) => option.value);
}

function collectionOptionNames(property: INodeProperties): string[] {
	return (property.options ?? []).map((option) => (option as { name: string }).name);
}

describe('example workflows', () => {
	it('ships at least the four documented scenarios', () => {
		const files = exampleFiles();
		expect(files).toContain('create-ticket-from-webhook.json');
		expect(files).toContain('notify-on-ticket-created.json');
		expect(files).toContain('nightly-oql-digest.json');
		expect(files).toContain('sync-ticket-to-external.json');
	});

	for (const file of exampleFiles()) {
		describe(file, () => {
			const workflow = loadExample(file);

			it('is valid JSON with nodes', () => {
				expect(workflow.name).toBeTruthy();
				expect(Array.isArray(workflow.nodes)).toBe(true);
				expect(workflow.nodes.length).toBeGreaterThan(0);
			});

			it('only connects nodes that exist', () => {
				const names = new Set(workflow.nodes.map((node) => node.name));
				for (const [source, connection] of Object.entries(workflow.connections)) {
					expect(names.has(source), `connection source ${source}`).toBe(true);
					for (const outputs of connection.main ?? []) {
						for (const target of outputs) {
							expect(names.has(target.node), `connection target ${target.node}`).toBe(true);
						}
					}
				}
			});

			it('uses only parameters and credentials the orboto nodes actually define', () => {
				for (const node of workflow.nodes) {
					const description = nodeDescription(node.type);
					if (!description) continue;
					// Parameter names repeat per resource (one operation property per
					// resource), so keep every definition, grouped by name.
					const properties = new Map<string, INodeProperties[]>();
					for (const property of description.properties) {
						properties.set(property.name, [...(properties.get(property.name) ?? []), property]);
					}
					for (const [key, value] of Object.entries(node.parameters ?? {})) {
						const definitions = properties.get(key);
						expect(definitions, `${node.name}: unknown parameter ${key}`).toBeDefined();
						if (!definitions) continue;
						const property = definitions[0];
						if (property.type === 'collection' && value && typeof value === 'object' && !Array.isArray(value)) {
							const allowed = new Set(collectionOptionNames(property));
							for (const nested of Object.keys(value as Record<string, unknown>)) {
								expect(allowed.has(nested), `${node.name}: unknown ${key} option ${nested}`).toBe(true);
							}
						}
						if (key === 'resource' || key === 'operation') {
							const allowed = definitions.flatMap(optionValues);
							expect(allowed, `${node.name}: invalid ${key} ${String(value)}`).toContain(String(value));
						}
						if (key === 'events' && Array.isArray(value)) {
							for (const event of value) {
								expect(ORBOTO_WEBHOOK_EVENTS, `${node.name}: unknown event ${String(event)}`).toContain(String(event));
							}
						}
					}
					const credentialNames = new Set((description.credentials ?? []).map((credential) => credential.name));
					for (const credential of Object.keys(node.credentials ?? {})) {
						expect(credentialNames.has(credential), `${node.name}: unknown credential ${credential}`).toBe(true);
					}
				}
			});
		});
	}
});
