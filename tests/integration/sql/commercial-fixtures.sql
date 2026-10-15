-- Only synthetic DONOS Next DEV fixtures. Admin provisioning, never runtime route.
begin;
select id from core.organizations where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000020') order by id for update;
insert into core.subscriptions(organization_id,status,starts_at,ends_at)
select id,'active','2026-01-01Z','2027-01-01Z' from core.organizations o where id in ('10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000020')
and not exists(select 1 from core.subscriptions s where s.organization_id=o.id);
insert into core.entitlements(organization_id,feature_key,enabled,valid_from,valid_until) values
 ('10000000-0000-4000-8000-000000000010','inventory_core',true,'2026-01-01Z','2027-01-01Z'),
 ('10000000-0000-4000-8000-000000000010','ai_photo',true,'2026-01-01Z','2027-01-01Z'),
 ('10000000-0000-4000-8000-000000000020','pricing_core',true,'2026-01-01Z','2027-01-01Z'),
 ('10000000-0000-4000-8000-000000000020','shopping_premium',true,'2026-01-01Z','2027-01-01Z'),
 ('10000000-0000-4000-8000-000000000020','ai_photo',true,'2026-01-01Z','2026-02-01Z')
on conflict do nothing;
do $$ begin
 if exists(select 1 from core.usage_buckets where organization_id='10000000-0000-4000-8000-000000000010' and meter_key='ai_photo' and period_start<='2026-01-01Z' and period_end>'2026-01-01Z' and period_start<>'2026-01-01Z') then raise exception 'Overlapping synthetic bucket';end if;
end $$;
insert into core.usage_buckets(organization_id,meter_key,period_start,period_end,limit_units) values('10000000-0000-4000-8000-000000000010','ai_photo','2026-01-01Z','2027-01-01Z',5) on conflict do nothing;
commit;
