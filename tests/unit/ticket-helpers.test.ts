import { describe, expect, it } from 'vitest';
import { ApiClient } from '../../nodes/orboto/shared/ApiClient';
import type { Transport, TransportRequest } from '../../nodes/orboto/shared/Types';
import { collectQuery, pageItems, resolveTicketId } from '../../nodes/orboto/shared/GenericFunctions';

const UUID = '33985889-ece0-40c9-af44-96206d0795d8';

function fakeClient(respond: (request: TransportRequest) => unknown): ApiClient {
	const transport: Transport = (request) => {
		const result = respond(request);
		if (result instanceof Error) return Promise.reject(result);
		return Promise.resolve(result);
	};
	return new ApiClient({ baseUrl: 'https://orboto.example.com', apiKey: 'k' }, transport);
}

describe('pageItems', () => {
	it('passes through bare arrays', () => {
		expect(pageItems([{ id: 'a' }])).toEqual([{ id: 'a' }]);
	});

	it('extracts items from cursor envelopes', () => {
		expect(pageItems({ items: [{ id: 'a' }], nextCursor: 'c1' })).toEqual([{ id: 'a' }]);
	});

	it('returns an empty array for unexpected shapes', () => {
		expect(pageItems({ nope: true })).toEqual([]);
		expect(pageItems(null)).toEqual([]);
	});
});

describe('resolveTicketId', () => {
	it('passes UUIDs through without calling the API', async () => {
		let calls = 0;
		const client = fakeClient(() => {
			calls += 1;
			return {};
		});
		await expect(resolveTicketId(client, 'ONN', `  ${UUID}  `)).resolves.toBe(UUID);
		expect(calls).toBe(0);
	});

	it('resolves keys and numbers via the by-key route', async () => {
		const seen: string[] = [];
		const client = fakeClient((request) => {
			seen.push(request.url);
			return { id: UUID, title: 'found' };
		});
		await expect(resolveTicketId(client, 'ONN', 'ONN-42')).resolves.toBe(UUID);
		await expect(resolveTicketId(client, 'ONN', '42')).resolves.toBe(UUID);
		expect(seen).toEqual([
			'https://orboto.example.com/api/projects/ONN/tickets/by-key/ONN-42',
			'https://orboto.example.com/api/projects/ONN/tickets/by-key/42',
		]);
	});

	it('fails when a key needs resolution but no project is set', async () => {
		const client = fakeClient(() => ({}));
		await expect(resolveTicketId(client, '', 'ONN-42')).rejects.toThrow(/project is required/);
	});
});

describe('collectQuery', () => {
	it('keeps primitives and drops empties and objects', () => {
		expect(
			collectQuery([
				['statusCategory', 'todo'],
				['assigneeId', ''],
				['includeClosedMilestones', true],
				['limit', 5],
				['junk', { nested: true }],
				['none', undefined],
			]),
		).toEqual({ statusCategory: 'todo', includeClosedMilestones: true, limit: 5 });
	});
});
