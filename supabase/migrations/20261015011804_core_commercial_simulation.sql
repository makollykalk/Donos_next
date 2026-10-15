-- Simulation only. Grants are provisioned outside the API. No payment data/provider.
create table core.subscriptions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references core.organizations(id) on delete restrict,
 source text not null default 'simulation' check(source='simulation'),
 status text not null check(status in ('active','cancelled')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 revision bigint not null default 1 check(revision>0), check(ends_at>starts_at)
);
create table core.entitlements (
 organization_id uuid not null references core.organizations(id) on delete restrict,
 feature_key text not null check(feature_key in ('inventory_core','shopping_premium','ai_text_whatsapp','ai_photo','ai_voice','pricing_core')),
 enabled boolean not null, valid_from timestamptz not null, valid_until timestamptz not null,
 revision bigint not null default 1 check(revision>0),
 source text not null default 'simulation' check(source='simulation'),
 primary key(organization_id,feature_key), check(valid_until>valid_from)
);
create table core.usage_buckets (
 organization_id uuid not null references core.organizations(id) on delete restrict,
 meter_key text not null check(meter_key in ('ai_text_whatsapp','ai_photo','ai_voice')),
 period_start timestamptz not null,period_end timestamptz not null,
 limit_units bigint not null check(limit_units>=0),reserved_units bigint not null default 0 check(reserved_units>=0),settled_units bigint not null default 0 check(settled_units>=0),
 primary key(organization_id,meter_key,period_start),check(period_end>period_start),
 check(reserved_units::numeric+settled_units::numeric<=limit_units::numeric)
);
create table core.usage_reservations (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,
 meter_key text not null,period_start timestamptz not null,
 operation_key uuid not null,request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 max_units bigint not null check(max_units>0), actual_units bigint,
 status text not null default 'reserved' check(status in ('reserved','settled','released','pending_reconciliation')),
 dispatched_at timestamptz, created_at timestamptz not null default now(),
 unique(organization_id,operation_key),unique(organization_id,id),
 foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict,
 foreign key(organization_id,meter_key,period_start) references core.usage_buckets(organization_id,meter_key,period_start) on delete restrict,
 check((status='settled' and actual_units is not null and actual_units>=0 and actual_units<=max_units)
   or (status in ('reserved','released','pending_reconciliation') and actual_units is null)),
 check(status<>'pending_reconciliation' or dispatched_at is not null),
 check(status<>'released' or dispatched_at is null)
);
create index reservations_bucket_idx on core.usage_reservations(organization_id,meter_key,period_start,status);
create table core.usage_ledger (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,reservation_id uuid not null,
 event_kind text not null check(event_kind in ('reserve','settle','release')),units bigint not null check(units>=0),
 created_at timestamptz not null default now(),unique(organization_id,reservation_id,event_kind),
 foreign key(organization_id,reservation_id) references core.usage_reservations(organization_id,id) on delete restrict
);

do $$ declare t text; begin
 foreach t in array array['subscriptions','entitlements','usage_buckets','usage_reservations','usage_ledger'] loop
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated',t);
 end loop;
 foreach t in array array['subscriptions','entitlements','usage_buckets'] loop
  execute format('create policy organization_scope on core.%I for all to donos_api using (organization_id=core.organization_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check (organization_id=core.organization_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t);
 end loop;
end $$;
create policy reservation_scope on core.usage_reservations for all to donos_api using (
 organization_id=core.organization_id() and restaurant_id=core.restaurant_id()
 and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
) with check (
 organization_id=core.organization_id() and restaurant_id=core.restaurant_id()
 and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
create policy usage_ledger_scope on core.usage_ledger for all to donos_api using (
 organization_id=core.organization_id() and exists(select 1 from core.usage_reservations r where r.organization_id=usage_ledger.organization_id and r.id=reservation_id)
) with check (
 organization_id=core.organization_id() and exists(select 1 from core.usage_reservations r where r.organization_id=usage_ledger.organization_id and r.id=reservation_id)
);
grant select on core.subscriptions,core.entitlements,core.usage_buckets,core.usage_reservations,core.usage_ledger to donos_api;
grant update(reserved_units,settled_units) on core.usage_buckets to donos_api;
grant insert(organization_id,restaurant_id,meter_key,period_start,operation_key,request_hash,max_units) on core.usage_reservations to donos_api;
grant update(status,actual_units,dispatched_at) on core.usage_reservations to donos_api;
grant insert(organization_id,reservation_id,event_kind,units) on core.usage_ledger to donos_api;
