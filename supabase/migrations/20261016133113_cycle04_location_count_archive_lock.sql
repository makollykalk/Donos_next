-- Serialize count creation against location archival, including direct database writes.
begin;
create or replace function core.inventory_count_session_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then
  perform id from core.stock_locations where organization_id=new.organization_id and restaurant_id=new.restaurant_id and id=new.location_id and not archived for share;
  if not found then raise exception 'count location unavailable' using errcode='23514';end if;
  if new.status<>'open' or new.opened_by<>core.actor_id() then raise exception 'invalid count opening' using errcode='23514'; end if;
 elsif row(new.id,new.organization_id,new.restaurant_id,new.location_id,new.blind,new.cut_at,new.opened_by,new.opened_at) is distinct from row(old.id,old.organization_id,old.restaurant_id,old.location_id,old.blind,old.cut_at,old.opened_by,old.opened_at) then
  raise exception 'count identity is immutable' using errcode='23514';
 elsif old.status<>'open' or (new.status='closed' and (new.closed_by<>core.actor_id() or new.closed_at is null or new.cancelled_at is not null)) or (new.status='cancelled' and (new.cancelled_by<>core.actor_id() or new.cancelled_at is null or length(btrim(coalesce(new.cancel_reason,'')))=0 or new.closed_at is not null)) or new.status='open' then
  raise exception 'invalid count transition' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function core.inventory_count_session_guard() from public,anon,authenticated;
commit;
