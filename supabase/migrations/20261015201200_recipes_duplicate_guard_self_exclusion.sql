create or replace function core.recipe_component_duplicate_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if exists(select 1 from core.recipe_components x where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_version_id=new.recipe_version_id and x.id<>new.id and x.kind=new.kind and x.ingredient_id is not distinct from new.ingredient_id and x.child_version_id is not distinct from new.child_version_id)
 and (new.duplicate_use_reason is null or exists(select 1 from core.recipe_components x where x.organization_id=new.organization_id and x.restaurant_id=new.restaurant_id and x.recipe_version_id=new.recipe_version_id and x.id<>new.id and x.kind=new.kind and x.ingredient_id is not distinct from new.ingredient_id and x.child_version_id is not distinct from new.child_version_id and x.duplicate_use_reason is null)) then
   raise exception 'duplicate component requires reason on every occurrence' using errcode='23514';
 end if;
 return null;
end $$;
