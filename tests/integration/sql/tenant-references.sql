-- Synthetic relational fixtures live only inside this rolled-back transaction.
begin;
insert into auth.users(id) values
 ('71000000-0000-4000-8000-000000000001'),('72000000-0000-4000-8000-000000000001');
insert into core.organizations(id,owner_user_id,name) values
 ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000001','Fixture A'),
 ('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000001','Fixture C'),
 ('72000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000001','Fixture B');
insert into core.restaurants(id,organization_id,name) values
 ('71000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000010','Fixture A1'),
 ('71000000-0000-4000-8000-000000000012','71000000-0000-4000-8000-000000000010','Fixture A2'),
 ('71000000-0000-4000-8000-000000000021','71000000-0000-4000-8000-000000000020','Fixture C1'),
 ('72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000010','Fixture B1');
set local role donos_api;
select set_config('app.user_id','71000000-0000-4000-8000-000000000001',true),
 set_config('app.session_id','71000000-0000-4000-8000-000000000099',true),
 set_config('app.organization_id','71000000-0000-4000-8000-000000000010',true),
 set_config('app.restaurant_id','71000000-0000-4000-8000-000000000011',true);
do $test$
declare n integer;
begin
  select count(*) into n from core.organizations;
  if n<>2 then raise exception 'owner with two organizations cannot resolve both'; end if;
  if exists(select 1 from core.organizations where name='Fixture B') then raise exception 'tenant B leaked'; end if;
  select count(*) into n from core.restaurants;
  if n<>1 then raise exception 'unit context leaked, got %',n; end if;
  begin
    insert into core.organizations(owner_user_id,name) values('72000000-0000-4000-8000-000000000001','Forgery');
    raise exception 'forged owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into core.restaurants(organization_id,name) values('72000000-0000-4000-8000-000000000010','Forgery');
    raise exception 'cross-tenant unit accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into core.request_contexts(user_id,session_id,organization_id,restaurant_id,token_hash)
    values(core.actor_id(),core.session_id(),'71000000-0000-4000-8000-000000000010',
      '72000000-0000-4000-8000-000000000011',repeat('a',64));
    raise exception 'cross-tenant FK accepted';
  exception when foreign_key_violation then null; end;
  begin
    update core.organizations set owner_user_id='72000000-0000-4000-8000-000000000001';
    raise exception 'owner mutation accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from core.audit_events;
    raise exception 'ledger deletion accepted';
  exception when insufficient_privilege then null; end;
end
$test$;
select set_config('app.restaurant_id','',true);
do $test$
declare n integer;
begin
  select count(*) into n from core.restaurants;
  if n<>2 then raise exception 'organization list mixed units from C/B, got %',n; end if;
end
$test$;
rollback;
select 'two owners / same-owner two organizations / scoped units / composite FK / immutable ownership PASS' as result;
