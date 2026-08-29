import { describe, expect, it } from 'vitest';
import { buildUpdateBody } from '../../nodes/orboto/resources/ticket/Ticket.resource';

describe('buildUpdateBody', () => {
	it('sends only the fields present in the Update Fields collection', () => {
		expect(buildUpdateBody({ priority: 'high' })).toEqual({ priority: 'high' });
		expect(buildUpdateBody({})).toEqual({});
	});

	it('never invents defaulted option values for untouched fields', () => {
		// Regression: type/priority/deliveryMode used to ride the form defaults
		// ('task'/'normal'/'implementation') and silently reset untouched tickets.
		const body = buildUpdateBody({ description: 'new text' });
		expect(body).toEqual({ description: 'new text' });
		expect(body).not.toHaveProperty('type');
		expect(body).not.toHaveProperty('priority');
		expect(body).not.toHaveProperty('deliveryMode');
	});

	it('sends an explicit false for booleans so they can be cleared again', () => {
		expect(buildUpdateBody({ isPrivate: false, skipAutoTranslate: true })).toEqual({
			isPrivate: false,
			skipAutoTranslate: true,
		});
	});

	it('drops empty strings and zero estimates', () => {
		expect(
			buildUpdateBody({ statusId: '', milestoneId: '', dueDate: '', estimatedTimeMinutes: 0 }),
		).toEqual({});
	});

	it('passes labels and splits assignee emails', () => {
		expect(
			buildUpdateBody({ labelNames: ['bug'], assigneeEmails: ' a@x.io, b@x.io ,', estimatedTimeMinutes: 45 }),
		).toEqual({ labelNames: ['bug'], assigneeEmails: ['a@x.io', 'b@x.io'], estimatedTimeMinutes: 45 });
	});

	it('drops an empty label list rather than clearing labels unintentionally', () => {
		expect(buildUpdateBody({ labelNames: [] })).toEqual({});
	});
});
