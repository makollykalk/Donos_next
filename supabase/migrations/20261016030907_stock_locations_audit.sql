-- Cycle 04: physical locations and stock count audit. Additive backfill; no ledger reset.
begin;

create table core.stock_locations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,
 name text not null check(length(name) between 1 and 120 and name=btrim(name)),
 is_default boolean not null default false,archived boolean not null default false,created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,id,is_default),
 foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);
insert into core.stock_locations(organization_id,restaurant_id,name,is_default)
 select organization_id,id,'Principal',true from core.restaurants;
create unique index stock_locations_one_default on core.stock_locations(organization_id,restaurant_id) where is_default and not archived;

alter table core.purchase_receipts add column location_id uuid;
alter table core.purchase_receipt_items add column location_id uuid;
alter table core.stock_balances add column location_id uuid;
alter table core.stock_movements add column location_id uuid;
alter table core.stock_movements add column count_item_id uuid;
alter table core.stock_reversals add column location_id uuid;
alter table core.purchase_price_history add column location_id uuid;
alter table core.recipe_cost_snapshot_lines add column location_id uuid;

-- Temporarily remove guards that intentionally forbid mutation of historical records.
drop trigger if exists balance_projection on core.stock_balances;
drop trigger if exists movement_projection on core.stock_movements;
drop trigger if exists stock_movements_immutable on core.stock_movements;
drop trigger if exists purchase_receipt_items_immutable on core.purchase_receipt_items;
drop trigger if exists stock_reversals_immutable on core.stock_reversals;
drop trigger if exists purchase_price_history_immutable on core.purchase_price_history;
drop trigger if exists recipe_cost_snapshot_lines_immutable on core.recipe_cost_snapshot_lines;
drop trigger if exists receipt_guard on core.purchase_receipts;

update core.purchase_receipts r set location_id=l.id from core.stock_locations l where l.organization_id=r.organization_id and l.restaurant_id=r.restaurant_id and l.is_default;
update core.purchase_receipt_items i set location_id=r.location_id from core.purchase_receipts r where r.organization_id=i.organization_id and r.restaurant_id=i.restaurant_id and r.id=i.receipt_id;
update core.stock_balances b set location_id=l.id from core.stock_locations l where l.organization_id=b.organization_id and l.restaurant_id=b.restaurant_id and l.is_default;
insert into core.stock_balances(organization_id,restaurant_id,location_id,ingredient_id)
 select i.organization_id,i.restaurant_id,l.id,i.id from core.ingredients i join core.stock_locations l on l.organization_id=i.organization_id and l.restaurant_id=i.restaurant_id and l.is_default
 where not exists(select 1 from core.stock_balances b where b.organization_id=i.organization_id and b.restaurant_id=i.restaurant_id and b.location_id=l.id and b.ingredient_id=i.id);
update core.stock_movements m set location_id=l.id from core.stock_locations l where l.organization_id=m.organization_id and l.restaurant_id=m.restaurant_id and l.is_default;
update core.stock_reversals r set location_id=m.location_id from core.stock_movements m where m.organization_id=r.organization_id and m.restaurant_id=r.restaurant_id and m.reversal_id=r.id;
update core.stock_reversals r set location_id=h.location_id from core.purchase_receipts h where h.organization_id=r.organization_id and h.restaurant_id=r.restaurant_id and h.id=r.origin_receipt_id and r.location_id is null;
update core.purchase_price_history p set location_id=h.location_id from core.purchase_receipt_items i join core.purchase_receipts h on h.organization_id=i.organization_id and h.restaurant_id=i.restaurant_id and h.id=i.receipt_id
 where i.organization_id=p.organization_id and i.restaurant_id=p.restaurant_id and i.id=p.receipt_item_id;
update core.recipe_cost_snapshot_lines s set location_id=l.id from core.stock_locations l where l.organization_id=s.organization_id and l.restaurant_id=s.restaurant_id and l.is_default;

-- The location-only backfill preserves every historical identifier, sequence, and snapshot.
set constraints all immediate;
set constraints all deferred;
drop trigger if exists item_guard on core.purchase_receipt_items;
alter table core.stock_balances drop constraint stock_balances_pkey;
alter table core.stock_balances alter column location_id set not null;
alter table core.stock_balances add primary key(organization_id,restaurant_id,location_id,ingredient_id);
alter table core.stock_movements alter column location_id set not null;
alter table core.purchase_receipts alter column location_id set not null;
alter table core.purchase_receipt_items alter column location_id set not null;
alter table core.stock_reversals alter column location_id set not null;
alter table core.purchase_price_history alter column location_id set not null;
alter table core.recipe_cost_snapshot_lines alter column location_id set not null;

alter table core.stock_movements drop constraint stock_movements_organization_id_restaurant_id_ingredient_i_key1;
alter table core.stock_movements drop constraint stock_movements_organization_id_restaurant_id_ingredient__fkey1;
alter table core.stock_movements drop constraint stock_movements_organization_id_restaurant_id_ingredient__fkey2;
alter table core.stock_balances drop constraint stock_balances_organization_id_restaurant_id_ingredient_i_fkey1;
alter table core.stock_movements add constraint stock_movements_location_sequence_key unique(organization_id,restaurant_id,location_id,ingredient_id,sequence);
alter table core.stock_movements add constraint stock_movements_location_id_key unique(organization_id,restaurant_id,location_id,id);
alter table core.stock_movements add constraint stock_movements_location_ingredient_id_key unique(organization_id,restaurant_id,location_id,ingredient_id,id);
alter table core.stock_balances add constraint stock_balances_location_scope_fkey foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict;
alter table core.stock_balances add constraint stock_balances_last_movement_location_fkey foreign key(organization_id,restaurant_id,location_id,ingredient_id,last_movement_id) references core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,id) deferrable initially deferred;

alter table core.purchase_receipts add constraint purchase_receipts_location_id_key unique(organization_id,restaurant_id,location_id,id);
alter table core.purchase_receipts add constraint purchase_receipts_location_fkey foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict;
alter table core.purchase_receipt_items add constraint purchase_receipt_items_location_id_key unique(organization_id,restaurant_id,location_id,ingredient_id,id);
alter table core.purchase_receipt_items add constraint purchase_receipt_items_location_fkey foreign key(organization_id,restaurant_id,location_id,receipt_id) references core.purchase_receipts(organization_id,restaurant_id,location_id,id) on delete restrict;
alter table core.stock_movements add constraint stock_movements_receipt_location_fkey foreign key(organization_id,restaurant_id,location_id,ingredient_id,receipt_item_id) references core.purchase_receipt_items(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict;
alter table core.stock_movements add constraint stock_movements_reversal_origin_location_fkey foreign key(organization_id,restaurant_id,location_id,ingredient_id,reversal_of_id) references core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict;

alter table core.stock_reversals add constraint stock_reversals_location_id_key unique(organization_id,restaurant_id,location_id,id);
alter table core.stock_reversals add constraint stock_reversals_location_fkey foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict;
alter table core.stock_reversals add constraint stock_reversals_origin_movement_location_fkey foreign key(organization_id,restaurant_id,location_id,origin_movement_id) references core.stock_movements(organization_id,restaurant_id,location_id,id) on delete restrict;
alter table core.stock_reversals add constraint stock_reversals_origin_receipt_location_fkey foreign key(organization_id,restaurant_id,location_id,origin_receipt_id) references core.purchase_receipts(organization_id,restaurant_id,location_id,id) on delete restrict;
alter table core.stock_movements drop constraint stock_movements_organization_id_restaurant_id_reversal_id_fkey;
alter table core.stock_movements add constraint stock_movements_reversal_location_fkey foreign key(organization_id,restaurant_id,location_id,reversal_id) references core.stock_reversals(organization_id,restaurant_id,location_id,id) on delete restrict;
alter table core.purchase_price_history add constraint purchase_price_history_location_fkey foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict;
alter table core.recipe_cost_snapshot_lines add constraint recipe_cost_snapshot_location_fkey foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict;
alter table core.recipe_cost_snapshot_lines drop constraint recipe_cost_snapshot_lines_organization_id_restaurant_id__fkey1;
alter table core.recipe_cost_snapshot_lines add constraint recipe_snapshot_movement_location_fkey foreign key(organization_id,restaurant_id,location_id,ingredient_id,last_movement_id) references core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict;
alter table core.recipe_cost_snapshot_lines drop constraint recipe_cost_snapshot_lines_organization_id_restaurant_id_va_key;
alter table core.recipe_cost_snapshot_lines add constraint recipe_snapshot_location_ingredient_key unique(organization_id,restaurant_id,validation_event_id,location_id,ingredient_id);

create table core.inventory_counts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,
 status text not null default 'open' check(status in('open','closed','cancelled')),blind boolean not null default false,
 cut_at timestamptz not null default now(),opened_by uuid not null references auth.users(id) on delete restrict,opened_at timestamptz not null default now(),
 closed_by uuid references auth.users(id) on delete restrict,closed_at timestamptz,cancelled_by uuid references auth.users(id) on delete restrict,cancelled_at timestamptz,cancel_reason text,
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,id),
 check((status='open' and closed_at is null and cancelled_at is null) or(status='closed' and closed_at is not null and closed_by is not null and cancelled_at is null) or(status='cancelled' and cancelled_at is not null and cancelled_by is not null and closed_at is null)),
 foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict
);
create unique index inventory_counts_one_open_per_location on core.inventory_counts(organization_id,restaurant_id,location_id) where status='open';
create table core.inventory_count_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,count_id uuid not null,ingredient_id uuid not null,
 theoretical_quantity core.inventory_quantity not null,theoretical_value core.inventory_value not null,reference_quantity core.inventory_quantity not null,reference_value core.inventory_value not null,issued_quantity core.inventory_quantity not null,ledger_sequence bigint not null check(ledger_sequence>=0),last_movement_id uuid,
 state text not null default 'not_counted' check(state in('not_counted','counted','review','validated')),counted_quantity core.inventory_quantity,observation text,
 positive_variance_total_value core.inventory_value,positive_variance_confirmed boolean not null default false,zero_value_reason text,
 adjustment_movement_id uuid,validated_by uuid references auth.users(id) on delete restrict,validated_at timestamptz,
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,id),unique(organization_id,restaurant_id,location_id,count_id,ingredient_id),unique(organization_id,restaurant_id,location_id,count_id,id),
 check((state='not_counted' and counted_quantity is null and validated_at is null) or(state<>'not_counted' and counted_quantity is not null)),
 check((positive_variance_total_value is null and not positive_variance_confirmed) or(positive_variance_total_value is not null and positive_variance_confirmed)),
 check(positive_variance_total_value is null or(theoretical_quantity=0 and counted_quantity>theoretical_quantity)),
 check(positive_variance_total_value is null or positive_variance_total_value<>0 or length(btrim(coalesce(zero_value_reason,'')))>0),
 check((state='validated' and validated_by is not null and validated_at is not null) or(state<>'validated' and validated_by is null and validated_at is null)),
 foreign key(organization_id,restaurant_id,location_id,count_id) references core.inventory_counts(organization_id,restaurant_id,location_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,location_id,ingredient_id,last_movement_id) references core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict
);
create table core.inventory_count_observations(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,count_id uuid not null,count_item_id uuid not null,
 sequence integer not null check(sequence>0),quantity core.inventory_quantity not null,observation text,recorded_by uuid not null references auth.users(id) on delete restrict,recorded_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,count_item_id,sequence),
 foreign key(organization_id,restaurant_id,location_id,count_id,count_item_id) references core.inventory_count_items(organization_id,restaurant_id,location_id,count_id,id) on delete restrict
);
alter table core.stock_movements add constraint stock_movements_count_item_location_fkey foreign key(organization_id,restaurant_id,location_id,count_item_id) references core.inventory_count_items(organization_id,restaurant_id,location_id,id) on delete restrict;
alter table core.inventory_count_items add constraint inventory_count_adjustment_movement_fkey foreign key(organization_id,restaurant_id,location_id,ingredient_id,adjustment_movement_id) references core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict;

create function core.stock_location_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' and (row(new.id,new.organization_id,new.restaurant_id,new.created_at) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.created_at)) then raise exception 'location identity is immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and new.archived and not old.archived and (exists(select 1 from core.stock_balances b where b.organization_id=old.organization_id and b.restaurant_id=old.restaurant_id and b.location_id=old.id and (b.quantity<>0 or b.value<>0)) or exists(select 1 from core.inventory_counts c where c.organization_id=old.organization_id and c.restaurant_id=old.restaurant_id and c.location_id=old.id and c.status='open') or exists(select 1 from core.purchase_receipts r where r.organization_id=old.organization_id and r.restaurant_id=old.restaurant_id and r.location_id=old.id and r.status='draft')) then raise exception 'location with stock, draft receipt, or open count cannot be archived' using errcode='23514'; end if;
 if new.is_default and new.archived then raise exception 'archived location cannot be default' using errcode='23514'; end if;
 return new;
end $$;
create trigger stock_location_guard before insert or update on core.stock_locations for each row execute function core.stock_location_guard();
create function core.stock_location_default_deferred_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare org uuid;unit_id uuid;
begin
 org:=coalesce(new.organization_id,old.organization_id);unit_id:=coalesce(new.restaurant_id,old.restaurant_id);
 if exists(select 1 from core.restaurants r where r.organization_id=org and r.id=unit_id) and (select count(*) from core.stock_locations l where l.organization_id=org and l.restaurant_id=unit_id and l.is_default and not l.archived)<>1 then raise exception 'unit must have exactly one active default stock location' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger stock_location_default_guard after insert or update or delete on core.stock_locations deferrable initially deferred for each row execute function core.stock_location_default_deferred_guard();

do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='core.stock_movements'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%kind%' loop execute format('alter table core.stock_movements drop constraint %I',c.conname); end loop;
end $$;
alter table core.stock_movements add constraint stock_movements_kind_check check(kind in('RECEIPT','ISSUE','REVERSAL','COUNT_ADJUSTMENT'));
alter table core.stock_movements add constraint stock_movements_kind_origin_check check(
 (kind='RECEIPT' and receipt_item_id is not null and reversal_of_id is null and reversal_id is null and count_item_id is null and quantity_delta>0)
 or(kind='ISSUE' and receipt_item_id is null and reversal_of_id is null and reversal_id is null and count_item_id is null and quantity_delta<0)
 or(kind='REVERSAL' and receipt_item_id is null and reversal_of_id is not null and reversal_id is not null and count_item_id is null)
 or(kind='COUNT_ADJUSTMENT' and receipt_item_id is null and reversal_of_id is null and reversal_id is null and count_item_id is not null));

create function core.inventory_count_session_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then
  if new.status<>'open' or new.opened_by<>core.actor_id() then raise exception 'invalid count opening' using errcode='23514'; end if;
 elsif row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.blind,new.cut_at,new.opened_by,new.opened_at) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.blind,old.cut_at,old.opened_by,old.opened_at) then
  raise exception 'count identity is immutable' using errcode='23514';
 elsif old.status<>'open' or (new.status='closed' and (new.closed_by<>core.actor_id() or new.closed_at is null or new.cancelled_at is not null)) or (new.status='cancelled' and (new.cancelled_by<>core.actor_id() or new.cancelled_at is null or length(btrim(coalesce(new.cancel_reason,'')))=0 or new.closed_at is not null)) or new.status='open' then
  raise exception 'invalid count transition' using errcode='23514';
 end if;
 return new;
end $$;
create trigger inventory_count_session_guard before insert or update on core.inventory_counts for each row execute function core.inventory_count_session_guard();
create function core.inventory_count_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare c core.inventory_counts%rowtype;
begin
 select * into strict c from core.inventory_counts where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.count_id for update;
 if c.status<>'open' then raise exception 'count is not open' using errcode='23514'; end if;
 if tg_op='INSERT' and (new.state<>'not_counted' or new.counted_quantity is not null or new.validated_by is not null) then raise exception 'invalid initial count item' using errcode='23514'; end if;
 if tg_op='UPDATE' and (row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.count_id,new.ingredient_id,new.theoretical_quantity,new.theoretical_value,new.reference_quantity,new.reference_value,new.issued_quantity,new.ledger_sequence,new.last_movement_id) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.count_id,old.ingredient_id,old.theoretical_quantity,old.theoretical_value,old.reference_quantity,old.reference_value,old.issued_quantity,old.ledger_sequence,old.last_movement_id)
   or (old.state='validated' and (row(new.state,new.counted_quantity,new.observation,new.positive_variance_total_value,new.positive_variance_confirmed,new.zero_value_reason,new.validated_by,new.validated_at) is distinct from row(old.state,old.counted_quantity,old.observation,old.positive_variance_total_value,old.positive_variance_confirmed,old.zero_value_reason,old.validated_by,old.validated_at)
     or (new.adjustment_movement_id is distinct from old.adjustment_movement_id and (old.adjustment_movement_id is not null or new.adjustment_movement_id is null or not exists(select 1 from core.stock_movements m where m.organization_id=old.organization_id and m.restaurant_id=old.restaurant_id and m.location_id=old.location_id and m.ingredient_id=old.ingredient_id and m.id=new.adjustment_movement_id and m.count_item_id=old.id and m.kind='COUNT_ADJUSTMENT')))))) then raise exception 'count snapshot or validated item is immutable' using errcode='23514'; end if;
 if new.state='validated' and new.validated_by<>core.actor_id() then raise exception 'count validator mismatch' using errcode='23514'; end if;
 return new;
end $$;
create trigger inventory_count_item_guard before insert or update on core.inventory_count_items for each row execute function core.inventory_count_item_guard();
create trigger inventory_count_observation_immutable before update or delete on core.inventory_count_observations for each row execute function core.inventory_immutable();

create or replace function core.inventory_movement_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare b core.stock_balances%rowtype;i core.purchase_receipt_items%rowtype;o core.stock_movements%rowtype;r core.stock_reversals%rowtype;ci core.inventory_count_items%rowtype;c core.inventory_counts%rowtype;expected_cost numeric;delta numeric;
begin
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id for update;
 if new.actor_user_id<>core.actor_id() or new.sequence<>b.sequence+1 or row(new.before_quantity,new.before_value,new.before_reference_quantity,new.before_reference_value,new.before_issued_quantity) is distinct from row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity) or new.quantity_delta<>new.after_quantity-new.before_quantity or new.value_delta<>new.after_value-new.before_value then raise exception 'invalid ledger chain' using errcode='23514';end if;
 if exists(select 1 from core.inventory_counts h join core.inventory_count_items x on x.organization_id=h.organization_id and x.restaurant_id=h.restaurant_id and x.location_id=h.location_id and x.count_id=h.id where h.organization_id=new.organization_id and h.restaurant_id=new.restaurant_id and h.location_id=new.location_id and h.status='open' and x.ingredient_id=new.ingredient_id)
  and (new.kind<>'COUNT_ADJUSTMENT' or not exists(select 1 from core.inventory_count_items x join core.inventory_counts h on h.organization_id=x.organization_id and h.restaurant_id=x.restaurant_id and h.location_id=x.location_id and h.id=x.count_id where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.location_id=new.location_id and x.ingredient_id=new.ingredient_id and x.id=new.count_item_id and x.state='validated' and h.status='open')) then raise exception 'item is locked by an open physical count' using errcode='23514'; end if;
 if new.kind='RECEIPT' then
  select * into strict i from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.receipt_item_id;
   perform 1 from core.purchase_receipts h join core.suppliers s on s.organization_id=h.organization_id and s.id=h.supplier_id join core.stock_locations l on l.organization_id=h.organization_id and l.restaurant_id=h.restaurant_id and l.id=h.location_id where h.organization_id=new.organization_id and h.restaurant_id=new.restaurant_id and h.location_id=new.location_id and h.id=i.receipt_id and h.status='draft' and not s.archived and not l.archived;
  if not found then raise exception 'receipt unavailable' using errcode='23514';end if;
  perform 1 from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id and not archived;
  if not found or new.quantity_delta<>i.base_quantity or new.value_delta<>i.line_value or new.after_reference_quantity<>new.after_quantity or new.after_reference_value<>new.after_value or new.after_issued_quantity<>0 then raise exception 'invalid receipt valuation' using errcode='23514';end if;
 elsif new.kind='ISSUE' then
  perform 1 from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id and not archived and (base_unit<>'un' or allow_fractional_count or new.quantity_delta=trunc(new.quantity_delta));
  if not found then raise exception 'ingredient unavailable' using errcode='23514';end if;
  expected_cost:=case when new.after_quantity=0 then new.before_value else core.inventory_cost(new.before_issued_quantity-new.quantity_delta,new.before_reference_value,new.before_reference_quantity)-core.inventory_cost(new.before_issued_quantity,new.before_reference_value,new.before_reference_quantity) end;
  if new.value_delta<>-expected_cost or(new.after_quantity>0 and row(new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(new.before_reference_quantity,new.before_reference_value,new.before_issued_quantity-new.quantity_delta)) then raise exception 'invalid issue valuation' using errcode='23514';end if;
 elsif new.kind='COUNT_ADJUSTMENT' then
  select * into strict ci from core.inventory_count_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.count_item_id and state='validated';
  select * into strict c from core.inventory_counts where organization_id=ci.organization_id and restaurant_id=ci.restaurant_id and location_id=ci.location_id and id=ci.count_id and status='open';
  delta:=ci.counted_quantity-ci.theoretical_quantity;
  if delta=0 or new.quantity_delta<>delta or new.after_quantity<>ci.counted_quantity then raise exception 'count adjustment quantity mismatch' using errcode='23514';end if;
  if delta<0 then
   expected_cost:=case when new.after_quantity=0 then new.before_value else core.inventory_cost(new.before_issued_quantity-delta,new.before_reference_value,new.before_reference_quantity)-core.inventory_cost(new.before_issued_quantity,new.before_reference_value,new.before_reference_quantity) end;
   if new.value_delta<>-expected_cost then raise exception 'invalid negative count valuation' using errcode='23514';end if;
  elsif b.quantity=0 then
   if not ci.positive_variance_confirmed or ci.positive_variance_total_value is null or new.value_delta<>ci.positive_variance_total_value then raise exception 'explicit positive count value required' using errcode='23514';end if;
  else
   expected_cost:=core.inventory_cost(delta,b.reference_value,b.reference_quantity);
   if new.value_delta<>expected_cost then raise exception 'invalid positive count valuation' using errcode='23514';end if;
  end if;
  if new.after_reference_quantity<>new.after_quantity or new.after_reference_value<>new.after_value or new.after_issued_quantity<>0 then raise exception 'invalid count average snapshot' using errcode='23514';end if;
 else
  select * into strict o from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.reversal_of_id;
  select * into strict r from core.stock_reversals where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.reversal_id;
  if o.kind='REVERSAL' or b.last_movement_id<>o.id or o.sequence<>b.sequence or (o.kind='ISSUE' and (r.origin_movement_id is distinct from o.id or r.origin_receipt_id is not null)) or (o.kind='RECEIPT' and not exists(select 1 from core.purchase_receipt_items p where p.organization_id=o.organization_id and p.restaurant_id=o.restaurant_id and p.location_id=o.location_id and p.id=o.receipt_item_id and p.receipt_id=r.origin_receipt_id)) or row(new.after_quantity,new.after_value,new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(o.before_quantity,o.before_value,o.before_reference_quantity,o.before_reference_value,o.before_issued_quantity) then raise exception 'invalid compensation' using errcode='23514';end if;
 end if;
 return new;
end $$;

create or replace function core.inventory_projection_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare b core.stock_balances%rowtype;m core.stock_movements%rowtype;
begin
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id;
 select * into m from core.stock_movements where organization_id=b.organization_id and restaurant_id=b.restaurant_id and location_id=b.location_id and ingredient_id=b.ingredient_id order by sequence desc limit 1;
 if not found then
  if row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity,b.sequence,b.last_movement_id) is distinct from row(0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::bigint,null::uuid) then raise exception 'nonzero without ledger' using errcode='23514';end if;
 elsif row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity,b.sequence,b.last_movement_id) is distinct from row(m.after_quantity,m.after_value,m.after_reference_quantity,m.after_reference_value,m.after_issued_quantity,m.sequence,m.id) then raise exception 'projection does not match ledger' using errcode='23514'; end if;
 return null;
end $$;

create or replace function core.inventory_receipt_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then
  if new.status<>'draft' or not exists(select 1 from core.stock_locations l where l.organization_id=new.organization_id and l.restaurant_id=new.restaurant_id and l.id=new.location_id and not l.archived) then raise exception 'receipt must start draft at active location' using errcode='23514';end if;
 else
  if old.status<>'draft' or new.status<>'received' or new.received_by<>core.actor_id() or new.location_id<>old.location_id then raise exception 'invalid receipt transition' using errcode='23514';end if;
  if not exists(select 1 from core.purchase_receipt_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.receipt_id=new.id)
   or exists(select 1 from core.purchase_receipt_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.receipt_id=new.id and not exists(select 1 from core.stock_movements m where m.organization_id=i.organization_id and m.restaurant_id=i.restaurant_id and m.location_id=i.location_id and m.receipt_item_id=i.id and m.kind='RECEIPT')) then raise exception 'receipt requires all posted items' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger receipt_guard before insert or update on core.purchase_receipts for each row execute function core.inventory_receipt_guard();
create trigger item_guard before insert on core.purchase_receipt_items for each row execute function core.inventory_item_guard();
create trigger stock_movements_immutable before update or delete on core.stock_movements for each row execute function core.inventory_immutable();
create trigger purchase_receipt_items_immutable before update or delete on core.purchase_receipt_items for each row execute function core.inventory_immutable();
create trigger stock_reversals_immutable before update or delete on core.stock_reversals for each row execute function core.inventory_immutable();
create trigger purchase_price_history_immutable before update or delete on core.purchase_price_history for each row execute function core.inventory_immutable();
create trigger recipe_cost_snapshot_lines_immutable before update or delete on core.recipe_cost_snapshot_lines for each row execute function core.recipe_immutable();
create constraint trigger balance_projection after insert or update on core.stock_balances deferrable initially deferred for each row execute function core.inventory_projection_guard();
create constraint trigger movement_projection after insert on core.stock_movements deferrable initially deferred for each row execute function core.inventory_projection_guard();

create unique index stock_movements_one_count_adjustment on core.stock_movements(organization_id,restaurant_id,count_item_id) where count_item_id is not null;
create function core.inventory_count_final_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.status='closed' and (exists(select 1 from core.inventory_count_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.location_id=new.location_id and i.count_id=new.id and i.state<>'validated') or exists(select 1 from core.inventory_count_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.location_id=new.location_id and i.count_id=new.id and ((i.counted_quantity=i.theoretical_quantity and i.adjustment_movement_id is not null) or(i.counted_quantity<>i.theoretical_quantity and i.adjustment_movement_id is null) or (i.adjustment_movement_id is not null and not exists(select 1 from core.stock_movements m where m.organization_id=i.organization_id and m.restaurant_id=i.restaurant_id and m.location_id=i.location_id and m.ingredient_id=i.ingredient_id and m.id=i.adjustment_movement_id and m.count_item_id=i.id and m.kind='COUNT_ADJUSTMENT'))))) then raise exception 'count close requires validated items and exact adjustments' using errcode='23514'; end if;
 if new.status='cancelled' and exists(select 1 from core.stock_movements m join core.inventory_count_items i on i.organization_id=m.organization_id and i.restaurant_id=m.restaurant_id and i.location_id=m.location_id and i.id=m.count_item_id where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.location_id=new.location_id and i.count_id=new.id) then raise exception 'cancelled count cannot have movements' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger inventory_count_final after insert or update on core.inventory_counts deferrable initially deferred for each row execute function core.inventory_count_final_guard();

create or replace function core.recipe_cost_snapshot_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare m core.stock_movements%rowtype;b core.stock_balances%rowtype;
begin
 if new.sequence=0 or new.last_movement_id is null then raise exception 'snapshot requires a valued stock movement' using errcode='23514';end if;
 select * into strict m from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.last_movement_id;
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id for share;
 if m.sequence<>new.sequence or b.sequence<>new.sequence or b.last_movement_id<>new.last_movement_id or m.after_quantity<>new.quantity or m.after_value<>new.value or m.after_reference_value<>new.cost_numerator or m.after_reference_quantity<>new.cost_denominator then raise exception 'snapshot source mismatch' using errcode='23514';end if;
 return new;
end $$;

do $$ declare t text;begin
 foreach t in array array['stock_locations','inventory_counts','inventory_count_items','inventory_count_observations'] loop
  execute format('alter table core.%I enable row level security',t);execute format('alter table core.%I force row level security',t);execute format('revoke all on core.%I from public,anon,authenticated',t);
  if t='stock_locations' then execute format('create policy %I on core.%I for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t||'_owner_context',t);
  else execute format('create policy %I on core.%I for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t||'_owner_context',t);end if;
 end loop;
end $$;
grant select,insert,update(name,archived,is_default) on core.stock_locations to donos_api;
grant select,insert,update(status,closed_by,closed_at,cancelled_by,cancelled_at,cancel_reason) on core.inventory_counts to donos_api;
grant select,insert,update(state,counted_quantity,observation,positive_variance_total_value,positive_variance_confirmed,zero_value_reason,adjustment_movement_id,validated_by,validated_at) on core.inventory_count_items to donos_api;
grant select,insert on core.inventory_count_observations to donos_api;
grant insert on core.stock_movements to donos_api;
create index stock_locations_active_idx on core.stock_locations(organization_id,restaurant_id,archived,name);
create index inventory_count_items_work_idx on core.inventory_count_items(organization_id,restaurant_id,location_id,count_id,state,ingredient_id);
create index inventory_count_observations_history_idx on core.inventory_count_observations(organization_id,restaurant_id,count_item_id,sequence);
create index stock_movements_location_ledger_idx on core.stock_movements(organization_id,restaurant_id,location_id,ingredient_id,sequence desc);
create index recipe_cost_snapshot_location_idx on core.recipe_cost_snapshot_lines(organization_id,restaurant_id,location_id,validation_event_id,ingredient_id);

alter table core.audit_events drop constraint audit_events_action_check;
alter table core.audit_events add constraint audit_events_action_check check(action in('organization.created','restaurant.created','context.selected','inventory.ingredient.created','inventory.ingredient.updated','inventory.supplier.created','inventory.supplier.updated','inventory.conversion.created','inventory.location.created','inventory.location.updated','inventory.receipt.drafted','inventory.receipt.received','inventory.issue.posted','inventory.reversal.posted','inventory.count.opened','inventory.count.item.recorded','inventory.count.item.reviewed','inventory.count.item.validated','inventory.count.closed','inventory.count.cancelled','recipe.created','recipe.version.created','recipe.measurement.recorded','recipe.measurement.validated'));
revoke all on all functions in schema core from public,anon,authenticated;
commit;
