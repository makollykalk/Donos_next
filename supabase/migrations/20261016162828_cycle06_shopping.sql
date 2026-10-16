-- Cycle 06: stock thresholds, shopping snapshots and confirmed purchase commitments.
-- Additive only. Apply exclusively to the authorized DONOS Next DEV project.
begin;

create table core.stock_thresholds(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,
 location_id uuid not null,ingredient_id uuid not null,base_unit text not null check(base_unit in('kg','L','un')),
 minimum_quantity core.inventory_quantity not null,target_quantity core.inventory_quantity not null,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id) on delete restrict,updated_at timestamptz not null default now(),
 check(target_quantity>=minimum_quantity),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,ingredient_id),
 foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict
);

create table core.shopping_lists(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,
 status text not null default 'draft' check(status in('draft','archived')),
 ledger_sequence_at_generation bigint not null check(ledger_sequence_at_generation>=0),generated_at timestamptz not null default now(),
 generated_by uuid not null references auth.users(id) on delete restrict,archived_at timestamptz,archived_by uuid references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 check((status='draft' and archived_at is null and archived_by is null) or(status='archived' and archived_at is not null and archived_by is not null)),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,id),
 foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict
);

create table core.shopping_list_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,list_id uuid not null,ingredient_id uuid not null,
 ingredient_name_snapshot text not null check(length(ingredient_name_snapshot) between 1 and 120),base_unit text not null check(base_unit in('kg','L','un')),
 ledger_sequence_at_generation bigint not null check(ledger_sequence_at_generation>=0),
 balance_quantity core.inventory_quantity not null,minimum_quantity core.inventory_quantity not null,target_quantity core.inventory_quantity not null,
 committed_pending_quantity core.inventory_quantity not null,needed_base_quantity core.inventory_quantity not null,
 suggested_purchase_quantity core.inventory_quantity not null,suggested_base_quantity core.inventory_quantity not null,
 original_unit text not null check(original_unit in('kg','g','L','mL','un','package')),
 conversion_id uuid,conversion_label text,conversion_version bigint,factor_to_base core.inventory_price not null check(factor_to_base>0),allow_fractional_count boolean not null,
 suggested_supplier_id uuid,suggested_supplier_name text,supplier_reference_line_value core.inventory_value,supplier_reference_base_quantity core.inventory_quantity,
 supplier_reference_posted_at timestamptz,supplier_reference_document_date date,
 purchase_quantity core.inventory_quantity not null check(purchase_quantity>0),supplier_id uuid,removed boolean not null default false,note text check(note is null or length(note)<=500),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(target_quantity>=minimum_quantity),check(needed_base_quantity=greatest(0,target_quantity-balance_quantity-committed_pending_quantity)),
 check((original_unit='package' and conversion_id is not null and conversion_label is not null and conversion_version is not null)
    or(original_unit<>'package' and conversion_id is null and conversion_label is null and conversion_version is null)),
 check((suggested_supplier_id is null and suggested_supplier_name is null and supplier_reference_line_value is null and supplier_reference_base_quantity is null and supplier_reference_posted_at is null and supplier_reference_document_date is null)
    or(suggested_supplier_id is not null and suggested_supplier_name is not null and supplier_reference_line_value is not null and supplier_reference_base_quantity is not null and supplier_reference_base_quantity>0 and supplier_reference_posted_at is not null)),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,id),unique(organization_id,restaurant_id,location_id,list_id,ingredient_id),
 foreign key(organization_id,restaurant_id,location_id,list_id) references core.shopping_lists(organization_id,restaurant_id,location_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,suggested_supplier_id) references core.suppliers(organization_id,id) on delete restrict,
 foreign key(organization_id,supplier_id) references core.suppliers(organization_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,conversion_id) references core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,id) on delete restrict
);

create table core.shopping_commitments(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,location_id uuid not null,
 list_id uuid not null,list_item_id uuid not null,ingredient_id uuid not null,supplier_id uuid,
 base_unit text not null check(base_unit in('kg','L','un')),confirmed_quantity core.inventory_quantity not null check(confirmed_quantity>0),
 original_unit text not null check(original_unit in('kg','g','L','mL','un','package')),
 conversion_id uuid,conversion_label text,conversion_version bigint,factor_to_base core.inventory_price not null check(factor_to_base>0),allow_fractional_count boolean not null,
 committed_base_quantity core.inventory_quantity not null check(committed_base_quantity>0),
 received_base_quantity core.inventory_quantity not null default 0,remaining_base_quantity core.inventory_quantity not null,
 status text not null default 'confirmed' check(status in('confirmed','fulfilled','cancelled')),
 confirmed_by uuid not null references auth.users(id) on delete restrict,confirmed_at timestamptz not null default now(),
 cancelled_by uuid references auth.users(id) on delete restrict,cancelled_at timestamptz,cancel_reason text check(cancel_reason is null or length(cancel_reason) between 1 and 240),
 check(received_base_quantity+remaining_base_quantity=committed_base_quantity),
 check((status='confirmed' and remaining_base_quantity>0 and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or(status='fulfilled' and remaining_base_quantity=0 and received_base_quantity=committed_base_quantity and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or(status='cancelled' and remaining_base_quantity>0 and cancelled_by is not null and cancelled_at is not null and cancel_reason is not null)),
 check((original_unit='package' and conversion_id is not null and conversion_label is not null and conversion_version is not null)
    or(original_unit<>'package' and conversion_id is null and conversion_label is null and conversion_version is null)),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,location_id,id),unique(organization_id,restaurant_id,location_id,ingredient_id,id),
 foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,location_id,list_id) references core.shopping_lists(organization_id,restaurant_id,location_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,location_id,list_item_id) references core.shopping_list_items(organization_id,restaurant_id,location_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,supplier_id) references core.suppliers(organization_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,conversion_id) references core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,id) on delete restrict
);
create unique index shopping_commitments_one_open_per_item on core.shopping_commitments(organization_id,restaurant_id,location_id,list_item_id) where status='confirmed';
alter table core.shopping_list_items add constraint shopping_list_items_parent_unique unique(organization_id,restaurant_id,location_id,id,list_id,ingredient_id);
alter table core.shopping_commitments add constraint shopping_commitments_item_identity_fkey foreign key(organization_id,restaurant_id,location_id,list_item_id,list_id,ingredient_id)
 references core.shopping_list_items(organization_id,restaurant_id,location_id,id,list_id,ingredient_id) on delete restrict;

alter table core.purchase_receipt_items add column commitment_id uuid;
alter table core.purchase_receipt_items add constraint purchase_receipt_items_commitment_fkey
 foreign key(organization_id,restaurant_id,location_id,ingredient_id,commitment_id)
 references core.shopping_commitments(organization_id,restaurant_id,location_id,ingredient_id,id) on delete restrict;

create index stock_thresholds_location_idx on core.stock_thresholds(organization_id,restaurant_id,location_id,ingredient_id);
create index shopping_lists_history_idx on core.shopping_lists(organization_id,restaurant_id,location_id,created_at desc,id);
create index shopping_list_items_list_idx on core.shopping_list_items(organization_id,restaurant_id,location_id,list_id,removed,ingredient_id);
create index shopping_commitments_open_scope_idx on core.shopping_commitments(organization_id,restaurant_id,location_id,ingredient_id,status) where status='confirmed';
create index purchase_receipt_items_commitment_idx on core.purchase_receipt_items(organization_id,restaurant_id,location_id,ingredient_id,commitment_id) where commitment_id is not null;

create function core.shopping_threshold_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.ingredients%rowtype;
begin
 if tg_op='UPDATE' and row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.ingredient_id,new.base_unit,new.created_by,new.created_at)
    is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.ingredient_id,old.base_unit,old.created_by,old.created_at)
 then raise exception 'threshold identity is immutable' using errcode='23514';end if;
 perform 1 from core.stock_locations where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.location_id and not archived for share;
 if not found then raise exception 'threshold location unavailable' using errcode='23514';end if;
 select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
 if i.archived or i.base_unit<>new.base_unit or new.updated_by<>core.actor_id() or (tg_op='INSERT' and new.created_by<>core.actor_id()) then raise exception 'threshold ingredient or actor mismatch' using errcode='23514';end if;
 new.updated_at:=now();return new;
end $$;
create trigger shopping_threshold_guard before insert or update on core.stock_thresholds for each row execute function core.shopping_threshold_guard();

create function core.shopping_list_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then
  perform 1 from core.stock_locations where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.location_id and not archived for share;
  if not found or new.status<>'draft' or new.generated_by<>core.actor_id() then raise exception 'invalid shopping list creation' using errcode='23514';end if;
 elsif row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.ledger_sequence_at_generation,new.generated_at,new.generated_by,new.created_at)
   is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.ledger_sequence_at_generation,old.generated_at,old.generated_by,old.created_at)
   or old.status<>'draft' or new.status<>'archived' or new.archived_by<>core.actor_id() or new.archived_at is null
 then raise exception 'invalid shopping list transition' using errcode='23514';end if;
 return new;
end $$;
create trigger shopping_list_guard before insert or update on core.shopping_lists for each row execute function core.shopping_list_guard();

create function core.shopping_list_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.ingredients%rowtype; l core.shopping_lists%rowtype; c core.ingredient_conversions%rowtype; f numeric;
begin
 if tg_op='INSERT' then
  select * into strict l from core.shopping_lists where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.list_id for update;
  select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
 else
  if row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.list_id,new.ingredient_id,new.ingredient_name_snapshot,new.base_unit,new.balance_quantity,new.minimum_quantity,new.target_quantity,new.committed_pending_quantity,new.needed_base_quantity,new.suggested_purchase_quantity,new.suggested_base_quantity,new.original_unit,new.conversion_id,new.conversion_label,new.conversion_version,new.factor_to_base,new.allow_fractional_count,new.suggested_supplier_id,new.suggested_supplier_name,new.supplier_reference_line_value,new.supplier_reference_base_quantity,new.supplier_reference_posted_at,new.supplier_reference_document_date,new.created_at)
    is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.list_id,old.ingredient_id,old.ingredient_name_snapshot,old.base_unit,old.balance_quantity,old.minimum_quantity,old.target_quantity,old.committed_pending_quantity,old.needed_base_quantity,old.suggested_purchase_quantity,old.original_unit,old.conversion_id,old.conversion_label,old.conversion_version,old.factor_to_base,old.allow_fractional_count,old.suggested_supplier_id,old.suggested_supplier_name,old.supplier_reference_line_value,old.supplier_reference_base_quantity,old.supplier_reference_posted_at,old.supplier_reference_document_date,old.created_at)
  then raise exception 'shopping suggestion snapshot is immutable' using errcode='23514';end if;
  if exists(select 1 from core.shopping_commitments cmt where cmt.organization_id=old.organization_id and cmt.restaurant_id=old.restaurant_id and cmt.location_id=old.location_id and cmt.list_item_id=old.id and cmt.status='confirmed') then raise exception 'item with open commitment cannot be edited' using errcode='23514';end if;
  select * into strict l from core.shopping_lists where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.list_id for update;
  select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
  if l.status<>'draft' then raise exception 'archived shopping list cannot be edited' using errcode='23514';end if;
 end if;
 perform 1 from core.stock_locations where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.location_id and not archived for share;
 if not found then raise exception 'shopping location unavailable' using errcode='23514';end if;
 if tg_op='INSERT' then
  if l.status<>'draft' or i.archived or i.base_unit<>new.base_unit or new.purchase_quantity<>new.suggested_purchase_quantity then raise exception 'shopping item parent, ingredient, or initial quantity mismatch' using errcode='23514';end if;
  if new.original_unit='package' then
   select * into strict c from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.conversion_id;
   if c.version<>new.conversion_version or c.label<>new.conversion_label or c.factor_to_base<>new.factor_to_base or exists(select 1 from core.ingredient_conversions v where v.organization_id=c.organization_id and v.restaurant_id=c.restaurant_id and v.ingredient_id=c.ingredient_id and v.label=c.label and v.version>c.version) then raise exception 'shopping conversion snapshot mismatch' using errcode='23514';end if;
   f:=c.factor_to_base;
  else
   f:=case when new.original_unit=i.base_unit then 1 when new.original_unit='g' and i.base_unit='kg' then 0.001 when new.original_unit='mL' and i.base_unit='L' then 0.001 else 0 end;
  end if;
  if f=0 or f<>new.factor_to_base or new.suggested_purchase_quantity*new.factor_to_base<>new.suggested_base_quantity or (i.base_unit='un' and not i.allow_fractional_count and new.suggested_base_quantity<>trunc(new.suggested_base_quantity)) then raise exception 'invalid shopping unit conversion' using errcode='23514';end if;
  if new.supplier_id is not null and not exists(select 1 from core.suppliers s where s.organization_id=new.organization_id and s.id=new.supplier_id and not s.archived) then raise exception 'shopping supplier unavailable' using errcode='23514';end if;
 end if;
 if i.archived or i.base_unit<>new.base_unit then raise exception 'shopping ingredient unavailable' using errcode='23514';end if;
 if new.supplier_id is not null and not exists(select 1 from core.suppliers s where s.organization_id=new.organization_id and s.id=new.supplier_id and not s.archived) then raise exception 'shopping supplier unavailable' using errcode='23514';end if;
 if i.base_unit='un' and not i.allow_fractional_count and mod(new.purchase_quantity*new.factor_to_base,1)<>0 then raise exception 'indivisible units cannot be fractional' using errcode='23514';end if;
 new.updated_at:=now();return new;
end $$;
create trigger shopping_list_item_guard before insert or update on core.shopping_list_items for each row execute function core.shopping_list_item_guard();

create function core.shopping_commitment_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare item core.shopping_list_items%rowtype; c core.ingredient_conversions%rowtype;
begin
 if tg_op='INSERT' then
  select * into strict item from core.shopping_list_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.list_item_id for update;
  perform 1 from core.shopping_lists where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.list_id and status='draft' for update;
  if not found or item.list_id<>new.list_id or item.ingredient_id<>new.ingredient_id or item.base_unit<>new.base_unit or item.removed or item.purchase_quantity<>new.confirmed_quantity or item.supplier_id is distinct from new.supplier_id
    or item.original_unit<>new.original_unit or item.conversion_id is distinct from new.conversion_id or item.conversion_label is distinct from new.conversion_label
    or item.conversion_version is distinct from new.conversion_version or item.factor_to_base<>new.factor_to_base or item.allow_fractional_count<>new.allow_fractional_count
    or new.committed_base_quantity<>new.confirmed_quantity*new.factor_to_base or new.received_base_quantity<>0 or new.remaining_base_quantity<>new.committed_base_quantity
    or new.status<>'confirmed' or new.confirmed_by<>core.actor_id() then raise exception 'invalid shopping commitment confirmation' using errcode='23514';end if;
  if item.original_unit='package' then
   select * into strict c from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.conversion_id;
   if c.version<>new.conversion_version or c.factor_to_base<>new.factor_to_base then raise exception 'commitment conversion is stale' using errcode='23514';end if;
  end if;
 else
  if row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.list_id,new.list_item_id,new.ingredient_id,new.supplier_id,new.base_unit,new.confirmed_quantity,new.original_unit,new.conversion_id,new.conversion_label,new.conversion_version,new.factor_to_base,new.allow_fractional_count,new.committed_base_quantity,new.confirmed_by,new.confirmed_at)
    is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.list_id,old.list_item_id,old.ingredient_id,old.supplier_id,old.base_unit,old.confirmed_quantity,old.original_unit,old.conversion_id,old.conversion_label,old.conversion_version,old.factor_to_base,old.allow_fractional_count,old.committed_base_quantity,old.confirmed_by,old.confirmed_at)
  then raise exception 'shopping commitment identity is immutable' using errcode='23514';end if;
  if old.status<>'confirmed' or new.received_base_quantity<old.received_base_quantity or new.remaining_base_quantity>old.remaining_base_quantity then raise exception 'invalid shopping commitment update' using errcode='23514';end if;
  if new.received_base_quantity>old.received_base_quantity and new.status not in('confirmed','fulfilled') then raise exception 'received commitment cannot be cancelled' using errcode='23514';end if;
  if new.status='cancelled' and (new.cancelled_by<>core.actor_id() or new.cancelled_at is null or length(btrim(coalesce(new.cancel_reason,'')))=0 or new.received_base_quantity<>old.received_base_quantity or new.remaining_base_quantity<>old.remaining_base_quantity) then raise exception 'invalid commitment cancellation' using errcode='23514';end if;
  if new.status='fulfilled' and new.received_base_quantity<>new.committed_base_quantity then raise exception 'commitment fulfillment requires full receipt' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger shopping_commitment_guard before insert or update on core.shopping_commitments for each row execute function core.shopping_commitment_guard();

create function core.shopping_commitment_receipt_projection_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare cid uuid;ids uuid[];expected core.shopping_commitments%rowtype; actual core.inventory_quantity;
begin
 if tg_table_name='shopping_commitments' then
  ids:=array[coalesce(new.id,old.id)];
 else
  select coalesce(array_agg(distinct commitment_id),array[]::uuid[]) into ids from core.purchase_receipt_items
   where organization_id=coalesce(new.organization_id,old.organization_id) and restaurant_id=coalesce(new.restaurant_id,old.restaurant_id)
    and receipt_id=coalesce(new.id,old.id) and commitment_id is not null;
 end if;
 foreach cid in array ids loop
  select * into strict expected from core.shopping_commitments where id=cid;
  select coalesce(sum(i.base_quantity),0)::core.inventory_quantity into actual from core.purchase_receipt_items i
   join core.purchase_receipts h on h.organization_id=i.organization_id and h.restaurant_id=i.restaurant_id and h.id=i.receipt_id and h.status='received'
   join core.stock_movements m on m.organization_id=i.organization_id and m.restaurant_id=i.restaurant_id and m.location_id=i.location_id and m.receipt_item_id=i.id and m.kind='RECEIPT'
   where i.organization_id=expected.organization_id and i.restaurant_id=expected.restaurant_id and i.location_id=expected.location_id and i.ingredient_id=expected.ingredient_id and i.commitment_id=cid;
  if actual<>expected.received_base_quantity or actual>expected.committed_base_quantity then raise exception 'commitment receipt projection mismatch' using errcode='23514';end if;
 end loop;
 return null;
end $$;
create constraint trigger shopping_commitment_receipt_projection after insert or update on core.shopping_commitments deferrable initially deferred for each row execute function core.shopping_commitment_receipt_projection_guard();
create constraint trigger shopping_receipt_commitment_projection after update of status on core.purchase_receipts deferrable initially deferred for each row execute function core.shopping_commitment_receipt_projection_guard();

create or replace function core.inventory_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.ingredients%rowtype; c core.ingredient_conversions%rowtype; k core.shopping_commitments%rowtype; f numeric;
begin
 perform 1 from core.purchase_receipts where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.receipt_id and status='draft' for update;
 if not found then raise exception 'draft required' using errcode='23514';end if;
 if (select count(*) from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and receipt_id=new.receipt_id)>=50 then raise exception 'too many lines' using errcode='23514';end if;
 select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
 if i.archived or new.base_unit<>i.base_unit or new.allow_fractional_count<>i.allow_fractional_count then raise exception 'ingredient mismatch' using errcode='23514';end if;
 if new.original_unit='package' then
  select * into strict c from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.conversion_id;
  if c.version<>new.conversion_version or c.label<>new.conversion_label or (new.commitment_id is null and exists(select 1 from core.ingredient_conversions v where v.organization_id=c.organization_id and v.restaurant_id=c.restaurant_id and v.ingredient_id=c.ingredient_id and v.label=c.label and v.version>c.version)) then raise exception 'conversion snapshot mismatch' using errcode='23514';end if;
  f:=c.factor_to_base;
 else
  f:=case when new.original_unit=i.base_unit then 1 when new.original_unit='g' and i.base_unit='kg' then 0.001 when new.original_unit='mL' and i.base_unit='L' then 0.001 else 0 end;
 end if;
 if f=0 or f<>new.factor_to_base or new.base_quantity<>new.original_quantity*f or (i.base_unit='un' and not i.allow_fractional_count and new.base_quantity<>trunc(new.base_quantity)) or (new.unit_price>0 and new.line_value=0) then raise exception 'invalid purchase quantities or valuation' using errcode='23514';end if;
 if new.commitment_id is not null then
  select * into strict k from core.shopping_commitments where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.commitment_id;
  if k.status<>'confirmed' or k.base_unit<>new.base_unit or k.original_unit<>new.original_unit or k.conversion_id is distinct from new.conversion_id or k.conversion_label is distinct from new.conversion_label or k.conversion_version is distinct from new.conversion_version or k.factor_to_base<>new.factor_to_base or k.allow_fractional_count<>new.allow_fractional_count then raise exception 'receipt commitment mismatch' using errcode='23514';end if;
 end if;
 return new;
end $$;

create function core.shopping_catalog_archive_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' and new.archived and not old.archived then
  if tg_table_name='ingredients' and exists(select 1 from core.shopping_commitments c where c.organization_id=old.organization_id and c.restaurant_id=old.restaurant_id and c.ingredient_id=old.id and c.status='confirmed') then raise exception 'ingredient has open purchase commitments' using errcode='23514';end if;
  if tg_table_name='suppliers' and exists(select 1 from core.shopping_commitments c where c.organization_id=old.organization_id and c.supplier_id=old.id and c.status='confirmed') then raise exception 'supplier has open purchase commitments' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger shopping_ingredient_archive_guard before update of archived on core.ingredients for each row execute function core.shopping_catalog_archive_guard();
create trigger shopping_supplier_archive_guard before update of archived on core.suppliers for each row execute function core.shopping_catalog_archive_guard();
-- Extend the location archival guard without rewriting its inventory/count rules.
create or replace function core.stock_location_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' and row(new.id,new.organization_id,new.restaurant_id,new.created_at) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.created_at) then raise exception 'location identity is immutable' using errcode='23514';end if;
 if tg_op='UPDATE' and new.archived and not old.archived and (exists(select 1 from core.stock_balances b where b.organization_id=old.organization_id and b.restaurant_id=old.restaurant_id and b.location_id=old.id and (b.quantity<>0 or b.value<>0)) or exists(select 1 from core.inventory_counts c where c.organization_id=old.organization_id and c.restaurant_id=old.restaurant_id and c.location_id=old.id and c.status='open') or exists(select 1 from core.purchase_receipts r where r.organization_id=old.organization_id and r.restaurant_id=old.restaurant_id and r.location_id=old.id and r.status='draft') or exists(select 1 from core.shopping_commitments c where c.organization_id=old.organization_id and c.restaurant_id=old.restaurant_id and c.location_id=old.id and c.status='confirmed')) then raise exception 'location with stock, draft receipt, open count, or open commitment cannot be archived' using errcode='23514';end if;
 if new.is_default and new.archived then raise exception 'archived location cannot be default' using errcode='23514';end if;
 return new;
end $$;

do $$ declare t text;begin
 foreach t in array array['stock_thresholds','shopping_lists','shopping_list_items','shopping_commitments'] loop
  execute format('alter table core.%I enable row level security',t);execute format('alter table core.%I force row level security',t);
  execute format('revoke all on core.%I from public,anon,authenticated',t);
  execute format('create policy %I on core.%I for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))',t||'_owner_context',t);
 end loop;
end $$;
grant select,insert,update(minimum_quantity,target_quantity,updated_by,updated_at) on core.stock_thresholds to donos_api;
grant select,insert,update(status,archived_by,archived_at) on core.shopping_lists to donos_api;
grant select,insert,update(purchase_quantity,supplier_id,removed,note,updated_at) on core.shopping_list_items to donos_api;
grant select,insert,update(status,received_base_quantity,remaining_base_quantity,cancelled_by,cancelled_at,cancel_reason) on core.shopping_commitments to donos_api;

alter table core.audit_events drop constraint audit_events_action_check;
alter table core.audit_events add constraint audit_events_action_check check(action in('organization.created','restaurant.created','context.selected','inventory.ingredient.created','inventory.ingredient.updated','inventory.supplier.created','inventory.supplier.updated','inventory.conversion.created','inventory.location.created','inventory.location.updated','inventory.receipt.drafted','inventory.receipt.received','inventory.issue.posted','inventory.reversal.posted','inventory.count.opened','inventory.count.item.recorded','inventory.count.item.reviewed','inventory.count.item.validated','inventory.count.closed','inventory.count.cancelled','recipe.created','recipe.version.created','recipe.measurement.recorded','recipe.measurement.validated','pricing.product.created','pricing.product.updated','pricing.product.archived','pricing.variant.created','pricing.variant.updated','pricing.channel.created','pricing.channel.updated','pricing.combo.created','pricing.combo.updated','pricing.simulation.created','shopping.threshold.updated','shopping.list.generated','shopping.item.updated','shopping.commitment.confirmed','shopping.commitment.cancelled'));

revoke all on function core.shopping_threshold_guard(),core.shopping_list_guard(),core.shopping_list_item_guard(),core.shopping_commitment_guard(),core.shopping_commitment_receipt_projection_guard(),core.shopping_catalog_archive_guard() from public,anon,authenticated;
revoke all on function core.inventory_item_guard() from public,anon,authenticated;
commit;
