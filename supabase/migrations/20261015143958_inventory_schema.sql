-- Cycle02 only, private schema; no legacy data or destructive cleanup.
create domain core.inventory_quantity as numeric check(value>=0 and value<1e18 and value=trunc(value,6));
create domain core.inventory_price as numeric check(value>=0 and value<1e18 and value=trunc(value,12));
create domain core.inventory_value as numeric check(value>=0 and value<1e26 and value=trunc(value,12));
create domain core.inventory_quantity_delta as numeric check(abs(value)<1e18 and value=trunc(value,6));
create domain core.inventory_value_delta as numeric check(abs(value)<1e26 and value=trunc(value,12));
revoke all on domain core.inventory_quantity,core.inventory_price,core.inventory_value,core.inventory_quantity_delta,core.inventory_value_delta from public,anon,authenticated;
grant usage on domain core.inventory_quantity,core.inventory_price,core.inventory_value,core.inventory_quantity_delta,core.inventory_value_delta to donos_api;
create table core.ingredients(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,
 name text not null check(length(name) between 1 and 120 and name=btrim(name)),
 base_unit text not null check(base_unit in('kg','L','un')),allow_fractional_count boolean not null default false,
 archived boolean not null default false,created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),
 foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);
create table core.suppliers(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references core.organizations(id) on delete restrict,
 name text not null check(length(name) between 1 and 120 and name=btrim(name)),contact text check(length(contact)<=240),
 archived boolean not null default false,created_at timestamptz not null default now(),unique(organization_id,id)
);
create table core.ingredient_conversions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,ingredient_id uuid not null,
 label text not null check(length(label) between 1 and 120 and label=btrim(label)),version bigint not null check(version>0),
 factor_to_base core.inventory_price not null check(factor_to_base>0),created_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,ingredient_id,id),
 unique(organization_id,restaurant_id,ingredient_id,label,version),
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict
);
create table core.purchase_receipts(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,supplier_id uuid not null,
 supplier_name_snapshot text not null,document_date date,document_reference text check(length(document_reference) between 1 and 120),
 status text not null default 'draft' check(status in('draft','received')),
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 received_by uuid references auth.users(id) on delete restrict,received_at timestamptz,
 check((status='draft' and received_by is null and received_at is null) or(status='received' and received_by is not null and received_at is not null)),
 unique(organization_id,restaurant_id,id),
 foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict,
 foreign key(organization_id,supplier_id) references core.suppliers(organization_id,id) on delete restrict
);
create table core.purchase_receipt_items(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,receipt_id uuid not null,ingredient_id uuid not null,
 ingredient_name_snapshot text not null,original_quantity core.inventory_quantity not null check(original_quantity>0),
 original_unit text not null check(original_unit in('kg','g','L','mL','un','package')),unit_price core.inventory_price not null,
 zero_cost_reason text check(length(zero_cost_reason) between 1 and 240),check(unit_price>0 or zero_cost_reason is not null),
 conversion_id uuid,conversion_label text,conversion_version bigint,factor_to_base core.inventory_price not null check(factor_to_base>0),
 base_quantity core.inventory_quantity not null check(base_quantity>0),line_value core.inventory_value not null,
 base_unit text not null check(base_unit in('kg','L','un')),allow_fractional_count boolean not null,
 check((original_unit='package' and conversion_id is not null and conversion_label is not null and conversion_version is not null) or(original_unit<>'package' and conversion_id is null and conversion_label is null and conversion_version is null)),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,ingredient_id,id),unique(organization_id,restaurant_id,receipt_id,ingredient_id),
 foreign key(organization_id,restaurant_id,receipt_id) references core.purchase_receipts(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,conversion_id) references core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,id) on delete restrict
);
create table core.stock_balances(
 organization_id uuid not null,restaurant_id uuid not null,ingredient_id uuid not null,
 quantity core.inventory_quantity not null default 0,value core.inventory_value not null default 0,
 reference_quantity core.inventory_quantity not null default 0,reference_value core.inventory_value not null default 0,
 issued_quantity core.inventory_quantity not null default 0,sequence bigint not null default 0 check(sequence>=0),last_movement_id uuid,
 primary key(organization_id,restaurant_id,ingredient_id),
 check((sequence=0 and last_movement_id is null) or(sequence>0 and last_movement_id is not null)),
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict
);
create table core.stock_reversals(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,
 origin_movement_id uuid,origin_receipt_id uuid,reason text not null check(length(reason) between 1 and 240),
 actor_user_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 check(num_nonnulls(origin_movement_id,origin_receipt_id)=1),unique(organization_id,restaurant_id,id),
 unique(organization_id,restaurant_id,origin_movement_id),unique(organization_id,restaurant_id,origin_receipt_id),
 foreign key(organization_id,restaurant_id,origin_receipt_id) references core.purchase_receipts(organization_id,restaurant_id,id) on delete restrict
);
create table core.stock_movements(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,ingredient_id uuid not null,
 sequence bigint not null check(sequence>0),kind text not null check(kind in('RECEIPT','ISSUE','REVERSAL')),
 quantity_delta core.inventory_quantity_delta not null check(quantity_delta<>0),value_delta core.inventory_value_delta not null,
 before_quantity core.inventory_quantity not null,
 before_value core.inventory_value not null,
 before_reference_quantity core.inventory_quantity not null,
 before_reference_value core.inventory_value not null,
 before_issued_quantity core.inventory_quantity not null,
 after_quantity core.inventory_quantity not null,
 after_value core.inventory_value not null,
 after_reference_quantity core.inventory_quantity not null,
 after_reference_value core.inventory_value not null,
 after_issued_quantity core.inventory_quantity not null,
 reason text not null check(length(reason) between 1 and 240),actor_user_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),receipt_item_id uuid,reversal_of_id uuid,reversal_id uuid,
 command_key uuid not null,policy_version text not null default 'moving-average-cumulative-v1' check(policy_version='moving-average-cumulative-v1'),
 check((kind='RECEIPT' and receipt_item_id is not null and reversal_of_id is null and reversal_id is null and quantity_delta>0)
 or(kind='ISSUE' and receipt_item_id is null and reversal_of_id is null and reversal_id is null and quantity_delta<0)
 or(kind='REVERSAL' and receipt_item_id is null and reversal_of_id is not null and reversal_id is not null)),
 unique(organization_id,restaurant_id,id),unique(organization_id,restaurant_id,ingredient_id,id),
 unique(organization_id,restaurant_id,ingredient_id,sequence),unique(organization_id,restaurant_id,receipt_item_id),
 unique(organization_id,restaurant_id,reversal_of_id),
 foreign key(organization_id,restaurant_id,ingredient_id) references core.ingredients(organization_id,restaurant_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,receipt_item_id) references core.purchase_receipt_items(organization_id,restaurant_id,ingredient_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,reversal_of_id) references core.stock_movements(organization_id,restaurant_id,ingredient_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,reversal_id) references core.stock_reversals(organization_id,restaurant_id,id) on delete restrict
);
alter table core.stock_balances add foreign key(organization_id,restaurant_id,ingredient_id,last_movement_id) references core.stock_movements(organization_id,restaurant_id,ingredient_id,id) deferrable initially deferred;
alter table core.stock_reversals add foreign key(organization_id,restaurant_id,origin_movement_id) references core.stock_movements(organization_id,restaurant_id,id) on delete restrict;
create table core.purchase_price_history(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,restaurant_id uuid not null,ingredient_id uuid not null,supplier_id uuid not null,
 supplier_name_snapshot text not null,receipt_item_id uuid not null,receipt_movement_id uuid not null,posted_sequence bigint not null check(posted_sequence>0),
 original_quantity core.inventory_quantity not null,original_unit text not null,unit_price core.inventory_price not null,
 base_quantity core.inventory_quantity not null check(base_quantity>0),line_value core.inventory_value not null,
 conversion_id uuid,conversion_label text,conversion_version bigint,factor_to_base core.inventory_price not null,
 base_unit text not null,allow_fractional_count boolean not null,document_date date,posted_at timestamptz not null default now(),
 unique(organization_id,restaurant_id,receipt_item_id),
 foreign key(organization_id,supplier_id) references core.suppliers(organization_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,receipt_item_id) references core.purchase_receipt_items(organization_id,restaurant_id,ingredient_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,receipt_movement_id) references core.stock_movements(organization_id,restaurant_id,ingredient_id,id) on delete restrict,
 foreign key(organization_id,restaurant_id,ingredient_id,conversion_id) references core.ingredient_conversions(organization_id,restaurant_id,ingredient_id,id) on delete restrict
);
alter table core.ingredients enable row level security;
alter table core.ingredients force row level security;
create policy ingredients_scope on core.ingredients for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.ingredients to donos_api;
alter table core.suppliers enable row level security;
alter table core.suppliers force row level security;
create policy suppliers_scope on core.suppliers for all to donos_api using(organization_id=core.organization_id()  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id()  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.suppliers to donos_api;
alter table core.ingredient_conversions enable row level security;
alter table core.ingredient_conversions force row level security;
create policy ingredient_conversions_scope on core.ingredient_conversions for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.ingredient_conversions to donos_api;
alter table core.purchase_receipts enable row level security;
alter table core.purchase_receipts force row level security;
create policy purchase_receipts_scope on core.purchase_receipts for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()) and created_by=core.actor_id() and (received_by is null or received_by=core.actor_id()));
grant select,insert on core.purchase_receipts to donos_api;
alter table core.purchase_receipt_items enable row level security;
alter table core.purchase_receipt_items force row level security;
create policy purchase_receipt_items_scope on core.purchase_receipt_items for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.purchase_receipt_items to donos_api;
alter table core.stock_balances enable row level security;
alter table core.stock_balances force row level security;
create policy stock_balances_scope on core.stock_balances for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.stock_balances to donos_api;
alter table core.stock_movements enable row level security;
alter table core.stock_movements force row level security;
create policy stock_movements_scope on core.stock_movements for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()) and actor_user_id=core.actor_id());
grant select,insert on core.stock_movements to donos_api;
alter table core.purchase_price_history enable row level security;
alter table core.purchase_price_history force row level security;
create policy purchase_price_history_scope on core.purchase_price_history for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()));
grant select,insert on core.purchase_price_history to donos_api;
alter table core.stock_reversals enable row level security;
alter table core.stock_reversals force row level security;
create policy stock_reversals_scope on core.stock_reversals for all to donos_api using(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())) with check(organization_id=core.organization_id() and restaurant_id=core.restaurant_id() and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()) and actor_user_id=core.actor_id());
grant select,insert on core.stock_reversals to donos_api;
grant update(name,archived) on core.ingredients to donos_api;
grant update(name,contact,archived) on core.suppliers to donos_api;
grant update(status,received_by,received_at) on core.purchase_receipts to donos_api;
grant update(quantity,value,reference_quantity,reference_value,issued_quantity,sequence,last_movement_id) on core.stock_balances to donos_api;
create index ingredients_catalog_idx on core.ingredients(organization_id,restaurant_id,archived,id);
create index suppliers_catalog_idx on core.suppliers(organization_id,archived,id);
create index movements_ledger_idx on core.stock_movements(organization_id,restaurant_id,ingredient_id,sequence desc);
create index price_history_supplier_idx on core.purchase_price_history(organization_id,restaurant_id,ingredient_id,supplier_id,posted_sequence desc);
create index receipts_catalog_idx on core.purchase_receipts(organization_id,restaurant_id,id);
alter table core.audit_events drop constraint audit_events_action_check;
alter table core.audit_events add constraint audit_events_action_check check(action in('organization.created','restaurant.created','context.selected','inventory.ingredient.created','inventory.ingredient.updated','inventory.supplier.created','inventory.supplier.updated','inventory.conversion.created','inventory.receipt.drafted','inventory.receipt.received','inventory.issue.posted','inventory.reversal.posted'));
alter table core.audit_events add constraint inventory_audit_unit_required check(action not like 'inventory.%' or restaurant_id is not null);
revoke all on all tables in schema core from public,anon,authenticated;
