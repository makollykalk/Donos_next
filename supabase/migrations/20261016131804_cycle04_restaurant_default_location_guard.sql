-- Repair synthetic units already created without inventory APIs and enforce future bootstrap integrity.
insert into core.stock_locations(organization_id,restaurant_id,name,is_default)
select r.organization_id,r.id,'Principal',true from core.restaurants r
where not exists(select 1 from core.stock_locations l where l.organization_id=r.organization_id and l.restaurant_id=r.id and l.is_default and not l.archived);

create function core.restaurant_default_stock_location_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if (select count(*) from core.stock_locations where organization_id=new.organization_id and restaurant_id=new.id and is_default and not archived)<>1 then
  raise exception 'restaurant requires exactly one active default stock location' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger restaurant_default_stock_location_guard after insert on core.restaurants deferrable initially deferred for each row execute function core.restaurant_default_stock_location_guard();
revoke all on function core.restaurant_default_stock_location_guard() from public,anon,authenticated;
