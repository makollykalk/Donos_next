import { afterAll, expect, it } from 'vitest';
import { runtimePool } from '../helpers/cycle07-local-db.js';

const pool = runtimePool(1);
afterAll(() => pool.end());

it('Cycle 07 proposal persistence is tenant scoped, private, exact, and retained for 30 days', async () => {
  const target = (await pool.query<{ database_name: string; role: string }>(
    'select current_database() as database_name, current_user as role',
  )).rows[0];
  expect(target).toEqual({ database_name: 'postgres', role: 'donos_api' });

  const relation = (await pool.query<{ rls: boolean; force_rls: boolean }>(
    `select c.relrowsecurity as rls,c.relforcerowsecurity as force_rls from pg_class c
     join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relname='ai_text_proposals' and c.relkind='r'`,
  )).rows[0];
  expect(relation).toEqual({ rls: true, force_rls: true });

  const columns = (await pool.query<{ column_name: string; is_nullable: string }>(
    `select column_name,is_nullable from information_schema.columns where table_schema='core'
     and table_name='ai_text_proposals'`,
  )).rows;
  const names = new Set(columns.map((column) => column.column_name));
  for (const column of ['organization_id', 'restaurant_id', 'location_id', 'actor_user_id', 'operation_key',
    'request_hash', 'usage_reservation_id', 'status', 'version', 'candidate_json', 'review_json',
    'created_at', 'updated_at', 'terminal_at', 'expires_at', 'result_id']) expect(names.has(column), column).toBe(true);
  expect([...names].some((name) => /raw_text|source_text|original_text/i.test(name))).toBe(false);

  const foreignKeys = (await pool.query<{ definition: string }>(
    `select pg_get_constraintdef(c.oid) as definition from pg_constraint c
     join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='core' and t.relname='ai_text_proposals' and c.contype='f'`,
  )).rows.map((row) => row.definition);
  expect(foreignKeys.some((key) => /organization_id, restaurant_id.*core\.restaurants/i.test(key))).toBe(true);
  expect(foreignKeys.some((key) => /organization_id, restaurant_id, location_id.*core\.stock_locations/i.test(key))).toBe(true);
  expect(foreignKeys.some((key) => /organization_id, restaurant_id, usage_meter_key, operation_key, request_hash, usage_reservation_id.*core\.usage_reservations/i.test(key))).toBe(true);
  expect(foreignKeys.some((key) => /actor_user_id.*auth\.users/i.test(key))).toBe(true);
  expect(foreignKeys.some((key) => /foreign key\s*\(organization_id, restaurant_id, location_id, receipt_result_id\).*core\.purchase_receipts\(organization_id, restaurant_id, location_id, id\)/i.test(key))).toBe(true);
  expect(foreignKeys.some((key) => /foreign key\s*\(organization_id, restaurant_id, location_id, movement_result_id\).*core\.stock_movements\(organization_id, restaurant_id, location_id, id\)/i.test(key))).toBe(true);

  const uniqueKey = await pool.query(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='core' and t.relname='ai_text_proposals' and c.contype='u'
       and pg_get_constraintdef(c.oid) like '%organization_id, restaurant_id, operation_key%'`,
  );
  expect(uniqueKey.rowCount).toBe(1);
  expect((await pool.query(
    "select 1 from pg_indexes where schemaname='core' and indexname='ai_text_proposals_location_idx'",
  )).rowCount).toBe(1);
  const reservationFkIndex = (await pool.query<{ definition: string }>(
    `select indexdef as definition from pg_indexes
     where schemaname='core' and indexname='ai_text_proposals_usage_reservation_fk_idx'`,
  )).rows[0]?.definition;
  expect(reservationFkIndex).toMatch(/\(organization_id, restaurant_id, usage_meter_key, operation_key, request_hash, usage_reservation_id\)/i);

  expect((await pool.query("select extversion from pg_extension where extname='pg_cron'")).rows[0]?.extversion).toBe('1.6.4');
  expect((await pool.query("select to_regprocedure('core.purge_expired_ai_text_proposals()') is not null as exists")).rows[0]?.exists).toBe(true);
  const cleanup = (await pool.query<{ security_definer: boolean; runtime_can_execute: boolean }>(
    `select p.prosecdef as security_definer,has_function_privilege(current_user,p.oid,'EXECUTE') as runtime_can_execute
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='core' and p.proname='purge_expired_ai_text_proposals'`,
  )).rows[0];
  expect(cleanup).toEqual({ security_definer: false, runtime_can_execute: false });

  for (const role of ['anon', 'authenticated']) {
    expect((await pool.query("select has_schema_privilege($1,'core','usage') as allowed", [role])).rows[0]?.allowed).toBe(false);
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      expect((await pool.query(
        'select has_table_privilege($1,\'core.ai_text_proposals\',$2) as allowed', [role, privilege],
      )).rows[0]?.allowed).toBe(false);
    }
  }
  expect((await pool.query("select has_table_privilege(current_user,'core.ai_text_proposals','SELECT') as allowed")).rows[0]?.allowed).toBe(true);
  for (const privilege of ['INSERT', 'UPDATE']) {
    expect((await pool.query(
      'select has_table_privilege(current_user,\'core.ai_text_proposals\',$1) as allowed', [privilege],
    )).rows[0]?.allowed).toBe(false);
  }
  expect((await pool.query("select has_column_privilege(current_user,'core.ai_text_proposals','usage_reservation_id','INSERT') as allowed")).rows[0]?.allowed).toBe(true);
  expect((await pool.query("select has_column_privilege(current_user,'core.ai_text_proposals','status','UPDATE') as allowed")).rows[0]?.allowed).toBe(true);
  for (const column of ['receipt_result_id', 'movement_result_id']) {
    expect((await pool.query(
      'select has_column_privilege(current_user,\'core.ai_text_proposals\',$1,\'UPDATE\') as allowed', [column],
    )).rows[0]?.allowed).toBe(true);
  }
  expect((await pool.query("select has_column_privilege(current_user,'core.ai_text_proposals','result_id','UPDATE') as allowed")).rows[0]?.allowed).toBe(false);
  expect((await pool.query("select has_table_privilege(current_user,'core.ai_text_proposals','TRUNCATE') as allowed")).rows[0]?.allowed).toBe(false);
  expect((await pool.query("select has_table_privilege(current_user,'core.ai_text_proposals','DELETE') as allowed")).rows[0]?.allowed).toBe(false);
  expect((await pool.query("select has_column_privilege(current_user,'core.ai_text_proposals','expires_at','UPDATE') as allowed")).rows[0]?.allowed).toBe(false);
});
