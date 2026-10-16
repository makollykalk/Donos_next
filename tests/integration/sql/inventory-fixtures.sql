-- Administrative synthetic fixture provisioning, NOT an application route or migration.
-- Only the explicitly authorized DONOS Next DEV. Auth A/B are preexisting synthetic .invalid users.
insert into core.organizations(id,owner_user_id,name) values
 ('31000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','Synthetic Inventory A'),
 ('31000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000001','Synthetic Inventory C'),
 ('32000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000001','Synthetic Inventory B');
insert into core.subscriptions(organization_id,status,starts_at,ends_at)
select id,'active',now()-interval '1 day',now()+interval '1 year' from core.organizations
where id in('31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000020','32000000-0000-4000-8000-000000000010');
insert into core.entitlements(organization_id,feature_key,enabled,valid_from,valid_until)
select id,'inventory_core',true,now()-interval '1 day',now()+interval '1 year' from core.organizations
where id in('31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000020','32000000-0000-4000-8000-000000000010');
-- Deliberately no ON CONFLICT update, purge, real data, grants from API, or secrets.
-- Each test creates its own restaurant through the owner API/service.
