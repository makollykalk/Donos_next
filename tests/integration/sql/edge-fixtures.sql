-- Explicit synthetic edge cases, DEV only. Administrative fixture, no API writes.
begin;
insert into core.request_contexts(user_id,session_id,organization_id,restaurant_id,token_hash,created_at,expires_at)
values('10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011',encode(extensions.digest(repeat('9',64),'sha256'),'hex'),'2026-01-01Z','2026-01-01T00:30:00Z') on conflict do nothing;
insert into core.entitlements(organization_id,feature_key,enabled,valid_from,valid_until) values
('10000000-0000-4000-8000-000000000010','ai_voice',true,'2026-01-01Z','2027-01-01Z') on conflict do nothing;
insert into core.usage_buckets(organization_id,meter_key,period_start,period_end,limit_units) values
('10000000-0000-4000-8000-000000000010','ai_voice','2026-01-01T00:00:00.123456Z','2027-01-01Z',5),
('10000000-0000-4000-8000-000000000010','ai_text_whatsapp','2025-01-01T00:00:00.123456Z','2026-01-01Z',5) on conflict do nothing;
insert into core.usage_reservations(id,organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units)
values('90000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011','ai_text_whatsapp','2025-01-01T00:00:00.123456Z','90000000-0000-4000-8000-000000000011',repeat('e',64),5) on conflict do nothing;
update core.usage_buckets b set reserved_units=(select coalesce(sum(max_units),0) from core.usage_reservations r where r.organization_id=b.organization_id and r.meter_key=b.meter_key and r.period_start=b.period_start and r.status in ('reserved','pending_reconciliation')),
settled_units=(select coalesce(sum(actual_units),0) from core.usage_reservations r where r.organization_id=b.organization_id and r.meter_key=b.meter_key and r.period_start=b.period_start and r.status='settled')
where b.organization_id='10000000-0000-4000-8000-000000000010' and b.meter_key='ai_text_whatsapp';
insert into core.usage_ledger(organization_id,reservation_id,event_kind,units)
values('10000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000010','reserve',5) on conflict do nothing;
-- Deliberately corrupted admin fixture: runtime must fail closed on overlapping periods.
insert into core.organizations(id,owner_user_id,name) values('90000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','DEV Overlap fixture') on conflict do nothing;
insert into core.restaurants(id,organization_id,name) values('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000020','DEV Overlap unit') on conflict do nothing;
insert into core.subscriptions(organization_id,status,starts_at,ends_at)
select '90000000-0000-4000-8000-000000000020','active','2026-01-01Z','2027-01-01Z' where not exists(select 1 from core.subscriptions where organization_id='90000000-0000-4000-8000-000000000020');
insert into core.entitlements(organization_id,feature_key,enabled,valid_from,valid_until) values
('90000000-0000-4000-8000-000000000020','inventory_core',true,'2026-01-01Z','2027-01-01Z'),
('90000000-0000-4000-8000-000000000020','ai_photo',true,'2026-01-01Z','2027-01-01Z') on conflict do nothing;
insert into core.usage_buckets(organization_id,meter_key,period_start,period_end,limit_units) values
('90000000-0000-4000-8000-000000000020','ai_photo','2026-01-01Z','2027-01-01Z',5),
('90000000-0000-4000-8000-000000000020','ai_photo','2026-02-01Z','2027-01-01Z',5) on conflict do nothing;
-- Cancelled subscription with previously reserved usage. No real billing.
insert into core.organizations(id,owner_user_id,name) values('90000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000001','DEV Cancelled fixture') on conflict do nothing;
insert into core.restaurants(id,organization_id,name) values('90000000-0000-4000-8000-000000000031','90000000-0000-4000-8000-000000000030','DEV Cancelled unit') on conflict do nothing;
insert into core.stock_locations(organization_id,restaurant_id,name,is_default)
select r.organization_id,r.id,'Principal',true from core.restaurants r where r.id in('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000031')
and not exists(select 1 from core.stock_locations l where l.organization_id=r.organization_id and l.restaurant_id=r.id and l.is_default and not l.archived);
insert into core.subscriptions(organization_id,status,starts_at,ends_at)
select '90000000-0000-4000-8000-000000000030','cancelled','2026-01-01Z','2027-01-01Z' where not exists(select 1 from core.subscriptions where organization_id='90000000-0000-4000-8000-000000000030');
insert into core.entitlements(organization_id,feature_key,enabled,valid_from,valid_until) values
('90000000-0000-4000-8000-000000000030','inventory_core',true,'2026-01-01Z','2027-01-01Z'),
('90000000-0000-4000-8000-000000000030','ai_photo',true,'2026-01-01Z','2027-01-01Z') on conflict do nothing;
insert into core.usage_buckets(organization_id,meter_key,period_start,period_end,limit_units) values
('90000000-0000-4000-8000-000000000030','ai_photo','2026-01-01Z','2027-01-01Z',5) on conflict do nothing;
insert into core.usage_reservations(id,organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units)
values('90000000-0000-4000-8000-000000000032','90000000-0000-4000-8000-000000000030','90000000-0000-4000-8000-000000000031','ai_photo','2026-01-01Z','90000000-0000-4000-8000-000000000033',repeat('d',64),5) on conflict do nothing;
update core.usage_buckets b set reserved_units=(select coalesce(sum(max_units),0) from core.usage_reservations r where r.organization_id=b.organization_id and r.meter_key=b.meter_key and r.period_start=b.period_start and r.status in ('reserved','pending_reconciliation')),
settled_units=(select coalesce(sum(actual_units),0) from core.usage_reservations r where r.organization_id=b.organization_id and r.meter_key=b.meter_key and r.period_start=b.period_start and r.status='settled')
where b.organization_id='90000000-0000-4000-8000-000000000030';
insert into core.usage_ledger(organization_id,reservation_id,event_kind,units)
values('90000000-0000-4000-8000-000000000030','90000000-0000-4000-8000-000000000032','reserve',5) on conflict do nothing;
commit;
