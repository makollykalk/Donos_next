-- Cycle 05: owner-scoped App 02 pricing catalog and immutable simulation snapshots.
-- This migration is additive; it does not touch existing inventory or recipe rows.
begin;

create table core.pricing_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  name text not null check(length(name) between 1 and 120 and name=btrim(name)),
  description text check(description is null or length(description)<=1000),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);

create table core.pricing_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  product_id uuid not null,
  name text not null check(length(name) between 1 and 120 and name=btrim(name)),
  list_price numeric(38,12) not null check(list_price>0 and list_price<100000000000000000000000000),
  cost_source_kind text not null check(cost_source_kind in ('manual','recipe')),
  manual_ingredient_cost numeric(38,12) check(manual_ingredient_cost is null or (manual_ingredient_cost>=0 and manual_ingredient_cost<100000000000000000000000000)),
  manual_cost_updated_at timestamptz,
  manual_currency text check(manual_currency is null or manual_currency='BRL'),
  recipe_id uuid,
  location_id uuid,
  quantity_per_sale core.inventory_quantity,
  packaging jsonb not null default '[]'::jsonb check(jsonb_typeof(packaging)='array'),
  other_variable_cost numeric(38,12) not null default 0 check(other_variable_cost>=0 and other_variable_cost<100000000000000000000000000),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id,product_id) references core.pricing_products(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,recipe_id) references core.recipes(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict,
  check((cost_source_kind='manual' and manual_ingredient_cost is not null and manual_cost_updated_at is not null and manual_currency='BRL' and recipe_id is null and location_id is null and quantity_per_sale is null)
     or (cost_source_kind='recipe' and manual_ingredient_cost is null and manual_cost_updated_at is null and manual_currency is null and recipe_id is not null and location_id is not null and quantity_per_sale is not null and quantity_per_sale>0))
);

create table core.pricing_channel_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  name text not null check(length(name) between 1 and 120 and name=btrim(name)),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);

create table core.pricing_channel_rates (
  id uuid primary key,
  organization_id uuid not null,
  restaurant_id uuid not null,
  channel_id uuid not null,
  kind text not null check(kind in ('fee','tax','discount')),
  mode text not null check(mode in ('percentage','fixed')),
  value numeric(38,12) not null check(value>=0 and value<100000000000000000000000000),
  rate_base text check(rate_base in ('list_price','net_after_discount')),
  fixed_basis text not null check(fixed_basis='per_sale'),
  created_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id,channel_id) references core.pricing_channel_profiles(organization_id,restaurant_id,id) on delete restrict,
  check((mode='percentage' and value<=1 and rate_base is not null) or (mode='fixed' and rate_base is null)),
  check(kind<>'discount' or mode<>'percentage' or rate_base='list_price')
);

create table core.pricing_combos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  name text not null check(length(name) between 1 and 120 and name=btrim(name)),
  exclusive_packaging jsonb not null default '[]'::jsonb check(jsonb_typeof(exclusive_packaging)='array'),
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);

create table core.pricing_combo_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  combo_id uuid not null,
  variant_id uuid not null,
  position smallint not null check(position between 1 and 100),
  quantity core.inventory_quantity not null check(quantity>0),
  replaced_packaging_paths jsonb not null default '[]'::jsonb check(jsonb_typeof(replaced_packaging_paths)='array'),
  created_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  unique(organization_id,restaurant_id,combo_id,position),
  unique(organization_id,restaurant_id,combo_id,variant_id),
  foreign key(organization_id,restaurant_id,combo_id) references core.pricing_combos(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,variant_id) references core.pricing_variants(organization_id,restaurant_id,id) on delete restrict
);

create table core.pricing_simulations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  variant_id uuid,
  combo_id uuid,
  channel_id uuid not null,
  input_snapshot jsonb not null check(jsonb_typeof(input_snapshot)='object'),
  cost_source_snapshot jsonb check(cost_source_snapshot is null or jsonb_typeof(cost_source_snapshot)='object'),
  component_cost_snapshots jsonb not null default '[]'::jsonb check(jsonb_typeof(component_cost_snapshots)='array'),
  channel_snapshot jsonb not null check(jsonb_typeof(channel_snapshot)='object'),
  combo_snapshot jsonb check(combo_snapshot is null or jsonb_typeof(combo_snapshot)='object'),
  quote jsonb not null check(jsonb_typeof(quote)='object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(organization_id,restaurant_id,id),
  foreign key(organization_id,restaurant_id,variant_id) references core.pricing_variants(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,combo_id) references core.pricing_combos(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,channel_id) references core.pricing_channel_profiles(organization_id,restaurant_id,id) on delete restrict,
  check((variant_id is not null and combo_id is null and cost_source_snapshot is not null and component_cost_snapshots='[]'::jsonb and combo_snapshot is null)
     or (variant_id is null and combo_id is not null and cost_source_snapshot is null and jsonb_array_length(component_cost_snapshots)>0 and combo_snapshot is not null))
);

create index pricing_products_scope_active_idx on core.pricing_products(organization_id,restaurant_id,id) where archived_at is null;
create index pricing_variants_product_idx on core.pricing_variants(organization_id,restaurant_id,product_id,id) where archived_at is null;
create index pricing_channel_rates_channel_idx on core.pricing_channel_rates(organization_id,restaurant_id,channel_id,id);
create index pricing_combos_scope_active_idx on core.pricing_combos(organization_id,restaurant_id,id) where archived_at is null;
create index pricing_combo_components_combo_idx on core.pricing_combo_components(organization_id,restaurant_id,combo_id,position);
create index pricing_combo_components_variant_idx on core.pricing_combo_components(organization_id,restaurant_id,variant_id);
create index pricing_simulations_variant_history_idx on core.pricing_simulations(organization_id,restaurant_id,variant_id,created_at desc,id desc) where variant_id is not null;
create index pricing_simulations_combo_history_idx on core.pricing_simulations(organization_id,restaurant_id,combo_id,created_at desc,id desc) where combo_id is not null;

do $$ declare t text; begin
  foreach t in array array['pricing_products','pricing_variants','pricing_channel_profiles','pricing_channel_rates','pricing_combos','pricing_combo_components','pricing_simulations'] loop
    execute format('alter table core.%I enable row level security',t);
    execute format('alter table core.%I force row level security',t);
    execute format('revoke all on core.%I from public,anon,authenticated',t);
    execute format('create policy pricing_owner_context on core.%I for all to donos_api using (organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check (organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t);
  end loop;
end $$;

grant select,insert,update(name,description,archived_at,updated_at) on core.pricing_products to donos_api;
grant select,insert,update(name,list_price,cost_source_kind,manual_ingredient_cost,manual_cost_updated_at,manual_currency,recipe_id,location_id,quantity_per_sale,packaging,other_variable_cost,archived_at,updated_at) on core.pricing_variants to donos_api;
grant select,insert,update(name,archived_at,updated_at) on core.pricing_channel_profiles to donos_api;
grant select,insert,update(kind,mode,value,rate_base,fixed_basis),delete on core.pricing_channel_rates to donos_api;
grant select,insert,update(name,exclusive_packaging,archived_at,updated_at) on core.pricing_combos to donos_api;
grant select,insert,update(variant_id,position,quantity,replaced_packaging_paths),delete on core.pricing_combo_components to donos_api;
grant select,insert on core.pricing_simulations to donos_api;

create function core.pricing_identity_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if new.created_by<>core.actor_id() or (tg_op='UPDATE' and new.created_by is distinct from old.created_by) then
    raise exception 'pricing actor identity mismatch' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function core.pricing_identity_guard() from public,anon,authenticated,donos_api;
create trigger pricing_products_identity_guard before insert or update on core.pricing_products for each row execute function core.pricing_identity_guard();
create trigger pricing_variants_identity_guard before insert or update on core.pricing_variants for each row execute function core.pricing_identity_guard();
create trigger pricing_channels_identity_guard before insert or update on core.pricing_channel_profiles for each row execute function core.pricing_identity_guard();
create trigger pricing_combos_identity_guard before insert or update on core.pricing_combos for each row execute function core.pricing_identity_guard();
create trigger pricing_simulations_identity_guard before insert on core.pricing_simulations for each row execute function core.pricing_identity_guard();

create function core.pricing_simulation_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  raise exception 'pricing simulation snapshot is immutable' using errcode='23514';
end $$;
revoke all on function core.pricing_simulation_immutable() from public,anon,authenticated,donos_api;
create trigger pricing_simulations_immutable before update or delete on core.pricing_simulations for each row execute function core.pricing_simulation_immutable();

alter table core.audit_events drop constraint audit_events_action_check;
alter table core.audit_events add constraint audit_events_action_check check(action in(
  'organization.created','restaurant.created','context.selected',
  'inventory.ingredient.created','inventory.ingredient.updated','inventory.supplier.created','inventory.supplier.updated','inventory.conversion.created',
  'inventory.location.created','inventory.location.updated','inventory.receipt.drafted','inventory.receipt.received','inventory.issue.posted','inventory.reversal.posted',
  'inventory.count.opened','inventory.count.item.recorded','inventory.count.item.reviewed','inventory.count.item.validated','inventory.count.closed','inventory.count.cancelled',
  'recipe.created','recipe.version.created','recipe.measurement.recorded','recipe.measurement.validated',
  'pricing.product.created','pricing.product.updated','pricing.product.archived',
  'pricing.variant.created','pricing.variant.updated',
  'pricing.channel.created','pricing.channel.updated',
  'pricing.combo.created','pricing.combo.updated','pricing.simulation.created'
));
alter table core.audit_events add constraint pricing_audit_unit_required check(action not like 'pricing.%' or restaurant_id is not null);

commit;
