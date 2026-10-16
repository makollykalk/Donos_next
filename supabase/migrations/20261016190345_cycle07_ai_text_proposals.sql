-- Cycle 07A: private, tenant-scoped text proposals and bounded structured retention.
-- pg_cron is a Supabase-provided extension; pin the DEV-verified available version.
do $$ begin
  if current_user<>'postgres' or not exists(
    select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)
  ) then
    raise exception 'Cycle 07 retention migration requires the postgres BYPASSRLS scheduler owner';
  end if;
end $$;
create extension if not exists pg_cron with schema pg_catalog version '1.6.4';

-- The composite reservation reference prevents a proposal from pointing at another
-- restaurant's reservation even if its UUID is known.
create unique index usage_reservations_proposal_link_uq
  on core.usage_reservations(organization_id,restaurant_id,meter_key,operation_key,request_hash,id);

create table core.ai_text_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  restaurant_id uuid not null,
  location_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation_key uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  usage_meter_key text not null default 'ai_text_whatsapp' check(usage_meter_key='ai_text_whatsapp'),
  usage_reservation_id uuid not null,
  status text not null check(status in ('interpreting','needs_review','ready','confirmed','discarded','reconciliation_required')),
  version integer not null default 1 check(version>0),
  candidate_json jsonb check(candidate_json is null or (jsonb_typeof(candidate_json)='object' and octet_length(candidate_json::text)<=16384)),
  review_json jsonb not null default '{}'::jsonb check(jsonb_typeof(review_json)='object' and octet_length(review_json::text)<=8192),
  receipt_result_id uuid,
  movement_result_id uuid,
  result_id uuid generated always as (coalesce(receipt_result_id,movement_result_id)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  terminal_at timestamptz,
  expires_at timestamptz not null default (now()+interval '30 days'),
  unique(organization_id,restaurant_id,id),
  unique(organization_id,restaurant_id,operation_key),
  unique(organization_id,restaurant_id,usage_reservation_id),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,location_id) references core.stock_locations(organization_id,restaurant_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,usage_meter_key,operation_key,request_hash,usage_reservation_id)
    references core.usage_reservations(organization_id,restaurant_id,meter_key,operation_key,request_hash,id) on delete restrict,
  foreign key(organization_id,restaurant_id,location_id,receipt_result_id)
    references core.purchase_receipts(organization_id,restaurant_id,location_id,id) on delete restrict,
  foreign key(organization_id,restaurant_id,location_id,movement_result_id)
    references core.stock_movements(organization_id,restaurant_id,location_id,id) on delete restrict,
  check(updated_at>=created_at),
  check(
    (status in ('interpreting','needs_review','ready','reconciliation_required') and terminal_at is null and expires_at=created_at+interval '30 days')
    or (status in ('confirmed','discarded') and terminal_at is not null and terminal_at>=created_at and expires_at=terminal_at+interval '30 days')
  ),
  check(status='interpreting' or candidate_json is not null),
  check((status='confirmed' and num_nonnulls(receipt_result_id,movement_result_id)=1)
    or (status<>'confirmed' and num_nonnulls(receipt_result_id,movement_result_id)=0))
);

create index ai_text_proposals_scope_expires_idx
  on core.ai_text_proposals(organization_id,restaurant_id,expires_at)
  where status<>'reconciliation_required';
create index ai_text_proposals_actor_idx on core.ai_text_proposals(actor_user_id);
create index ai_text_proposals_location_idx
  on core.ai_text_proposals(organization_id,restaurant_id,location_id);
create index ai_text_proposals_receipt_result_idx
  on core.ai_text_proposals(organization_id,restaurant_id,location_id,receipt_result_id)
  where receipt_result_id is not null;
create index ai_text_proposals_movement_result_idx
  on core.ai_text_proposals(organization_id,restaurant_id,location_id,movement_result_id)
  where movement_result_id is not null;

alter table core.ai_text_proposals enable row level security;
alter table core.ai_text_proposals force row level security;
revoke all on core.ai_text_proposals from public,anon,authenticated;
create policy ai_text_proposals_owner_context on core.ai_text_proposals for all to donos_api
  using (
    organization_id=core.organization_id()
    and restaurant_id=core.restaurant_id()
    and actor_user_id=core.actor_id()
    and (expires_at>statement_timestamp() or status='reconciliation_required')
    and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
  )
  with check (
    organization_id=core.organization_id()
    and restaurant_id=core.restaurant_id()
    and actor_user_id=core.actor_id()
    and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
  );
grant select on core.ai_text_proposals to donos_api;
grant insert(organization_id,restaurant_id,location_id,actor_user_id,operation_key,request_hash,usage_reservation_id,status,candidate_json,review_json)
  on core.ai_text_proposals to donos_api;

create function core.ai_text_proposal_update_guard() returns trigger
  language plpgsql security invoker set search_path=pg_catalog,core as $$
declare stamp timestamptz:=statement_timestamp();
begin
  if old.status in ('confirmed','discarded') then
    raise exception 'terminal proposal is immutable' using errcode='23514';
  end if;
  if not (
    (old.status='interpreting' and new.status in ('interpreting','needs_review','ready','discarded','reconciliation_required'))
    or (old.status='needs_review' and new.status in ('needs_review','ready','discarded','reconciliation_required'))
    or (old.status='ready' and new.status in ('needs_review','ready','confirmed','discarded','reconciliation_required'))
    or (old.status='reconciliation_required' and new.status in ('confirmed','discarded'))
  ) then
    raise exception 'invalid proposal state transition' using errcode='23514';
  end if;
  new.version:=old.version+1;
  new.updated_at:=stamp;
  if new.status in ('confirmed','discarded') then
    new.terminal_at:=stamp;
    new.expires_at:=stamp+interval '30 days';
  else
    new.terminal_at:=null;
    new.expires_at:=new.created_at+interval '30 days';
  end if;
  return new;
end
$$;
revoke all on function core.ai_text_proposal_update_guard() from public,anon,authenticated,donos_api;
create trigger ai_text_proposal_update_guard before update on core.ai_text_proposals
  for each row execute function core.ai_text_proposal_update_guard();
grant update(status,candidate_json,review_json,receipt_result_id,movement_result_id,usage_reservation_id)
  on core.ai_text_proposals to donos_api;

-- SECURITY INVOKER: the scheduled postgres owner can sweep expired records;
-- the runtime role has neither function EXECUTE nor DELETE/TRUNCATE privileges.
create function core.purge_expired_ai_text_proposals() returns bigint
  language sql security invoker set search_path=pg_catalog,core as $$
    with removed as (
      delete from core.ai_text_proposals
      where expires_at<=statement_timestamp() and status<>'reconciliation_required'
      returning 1
    ) select count(*)::bigint from removed
  $$;
revoke all on function core.purge_expired_ai_text_proposals() from public,anon,authenticated,donos_api;
grant execute on function core.purge_expired_ai_text_proposals() to postgres;

grant usage on schema cron to postgres;
select cron.schedule(
  'cycle07-purge-expired-ai-text-proposals',
  '17 3 * * *',
  'select core.purge_expired_ai_text_proposals()'
);
do $$ begin
  if not exists(select 1 from cron.job where jobname='cycle07-purge-expired-ai-text-proposals' and username='postgres' and active) then
    raise exception 'Cycle 07 retention job was not registered under postgres';
  end if;
end $$;
