-- Financial integrity functions run with runtime privileges and FORCE RLS.
create function core.inventory_half_even(n numeric,d numeric) returns numeric language plpgsql immutable strict security invoker set search_path=pg_catalog as $$
declare a numeric; b numeric; c numeric; r numeric;
begin
 if d<=0 or d<>trunc(d) or n<>trunc(n) or abs(n)='Infinity'::numeric or n='NaN'::numeric then raise exception 'invalid integer ratio' using errcode='23514'; end if;
 a:=abs(n); b:=d; c:=div(a,b); r:=mod(a,b);
 if r*2>b or(r*2=b and mod(c,2)=1) then c:=c+1;end if;
 return sign(n)*c;
end $$;
create function core.inventory_cost(x numeric,v numeric,q numeric) returns numeric language sql immutable strict security invoker set search_path=pg_catalog as $$
 select core.inventory_half_even(x*1000000*v*1000000000000,q*1000000)/1000000000000
$$;
create function core.inventory_valid_state(q numeric,v numeric,rq numeric,rv numeric,x numeric) returns boolean language sql immutable strict security invoker set search_path=pg_catalog as $$
 select case when q=0 then v=0 and rq=0 and rv=0 and x=0
 else rq>0 and x>=0 and q=rq-x and v=rv-core.inventory_cost(x,rv,rq) end
$$;
alter table core.stock_balances add constraint inventory_balance_state check(core.inventory_valid_state(quantity,value,reference_quantity,reference_value,issued_quantity));
alter table core.stock_movements add constraint inventory_before_state check(core.inventory_valid_state(before_quantity,before_value,before_reference_quantity,before_reference_value,before_issued_quantity));
alter table core.stock_movements add constraint inventory_after_state check(core.inventory_valid_state(after_quantity,after_value,after_reference_quantity,after_reference_value,after_issued_quantity));
create function core.inventory_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin raise exception 'immutable inventory record' using errcode='23514';end $$;
create trigger ingredient_conversions_immutable before update or delete on core.ingredient_conversions for each row execute function core.inventory_immutable();
create trigger purchase_receipt_items_immutable before update or delete on core.purchase_receipt_items for each row execute function core.inventory_immutable();
create trigger stock_movements_immutable before update or delete on core.stock_movements for each row execute function core.inventory_immutable();
create trigger purchase_price_history_immutable before update or delete on core.purchase_price_history for each row execute function core.inventory_immutable();
create trigger stock_reversals_immutable before update or delete on core.stock_reversals for each row execute function core.inventory_immutable();

create function core.inventory_conversion_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare current_version bigint;
begin
 perform 1 from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id and not archived for update;
 if not found then raise exception 'ingredient unavailable' using errcode='23514';end if;
 select coalesce(max(version),0) into current_version from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and label=new.label;
 if new.version<>current_version+1 then raise exception 'conversion version conflict' using errcode='23514';end if;
 return new;
end $$;
create trigger conversion_guard before insert on core.ingredient_conversions for each row execute function core.inventory_conversion_guard();

create function core.inventory_receipt_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then
  if new.status<>'draft' then raise exception 'receipt must start draft' using errcode='23514';end if;
 else
  if old.status<>'draft' or new.status<>'received' or new.received_by<>core.actor_id() then raise exception 'invalid receipt transition' using errcode='23514';end if;
  if not exists(select 1 from core.purchase_receipt_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.receipt_id=new.id)
   or exists(select 1 from core.purchase_receipt_items i where i.organization_id=new.organization_id and i.restaurant_id=new.restaurant_id and i.receipt_id=new.id
     and not exists(select 1 from core.stock_movements m where m.organization_id=i.organization_id and m.restaurant_id=i.restaurant_id and m.receipt_item_id=i.id and m.kind='RECEIPT'))
   then raise exception 'receipt requires all posted items' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger receipt_guard before insert or update on core.purchase_receipts for each row execute function core.inventory_receipt_guard();
create trigger receipt_no_delete before delete on core.purchase_receipts for each row execute function core.inventory_immutable();

create function core.inventory_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.ingredients%rowtype; c core.ingredient_conversions%rowtype; f numeric;
begin
 perform 1 from core.purchase_receipts where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.receipt_id and status='draft' for update;
 if not found then raise exception 'draft required' using errcode='23514';end if;
 if (select count(*) from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and receipt_id=new.receipt_id)>=50 then raise exception 'too many lines' using errcode='23514';end if;
 select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
 if i.archived or new.base_unit<>i.base_unit or new.allow_fractional_count<>i.allow_fractional_count then raise exception 'ingredient mismatch' using errcode='23514';end if;
 if new.original_unit='package' then
  select * into strict c from core.ingredient_conversions where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.conversion_id;
  if c.version<>new.conversion_version or c.label<>new.conversion_label or exists(select 1 from core.ingredient_conversions v where v.organization_id=c.organization_id and v.restaurant_id=c.restaurant_id and v.ingredient_id=c.ingredient_id and v.label=c.label and v.version>c.version) then raise exception 'conversion snapshot mismatch' using errcode='23514';end if;
  f:=c.factor_to_base;
 else
  f:=case when new.original_unit=i.base_unit then 1 when new.original_unit='g' and i.base_unit='kg' then 0.001 when new.original_unit='mL' and i.base_unit='L' then 0.001 else 0 end;
 end if;
 if f=0 or f<>new.factor_to_base or new.base_quantity<>new.original_quantity*f
  or (i.base_unit='un' and not i.allow_fractional_count and new.base_quantity<>trunc(new.base_quantity))
  or new.line_value<>core.inventory_half_even(new.original_quantity*1000000*new.unit_price*1000000000000,1000000)/1000000000000
  or(new.unit_price>0 and new.line_value=0)
 then raise exception 'invalid purchase quantities or valuation' using errcode='23514';end if;
 return new;
end $$;
create trigger item_guard before insert on core.purchase_receipt_items for each row execute function core.inventory_item_guard();

create function core.inventory_movement_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare b core.stock_balances%rowtype; i core.purchase_receipt_items%rowtype; o core.stock_movements%rowtype; r core.stock_reversals%rowtype; expected_cost numeric;
begin
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id for update;
 if new.actor_user_id<>core.actor_id() or new.sequence<>b.sequence+1 or
 row(new.before_quantity,new.before_value,new.before_reference_quantity,new.before_reference_value,new.before_issued_quantity)
 is distinct from row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity) or
 new.quantity_delta<>new.after_quantity-new.before_quantity or new.value_delta<>new.after_value-new.before_value
 then raise exception 'invalid ledger chain' using errcode='23514';end if;
 if new.kind='RECEIPT' then
  select * into strict i from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.receipt_item_id;
  perform 1 from core.purchase_receipts h join core.suppliers s on s.organization_id=h.organization_id and s.id=h.supplier_id where h.organization_id=new.organization_id and h.restaurant_id=new.restaurant_id and h.id=i.receipt_id and h.status='draft' and not s.archived;
  if not found then raise exception 'receipt unavailable' using errcode='23514';end if;
  perform 1 from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id and not archived;
  if not found then raise exception 'ingredient unavailable' using errcode='23514';end if;
  if new.quantity_delta<>i.base_quantity or new.value_delta<>i.line_value or new.after_reference_quantity<>new.after_quantity or new.after_reference_value<>new.after_value or new.after_issued_quantity<>0 then raise exception 'invalid receipt valuation' using errcode='23514';end if;
 elsif new.kind='ISSUE' then
  perform 1 from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id and not archived and (base_unit<>'un' or allow_fractional_count or new.quantity_delta=trunc(new.quantity_delta));
  if not found then raise exception 'ingredient unavailable' using errcode='23514';end if;
  expected_cost:=case when new.after_quantity=0 then new.before_value else core.inventory_cost(new.before_issued_quantity-new.quantity_delta,new.before_reference_value,new.before_reference_quantity)-core.inventory_cost(new.before_issued_quantity,new.before_reference_value,new.before_reference_quantity) end;
  if new.value_delta<>-expected_cost or(new.after_quantity>0 and row(new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(new.before_reference_quantity,new.before_reference_value,new.before_issued_quantity-new.quantity_delta)) then raise exception 'invalid issue valuation' using errcode='23514';end if;
 else
  select * into strict o from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id and id=new.reversal_of_id;
  select * into strict r from core.stock_reversals where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.reversal_id;
  if o.kind='REVERSAL' or b.last_movement_id<>o.id or o.sequence<>b.sequence or
   (o.kind='ISSUE' and (r.origin_movement_id is distinct from o.id or r.origin_receipt_id is not null)) or
   (o.kind='RECEIPT' and not exists(select 1 from core.purchase_receipt_items p where p.organization_id=o.organization_id and p.restaurant_id=o.restaurant_id and p.id=o.receipt_item_id and p.receipt_id=r.origin_receipt_id)) or
   row(new.after_quantity,new.after_value,new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(o.before_quantity,o.before_value,o.before_reference_quantity,o.before_reference_value,o.before_issued_quantity)
   then raise exception 'invalid compensation' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger movement_guard before insert on core.stock_movements for each row execute function core.inventory_movement_guard();

create function core.inventory_projection_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare b core.stock_balances%rowtype; m core.stock_movements%rowtype;
begin
 select * into strict b from core.stock_balances where organization_id=new.organization_id and restaurant_id=new.restaurant_id and ingredient_id=new.ingredient_id;
 select * into m from core.stock_movements where organization_id=b.organization_id and restaurant_id=b.restaurant_id and ingredient_id=b.ingredient_id order by sequence desc limit 1;
 if not found then
  if row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity,b.sequence,b.last_movement_id) is distinct from row(0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::bigint,null::uuid) then raise exception 'nonzero without ledger' using errcode='23514';end if;
 elsif row(b.quantity,b.value,b.reference_quantity,b.reference_value,b.issued_quantity,b.sequence,b.last_movement_id) is distinct from row(m.after_quantity,m.after_value,m.after_reference_quantity,m.after_reference_value,m.after_issued_quantity,m.sequence,m.id) then raise exception 'projection does not match ledger' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger balance_projection after insert or update on core.stock_balances deferrable initially deferred for each row execute function core.inventory_projection_guard();
create constraint trigger movement_projection after insert on core.stock_movements deferrable initially deferred for each row execute function core.inventory_projection_guard();

create function core.inventory_receipt_final_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare rid uuid; h core.purchase_receipts%rowtype;
begin
 if tg_table_name='purchase_receipts' then rid:=new.id;
 elsif tg_table_name='purchase_receipt_items' then rid:=new.receipt_id;
 else select receipt_id into rid from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.receipt_item_id;end if;
 if rid is null then return null;end if;
 select * into strict h from core.purchase_receipts where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=rid;
 if not exists(select 1 from core.purchase_receipt_items i where i.organization_id=h.organization_id and i.restaurant_id=h.restaurant_id and i.receipt_id=h.id) then raise exception 'receipt needs items' using errcode='23514';end if;
 if h.status='draft' and exists(select 1 from core.stock_movements m join core.purchase_receipt_items i on i.organization_id=m.organization_id and i.restaurant_id=m.restaurant_id and i.id=m.receipt_item_id where i.organization_id=h.organization_id and i.restaurant_id=h.restaurant_id and i.receipt_id=h.id) then raise exception 'draft cannot have movements' using errcode='23514';end if;
 if h.status='received' and exists(select 1 from core.purchase_receipt_items i where i.organization_id=h.organization_id and i.restaurant_id=h.restaurant_id and i.receipt_id=h.id and not exists(select 1 from core.purchase_price_history p where p.organization_id=i.organization_id and p.restaurant_id=i.restaurant_id and p.receipt_item_id=i.id)) then raise exception 'received requires price history' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger purchase_receipts_final after insert or update on core.purchase_receipts deferrable initially deferred for each row execute function core.inventory_receipt_final_guard();
create constraint trigger purchase_receipt_items_final after insert or update on core.purchase_receipt_items deferrable initially deferred for each row execute function core.inventory_receipt_final_guard();
create constraint trigger stock_movements_final after insert or update on core.stock_movements deferrable initially deferred for each row execute function core.inventory_receipt_final_guard();

create function core.inventory_price_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.purchase_receipt_items%rowtype; m core.stock_movements%rowtype; h core.purchase_receipts%rowtype;
begin
 select * into strict i from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.receipt_item_id;
 select * into strict m from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.receipt_movement_id;
 select * into strict h from core.purchase_receipts where organization_id=i.organization_id and restaurant_id=i.restaurant_id and id=i.receipt_id;
 if m.kind<>'RECEIPT' or m.receipt_item_id<>i.id or m.sequence<>new.posted_sequence or new.supplier_id<>h.supplier_id or new.supplier_name_snapshot<>h.supplier_name_snapshot or new.document_date is distinct from h.document_date or
 row(new.ingredient_id,new.original_quantity,new.original_unit,new.unit_price,new.base_quantity,new.line_value,new.conversion_id,new.conversion_label,new.conversion_version,new.factor_to_base,new.base_unit,new.allow_fractional_count)
 is distinct from row(i.ingredient_id,i.original_quantity,i.original_unit,i.unit_price,i.base_quantity,i.line_value,i.conversion_id,i.conversion_label,i.conversion_version,i.factor_to_base,i.base_unit,i.allow_fractional_count)
 then raise exception 'price history snapshot mismatch' using errcode='23514';end if;
 return new;
end $$;
create trigger price_guard before insert on core.purchase_price_history for each row execute function core.inventory_price_guard();
create function core.inventory_reversal_final_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare expected bigint; actual bigint;
begin
 if new.actor_user_id<>core.actor_id() then raise exception 'actor mismatch' using errcode='23514';end if;
 if new.origin_movement_id is not null then expected:=1;
 else select count(*) into expected from core.purchase_receipt_items where organization_id=new.organization_id and restaurant_id=new.restaurant_id and receipt_id=new.origin_receipt_id;end if;
 select count(*) into actual from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and reversal_id=new.id;
 if expected=0 or actual<>expected then raise exception 'incomplete reversal' using errcode='23514';end if;
 return null;
end $$;
create constraint trigger reversal_final after insert on core.stock_reversals deferrable initially deferred for each row execute function core.inventory_reversal_final_guard();
revoke all on all functions in schema core from public,anon,authenticated;
grant execute on all functions in schema core to donos_api;
