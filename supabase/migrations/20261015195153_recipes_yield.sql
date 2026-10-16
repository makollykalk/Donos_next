-- Cycle 03: immutable recipe versions and observed yields. Private core schema only.
create table core.recipes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null,
 kind text not null check(kind in ('product','preparation')),
 name text not null check(length(name) between 1 and 120 and name=btrim(name)),
 current_version_id uuid, archived boolean not null default false, created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),
 foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);
create table core.recipe_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null,
 recipe_id uuid not null, version_number bigint not null check(version_number>0), name text not null check(length(name) between 1 and 120 and name=btrim(name)),
 kind text not null check(kind in ('product','preparation')), output_unit text not null check(output_unit in ('kg','L','un')),
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id), unique(organization_id,restaurant_id,recipe_id,id), unique(organization_id,restaurant_id,recipe_id,version_number),
 foreign key(organization_id,restaurant_id,recipe_id) references core.recipes(organization_id,restaurant_id,id) on delete restrict
);
alter table core.recipes add constraint recipes_current_version_fk foreign key(organization_id,restaurant_id,id,current_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) deferrable initially deferred;
create table core.recipe_transformations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, recipe_id uuid not null, recipe_version_id uuid not null,
 position integer not null check(position between 1 and 30), kind text not null check(kind in ('cleaning','cooking','loss','other')),
 label text not null check(length(label) between 1 and 120 and label=btrim(label)), unique(organization_id,restaurant_id,id), unique(organization_id,restaurant_id,recipe_version_id,position),
 unique(organization_id,restaurant_id,recipe_version_id,id),
 foreign key(organization_id,restaurant_id,recipe_id,recipe_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) on delete restrict
);
create table core.recipe_components (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, recipe_id uuid not null, recipe_version_id uuid not null,
 kind text not null check(kind in ('ingredient','recipe')), ingredient_id uuid, child_recipe_id uuid, child_version_id uuid,
 quantity core.inventory_quantity not null check(quantity>0), unit text not null check(unit in ('kg','g','L','mL','un','package')),
 role text not null check(role in ('ingredient','packaging')), conversion_id uuid, conversion_label text, conversion_version bigint,
 factor_to_base core.inventory_price, duplicate_use_reason text check(length(btrim(duplicate_use_reason)) between 1 and 240 and duplicate_use_reason=btrim(duplicate_use_reason)),
 created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),
 foreign key(organization_id,restaurant_id,recipe_id,recipe_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,child_recipe_id,child_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,conversion_id) references core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,id) on delete restrict,
 check((kind='ingredient' and ingredient_id is not null and child_recipe_id is null and child_version_id is null and factor_to_base is not null
   and ((unit='package' and conversion_id is not null and conversion_label is not null and conversion_version is not null) or (unit<>'package' and conversion_id is null and conversion_label is null and conversion_version is null)))
   or (kind='recipe' and ingredient_id is null and child_recipe_id is not null and child_version_id is not null and conversion_id is null and conversion_label is null and conversion_version is null and factor_to_base is null and unit in ('kg','g','L','mL','un')))
);
create table core.recipe_yield_measurements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, recipe_id uuid not null, recipe_version_id uuid not null,
 measurement_number bigint not null check(measurement_number>0), kind text not null check(kind in ('estimated','measured')),
 observed_at timestamptz not null, method text not null check(length(method) between 1 and 500),
 gross_quantity core.inventory_quantity not null check(gross_quantity>0), net_quantity core.inventory_quantity not null check(net_quantity>0),
 final_quantity core.inventory_quantity not null check(final_quantity>0), output_unit text not null check(output_unit in ('kg','L','un')),
 portion_count core.inventory_quantity, portion_quantity core.inventory_quantity,
 supersedes_measurement_id uuid, recorded_by uuid not null references auth.users(id) on delete restrict, recorded_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id), unique(organization_id,restaurant_id,recipe_version_id,id), unique(organization_id,restaurant_id,recipe_version_id,measurement_number),
 foreign key(organization_id,restaurant_id,recipe_id,recipe_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,recipe_version_id,supersedes_measurement_id) references core.recipe_yield_measurements(organization_id,restaurant_id,recipe_version_id,id) on delete restrict,
 check(net_quantity<=gross_quantity),
 check((portion_count is null and portion_quantity is null) or (portion_count>0 and portion_quantity>0))
);
create table core.recipe_transformation_measurements (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, recipe_version_id uuid not null,
 measurement_id uuid not null, transformation_id uuid not null, input_quantity core.inventory_quantity not null check(input_quantity>0),
 output_quantity core.inventory_quantity not null check(output_quantity>0), unit text not null check(unit in ('kg','L','un')),
 gain_reason text check(length(gain_reason) between 1 and 240), created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id), unique(organization_id,restaurant_id,measurement_id,transformation_id),
 foreign key(organization_id,restaurant_id,recipe_version_id,measurement_id) references core.recipe_yield_measurements(organization_id,restaurant_id,recipe_version_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,recipe_version_id,transformation_id) references core.recipe_transformations(organization_id,restaurant_id,recipe_version_id,id) on delete restrict,
 check(output_quantity<=input_quantity or gain_reason is not null)
);
create table core.recipe_validation_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, recipe_id uuid not null,
 recipe_version_id uuid not null, measurement_id uuid not null, validated_by uuid not null references auth.users(id) on delete restrict,
 validated_at timestamptz not null default now(), cost_policy text not null default 'moving_average_current_v1' check(cost_policy='moving_average_current_v1'),
 unique(organization_id,restaurant_id,id), unique(organization_id,restaurant_id,measurement_id),
 foreign key(organization_id,restaurant_id,recipe_id,recipe_version_id) references core.recipe_versions(organization_id,restaurant_id,recipe_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,recipe_version_id,measurement_id) references core.recipe_yield_measurements(organization_id,restaurant_id,recipe_version_id,id) on delete restrict
);
create table core.recipe_cost_snapshot_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, restaurant_id uuid not null, validation_event_id uuid not null,
 ingredient_id uuid not null, sequence bigint not null check(sequence>=0), last_movement_id uuid,
 quantity core.inventory_quantity not null check(quantity>=0), value core.inventory_value not null check(value>=0),
 cost_numerator numeric not null check(cost_numerator>=0), cost_denominator numeric not null check(cost_denominator>0),
 occurrence_count integer not null check(occurrence_count>0), created_at timestamptz not null default now(), unique(organization_id,restaurant_id,id),
 unique(organization_id,restaurant_id,validation_event_id,ingredient_id),
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,validation_event_id) references core.recipe_validation_events(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,last_movement_id) references core.stock_movements(organization_id,restaurant_id,ingredient_id,id) on delete restrict
);

create function core.recipe_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin raise exception 'immutable recipe history' using errcode='23514'; end $$;
create trigger recipe_versions_immutable before update or delete on core.recipe_versions for each row execute function core.recipe_immutable();
create trigger recipe_transformations_immutable before update or delete on core.recipe_transformations for each row execute function core.recipe_immutable();
create trigger recipe_components_immutable before update or delete on core.recipe_components for each row execute function core.recipe_immutable();
create trigger recipe_yield_measurements_immutable before update or delete on core.recipe_yield_measurements for each row execute function core.recipe_immutable();
create trigger recipe_transformation_measurements_immutable before update or delete on core.recipe_transformation_measurements for each row execute function core.recipe_immutable();
create trigger recipe_validation_events_immutable before update or delete on core.recipe_validation_events for each row execute function core.recipe_immutable();
create trigger recipe_cost_snapshot_lines_immutable before update or delete on core.recipe_cost_snapshot_lines for each row execute function core.recipe_immutable();

create function core.recipe_identity_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' and new.created_by<>core.actor_id() then raise exception 'actor mismatch' using errcode='23514'; end if;
 if tg_op='UPDATE' and (row(new.id,new.organization_id,new.restaurant_id,new.kind,new.created_by,new.created_at) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.kind,old.created_by,old.created_at)) then raise exception 'identity fields are immutable' using errcode='23514'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger recipe_identity_guard before insert or update on core.recipes for each row execute function core.recipe_identity_guard();

create function core.recipe_version_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare r core.recipes%rowtype; expected bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 select * into strict r from core.recipes where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.recipe_id for update;
 if r.archived or r.kind<>new.kind or new.created_by<>core.actor_id() then raise exception 'recipe version context invalid' using errcode='23514'; end if;
 select coalesce(max(version_number),0)+1 into expected from core.recipe_versions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_id=new.recipe_id;
 if new.version_number<>expected then raise exception 'recipe version sequence conflict' using errcode='23514'; end if;
 return new;
end $$;
create trigger recipe_version_guard before insert on core.recipe_versions for each row execute function core.recipe_version_guard();

create function core.recipe_component_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare parent core.recipe_versions%rowtype; child core.recipe_versions%rowtype; i core.ingredients%rowtype; c core.ingredient_conversions%rowtype; f numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 select * into strict parent from core.recipe_versions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_id=new.recipe_id and id=new.recipe_version_id;
 if exists(select 1 from core.recipe_validation_events where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id) then raise exception 'validated recipe version is sealed' using errcode='23514'; end if;
 if (select count(*) from core.recipe_components where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id)>=250 then raise exception 'too many recipe components' using errcode='23514'; end if;
 if new.kind='ingredient' then
  select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
  if i.archived then raise exception 'ingredient unavailable' using errcode='23514'; end if;
  if new.unit='package' then
   select * into strict c from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.conversion_id;
 if c.version<>new.conversion_version or c.label<>new.conversion_label then raise exception 'conversion snapshot mismatch' using errcode='23514'; end if;
   f:=c.factor_to_base;
  else
   f:=case when new.unit=i.base_unit then 1 when new.unit='g' and i.base_unit='kg' then 0.001 when new.unit='mL' and i.base_unit='L' then 0.001 else 0 end;
  end if;
  if f=0 or new.factor_to_base<>f or (i.base_unit='un' and not i.allow_fractional_count and new.quantity*f<>trunc(new.quantity*f)) then raise exception 'component unit mismatch' using errcode='23514'; end if;
 else
  select * into strict child from core.recipe_versions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_id=new.child_recipe_id and id=new.child_version_id;
  if child.kind<>'preparation' or (new.unit in ('kg','g') and child.output_unit<>'kg') or (new.unit in ('L','mL') and child.output_unit<>'L') or (new.unit='un' and child.output_unit<>'un') then raise exception 'child recipe unit mismatch' using errcode='23514'; end if;
  if exists(with recursive descendants(version_id) as (
    select new.child_version_id
    union
    select edge.child_version_id from descendants d join core.recipe_components edge on edge.organization_id=new.organization_id and edge.restaurant_id=new.restaurant_id and edge.recipe_version_id=d.version_id and edge.kind='recipe'
  ) select 1 from descendants where version_id=new.recipe_version_id) then raise exception 'recipe cycle' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger recipe_component_guard before insert on core.recipe_components for each row execute function core.recipe_component_guard();

create function core.recipe_component_duplicate_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if exists(select 1 from core.recipe_components x where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_version_id=new.recipe_version_id and x.id<>new.id and x.kind=new.kind and x.ingredient_id is not distinct from new.ingredient_id and x.child_version_id is not distinct from new.child_version_id)
 and (new.duplicate_use_reason is null or exists(select 1 from core.recipe_components x where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_version_id=new.recipe_version_id and x.id<>new.id and x.kind=new.kind and x.ingredient_id is not distinct from new.ingredient_id and x.child_version_id is not distinct from new.child_version_id and x.duplicate_use_reason is null)) then
   raise exception 'duplicate component requires reason on every occurrence' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger recipe_component_duplicate_guard after insert on core.recipe_components deferrable initially deferred for each row execute function core.recipe_component_duplicate_guard();

create function core.recipe_transformation_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 if exists(select 1 from core.recipe_validation_events where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id) then raise exception 'validated recipe version is sealed' using errcode='23514'; end if;
 return new;
end $$;
create trigger recipe_transformation_guard before insert on core.recipe_transformations for each row execute function core.recipe_transformation_guard();

create function core.recipe_measurement_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare v core.recipe_versions%rowtype; expected bigint; prior core.recipe_yield_measurements%rowtype; t record; tr core.recipe_transformations%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 select * into strict v from core.recipe_versions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_id=new.recipe_id and id=new.recipe_version_id;
 if new.recorded_by<>core.actor_id() or new.output_unit<>v.output_unit then raise exception 'measurement context mismatch' using errcode='23514'; end if;
 select coalesce(max(measurement_number),0)+1 into expected from core.recipe_yield_measurements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id;
 if new.measurement_number<>expected then raise exception 'measurement sequence conflict' using errcode='23514'; end if;
 if new.supersedes_measurement_id is not null then
  select * into strict prior from core.recipe_yield_measurements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id and id=new.supersedes_measurement_id;
  if prior.measurement_number>=new.measurement_number then raise exception 'invalid superseded measurement' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger recipe_measurement_guard before insert on core.recipe_yield_measurements for each row execute function core.recipe_measurement_guard();

create function core.recipe_transformation_measurement_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare k text; out_unit text;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 select x.kind,v.output_unit into strict k,out_unit from core.recipe_transformations x join core.recipe_versions v on v.organization_id=x.organization_id and v.restaurant_id=x.restaurant_id and v.recipe_id=x.recipe_id and v.id=x.recipe_version_id
 where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_version_id=new.recipe_version_id and x.id=new.transformation_id;
 if exists(select 1 from core.recipe_validation_events where organization_id=new.organization_id and restaurant_id=new.restaurant_id and measurement_id=new.measurement_id) then raise exception 'validated measurement is sealed' using errcode='23514'; end if;
 if new.unit<>out_unit or (k in ('cleaning','loss') and new.output_quantity>new.input_quantity) or (new.output_quantity>new.input_quantity and new.gain_reason is null) then raise exception 'invalid transformation measurement' using errcode='23514'; end if;
 return new;
end $$;
create trigger recipe_transformation_measurement_guard before insert on core.recipe_transformation_measurements for each row execute function core.recipe_transformation_measurement_guard();

create function core.recipe_validation_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare m core.recipe_yield_measurements%rowtype; stage_count bigint; measured_count bigint; first_input numeric; last_output numeric; last_cleaning_output numeric; broken_links bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text||':'||new.restaurant_id::text||':recipe-graph',0));
 select * into strict m from core.recipe_yield_measurements x where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_id=new.recipe_id and x.recipe_version_id=new.recipe_version_id and x.id=new.measurement_id;
 if new.validated_by<>core.actor_id() or m.kind<>'measured' then raise exception 'real measurement required' using errcode='23514'; end if;
 select count(*) into stage_count from core.recipe_transformations where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id;
 select count(*) into measured_count from core.recipe_transformation_measurements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and recipe_version_id=new.recipe_version_id and measurement_id=new.measurement_id;
 select tm.input_quantity into first_input from core.recipe_transformation_measurements tm join core.recipe_transformations t on t.organization_id=tm.organization_id and t.restaurant_id=tm.restaurant_id and t.recipe_version_id=tm.recipe_version_id and t.id=tm.transformation_id where tm.organization_id=new.organization_id and tm.restaurant_id=new.restaurant_id and tm.recipe_version_id=new.recipe_version_id and tm.measurement_id=new.measurement_id order by t.position asc limit 1;
 select tm.output_quantity into last_output from core.recipe_transformation_measurements tm join core.recipe_transformations t on t.organization_id=tm.organization_id and t.restaurant_id=tm.restaurant_id and t.recipe_version_id=tm.recipe_version_id and t.id=tm.transformation_id where tm.organization_id=new.organization_id and tm.restaurant_id=new.restaurant_id and tm.recipe_version_id=new.recipe_version_id and tm.measurement_id=new.measurement_id order by t.position desc limit 1;
 select tm.output_quantity into last_cleaning_output from core.recipe_transformation_measurements tm join core.recipe_transformations t on t.organization_id=tm.organization_id and t.restaurant_id=tm.restaurant_id and t.recipe_version_id=tm.recipe_version_id and t.id=tm.transformation_id where tm.organization_id=new.organization_id and tm.restaurant_id=new.restaurant_id and tm.recipe_version_id=new.recipe_version_id and tm.measurement_id=new.measurement_id and t.kind in ('cleaning','loss') order by t.position desc limit 1;
 if stage_count<>measured_count then raise exception 'all transformation results are required' using errcode='23514'; end if;
 if stage_count=0 and (m.gross_quantity<>m.net_quantity or m.net_quantity<>m.final_quantity) then raise exception 'gross, net and final must match without transformations' using errcode='23514'; end if;
 if stage_count>0 and (first_input<>m.gross_quantity or last_output<>m.final_quantity or coalesce(last_cleaning_output,m.gross_quantity)<>m.net_quantity) then raise exception 'transformation endpoints must match measured gross, net and final' using errcode='23514'; end if;
 with ordered as (select tm.input_quantity,tm.output_quantity,row_number() over(order by t.position) rn,lag(tm.output_quantity) over(order by t.position) prev from core.recipe_transformation_measurements tm join core.recipe_transformations t on t.organization_id=tm.organization_id and t.restaurant_id=tm.restaurant_id and t.recipe_version_id=tm.recipe_version_id and t.id=tm.transformation_id where tm.organization_id=new.organization_id and tm.restaurant_id=new.restaurant_id and tm.recipe_version_id=new.recipe_version_id and tm.measurement_id=new.measurement_id)
 select count(*) into broken_links from ordered where rn>1 and input_quantity<>prev;
 if broken_links>0 then raise exception 'transformation measurements must be continuous' using errcode='23514'; end if;
 return new;
end $$;
create trigger recipe_validation_guard before insert on core.recipe_validation_events for each row execute function core.recipe_validation_guard();

create function core.recipe_cost_snapshot_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare m core.stock_movements%rowtype; b core.stock_balances%rowtype;
begin
 if new.sequence=0 or new.last_movement_id is null then raise exception 'snapshot requires a valued stock movement' using errcode='23514'; end if;
 select * into strict m from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.last_movement_id;
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id for share;
 if m.sequence<>new.sequence or b.sequence<>new.sequence or b.last_movement_id<>new.last_movement_id or m.after_quantity<>new.quantity or m.after_value<>new.value or m.after_reference_value<>new.cost_numerator or m.after_reference_quantity<>new.cost_denominator then raise exception 'snapshot source mismatch' using errcode='23514'; end if;
 return new;
end $$;
create trigger recipe_cost_snapshot_guard before insert on core.recipe_cost_snapshot_lines for each row execute function core.recipe_cost_snapshot_guard();

do $$ declare t text; begin
 foreach t in array array['recipes','recipe_versions','recipe_transformations','recipe_components','recipe_yield_measurements','recipe_transformation_measurements','recipe_validation_events','recipe_cost_snapshot_lines'] loop
  execute format('alter table core.%I enable row level security',t);
  execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated',t);
  execute format('create policy recipe_owner_context on core.%I for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t);
 end loop;
end $$;
grant select,insert on core.recipes,core.recipe_versions,core.recipe_transformations,core.recipe_components,core.recipe_yield_measurements,core.recipe_transformation_measurements,core.recipe_validation_events,core.recipe_cost_snapshot_lines to donos_api;
grant update(name,archived,current_version_id,updated_at) on core.recipes to donos_api;
create index recipes_list_idx on core.recipes(organization_id,restaurant_id,archived,updated_at desc,id);
create index recipe_components_child_idx on core.recipe_components(organization_id,restaurant_id,child_version_id) where kind='recipe';
create index recipe_measurements_history_idx on core.recipe_yield_measurements(organization_id,restaurant_id,recipe_version_id,measurement_number desc);
create index recipe_validations_history_idx on core.recipe_validation_events(organization_id,restaurant_id,recipe_version_id,validated_at desc);
create index recipe_cost_snapshot_lookup_idx on core.recipe_cost_snapshot_lines(organization_id,restaurant_id,validation_event_id,ingredient_id);

alter table core.audit_events drop constraint audit_events_action_check;
alter table core.audit_events add constraint audit_events_action_check check(action in('organization.created','restaurant.created','context.selected','inventory.ingredient.created','inventory.ingredient.updated','inventory.supplier.created','inventory.supplier.updated','inventory.conversion.created','inventory.receipt.drafted','inventory.receipt.received','inventory.issue.posted','inventory.reversal.posted','recipe.created','recipe.version.created','recipe.measurement.recorded','recipe.measurement.validated'));
alter table core.audit_events add constraint recipe_audit_unit_required check(action not like 'recipe.%' or restaurant_id is not null);
