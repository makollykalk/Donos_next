begin;
insert into auth.users(id) values('30000000-0000-4000-8000-000000000001');
do $test$
begin
  begin
    insert into core.idempotency_records(scope_kind,scope_id,actor_user_id,organization_id,operation,key,request_hash)
    values('organization','30000000-0000-4000-8000-000000000010',
      '30000000-0000-4000-8000-000000000001',null,'fixture',gen_random_uuid(),repeat('a',64));
    raise exception 'NULL organization scope accepted';
  exception when check_violation then null; end;
end
$test$;
rollback;
select 'organization idempotency scope rejects NULL PASS' as result;
