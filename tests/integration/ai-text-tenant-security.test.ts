import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createActorVerifier } from '../../apps/api/src/auth/verify-actor.js';
import { aiProposalRepository } from '../../packages/db/src/ai-proposal-repository.js';
import { runtimePool, login } from '../helpers/cycle07-local-db.js';
import { fixtures } from '../helpers/fixtures.js';

const pool = runtimePool(1);
afterAll(() => pool.end());

it('runtime RLS isolates proposals across organizations and restaurants and rejects forged writes', async () => {
  const [a, b] = await Promise.all([login('a'), login('b')]);
  const actorA = await createActorVerifier(a.auth.auth, a.issuer)(a.token, randomUUID());
  const actorB = await createActorVerifier(b.auth.auth, b.issuer)(b.token, randomUUID());
  const client = await pool.connect();
  try {
    await client.query('begin');
    const setContext = async (actor: typeof actorA, org: string, restaurant: string) => {
      await client.query(
        `select set_config('app.user_id',$1,true),set_config('app.session_id',$2,true),
          set_config('app.organization_id',$3,true),set_config('app.restaurant_id',$4,true)`,
        [actor.userId, actor.sessionId, org, restaurant],
      );
    };
    const ctx = { actor: actorA, organizationId: fixtures.orgA, restaurantId: fixtures.a1 };
    const tx = { query: (text: string, values?: readonly unknown[]) => client.query(text, values ? [...values] : []) };
    await setContext(actorA, fixtures.orgA, fixtures.a1);
    const locationA = (await client.query<{ id: string }>(
      `select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and is_default and not archived`,
      [fixtures.orgA, fixtures.a1],
    )).rows[0]?.id;
    expect(locationA, 'synthetic A1 default location').toBeTruthy();
    const operationKey = randomUUID();
    const requestHash = 'a'.repeat(64);
    const reservation = (await client.query<{ id: string }>(
      `insert into core.usage_reservations
        (organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units)
       select $1,$2,'ai_text_whatsapp',period_start,$3,$4,1
       from core.usage_buckets where organization_id=$1
         and meter_key='ai_text_whatsapp' order by period_start desc limit 1
       returning id`,
      [fixtures.orgA, fixtures.a1, operationKey, requestHash],
    )).rows[0];
    expect(reservation, 'rollback-only synthetic reservation').toBeTruthy();
    const proposal = await aiProposalRepository.insert(ctx, {
      locationId: locationA!, operationKey, requestHash,
      usageReservationId: reservation!.id, status: 'needs_review',
      candidate: { action: 'issue', ingredientDescription: 'synthetic', quantity: '1', unit: 'kg', totalPrice: null,
        unitPrice: null, reason: 'synthetic check', ambiguous: false, explanations: [] },
    }, tx);
    expect(proposal.version).toBe(1);

    const proposalId = proposal.id;
    expect((await client.query('select id from core.ai_text_proposals where id=$1', [proposalId])).rowCount).toBe(1);
    await setContext(actorA, fixtures.orgA, fixtures.a2);
    expect((await client.query('select id from core.ai_text_proposals where id=$1', [proposalId])).rowCount).toBe(0);
    await setContext(actorB, fixtures.orgB, fixtures.b1);
    expect((await client.query('select id from core.ai_text_proposals where id=$1', [proposalId])).rowCount).toBe(0);

    const locationB = (await client.query<{ id: string }>(
      `select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and is_default and not archived`,
      [fixtures.orgB, fixtures.b1],
    )).rows[0]?.id;
    expect(locationB, 'synthetic B1 default location').toBeTruthy();
    await setContext(actorA, fixtures.orgB, fixtures.b1);
    expect((await client.query('select id from core.ai_text_proposals where id=$1', [proposalId])).rowCount).toBe(0);
    await setContext(actorA, fixtures.orgA, fixtures.a2);
    const locationA2 = (await client.query<{ id: string }>(
      `select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and is_default and not archived`,
      [fixtures.orgA, fixtures.a2],
    )).rows[0]?.id;
    expect(locationA2, 'synthetic A2 default location').toBeTruthy();
    await setContext(actorA, fixtures.orgA, fixtures.a1);
    const crossUnitOperationKey = randomUUID();
    const crossUnitRequestHash = 'c'.repeat(64);
    const crossUnitReservation = (await client.query<{ id: string }>(
      `insert into core.usage_reservations
        (organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units)
       select $1,$2,'ai_text_whatsapp',period_start,$3,$4,1
       from core.usage_buckets where organization_id=$1
         and meter_key='ai_text_whatsapp' order by period_start desc limit 1
       returning id`,
      [fixtures.orgA, fixtures.a1, crossUnitOperationKey, crossUnitRequestHash],
    )).rows[0];
    expect(crossUnitReservation, 'rollback-only reservation for cross-unit FK').toBeTruthy();
    await client.query('savepoint cross_unit_reference');
    await expect(client.query(
      `insert into core.ai_text_proposals
        (organization_id,restaurant_id,location_id,actor_user_id,operation_key,request_hash,usage_reservation_id,status,candidate_json)
       values($1,$2,$3,$4,$5,$6,$7,'ready','{}'::jsonb)`,
      [fixtures.orgA, fixtures.a1, locationA2, actorA.userId, crossUnitOperationKey,
        crossUnitRequestHash, crossUnitReservation!.id],
    )).rejects.toMatchObject({ code: '23503' });
    await client.query('rollback to savepoint cross_unit_reference');

    await client.query('savepoint forged_write');
    await expect(client.query(
      `insert into core.ai_text_proposals
        (organization_id,restaurant_id,location_id,actor_user_id,operation_key,request_hash,usage_reservation_id,status,candidate_json)
       values($1,$2,$3,$4,$5,$6,$7,'ready','{}'::jsonb)`,
      [fixtures.orgA, fixtures.a1, locationA, actorB.userId, randomUUID(), 'b'.repeat(64), reservation!.id],
    )).rejects.toMatchObject({ code: '42501' });
    await client.query('rollback to savepoint forged_write');

    await setContext(actorB, fixtures.orgB, fixtures.b1);
    expect((await client.query('select id from core.ai_text_proposals where id=$1', [proposalId])).rowCount).toBe(0);

    await setContext(actorA, fixtures.orgA, fixtures.a1);
    const reviewed = await aiProposalRepository.updateReview(ctx, proposalId, 1, {
      status: 'ready', candidate: proposal.candidate!, review: { reason: 'owner reviewed synthetic proposal' },
    }, tx);
    expect(reviewed.version).toBe(2);
    expect((await aiProposalRepository.list(ctx, { limit: 50 }, tx)).map((row) => row.id)).toContain(proposalId);
    const discarded = await aiProposalRepository.markTerminal(ctx, proposalId, 2, { status: 'discarded', resultId: null }, tx);
    expect(discarded.status).toBe('discarded');
    expect(discarded.terminalAt).not.toBeNull();
    expect(new Date(discarded.expiresAt).getTime() - new Date(discarded.terminalAt!).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    await expect(aiProposalRepository.updateReview(ctx, proposalId, 3, {
      status: 'ready', candidate: proposal.candidate!, review: {},
    }, tx)).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
    await Promise.all([a.auth.auth.signOut({ scope: 'local' }).catch(() => undefined), b.auth.auth.signOut({ scope: 'local' }).catch(() => undefined)]);
  }
}, 120000);
