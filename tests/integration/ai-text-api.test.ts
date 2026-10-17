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

function lifecycleDb(options: { failDispatch?: boolean; catalogSize?: number } = {}) {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const idempotency = new Map<string, { request_hash: unknown; response_json: unknown }>();
  const catalogItems = Array.from({ length: options.catalogSize ?? 1 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: index === 0 ? 'muçarela' : index === (options.catalogSize ?? 1) - 1 ? 'último insumo' : `insumo ${index + 1}`,
    baseUnit: 'kg', archived: false,
  }));
  const supplierId = '00000000-0000-4000-8000-999999999999';
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
    if (sql.includes('update core.ai_text_proposals')) {
      const assignmentBlock = sql.match(/set([\s\S]*?)where/iu)?.[1] ?? '';
      const changedColumns = [...assignmentBlock.matchAll(/(?:^|,)\s*([a-z_]+)\s*=/giu)].map(match => match[1]);
      const allowedColumns = new Set(['status', 'candidate_json', 'review_json', 'receipt_result_id', 'movement_result_id', 'usage_reservation_id']);
      if (changedColumns.some(column => !allowedColumns.has(column!))) throw new Error(`permission denied for update columns: ${changedColumns.join(',')}`);
    }
    if (sql.includes('insert into core.idempotency_records')) {
      const id = values.slice(0, 4).join(':');
      if (idempotency.has(id)) return { rows: [], rowCount: 0 };
      idempotency.set(id, { request_hash: values[6], response_json: null });
      return { rows: [{ key: values[3] }], rowCount: 1 };
    }
    if (sql.includes('select request_hash,response_json from core.idempotency_records')) {
      const found = idempotency.get(values.slice(0, 4).join(':'));
      return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes('update core.idempotency_records set response_json')) {
      const found = idempotency.get(values.slice(0, 4).join(':'));
      if (found) found.response_json = JSON.parse(values[4] as string);
      return { rows: [], rowCount: found ? 1 : 0 };
    }
    if (sql.includes('from core.entitlements e')) return { rows: ['inventory_core', 'ai_text_whatsapp'].map(feature_key => ({ feature_key, enabled: true, valid: true, subscribed: true })), rowCount: 2 };
    if (sql.includes('from core.stock_locations')) return { rows: [{ id: locationId }], rowCount: 1 };
    if (sql.includes('from core.suppliers')) return values[1] === supplierId ? { rows: [{ id: supplierId }], rowCount: 1 } : { rows: [], rowCount: 0 };
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
      const proposedStatus = values[7];
      if (!['interpreting', 'needs_review', 'ready'].includes(String(proposedStatus))) throw new Error('check constraint invalid_initial_status');
      if (proposedStatus !== 'interpreting' && !values[8]) throw new Error('check constraint status_requires_candidate');
      proposal = { id: proposalId, organization_id: orgId, restaurant_id: restaurantId, location_id: locationId,
        actor_user_id: actor.userId, operation_key: values[4], request_hash: values[5], usage_reservation_id: reservationId,
        status: values[7], version: 1, candidate_json: values[8] ? JSON.parse(values[8] as string) : null, review_json: JSON.parse(values[9] as string),
        result_id: null, receipt_result_id: null, movement_result_id: null, created_at: new Date(), updated_at: new Date(),
        terminal_at: null, expires_at: new Date(Date.now() + 86400000).toISOString() };
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes('select id from core.ai_text_proposals')) return proposal && values[0] === proposal.organization_id && values[1] === proposal.restaurant_id && values[2] === proposal.operation_key ? { rows: [{ id: proposal.id }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (sql.includes('from core.ai_text_proposals') && sql.includes('organization_id=$1') && sql.includes('restaurant_id=$2') && sql.includes('id=$3')) return proposal && values[0] === proposal.organization_id && values[1] === proposal.restaurant_id && values[2] === proposal.id ? { rows: [{ ...proposal }] , rowCount: 1 } : { rows: [], rowCount: 0 };
    if (sql.includes('from core.ai_text_proposals')) return proposal ? { rows: [{ ...proposal }], rowCount: 1 } : { rows: [], rowCount: 0 };
    if (sql.includes('update core.ai_text_proposals set status=$4') && sql.includes("and (($4='discarded'")) {
      if (!sql.includes("status in ('interpreting','needs_review','ready','reconciliation_required')")) throw new Error('adapter requires terminal transition predicate');
      if (!proposal || proposal.version !== values[6] || !proposal.candidate_json) throw new Error('check constraint status_requires_candidate');
      if (values[3] !== 'discarded' || !['interpreting', 'needs_review', 'ready', 'reconciliation_required'].includes(proposal.status)) return { rows: [], rowCount: 0 };
      proposal.status = 'discarded'; proposal.version++; proposal.terminal_at = new Date(); proposal.expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes('update core.ai_text_proposals set status=$4') && sql.includes("and status='interpreting'")) {
      if (!proposal || proposal.status !== 'interpreting' || proposal.version !== values[6]) return { rows: [], rowCount: 0 };
      if (!values[4]) throw new Error('check constraint status_requires_candidate');
      proposal.status = values[3]; proposal.candidate_json = JSON.parse(values[4] as string); proposal.review_json = JSON.parse(values[5] as string); proposal.version++;
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes('update core.ai_text_proposals set status=$4')) {
      if (!sql.includes("status in ('needs_review','ready')")) throw new Error('adapter requires reviewable-state predicate');
      if (!['needs_review', 'ready'].includes(String(proposal?.status))) return { rows: [], rowCount: 0 };
      if (!values[4]) throw new Error('check constraint status_requires_candidate');
      if (!proposal || proposal.version !== values[6]) return { rows: [], rowCount: 0 };
      proposal.status = values[3]; proposal.candidate_json = JSON.parse(values[4] as string); proposal.review_json = JSON.parse(values[5] as string); proposal.version++;
      return { rows: [{ ...proposal }], rowCount: 1 };
    }
    if (sql.includes("update core.ai_text_proposals set status='reconciliation_required'")) {
      if (!sql.includes("status='interpreting'")) throw new Error('adapter requires reconciliation transition predicate');
      if (proposal && !proposal.candidate_json) throw new Error('check constraint status_requires_candidate');
      if (proposal && (proposal.status !== 'interpreting' || proposal.version !== values[3])) return { rows: [], rowCount: 0 };
      if (proposal) { proposal.status = 'reconciliation_required'; proposal.version++; proposal.updated_at = new Date(); }
      return { rows: proposal ? [{ ...proposal }] : [], rowCount: proposal ? 1 : 0 };
    }
    if (sql.includes("update core.ai_text_proposals set status='discarded'")) {
      if (sql.includes('terminal_at=')) throw new Error('permission denied for column terminal_at');
      if (proposal && !proposal.candidate_json) throw new Error('check constraint status_requires_candidate');
      if (proposal) { proposal.status = 'discarded'; proposal.terminal_at = new Date(); }
      return { rows: [], rowCount: proposal ? 1 : 0 };
    }
    if (sql.includes('from core.ingredients')) {
      const cursor = String(values[2] ?? '');
      const page = catalogItems.filter(item => item.id > cursor).slice(0, Number(values[4]));
      return { rows: page, rowCount: page.length };
    }
    return { rows: [], rowCount: 1 };
  } };
  const database = { withRestaurantTx: async (_actor: unknown, requestedSelection: any, _token: string, fn: (ctx: unknown, tx: unknown) => Promise<unknown>) => {
    const savedReservation = { ...reservation };
    const savedProposal = proposal ? structuredClone(proposal) : undefined;
    const savedIdempotency = structuredClone([...idempotency.entries()]);
    try { return await fn({ ...requestedSelection, actor }, tx); }
    catch (error) {
      Object.assign(reservation, savedReservation);
      proposal = savedProposal;
      idempotency.clear();
      for (const [key, value] of savedIdempotency) idempotency.set(key, value);
      throw error;
    }
  } } as any;
  return { database, calls, reservation, supplierId, catalogItems, get proposal() { return proposal; } };
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

it('resolves owner ambiguity, normalizes standard units, retains partial selections and pages the full catalog', async () => {
  const fake = lifecycleDb({ catalogSize: 120 });
  const service = createAiTextService(fake.database, async () => ({
    action: 'receipt', ingredientDescription: 'item semelhante', quantity: '5', unit: 'kg',
    totalPrice: null, unitPrice: null, reason: null, ambiguous: true, explanations: ['Escolha o insumo correto.'],
  }));
  const args = { actor: actor as any, selection, contextToken };
  const original = await service.createProposal(args, { locationId, text: 'Entrada de 5 kg' }, randomUUID(), 'request-edit') as any;
  const updateKey = randomUUID();
  const selected = await service.updateProposal(args, original.id, {
    expectedVersion: original.version, action: 'receipt', ingredientId: fake.catalogItems.at(-1)!.id,
    quantity: '5', unit: { kind: 'standard', code: 'kg' }, unitPrice: '38', supplierId: fake.supplierId,
  }, updateKey) as any;
  expect(selected.status).toBe('ready');
  expect(selected.candidate.ambiguous).toBe(false);
  expect(selected.candidate.unit).toBe('kg');
  expect(selected.candidate.ingredientDescription).toBe('último insumo');
  expect(selected.missingFields).not.toContain('supplier');
  expect(fake.calls.filter(call => call.sql.includes('from core.ingredients')).length).toBeGreaterThan(1);

  await expect(service.updateProposal({ actor: actor as any, selection, contextToken: 'b'.repeat(64) }, original.id, {
    expectedVersion: original.version, action: 'receipt', ingredientId: fake.catalogItems.at(-1)!.id,
    quantity: '5', unit: { kind: 'standard', code: 'kg' }, unitPrice: '38', supplierId: fake.supplierId,
  }, updateKey)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

  await expect(service.updateProposal({ actor: actor as any, selection: { ...selection, restaurantId: randomUUID() }, contextToken }, original.id, {
    expectedVersion: original.version, action: 'receipt', ingredientId: fake.catalogItems.at(-1)!.id,
    quantity: '5', unit: { kind: 'standard', code: 'kg' }, unitPrice: '38', supplierId: fake.supplierId,
  }, updateKey)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

  const partial = await service.updateProposal(args, original.id, { expectedVersion: selected.version, quantity: '6' }, randomUUID()) as any;
  expect(partial.status).toBe('ready');
  expect(partial.candidate.quantity).toBe('6');
  expect(partial.missingFields).not.toContain('supplier');
});

it('rejects package input units until a conversion snapshot can be represented safely', async () => {
  const fake = lifecycleDb();
  const service = createAiTextService(fake.database, async () => ({
    action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
    totalPrice: null, unitPrice: '38', reason: null, ambiguous: false, explanations: [],
  }));
  const args = { actor: actor as any, selection, contextToken };
  const proposal = await service.createProposal(args, { locationId, text: 'Entrada de queijo' }, randomUUID(), 'request-package') as any;
  await expect(service.updateProposal(args, proposal.id, {
    expectedVersion: proposal.version, unit: { kind: 'package', conversionId: randomUUID() },
  }, randomUUID())).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

it('recalculates a derived unit price when quantity changes and preserves total price', async () => {
  const fake = lifecycleDb();
  const service = createAiTextService(fake.database, async () => ({
    action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
    totalPrice: '190', unitPrice: null, reason: null, ambiguous: false, explanations: [],
  }));
  const args = { actor: actor as any, selection, contextToken };
  const proposal = await service.createProposal(args, { locationId, text: 'Entrada 5 kg por R$190' }, randomUUID(), 'request-price') as any;
  const updated = await service.updateProposal(args, proposal.id, {
    expectedVersion: proposal.version, quantity: '10', supplierId: fake.supplierId,
  }, randomUUID()) as any;
  expect(updated.status).toBe('ready');
  expect(updated.candidate.totalPrice).toBe('190');
  expect(updated.candidate.unitPrice).toBe('19');
  const overridden = await service.updateProposal(args, proposal.id, {
    expectedVersion: updated.version, unitPrice: '20',
  }, randomUUID()) as any;
  const quantityChanged = await service.updateProposal(args, proposal.id, {
    expectedVersion: overridden.version, quantity: '20',
  }, randomUUID()) as any;
  expect(quantityChanged.candidate.totalPrice).toBe('190');
  expect(quantityChanged.candidate.unitPrice).toBe('20');
});

it('rejects public edits during extraction and completes the reserved proposal after extraction resolves', async () => {
  const fake = lifecycleDb();
  let extractionStarted!: () => void;
  let resolveExtraction!: (value: unknown) => void;
  const started = new Promise<void>(resolve => { extractionStarted = resolve; });
  const extractionResult = new Promise<unknown>(resolve => { resolveExtraction = resolve; });
  const service = createAiTextService(fake.database, async () => {
    extractionStarted();
    return extractionResult;
  });
  const args = { actor: actor as any, selection, contextToken };
  const key = randomUUID();
  const creation = service.createProposal(args, { locationId, text: 'Entrada 5 kg por R$190' }, key, 'request-race');
  await started;
  const duplicate = await service.createProposal(args, { locationId, text: 'Entrada 5 kg por R$190' }, key, 'request-race-retry') as any;
  expect(duplicate.status).toBe('interpreting');
  await expect(service.updateProposal(args, duplicate.id, {
    expectedVersion: duplicate.version, action: 'receipt', ingredientId: fake.catalogItems[0]!.id,
    quantity: '5', unit: { kind: 'standard', code: 'kg' }, unitPrice: '38', supplierId: fake.supplierId,
  }, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  resolveExtraction({
    action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
    totalPrice: '190', unitPrice: null, reason: null, ambiguous: false, explanations: [],
  });
  const completed = await creation as any;
  expect(completed.id).toBe(duplicate.id);
  expect(completed.status).toBe('needs_review');
  expect(fake.proposal?.version).toBe(2);
  expect(fake.reservation.status).toBe('settled');
});

it('keeps discard idempotency scoped to its proposal context and location', async () => {
  const fake = lifecycleDb();
  const service = createAiTextService(fake.database, async () => ({
    action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
    totalPrice: null, unitPrice: '38', reason: null, ambiguous: false, explanations: [],
  }));
  const args = { actor: actor as any, selection, contextToken };
  const proposal = await service.createProposal(args, { locationId, text: 'Entrada de queijo' }, randomUUID(), 'request-discard') as any;
  const key = randomUUID();
  expect(await service.discardProposal(args, proposal.id, key)).toEqual({ id: proposal.id, status: 'discarded' });
  expect(await service.discardProposal(args, proposal.id, key)).toEqual({ id: proposal.id, status: 'discarded' });
  await expect(service.discardProposal({ actor: actor as any, selection, contextToken: 'b'.repeat(64) }, proposal.id, key))
    .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(service.discardProposal({ actor: actor as any, selection: { ...selection, restaurantId: randomUUID() }, contextToken }, proposal.id, key))
    .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});
