-- Forward-only correction: multiply scaled integer to preserve all decimal places.
create or replace function core.inventory_cost(x numeric,v numeric,q numeric) returns numeric language sql immutable strict security invoker set search_path=pg_catalog as $$
 select core.inventory_half_even(x*1000000*v*1000000000000,q*1000000)*0.000000000001
$$;
create or replace function core.inventory_item_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
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
  or new.line_value<>core.inventory_half_even(new.original_quantity*1000000*new.unit_price*1000000000000,1000000)*0.000000000001
  or(new.unit_price>0 and new.line_value=0)
 then raise exception 'invalid purchase quantities or valuation' using errcode='23514';end if;
 return new;
end $$;
