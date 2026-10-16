-- Cycle 06 hotfix: keep both immutable-snapshot row expressions column-aligned.
-- Additive function replacement only; does not rewrite data or change grants.
begin;
create or replace function core.shopping_list_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare i core.ingredients%rowtype; l core.shopping_lists%rowtype; c core.ingredient_conversions%rowtype; f numeric;
begin
 if tg_op='INSERT' then
  select * into strict l from core.shopping_lists where organization_id=new.organization_id and restaurant_id=new.restaurant_id and location_id=new.location_id and id=new.list_id for update;
  select * into strict i from core.ingredients where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.ingredient_id;
 else
  if row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.list_id,new.ingredient_id,new.ingredient_name_snapshot,new.base_unit,new.balance_quantity,new.minimum_quantity,new.target_quantity,new.committed_pending_quantity,new.needed_base_quantity,new.suggested_purchase_quantity,new.suggested_base_quantity,new.original_unit,new.conversion_id,new.conversion_label,new.conversion_version,new.factor_to_base,new.allow_fractional_count,new.suggested_supplier_id,new.suggested_supplier_name,new.supplier_reference_line_value,new.supplier_reference_base_quantity,new.supplier_reference_posted_at,new.supplier_reference_document_date,new.created_at)
    is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.list_id,old.ingredient_id,old.ingredient_name_snapshot,old.base_unit,old.balance_quantity,old.minimum_quantity,old.target_quantity,old.committed_pending_quantity,old.needed_base_quantity,old.suggested_purchase_quantity,old.suggested_base_quantity,old.original_unit,old.conversion_id,old.conversion_label,old.conversion_version,old.factor_to_base,old.allow_fractional_count,old.suggested_supplier_id,old.suggested_supplier_name,old.supplier_reference_line_value,old.supplier_reference_base_quantity,old.supplier_reference_posted_at,old.supplier_reference_document_date,old.created_at)
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
commit;
