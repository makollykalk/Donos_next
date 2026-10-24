import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { AiTextCandidate, ContextSelection } from '@donos/contracts';
import { createAiTextService } from '../../apps/api/src/services/ai-text.js';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { aiProposalRepository } from '../../packages/db/src/ai-proposal-repository.js';
import { createDatabase } from '../../packages/db/src/transaction.js';
import { createCore } from '../../packages/domain-core/src/context.js';
import { settleUsage } from '../../packages/domain-billing/src/usage.js';
import { draftReceipt, receiveReceipt } from '../../packages/domain-purchases/src/receipts.js';
import { issueStock } from '../../packages/domain-inventory/src/issues.js';
import { fixtures } from '../helpers/fixtures.js';
import { login, runtimePool } from '../helpers/cycle07-local-db.js';

const runId = randomUUID();
const selectionA = { organizationId: fixtures.orgA, restaurantId: fixtures.a1 };
const selectionB = { organizationId: fixtures.orgB, restaurantId: fixtures.b1 };
const candidate = {
  action: 'receipt' as const, ingredientDescription: 'muçarela', quantity: '5', unit: 'kg' as const,
  totalPrice: '190', unitPrice: null, reason: null, ambiguous: false, explanations: [],
};
const scenarioLabels = ['receipt-concurrency', 'insufficient-issue', 'rollback', 'tenant-forgery'] as const;
const keyLabels = ['ingredient', 'supplier', 'proposal', 'review', 'confirm', 'rollback-confirm', 'cross-tenant-confirm', 'confirm-2', 'wrong-context'] as const;
const runManifest = Object.fromEntries(scenarioLabels.map(label => [label,
  Object.fromEntries(keyLabels.map(key => [key, runUuid(`${label}:${key}`)])),
])) as Record<(typeof scenarioLabels)[number], Record<(typeof keyLabels)[number], string>>;

function runUuid(label: string): string {
  const bytes = createHash('sha256').update(`${runId}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Actor = Awaited<ReturnType<ReturnType<typeof createActorVerifier>>>;
type Selected = Awaited<ReturnType<ReturnType<typeof createCore>['selectContext']>>;
type Proposal = { id: string; version: number; status: string; candidate: AiTextCandidate };
type TestArgs = { actor: Actor; selection: ContextSelection; contextToken: string };

let pool: Pool;
let db: ReturnType<typeof createDatabase>;
let actorA: Actor;
let actorB: Actor;
let contextA: Selected;
let contextB: Selected;
let locationAId: string;
let activeLocationAIds: string[] = [];
let startingSettledUnitsA = 0n;
let contextIdA: string;
let contextIdB: string;
const committedSetups: Array<{ label: string; action: 'receipt' | 'issue'; ingredientId: string; supplierId: string | null; proposalId: string; reservationId: string; keys: Record<string, string> }> = [];
let loginA: Awaited<ReturnType<typeof login>>;
let loginB: Awaited<ReturnType<typeof login>>;

async function preflightReadOnly(targetPool: Pool): Promise<void> {
  const client = await targetPool.connect();
  try {
    await client.query('begin read only');
    const runtime = (await client.query<{
      current_database: string; current_user: string; session_user: string; transaction_read_only: string;
    }>(`select current_database() as current_database, current_user as current_user,
              session_user as session_user, current_setting('transaction_read_only') as transaction_read_only`)).rows[0]!;
    expect(runtime.current_database, 'C07-DEV database').toBe('postgres');
    expect(runtime.current_user, 'runtime application role').toBe('donos_api');
    expect(runtime.session_user, 'direct application connection role').toBe('donos_api');
    expect(runtime.transaction_read_only).toBe('on');

    const role = (await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper,rolbypassrls from pg_catalog.pg_roles where rolname=current_user',
    )).rows[0]!;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });

    const schema = (await client.query<{ proposals: string | null; reservations: string | null; movements: string | null }>(
      `select to_regclass('core.ai_text_proposals')::text as proposals,
              to_regclass('core.usage_reservations')::text as reservations,
              to_regclass('core.stock_movements')::text as movements`,
    )).rows[0]!;
    expect(schema).toEqual({ proposals: 'core.ai_text_proposals', reservations: 'core.usage_reservations', movements: 'core.stock_movements' });

    for (const [name, userId, selection] of [
      ['a', fixtures.a, selectionA], ['b', fixtures.b, selectionB],
    ] as const) {
      await client.query(
        `select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),
                set_config('app.organization_id',$3,true),set_config('app.restaurant_id',$4,true)`,
        [userId, runUuid(`preflight-session-${name}`), selection.organizationId, selection.restaurantId],
      );
      const ownership = (await client.query<{ organization_id: string; restaurant_id: string }>(
        `select o.id as organization_id,r.id as restaurant_id
           from core.organizations o join core.restaurants r on r.organization_id=o.id
          where o.id=$1 and o.owner_user_id=$2 and r.id=$3`,
        [selection.organizationId, userId, selection.restaurantId],
      )).rows[0];
      expect(ownership, `synthetic actor ${name} owns only the expected organization/unit`).toEqual({
        organization_id: selection.organizationId, restaurant_id: selection.restaurantId,
      });
      const location = await client.query<{ id: string; is_default: boolean }>(
        `select id,is_default from core.stock_locations where organization_id=$1 and restaurant_id=$2 and not archived order by id`,
        [selection.organizationId, selection.restaurantId],
      );
      expect(location.rows.filter(row => row.is_default), `synthetic actor ${name} expected one active default location`).toHaveLength(1);
      if (name === 'a') {
        activeLocationAIds = location.rows.map(row => row.id);
        locationAId = location.rows.find(row => row.is_default)!.id;
      }
      const capabilities = await client.query<{ feature_key: string; allowed: boolean }>(
        `select e.feature_key,
                e.enabled and e.valid_from<=now() and now()<e.valid_until
                  and exists(select 1 from core.subscriptions s where s.organization_id=e.organization_id
                    and s.status='active' and s.starts_at<=now() and now()<s.ends_at) as allowed
           from core.entitlements e where e.organization_id=$1 and e.feature_key=any($2::text[])`,
        [selection.organizationId, ['inventory_core', 'ai_text_whatsapp']],
      );
      expect(capabilities.rows.sort((a, b) => a.feature_key.localeCompare(b.feature_key)), `synthetic actor ${name} required entitlements`).toEqual([
        { feature_key: 'ai_text_whatsapp', allowed: true },
        { feature_key: 'inventory_core', allowed: true },
      ]);
    }

    await client.query(
      `select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),
              set_config('app.organization_id',$3,true),set_config('app.restaurant_id',$4,true)`,
      [fixtures.a, runUuid('preflight-quota-session'), selectionA.organizationId, selectionA.restaurantId],
    );
    const quota = await client.query<{ limit_units: string; reserved_units: string; settled_units: string }>(
      `select limit_units::text,reserved_units::text,settled_units::text from core.usage_buckets
        where organization_id=$1 and meter_key='ai_text_whatsapp' and period_start<=now() and now()<period_end`,
      [selectionA.organizationId],
    );
    expect(quota.rowCount, 'one current synthetic A text quota bucket').toBe(1);
    const bucket = quota.rows[0]!;
    startingSettledUnitsA = BigInt(bucket.settled_units);
    expect(BigInt(bucket.limit_units) - BigInt(bucket.reserved_units) - BigInt(bucket.settled_units),
      'enough quota for four synthetic proposal setups').toBeGreaterThanOrEqual(4n);

    await client.query('rollback');
    console.info(`[T4R ${runId}] read-only preflight passed: db=${runtime.current_database}, current_user=${runtime.current_user}, session_user=${runtime.session_user}, PostgreSQL schema and A/B fixture scopes validated`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function withReadContext<T>(client: PoolClient, actor: Actor, selection: ContextSelection, action: () => Promise<T>): Promise<T> {
  await client.query('begin read only');
  try {
    await client.query(
      `select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),
              set_config('app.organization_id',$3,true),set_config('app.restaurant_id',$4,true)`,
      [actor.userId, actor.sessionId, selection.organizationId, selection.restaurantId],
    );
    return await action();
  } finally {
    await client.query('rollback').catch(() => undefined);
  }
}

async function expectNoIdempotencyAsB(keys: string[]): Promise<void> {
  const read = await observer();
  try {
    const result = await withReadContext(read.client, actorB, selectionB, () => read.client.query(
      'select operation,key from core.idempotency_records where organization_id=$1 and key=any($2::uuid[])',
      [selectionB.organizationId, keys],
    ));
    expect(result.rows, 'forged A-context attempts must create no idempotency rows for B').toEqual([]);
  } finally { read.client.release(); }
}

async function observer(): Promise<{ client: PoolClient; pid: number }> {
  const client = await pool.connect();
  const pid = Number((await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid);
  return { client, pid };
}

async function contextRecordId(actor: Actor, selection: ContextSelection, token: string): Promise<string> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return db.withRestaurantTx(actor, selection, token, async (_ctx, tx) => {
    const row = (await tx.query<{ id: string }>(
      'select id from core.request_contexts where token_hash=$1 and user_id=$2 and session_id=$3',
      [tokenHash, actor.userId, actor.sessionId],
    )).rows[0];
    if (!row) throw new Error('T4R context row was not found under the application role');
    return row.id;
  });
}

async function setupProposal(label: string, action: 'receipt' | 'issue' = 'receipt'): Promise<{
  ingredientId: string; supplierId: string | null; proposal: Proposal; args: TestArgs; keys: Record<string, string>;
}> {
  const keys = runManifest[label as (typeof scenarioLabels)[number]];
  const actor = { ...actorA, requestId: runId };
  const args: TestArgs = { actor, selection: selectionA, contextToken: contextA.token };
  const inventory = createInventoryService(db);
  const ingredient = await inventory.createIngredient(actor, selectionA, contextA.token, {
    name: `C07 T4R ${runId} ${label}`, baseUnit: 'kg', allowFractionalCount: true,
  }, keys.ingredient!);
  console.info(`[T4R ${runId}] committed ingredient ${label}: id=${ingredient.id}; balances are initialized for active A locations=${activeLocationAIds.join(',')}; key=${keys.ingredient}`);
  let supplierId: string | null = null;
  if (action === 'receipt') {
    const supplier = await inventory.createSupplier(actor, selectionA, contextA.token,
      { name: `C07 T4R ${runId} ${label} supplier` }, keys.supplier!);
    supplierId = supplier.id;
    console.info(`[T4R ${runId}] committed supplier ${label}: id=${supplierId}; key=${keys.supplier}`);
  }
  const extractor = async () => action === 'receipt' ? candidate : {
    action: 'issue' as const, ingredientDescription: 'muçarela', quantity: '5', unit: 'kg' as const,
    totalPrice: null, unitPrice: null, reason: `T4R synthetic issue ${runId}`, ambiguous: false, explanations: [],
  };
  const service = createAiTextService(db, extractor);
  const proposal = await service.createProposal(args, {
    locationId: locationAId,
    text: 'Comprei 5 kg de muçarela por R$ 190',
  }, keys.proposal!, runId) as Proposal;
  console.info(`[T4R ${runId}] committed proposal interpretation ${label}: proposal=${proposal.id}; operationKey=${keys.proposal}`);
  const ready = await service.updateProposal(args, proposal.id, {
    expectedVersion: proposal.version,
    action,
    ingredientId: ingredient.id,
    quantity: '5',
    unit: { kind: 'standard', code: 'kg' },
    ...(supplierId ? { supplierId } : {}),
    ...(action === 'issue' ? { reason: `T4R synthetic issue ${runId}` } : {}),
  }, keys.review!) as Proposal;
  console.info(`[T4R ${runId}] committed proposal review ${label}: proposal=${ready.id}; version=${ready.version}; key=${keys.review}`);
  expect(ready.status).toBe('ready');
  if (action === 'receipt') {
    expect(ready.candidate.totalPrice).toBe('190');
    expect(ready.candidate.unitPrice).toBe('38');
  }
  const reservation = await db.withRestaurantTx(actor, selectionA, contextA.token, async (_ctx, tx) =>
    (await aiProposalRepository.get({ actor, ...selectionA }, ready.id, tx)).usageReservationId);
  console.info(`[T4R ${runId}] setup ${label} reservation: id=${reservation}; status=settled by real synthetic extraction`);
  committedSetups.push({ label, action, ingredientId: ingredient.id, supplierId, proposalId: ready.id, reservationId: reservation, keys });
  return { ingredientId: ingredient.id, supplierId, proposal: ready, args, keys };
}

async function snapshot(client: PoolClient, setup: Awaited<ReturnType<typeof setupProposal>>, extraKeys: string[] = [], auditEntityIds: string[] = []) {
  return withReadContext(client, actorA, selectionA, async () => {
    const balance = (await client.query<{ quantity: string; value: string; sequence: string }>(
      `select quantity::text,value::text,sequence::text from core.stock_balances
        where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4`,
      [selectionA.organizationId, selectionA.restaurantId, locationAId, setup.ingredientId],
    )).rows[0];
    const movements = (await client.query(
      `select id,kind,quantity_delta::text,value_delta::text,after_quantity::text,after_value::text,command_key
         from core.stock_movements where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and location_id=$4`,
      [selectionA.organizationId, selectionA.restaurantId, setup.ingredientId, locationAId],
    )).rows;
    const prices = (await client.query(
      `select id,unit_price::text,base_quantity::text,line_value::text,receipt_movement_id
         from core.purchase_price_history where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 and location_id=$4`,
      [selectionA.organizationId, selectionA.restaurantId, setup.ingredientId, locationAId],
    )).rows;
    const receipts = (await client.query(
      `select h.id,h.status,i.id as item_id,i.original_quantity::text,i.unit_price::text,i.base_quantity::text,i.line_value::text
         from core.purchase_receipts h join core.purchase_receipt_items i
           on i.organization_id=h.organization_id and i.restaurant_id=h.restaurant_id and i.receipt_id=h.id
        where h.organization_id=$1 and h.restaurant_id=$2 and i.ingredient_id=$3`,
      [selectionA.organizationId, selectionA.restaurantId, setup.ingredientId],
    )).rows;
    const proposal = (await client.query(
      `select id,status,version,receipt_result_id,movement_result_id,usage_reservation_id,candidate_json,review_json
         from core.ai_text_proposals where organization_id=$1 and restaurant_id=$2 and id=$3`,
      [selectionA.organizationId, selectionA.restaurantId, setup.proposal.id],
    )).rows[0];
    const reservation = proposal ? (await client.query(
      `select id,status,max_units::text,actual_units::text,operation_key from core.usage_reservations
        where organization_id=$1 and restaurant_id=$2 and id=$3`,
      [selectionA.organizationId, selectionA.restaurantId, proposal.usage_reservation_id],
    )).rows[0] : undefined;
    const ledger = proposal ? (await client.query(
      `select event_kind,units::text from core.usage_ledger where organization_id=$1 and reservation_id=$2 order by id`,
      [selectionA.organizationId, proposal.usage_reservation_id],
    )).rows : [];
    const quota = (await client.query<{ limit_units: string; reserved_units: string; settled_units: string }>(
      `select limit_units::text,reserved_units::text,settled_units::text from core.usage_buckets
        where organization_id=$1 and meter_key='ai_text_whatsapp' and period_start<=now() and now()<period_end`,
      [selectionA.organizationId],
    )).rows[0];
    const idempotency = (await client.query(
      `select operation,key,response_json is not null as has_response from core.idempotency_records
        where organization_id=$1 and key=any($2::uuid[]) order by operation,key`,
      [selectionA.organizationId, [...new Set([...Object.values(setup.keys), ...extraKeys])]],
    )).rows;
    const audit = (await client.query(
      `select action,entity_id,request_id from core.audit_events where organization_id=$1 and restaurant_id=$2
        and entity_id=any($3::uuid[]) and action in ('inventory.ingredient.created','inventory.supplier.created','inventory.receipt.received','inventory.issue.posted') order by action,entity_id`,
      [selectionA.organizationId, selectionA.restaurantId, [...new Set([setup.ingredientId, ...(setup.supplierId ? [setup.supplierId] : []), ...auditEntityIds])]],
    )).rows;
    const allLocationBalances = (await client.query<{ location_id: string; quantity: string; value: string; sequence: string }>(
      `select location_id,quantity::text,value::text,sequence::text from core.stock_balances
        where organization_id=$1 and restaurant_id=$2 and ingredient_id=$3 order by location_id`,
      [selectionA.organizationId, selectionA.restaurantId, setup.ingredientId],
    )).rows;
    return { balance, allLocationBalances, movements, prices, receipts, proposal, reservation, ledger, quota, idempotency, audit };
  });
}

beforeAll(async () => {
  pool = runtimePool(5);
  db = createDatabase(pool);
  await preflightReadOnly(pool);

  console.info(`[T4R ${runId}] write-ahead manifest: synthetic A/B tenants only; labels=${scenarioLabels.join(',')}; keys=${Object.values(runManifest).flatMap(Object.values).join(',')}; no other fixture ids are used`);
  loginA = await login('a');
  console.info(`[T4R ${runId}] Auth login A completed for fixture A; local signout scheduled in afterAll`);
  loginB = await login('b');
  console.info(`[T4R ${runId}] Auth login B completed for fixture B; local signout scheduled in afterAll`);
  expect(loginA.userId, 'fixture A Auth user').toBe(fixtures.a);
  expect(loginB.userId, 'fixture B Auth user').toBe(fixtures.b);
  actorA = await createActorVerifier(loginA.auth.auth, loginA.issuer)(loginA.token, runId);
  actorB = await createActorVerifier(loginB.auth.auth, loginB.issuer)(loginB.token, runId);
  const core = createCore(db);
  console.info(`[T4R ${runId}] synthetic fixture scope verified by read-only preflight: A org/unit=${selectionA.organizationId}/${selectionA.restaurantId}; B org/unit=${selectionB.organizationId}/${selectionB.restaurantId}; active A locations=${activeLocationAIds.join(',')}; starting A settled quota=${startingSettledUnitsA}; planned setup count=4`);
  contextA = await core.selectContext(actorA, selectionA);
  contextIdA = await contextRecordId(actorA, selectionA, contextA.token);
  console.info(`[T4R ${runId}] committed context A: context=${contextIdA}; request=${runId}; Auth session signout is scheduled after suite`);
  contextB = await core.selectContext(actorB, selectionB);
  contextIdB = await contextRecordId(actorB, selectionB, contextB.token);
  console.info(`[T4R ${runId}] committed context B: context=${contextIdB}; request=${runId}; Auth session signout is scheduled after suite`);
}, 120_000);

afterAll(async () => {
  await Promise.all([
    loginA?.auth.auth.signOut({ scope: 'local' }).catch(() => undefined),
    loginB?.auth.auth.signOut({ scope: 'local' }).catch(() => undefined),
  ]);
  await pool?.end();
});

describe('Cycle 07A T4R real PostgreSQL confirmation proof', () => {
  it('receives the canonical 5 kg for R$190 exactly once under real concurrent sessions and tenant RLS', async () => {
    const setup = await setupProposal('receipt-concurrency');
    let openBarrier!: () => void;
    const bothSessions = new Promise<void>(resolve => { openBarrier = resolve; });
    const sessionPids: number[] = [];
    const receiveCalls: string[] = [];
    const actualReceive = receiveReceipt;
    const concurrentService = createAiTextService(db, undefined, {
      draftReceipt,
      receiveReceipt: async (ctx, id, key, tx) => { receiveCalls.push(key); return actualReceive(ctx, id, key, tx); },
      issueStock,
      settleUsage: async (ctx, id, units, tx) => {
        const pid = Number((await tx.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid);
        sessionPids.push(pid);
        if (sessionPids.length === 2) openBarrier();
        await bothSessions;
        return settleUsage(ctx, id, units, tx);
      },
    });
    const observerClient = await observer();
    try {
      const initial = await snapshot(observerClient.client, setup);
      expect(initial.balance).toMatchObject({ quantity: '0', value: '0', sequence: '0' });
      expect(initial.movements).toHaveLength(0);
      expect(initial.allLocationBalances).toHaveLength(activeLocationAIds.length);
      expect(initial.allLocationBalances.every(row => row.quantity === '0' && row.value === '0'), 'new ingredient has zero balances in every active A location').toBe(true);
      expect(initial.prices).toHaveLength(0);
      expect(initial.receipts).toHaveLength(0);
      expect(initial.proposal).toMatchObject({ status: 'ready', version: setup.proposal.version });

      const keys = [setup.keys.confirm!, setup.keys['confirm-2']!];
      const attempts = await Promise.allSettled(keys.map(key => concurrentService.confirmProposal(
        setup.args, setup.proposal.id, { expectedVersion: setup.proposal.version, confirmed: true }, key,
      )));
      const fulfilled = attempts.flatMap((item, index) => item.status === 'fulfilled' ? [{ result: item.value, key: keys[index]! }] : []);
      const rejected = attempts.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
      expect(sessionPids).toHaveLength(2);
      expect(new Set(sessionPids).size, 'two distinct PostgreSQL backend sessions reached the barrier').toBe(2);
      expect(sessionPids).not.toContain(observerClient.pid);
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'RESOURCE_CONFLICT' });
      expect(receiveCalls).toHaveLength(1);

      const winner = fulfilled[0]!;
      const replay = await concurrentService.confirmProposal(setup.args, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, winner.key);
      expect(replay).toEqual(winner.result);

      const winnerResult = winner.result as { result?: { receiptId?: string } };
      const receiptId = winnerResult.result?.receiptId;
      expect(receiptId, 'real receipt id returned by confirm operation').toBeTruthy();
      const after = await snapshot(observerClient.client, setup, keys, [receiptId!]);
      expect(after.balance).toMatchObject({ quantity: '5', value: '190', sequence: '1' });
      expect(after.movements).toHaveLength(1);
      expect(after.movements[0]).toMatchObject({ kind: 'RECEIPT', quantity_delta: '5', value_delta: '190', after_quantity: '5', after_value: '190', command_key: winner.key });
      expect(after.prices).toHaveLength(1);
      expect(after.prices[0]).toMatchObject({ unit_price: '38', base_quantity: '5', line_value: '190' });
      expect(after.receipts).toHaveLength(1);
      expect(after.receipts[0]).toMatchObject({ status: 'received', original_quantity: '5', unit_price: '38', base_quantity: '5', line_value: '190' });
      expect(after.proposal).toMatchObject({ status: 'confirmed', receipt_result_id: after.receipts[0]!.id, movement_result_id: null });
      expect(after.reservation).toMatchObject({ status: 'settled', max_units: '1', actual_units: '1' });
      expect(after.ledger.map((row: { event_kind: string }) => row.event_kind).sort()).toEqual(['reserve', 'settle']);
      expect(after.idempotency.filter((row: { operation: string }) => row.operation === 'ai.text.proposal.confirm'))
        .toEqual([{ operation: 'ai.text.proposal.confirm', key: winner.key, has_response: true }]);
      expect(after.audit).toContainEqual({ action: 'inventory.receipt.received', entity_id: receiptId, request_id: runId });
      expect(after.allLocationBalances).toHaveLength(activeLocationAIds.length);
      for (const row of after.allLocationBalances) {
        if (row.location_id === locationAId) expect(row).toMatchObject({ quantity: '5', value: '190', sequence: '1' });
        else expect(row).toMatchObject({ quantity: '0', value: '0', sequence: '0' });
      }
      console.info(`[T4R ${runId}] receipt confirmed: proposal=${setup.proposal.id}, receipt=${after.receipts[0]!.id}, movement=${after.movements[0]!.id}, price=${after.prices[0]!.id}, pids=${sessionPids.join(',')}, observerPid=${observerClient.pid}`);

      const actorBArgs: TestArgs = { actor: actorB, selection: selectionB, contextToken: contextB.token };
      const asB = createAiTextService(db);
      await expect(asB.getProposal(actorBArgs, setup.proposal.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      await expect(asB.confirmProposal(actorBArgs, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys['cross-tenant-confirm']!))
        .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      await expect(asB.confirmProposal({ actor: actorB, selection: selectionA, contextToken: contextA.token }, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys['wrong-context']!))
        .rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
      await expectNoIdempotencyAsB([setup.keys['cross-tenant-confirm']!, setup.keys['wrong-context']!]);
      const readAsB = await observer();
      try {
        const hidden = await withReadContext(readAsB.client, actorB, selectionB, () => readAsB.client.query(
          'select id from core.ai_text_proposals where organization_id=$1 and restaurant_id=$2 and id=$3',
          [selectionA.organizationId, selectionA.restaurantId, setup.proposal.id],
        ));
        expect(hidden.rowCount).toBe(0);
      } finally { readAsB.client.release(); }
    } finally { observerClient.client.release(); }
  }, 120_000);

  it('blocks an issue that exceeds stock and leaves no negative balance or movement', async () => {
    const setup = await setupProposal('insufficient-issue', 'issue');
    const observerClient = await observer();
    try {
      const before = await snapshot(observerClient.client, setup);
      expect(before.balance).toMatchObject({ quantity: '0', value: '0' });
      await expect(createAiTextService(db).confirmProposal(setup.args, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys.confirm!))
        .rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      const after = await snapshot(observerClient.client, setup);
      expect(after.balance).toMatchObject({ quantity: '0', value: '0', sequence: '0' });
      expect(after.movements).toHaveLength(0);
      expect(after.proposal).toMatchObject({ status: 'ready', version: setup.proposal.version });
      expect(after.idempotency.filter((row: { operation: string }) => row.operation === 'ai.text.proposal.confirm')).toHaveLength(0);
      expect(after.reservation).toEqual(before.reservation);
      expect(after.ledger).toEqual(before.ledger);
      expect(after.quota).toEqual(before.quota);
      expect(after.idempotency).toEqual(before.idempotency);
      expect(after.audit).toEqual(before.audit);
      console.info(`[T4R ${runId}] insufficient issue retained only identified setup: proposal=${setup.proposal.id}, ingredient=${setup.ingredientId}, reservation=${after.reservation.id}`);
    } finally { observerClient.client.release(); }
  }, 120_000);

  it('rolls back a real receipt operation, stock, price history, usage, idempotency and audit on injected failure', async () => {
    const setup = await setupProposal('rollback', 'receipt');
    const observerClient = await observer();
    try {
      const before = await snapshot(observerClient.client, setup);
      expect(before.balance).toMatchObject({ quantity: '0', value: '0' });
      let realReceiptCompleted = false;
      let injectedReceiptId: string | undefined;
      let settlementCalls = 0;
      const service = createAiTextService(db, undefined, {
        draftReceipt,
        receiveReceipt: async (ctx, id, key, tx) => {
          const received = await receiveReceipt(ctx, id, key, tx);
          injectedReceiptId = received.receiptId;
          realReceiptCompleted = true;
          expect(received.movements).toHaveLength(1);
          throw new Error(`T4R rollback injection after real receipt ${runId}`);
        },
        issueStock,
        settleUsage: async (ctx, id, units, tx) => {
          settlementCalls += 1;
          return settleUsage(ctx, id, units, tx);
        },
      });
      await expect(service.confirmProposal(setup.args, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys['rollback-confirm']!))
        .rejects.toThrow(`T4R rollback injection after real receipt ${runId}`);
      expect(realReceiptCompleted).toBe(true);
      expect(settlementCalls).toBe(1);
      const after = await snapshot(observerClient.client, setup, [], [injectedReceiptId!]);
      expect(after.balance).toMatchObject({ quantity: '0', value: '0', sequence: '0' });
      expect(after.movements).toHaveLength(0);
      expect(after.prices).toHaveLength(0);
      expect(after.receipts).toHaveLength(0);
      expect(after.proposal).toMatchObject({ status: 'ready', version: setup.proposal.version });
      expect(after.reservation).toMatchObject({ status: 'settled', actual_units: '1' });
      expect(after.reservation).toEqual(before.reservation);
      expect(after.ledger.map((row: { event_kind: string }) => row.event_kind).sort()).toEqual(['reserve', 'settle']);
      expect(after.ledger).toEqual(before.ledger);
      expect(after.quota).toEqual(before.quota);
      expect(after.idempotency).toEqual(before.idempotency);
      expect(after.audit).toEqual(before.audit);
      expect(after.audit.filter((row: { action: string; entity_id: string }) => row.action === 'inventory.receipt.received' && row.entity_id === injectedReceiptId)).toHaveLength(0);
      console.info(`[T4R ${runId}] rollback proved failed real receipt left the already-settled usage unchanged: proposal=${setup.proposal.id}, ingredient=${setup.ingredientId}, reservation=${after.reservation!.id}, confirmKey=${setup.keys['rollback-confirm']}`);
    } finally { observerClient.client.release(); }
  }, 120_000);

  it('does not expose or confirm an A proposal through synthetic actor B or a forged A context', async () => {
    const setup = await setupProposal('tenant-forgery');
    const observerClient = await observer();
    try {
      const before = await snapshot(observerClient.client, setup);
      const actorBArgs: TestArgs = { actor: actorB, selection: selectionB, contextToken: contextB.token };
      const service = createAiTextService(db);
      await expect(service.getProposal(actorBArgs, setup.proposal.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      await expect(service.confirmProposal(actorBArgs, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys['cross-tenant-confirm']!))
        .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
      await expect(service.confirmProposal({ actor: actorB, selection: selectionA, contextToken: contextA.token }, setup.proposal.id,
        { expectedVersion: setup.proposal.version, confirmed: true }, setup.keys['wrong-context']!))
        .rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
      await expectNoIdempotencyAsB([setup.keys['cross-tenant-confirm']!, setup.keys['wrong-context']!]);
      const hidden = await withReadContext(observerClient.client, actorB, selectionB, () => observerClient.client.query(
        'select id from core.ai_text_proposals where organization_id=$1 and restaurant_id=$2 and id=$3',
        [selectionA.organizationId, selectionA.restaurantId, setup.proposal.id],
      ));
      expect(hidden.rowCount).toBe(0);
      const after = await snapshot(observerClient.client, setup);
      expect(after).toMatchObject({ balance: before.balance, movements: before.movements, prices: before.prices, receipts: before.receipts });
      expect(after.proposal).toMatchObject({ status: 'ready', version: setup.proposal.version });
      expect(after.idempotency.filter((row: { key: string }) => row.key === setup.keys['cross-tenant-confirm'])).toHaveLength(0);
      console.info(`[T4R ${runId}] tenant isolation proved: proposal=${setup.proposal.id} remains visible only to synthetic A; B fixture=${actorB.userId}`);
    } finally { observerClient.client.release(); }
  }, 120_000);

  it('matches the complete run manifest and approved persistent synthetic effects', async () => {
    expect(committedSetups.map(record => record.label).sort()).toEqual([...scenarioLabels].sort());
    const readA = await observer();
    try {
      const aggregate = await withReadContext(readA.client, actorA, selectionA, async () => {
        const ingredients = await readA.client.query<{ id: string }>(
          `select id from core.ingredients where organization_id=$1 and restaurant_id=$2 and name like $3 order by id`,
          [selectionA.organizationId, selectionA.restaurantId, `C07 T4R ${runId} %`],
        );
        const suppliers = await readA.client.query<{ id: string }>(
          `select id from core.suppliers where organization_id=$1 and name like $2 order by id`,
          [selectionA.organizationId, `C07 T4R ${runId} %`],
        );
        const proposals = await readA.client.query<{ id: string; operation_key: string; status: string }>(
          `select id,operation_key,status from core.ai_text_proposals where organization_id=$1 and restaurant_id=$2 and operation_key=any($3::uuid[]) order by operation_key`,
          [selectionA.organizationId, selectionA.restaurantId, scenarioLabels.map(label => runManifest[label].proposal)],
        );
        const reservations = await readA.client.query<{ id: string; status: string; actual_units: string }>(
          `select id,status,actual_units::text from core.usage_reservations where organization_id=$1 and id=any($2::uuid[]) order by id`,
          [selectionA.organizationId, committedSetups.map(record => record.reservationId)],
        );
        const ledger = await readA.client.query<{ event_kind: string; units: string }>(
          `select event_kind,units::text from core.usage_ledger where organization_id=$1 and reservation_id=any($2::uuid[]) order by event_kind,reservation_id`,
          [selectionA.organizationId, committedSetups.map(record => record.reservationId)],
        );
        const idemKeys = committedSetups.flatMap(record => [record.keys.ingredient, record.keys.review,
          ...(record.supplierId ? [record.keys.supplier] : [])]);
        const idempotency = await readA.client.query<{ operation: string; key: string; has_response: boolean }>(
          `select operation,key,response_json is not null as has_response from core.idempotency_records where organization_id=$1 and key=any($2::uuid[]) order by operation,key`,
          [selectionA.organizationId, idemKeys],
        );
        const audit = await readA.client.query<{ action: string; entity_id: string; request_id: string; actor_user_id: string }>(
          `select action,entity_id,request_id,actor_user_id from core.audit_events where organization_id=$1 and restaurant_id=$2 and request_id=$3 and action in ('context.selected','inventory.ingredient.created','inventory.supplier.created','inventory.receipt.received') order by action,entity_id`,
          [selectionA.organizationId, selectionA.restaurantId, runId],
        );
        const quota = await readA.client.query<{ settled_units: string }>(
          `select settled_units::text from core.usage_buckets where organization_id=$1 and meter_key='ai_text_whatsapp' and period_start<=now() and now()<period_end`,
          [selectionA.organizationId],
        );
        const locations = await readA.client.query<{ location_id: string; ingredient_id: string; quantity: string; value: string }>(
          `select location_id,ingredient_id,quantity::text,value::text from core.stock_balances where organization_id=$1 and restaurant_id=$2 and ingredient_id=any($3::uuid[]) order by ingredient_id,location_id`,
          [selectionA.organizationId, selectionA.restaurantId, committedSetups.map(record => record.ingredientId)],
        );
        return { ingredients: ingredients.rows, suppliers: suppliers.rows, proposals: proposals.rows, reservations: reservations.rows,
          ledger: ledger.rows, idempotency: idempotency.rows, audit: audit.rows, quota: quota.rows, locations: locations.rows };
      });
      expect(aggregate.ingredients.map(row => row.id).sort()).toEqual(committedSetups.map(record => record.ingredientId).sort());
      expect(aggregate.suppliers.map(row => row.id).sort()).toEqual(committedSetups.filter(record => record.supplierId).map(record => record.supplierId!).sort());
      expect(aggregate.proposals).toHaveLength(4);
      expect(aggregate.proposals.filter(row => row.status === 'confirmed')).toHaveLength(1);
      expect(aggregate.proposals.filter(row => row.status === 'ready')).toHaveLength(3);
      expect(aggregate.reservations).toHaveLength(4);
      expect(aggregate.reservations.every(row => row.status === 'settled' && row.actual_units === '1')).toBe(true);
      expect(aggregate.ledger).toHaveLength(8);
      expect(aggregate.ledger.filter(row => row.event_kind === 'reserve')).toHaveLength(4);
      expect(aggregate.ledger.filter(row => row.event_kind === 'settle')).toHaveLength(4);
      expect(aggregate.idempotency).toHaveLength(11); // four ingredient + four review + three supplier commands
      expect(aggregate.idempotency.every(row => row.has_response)).toBe(true);
      expect(aggregate.audit.filter(row => row.action === 'context.selected')).toHaveLength(1);
      expect(aggregate.audit.filter(row => row.action === 'inventory.ingredient.created')).toHaveLength(4);
      expect(aggregate.audit.filter(row => row.action === 'inventory.supplier.created')).toHaveLength(3);
      expect(aggregate.audit.filter(row => row.action === 'inventory.receipt.received')).toHaveLength(1);
      expect(aggregate.audit.every(row => row.request_id === runId && row.actor_user_id === actorA.userId)).toBe(true);
      expect(BigInt(aggregate.quota[0]!.settled_units) - startingSettledUnitsA).toBe(4n);
      expect(aggregate.locations).toHaveLength(4 * activeLocationAIds.length);
      const receipt = aggregate.locations.find(row => row.ingredient_id === committedSetups.find(record => record.label === 'receipt-concurrency')!.ingredientId && row.location_id === locationAId);
      expect(receipt).toMatchObject({ quantity: '5', value: '190' });
      expect(aggregate.locations.filter(row => row !== receipt).every(row => row.quantity === '0' && row.value === '0')).toBe(true);
      console.info(`[T4R ${runId}] residual inventory verified by second connection: 4 ingredients, 3 suppliers, 4 proposals/reservations, 8 ledger events, 11 setup idempotency records, 9 A audit events, +4 settled quota; all locations accounted for`);
    } finally { readA.client.release(); }
    const readB = await observer();
    try {
      const contextAuditB = await withReadContext(readB.client, actorB, selectionB, () => readB.client.query(
        `select id from core.audit_events where organization_id=$1 and restaurant_id=$2 and request_id=$3 and action='context.selected'`,
        [selectionB.organizationId, selectionB.restaurantId, runId],
      ));
      expect(contextAuditB.rowCount).toBe(1);
      console.info(`[T4R ${runId}] residual inventory verified by second connection: one B context.selected audit scoped to synthetic B`);
    } finally { readB.client.release(); }
  }, 120_000);
});
