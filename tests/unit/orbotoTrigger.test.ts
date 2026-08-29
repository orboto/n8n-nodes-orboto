import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ORBOTO_WEBHOOK_EVENTS, signatureMatches } from '../../nodes/orboto/orbotoTrigger.node';

const SECRET = 'whsec_test';
const BODY = '{"event":"ticket.created","ticketKey":"ONN-42"}';

function sign(body: string, secret = SECRET): string {
	return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('signatureMatches', () => {
	it('accepts a correct sha256 HMAC', () => {
		expect(signatureMatches(sign(BODY), createHmac('sha256', SECRET).update(BODY).digest('hex'))).toBe(
			true,
		);
	});

	it('accepts uppercase hex digests', () => {
		const hex = createHmac('sha256', SECRET).update(BODY).digest('hex').toUpperCase();
		expect(signatureMatches(`sha256=${hex}`, hex.toLowerCase())).toBe(true);
	});

	it('rejects a signature made with the wrong secret', () => {
		const expected = createHmac('sha256', SECRET).update(BODY).digest('hex');
		expect(signatureMatches(sign(BODY, 'other-secret'), expected)).toBe(false);
	});

	it('rejects a signature over different content', () => {
		const expected = createHmac('sha256', SECRET).update('{"tampered":true}').digest('hex');
		expect(signatureMatches(sign(BODY), expected)).toBe(false);
	});

	it('rejects missing, malformed or non-prefixed signatures', () => {
		const expected = createHmac('sha256', SECRET).update(BODY).digest('hex');
		expect(signatureMatches(undefined, expected)).toBe(false);
		expect(signatureMatches('', expected)).toBe(false);
		expect(signatureMatches(`sha1=${expected}`, expected)).toBe(false);
		expect(signatureMatches(expected, expected)).toBe(false); // no sha256= prefix
		expect(signatureMatches('sha256=not-hex-at-all!!', expected)).toBe(false);
	});
});

describe('webhook event catalog', () => {
	it('ships the 16-event catalog from the design review', () => {
		expect(ORBOTO_WEBHOOK_EVENTS).toHaveLength(16);
		expect(ORBOTO_WEBHOOK_EVENTS).toContain('ticket.ready');
		expect(ORBOTO_WEBHOOK_EVENTS).toContain('agent.escalation_raised');
		expect(ORBOTO_WEBHOOK_EVENTS).toContain('inbound.signal.received');
		expect(ORBOTO_WEBHOOK_EVENTS).toContain('symphony.candidates_changed');
		expect(ORBOTO_WEBHOOK_EVENTS).toContain('ticket.checklist_item.completed');
	});
});
