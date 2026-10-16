-- Preserve the moving-average basis for negative count adjustments.
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
   if new.after_quantity=0 then
    if row(new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(0::numeric,0::numeric,0::numeric) then raise exception 'invalid empty count valuation' using errcode='23514';end if;
   elsif row(new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(new.before_reference_quantity,new.before_reference_value,new.before_issued_quantity-delta) then raise exception 'invalid negative count average snapshot' using errcode='23514';end if;
  elsif b.quantity=0 then
   if not ci.positive_variance_confirmed or ci.positive_variance_total_value is null or new.value_delta<>ci.positive_variance_total_value then raise exception 'explicit positive count value required' using errcode='23514';end if;
  else
   expected_cost:=core.inventory_cost(delta,b.reference_value,b.reference_quantity);
   if new.value_delta<>expected_cost then raise exception 'invalid positive count valuation' using errcode='23514';end if;
  end if;
  if delta>0 and (new.after_reference_quantity<>new.after_quantity or new.after_reference_value<>new.after_value or new.after_issued_quantity<>0) then raise exception 'invalid positive count average snapshot' using errcode='23514';end if;
 else
  select * into strict o from core.stock_movements where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and ingredient_id=new.ingredient_id and id=new.reversal_of_id;
  select * into strict r from core.stock_reversals where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.reversal_id;
  if o.kind='REVERSAL' or b.last_movement_id<>o.id or o.sequence<>b.sequence or (o.kind='ISSUE' and (r.origin_movement_id is distinct from o.id or r.origin_receipt_id is not null)) or (o.kind='RECEIPT' and not exists(select 1 from core.purchase_receipt_items p where p.organization_id=o.organization_id and p.restaurant_id=o.restaurant_id and p.location_id=o.location_id and p.id=o.receipt_item_id and p.receipt_id=r.origin_receipt_id)) or row(new.after_quantity,new.after_value,new.after_reference_quantity,new.after_reference_value,new.after_issued_quantity) is distinct from row(o.before_quantity,o.before_value,o.before_reference_quantity,o.before_reference_value,o.before_issued_quantity) then raise exception 'invalid compensation' using errcode='23514';end if;
 end if;
 return new;
end $$;
revoke all on function core.inventory_movement_guard() from public,anon,authenticated;
