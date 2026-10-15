begin;
insert into auth.users(id) values('40000000-0000-4000-8000-000000000001');
insert into core.organizations(id,owner_user_id,name) values
 ('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000001','Fixture audit');
insert into core.restaurants(id,organization_id,name) values
 ('40000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000010','Fixture unit');
insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id)
 values('40000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000011',
 '40000000-0000-4000-8000-000000000001','context.selected','40000000-0000-4000-8000-000000000011',gen_random_uuid());
set local role donos_api;
select set_config('app.user_id','40000000-0000-4000-8000-000000000001',true),
 set_config('app.organization_id','40000000-0000-4000-8000-000000000010',true),
 set_config('app.restaurant_id','',true);
do $test$
begin
 if exists(select 1 from core.audit_events where restaurant_id is not null) then
   raise exception 'unit audit leaked without active unit'; end if;
 begin
  insert into core.audit_events(organization_id,restaurant_id,actor_user_id,action,entity_id,request_id)
   values(core.organization_id(),'40000000-0000-4000-8000-000000000011',core.actor_id(),
   'context.selected','40000000-0000-4000-8000-000000000011',gen_random_uuid());
  raise exception 'unit audit write accepted without active unit';
 exception when insufficient_privilege then null; end;
end
$test$;
select set_config('app.restaurant_id','40000000-0000-4000-8000-000000000011',true);
do $test$ begin
 if (select count(*) from core.audit_events)<>1 then raise exception 'active unit audit hidden'; end if;
end $test$;
rollback;
select 'unit audit requires explicit unit PASS' as result;
