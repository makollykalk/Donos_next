-- Run only on the explicitly designated DONOS Next DEV (ADR 0002).
-- Assertions throw rather than treating an empty result as PASS.
do $test$
declare n integer;
begin
  if to_regclass('core.organizations') is null then
    raise exception 'core.organizations missing';
  end if;
  if not exists(select 1 from pg_roles where rolname='donos_api'
    and not rolsuper and not rolbypassrls and not rolcreaterole
    and not rolcreatedb and not rolinherit and rolcanlogin) then
    raise exception 'runtime role missing or privileged';
  end if;
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member
    where r.rolname='donos_api') then raise exception 'runtime has role membership'; end if;
  select count(*) into n from pg_class c join pg_namespace s on s.oid=c.relnamespace
    where s.nspname='core' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;
  if n<>6 then raise exception 'expected six identity tables with forced RLS, got %',n; end if;
  if exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace
    join pg_roles r on r.oid=c.relowner where s.nspname='core' and r.rolname='donos_api') then
    raise exception 'runtime owns application object'; end if;
  if has_schema_privilege('anon','core','USAGE') or has_schema_privilege('authenticated','core','USAGE') then
    raise exception 'Data API roles can use private schema'; end if;
  if has_table_privilege('donos_api','core.organizations','UPDATE')
    or has_table_privilege('donos_api','core.organizations','DELETE') then
    raise exception 'owner or tenant may be modified'; end if;
  if has_table_privilege('donos_api','core.audit_events','UPDATE')
    or has_table_privilege('donos_api','core.audit_events','DELETE') then
    raise exception 'audit is mutable'; end if;
  if not exists(select 1 from pg_constraint where conrelid='core.request_contexts'::regclass
    and contype='f' and cardinality(conkey)=2) then raise exception 'composite restaurant FK missing'; end if;
end
$test$;
begin;
set local role donos_api;
do $test$
begin
  if exists(select 1 from core.organizations) then raise exception 'unscoped organizations leaked'; end if;
  if exists(select 1 from core.restaurants) then raise exception 'unscoped restaurants leaked'; end if;
end
$test$;
rollback;
select 'core identity schema/grants/unscoped-RLS PASS' as result;
