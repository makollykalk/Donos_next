import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAiTextService } from '../../apps/api/src/services/ai-text.js';

const actor = { userId: randomUUID(), sessionId: randomUUID(), requestId: 'confirm-test' } as any;
const orgId = randomUUID();
const restaurantId = randomUUID();
const locationId = randomUUID();
const ingredientId = randomUUID();
const supplierId = randomUUID();
const proposalId = randomUUID();
const reservationId = randomUUID();
const contextToken = 'a'.repeat(64);
const selection = { organizationId: orgId, restaurantId };
const candidate = { action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg', totalPrice: '190', unitPrice: '38', reason: null, ambiguous: false, explanations: [] };

type State = {
  proposal: any;
  reservation: { status: string; actualUnits: string | null };
  balance: { quantity: string; value: string };
  movements: Array<{ kind: string; quantity: string; value: string }>;
  priceHistory: Array<{ unitPrice: string }>;
  receipts: Array<{ id: string }>;
  audits: string[];
  settlementCount: number;
  idempotency: Map<string, { hash: string; response?: unknown }>;
};

function transactionalDb(options: { action?: 'receipt' | 'issue'; reason?: string | null; failAfterAudit?: boolean; initialStock?: string; reservationStatus?: string } = {}) {
  const state: State = {
    proposal: {
      id: proposalId, organization_id: orgId, restaurant_id: restaurantId, location_id: locationId,
      actor_user_id: actor.userId, operation_key: randomUUID(), request_hash: 'b'.repeat(64), usage_reservation_id: reservationId,
      status: 'ready', version: 4, candidate_json: { ...candidate, action: options.action ?? 'receipt', reason: options.reason ?? candidate.reason },
      review_json: { action: options.action ?? 'receipt', ingredientId, supplierId, quantity: '5', unit: 'kg', unitPrice: '38', reason: options.reason ?? candidate.reason, missingFields: [] },
      result_id: null, receipt_result_id: null, movement_result_id: null, created_at: new Date(), updated_at: new Date(), terminal_at: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    reservation: { status: options.reservationStatus ?? 'settled', actualUnits: options.reservationStatus === 'pending_reconciliation' ? null : '1' },
    balance: { quantity: options.initialStock ?? '0', value: options.initialStock ? '200' : '0' }, movements: [],
    priceHistory: [], receipts: [], audits: [], settlementCount: 0, idempotency: new Map(),
  };
  let queue = Promise.resolve();
  const snapshot = () => structuredClone(state);
  const restore = (saved: State) => {
    Object.assign(state, saved);
  };
  const tx = { query: async (sql: string, values: readonly unknown[] = []) => {
    if (sql.includes('from core.entitlements e')) return { rows: ['inventory_core', 'ai_text_whatsapp'].map(feature_key => ({ feature_key, enabled: true, valid: true, subscribed: true })), rowCount: 2 };
    if (sql.includes('select id from core.stock_locations')) return { rows: values[0] === orgId && values[1] === restaurantId && values[2] === locationId ? [{ id: locationId }] : [], rowCount: 1 };
    if (sql.includes('from core.ingredients')) return { rows: [{ id: ingredientId, name: 'muçarela', baseUnit: 'kg', archived: false }], rowCount: 1 };
    if (sql.includes('from core.suppliers')) return { rows: [{ id: supplierId }], rowCount: 1 };
    if (sql.includes('from core.ai_text_proposals') && sql.includes('id=$3')) {
      const scoped = values[0] === orgId && values[1] === restaurantId && values[2] === proposalId;
      return { rows: scoped ? [{ ...state.proposal }] : [], rowCount: scoped ? 1 : 0 };
    }
    if (sql.includes('insert into core.idempotency_records')) {
      const id = String(values[3]);
      if (state.idempotency.has(id)) return { rows: [], rowCount: 0 };
      state.idempotency.set(id, { hash: String(values[6]) });
      return { rows: [{ key: id }], rowCount: 1 };
    }
    if (sql.includes('select request_hash,response_json from core.idempotency_records')) {
      const row = state.idempotency.get(String(values[3]));
      return { rows: row ? [{ request_hash: row.hash, response_json: row.response }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('update core.idempotency_records set response_json')) {
      const row = state.idempotency.get(String(values[3]));
      if (row) row.response = JSON.parse(String(values[4]));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('update core.ai_text_proposals set status=$4') && sql.includes("$4='confirmed'")) {
      const matches = values[0] === orgId && values[1] === restaurantId && values[2] === proposalId && values[6] === state.proposal.version;
      if (!matches || state.proposal.status !== 'ready') return { rows: [], rowCount: 0 };
      state.proposal.status = 'confirmed'; state.proposal.version++;
      state.proposal.receipt_result_id = values[3] === 'confirmed' ? (values[4] ?? null) : null;
      state.proposal.movement_result_id = values[3] === 'confirmed' ? (values[5] ?? null) : null;
      state.proposal.result_id = state.proposal.receipt_result_id ?? state.proposal.movement_result_id;
      state.proposal.terminal_at = new Date(); state.proposal.updated_at = new Date();
      return { rows: [{ ...state.proposal }], rowCount: 1 };
    }
    if (sql.startsWith('insert into core.audit_events')) {
      state.audits.push(String(values[3]));
      if (options.failAfterAudit) throw new Error('synthetic failure after movement and audit');
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  } };
  const database = { withRestaurantTx: async (_actor: unknown, requested: any, _token: string, fn: (ctx: any, tx: any) => Promise<unknown>) => {
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const saved = snapshot();
    try { return await fn({ ...requested, actor }, tx); }
    catch (error) { restore(saved); throw error; }
    finally { release(); }
  } } as any;
  const operations = {
    settleUsage: async (_ctx: unknown, id: string, units: string, _tx: unknown) => {
      if (id !== reservationId || units !== '1') throw new Error('unexpected reservation settlement');
      if (state.reservation.status !== 'settled') state.reservation = { status: 'settled', actualUnits: units };
      state.settlementCount++;
    },
    draftReceipt: async (_ctx: unknown, input: any, _tx: unknown) => {
      expect(input.items[0]).toMatchObject({ ingredientId, quantity: '5', unitPrice: '38', unit: { kind: 'standard', code: 'kg' } });
      expect(input.supplierId).toBe(supplierId);
      const receipt = { id: randomUUID(), status: 'draft', items: [] };
      state.receipts.push({ id: receipt.id });
      return receipt;
    },
    receiveReceipt: async (_ctx: unknown, receiptId: string, _key: string, _tx: unknown) => {
      const receipt = { receiptId, status: 'received', movements: [{ movementId: randomUUID(), balance: { quantity: '5', value: '190' } }] };
      state.movements.push({ kind: 'RECEIPT', quantity: '5', value: '190' });
      state.balance = { quantity: '5', value: '190' };
      state.priceHistory.push({ unitPrice: '38' });
      return receipt;
    },
    issueStock: async (_ctx: unknown, input: any, _key: string, _tx: unknown) => {
      if (!input.reason?.trim()) throw Object.assign(new Error('reason required'), { code: 'VALIDATION_ERROR' });
      if (BigInt(input.quantity) > BigInt(state.balance.quantity)) throw Object.assign(new Error('not enough stock'), { code: 'INSUFFICIENT_STOCK' });
      state.movements.push({ kind: 'ISSUE', quantity: input.quantity, value: '0' });
      state.balance.quantity = String(BigInt(state.balance.quantity) - BigInt(input.quantity));
      return { movementId: randomUUID(), balance: { ...state.balance } };
    },
  };
  return { database, state, operations };
}

const args = { actor, selection, contextToken };

describe('AI text proposal confirmation transaction', () => {
  it('does not move stock until explicit confirmation, then receives 5 kg at R$38/kg', async () => {
    const fake = transactionalDb();
    const service = createAiTextService(fake.database, undefined, fake.operations as any);
    expect(fake.state.balance).toEqual({ quantity: '0', value: '0' });
    expect(fake.state.movements).toHaveLength(0);
    const result = await service.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()) as any;
    expect(result.proposal.status).toBe('confirmed');
    expect(result.result.status).toBe('received');
    expect(fake.state.balance).toEqual({ quantity: '5', value: '190' });
    expect(fake.state.priceHistory).toEqual([{ unitPrice: '38' }]);
    expect(fake.state.movements).toHaveLength(1);
    expect(fake.state.audits).toContain('inventory.receipt.received');
  });

  it('requires a reason for an issue and keeps insufficient stock blocked', async () => {
    const missingReason = transactionalDb({ action: 'issue', reason: null, initialStock: '10' });
    const missingService = createAiTextService(missingReason.database, undefined, missingReason.operations as any);
    await expect(missingService.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(missingReason.state.movements).toHaveLength(0);

    const insufficient = transactionalDb({ action: 'issue', reason: 'Perda na preparação' });
    const service = createAiTextService(insufficient.database, undefined, insufficient.operations as any);
    await expect(service.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(insufficient.state.balance.quantity).toBe('0');
    expect(insufficient.state.movements).toHaveLength(0);
  });

  it('replays the original response and allows at most one movement for concurrent distinct keys', async () => {
    const fake = transactionalDb();
    const service = createAiTextService(fake.database, undefined, fake.operations as any);
    const key = randomUUID();
    const first = await service.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, key);
    expect(await service.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, key)).toEqual(first);
    expect(fake.state.movements).toHaveLength(1);

    const concurrent = transactionalDb();
    const parallelService = createAiTextService(concurrent.database, undefined, concurrent.operations as any);
    const settled = await Promise.allSettled([
      parallelService.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()),
      parallelService.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()),
    ]);
    expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.state.movements).toHaveLength(1);
  });

  it('rejects stale, terminal, and cross-tenant confirmation without another movement', async () => {
    const stale = transactionalDb();
    const staleService = createAiTextService(stale.database, undefined, stale.operations as any);
    await expect(staleService.confirmProposal(args, proposalId, { expectedVersion: 3, confirmed: true }, randomUUID()))
      .rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    expect(stale.state.movements).toHaveLength(0);

    const terminal = transactionalDb();
    terminal.state.proposal.status = 'discarded';
    const terminalService = createAiTextService(terminal.database, undefined, terminal.operations as any);
    await expect(terminalService.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()))
      .rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    expect(terminal.state.movements).toHaveLength(0);

    const crossTenant = transactionalDb();
    const tenantService = createAiTextService(crossTenant.database, undefined, crossTenant.operations as any);
    await expect(tenantService.confirmProposal({ ...args, selection: { ...selection, organizationId: randomUUID() } }, proposalId,
      { expectedVersion: 4, confirmed: true }, randomUUID())).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    expect(crossTenant.state.movements).toHaveLength(0);
  });

  it('rolls back movement, balance, price, reservation settlement, proposal, receipt draft, and audit together', async () => {
    const fake = transactionalDb({ failAfterAudit: true, reservationStatus: 'pending_reconciliation' });
    const service = createAiTextService(fake.database, undefined, fake.operations as any);
    await expect(service.confirmProposal(args, proposalId, { expectedVersion: 4, confirmed: true }, randomUUID()))
      .rejects.toThrow('synthetic failure after movement and audit');
    expect(fake.state).toMatchObject({
      proposal: { status: 'ready', version: 4, result_id: null },
      reservation: { status: 'pending_reconciliation', actualUnits: null },
      balance: { quantity: '0', value: '0' }, movements: [], priceHistory: [], receipts: [], audits: [],
    });
  });
});
