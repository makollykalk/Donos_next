import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
import { createAiTextService } from '../../apps/api/src/services/ai-text.js';
import type { TextExtractor } from '../../apps/api/src/services/ai-text-types.js';

const orgId = randomUUID();
const restaurantId = randomUUID();
const locationId = randomUUID();
const actor = { userId: randomUUID(), sessionId: randomUUID(), email: 'owner@example.test' };
const contextToken = 'a'.repeat(64);
const selection = { organizationId: orgId, restaurantId };

function stubDb(): any {
  return {
    withActorTx: async (_actor: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [], rowCount: 0 }) }),
    withRestaurantTx: async (_actor: unknown, _selection: unknown, _token: string, fn: (ctx: unknown, tx: unknown) => Promise<unknown>) =>
      fn({ ...actor, ...selection, actor }, { query: async () => ({ rows: [], rowCount: 0 }) }),
  };
}

const auth = { verifyActor: async () => actor as any };
const route = `/v1/organizations/${orgId}/restaurants/${restaurantId}/inventory/ai/text/proposals`;

function lifecycleDb(options: { failDispatch?: boolean } = {}) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const reservationId = randomUUID();
  const proposalId = randomUUID();
  const reservation: Record<string, unknown> = {
    id: reservationId, status: 'reserved', max_units: '1', actual_units: null,
    restaurant_id: restaurantId, meter_key: 'ai_text_whatsapp', period_start: '2026-10-01',
    request_hash: '', dispatched_at: null,
  };
  let proposal: Record<string, any> | undefined;
  const tx = { query: async (sql: string, values: readonly unknown[] = []) => {
    calls.push({ sql, values });
    if (sql.includes('from core.entitlements e')) return { rows: ['inventory_core', 'ai_text_whatsapp'].map(feature_key => ({ feature_key, enabled: true, valid: true, subscribed: true })), rowCount: 2 };
    if (sql.includes('from core.stock_locations')) return { rows: [{ id: locationId }], rowCount: 1 };
    if (sql.includes('from core.usage_reservations where organization_id=$1 and operation_key=$2')) {
      return { rows: reservation.request_hash ? [{ ...reservation }] : [], rowCount: reservation.request_hash ? 1 : 0 };
    }
    if (sql.includes('from core.usage_buckets')) return { rows: [{ period_start: '2026-10-01', limit_units: '10', reserved_units: '0', settled_units: '0' }], rowCount: 1 };
    if (sql.includes('insert into core.usage_reservations')) {
      reservation.request_hash = values[5]; reservation.restaurant_id = values[1]; reservation.meter_key = values[2]; reservation.max_units = values[6];
      return { rows: [{ ...reservation }], rowCount: 1 };
    }
    if (sql.includes('from core.usage_reservations where organization_id=$1 and restaurant_id=$2 and id=$3')) return { rows: [{ ...reservation }], rowCount: 1 };
    if (sql.includes('update core.usage_reservations set dispatched_at')) {
      if (options.failDispatch) throw new Error('synthetic dispatch failure');
      reservation.dispatched_at = new Date(); return { rows: [{ ...reservation }], rowCount: 1 };
    }
    if (sql.includes("update core.usage_reservations set status='released'")) { reservation.status = 'released'; return { rows: [{ ...reservation }], rowCount: 1 }; }
    if (sql.includes("update core.usage_reservations set status='pending_reconciliation'")) { reservation.status = 'pending_reconciliation'; return { rows: [{ ...reservation }], rowCount: 1 }; }
    if (sql.includes("update core.usage_reservations set status='settled'")) { reservation.status = 'settled'; reservation.actual_units = values[2]; return { rows: [{ ...reservation }], rowCount: 1 }; }
    if (sql.includes('insert into core.ai_text_proposals')) {
      proposal = { id: proposalId, organization_id: orgId, restaurant_id: restaurantId, location_id: locationId,
        actor_user_id: actor.userId, operation_key: values[4], request_hash: values[5], usage_reservation_id: reservationId,
        status: values[7], version: 1, candidate_json: values[8], review_json: JSON.parse(values[9] as string),
        result_id: null, receipt_result_id: null, movement_result_id: null, created_at: new Date(), updated_at: new Date(),
        terminal_at: null, expires_at: new Date(Date.now() + 86400000).toISOString() };
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes('select id from core.ai_text_proposals')) return { rows: proposal ? [{ id: proposal.id }] : [], rowCount: proposal ? 1 : 0 };
    if (sql.includes('from core.ai_text_proposals')) return { rows: proposal ? [{ ...proposal }] : [], rowCount: proposal ? 1 : 0 };
    if (sql.includes('update core.ai_text_proposals set status=$4')) {
      if (!proposal || proposal.version !== values[6]) return { rows: [], rowCount: 0 };
      proposal.status = values[3]; proposal.candidate_json = JSON.parse(values[4] as string); proposal.review_json = JSON.parse(values[5] as string); proposal.version++;
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes("update core.ai_text_proposals set status='reconciliation_required'")) {
      if (proposal) proposal.status = 'reconciliation_required';
      return { rows: [], rowCount: proposal ? 1 : 0 };
    }
    if (sql.includes("update core.ai_text_proposals set status='discarded'")) {
      if (proposal) { proposal.status = 'discarded'; proposal.terminal_at = new Date(); }
      return { rows: [], rowCount: proposal ? 1 : 0 };
    }
    if (sql.includes('from core.ingredients')) return { rows: [{ id: randomUUID(), name: 'muçarela', baseUnit: 'kg', archived: false }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  } };
  const database = { withRestaurantTx: async (_actor: unknown, _selection: unknown, _token: string, fn: (ctx: unknown, tx: unknown) => Promise<unknown>) =>
    fn({ ...selection, actor }, tx) } as any;
  return { database, calls, reservation, get proposal() { return proposal; } };
}

it('keeps the text proposal route unavailable when no extractor is configured in production', async () => {
  const app = buildApp({ database: stubDb(), ...auth });
  try {
    const response = await app.inject({
      method: 'POST', url: route,
      headers: { authorization: 'Bearer test', 'x-donos-context': contextToken, 'idempotency-key': randomUUID() },
      payload: { locationId, text: 'Comprei 5 kg de muçarela por R$ 190' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('DEPENDENCY_UNAVAILABLE');
  } finally { await app.close(); }
});

it('accepts the narrow injectable extractor contract without calling it during construction', async () => {
  const calls: Array<{ text: string; requestId: string }> = [];
  const extractor: TextExtractor = async input => { calls.push(input); return {}; };
  expect(createAiTextService).toBeTypeOf('function');
  expect(extractor).toBeTypeOf('function');
  expect(calls).toEqual([]);
});

it('checks inventory entitlement before dispatching source text to the extractor', async () => {
  const calls: Array<{ text: string; requestId: string }> = [];
  const extractor: TextExtractor = async input => { calls.push(input); return {}; };
  const database = {
    withRestaurantTx: async (_actor: unknown, _selection: unknown, _token: string, fn: (ctx: unknown, tx: unknown) => Promise<unknown>) =>
      fn({ ...selection, actor }, { query: async () => ({ rows: [], rowCount: 0 }) }),
  } as any;
  const service = createAiTextService(database, extractor);
  await expect(service.createProposal(
    { actor: actor as any, selection, contextToken },
    { locationId, text: 'Comprei 5 kg de muçarela por R$ 190' }, randomUUID(), 'request-test',
  )).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
  expect(calls).toEqual([]);
});

it('reserves before extraction, persists only the structured candidate, and reuses the idempotent proposal', async () => {
  const fake = lifecycleDb();
  const source = 'Comprei 5 kg de muçarela por R$ 190';
  const key = randomUUID();
  const extracted = { action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg', totalPrice: '190', unitPrice: null, reason: null, ambiguous: false, explanations: [] };
  let extractorCalls = 0;
  const service = createAiTextService(fake.database, async input => { extractorCalls++; expect(input.text).toBe(source); return extracted; });
  const args = { actor: actor as any, selection, contextToken };
  const first = await service.createProposal(args, { locationId, text: source }, key, 'request-test') as any;
  expect(first.status).toBe('needs_review');
  expect(first.missingFields).toContain('supplier');
  expect(extractorCalls).toBe(1);
  expect(fake.reservation.status).toBe('settled');
  expect(fake.proposal?.candidate_json).toEqual(extracted);
  expect(fake.calls.some(call => call.sql.includes('stock_movements'))).toBe(false);
  expect(fake.calls.every(call => !JSON.stringify(call.values).includes(source))).toBe(true);
  const duplicate = await service.createProposal(args, { locationId, text: source }, key, 'request-duplicate') as any;
  expect(duplicate.id).toBe(first.id);
  expect(extractorCalls).toBe(1);
  await expect(service.createProposal(args, { locationId, text: `${source}!` }, key, 'request-conflict'))
    .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(extractorCalls).toBe(1);
});

it('releases a reservation when dispatch fails before the extractor is called', async () => {
  const fake = lifecycleDb({ failDispatch: true });
  let extractorCalls = 0;
  const service = createAiTextService(fake.database, async () => { extractorCalls++; return {}; });
  await expect(service.createProposal({ actor: actor as any, selection, contextToken },
    { locationId, text: 'Comprei 5 kg de muçarela por R$ 190' }, randomUUID(), 'request-test'))
    .rejects.toThrow('synthetic dispatch failure');
  expect(extractorCalls).toBe(0);
  expect(fake.reservation.status).toBe('released');
  expect(fake.proposal?.status).toBe('discarded');
});

it('marks a dispatched timeout for reconciliation and does not retry extraction', async () => {
  const fake = lifecycleDb();
  const key = randomUUID();
  let extractorCalls = 0;
  const service = createAiTextService(fake.database, async () => { extractorCalls++; throw new Error('synthetic timeout'); });
  await expect(service.createProposal({ actor: actor as any, selection, contextToken },
    { locationId, text: 'Comprei 5 kg de muçarela por R$ 190' }, key, 'request-test'))
    .rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
  expect(extractorCalls).toBe(1);
  expect(fake.reservation.status).toBe('pending_reconciliation');
  expect(fake.proposal?.status).toBe('reconciliation_required');
  const retry = await service.createProposal({ actor: actor as any, selection, contextToken },
    { locationId, text: 'Comprei 5 kg de muçarela por R$ 190' }, key, 'request-retry') as any;
  expect(retry.status).toBe('reconciliation_required');
  expect(extractorCalls).toBe(1);
});
