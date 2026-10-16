create or replace function core.recipe_component_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
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
