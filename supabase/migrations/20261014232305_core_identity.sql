-- Clean Cycle 01 foundation. No legacy imports, cleanup or production migration.
create role donos_api login nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 10;

create schema core;
revoke all on schema core from public, anon, authenticated;
grant usage on schema core to donos_api;
alter default privileges in schema core revoke all on tables from public, anon, authenticated;
alter default privileges in schema core revoke execute on functions from public, anon, authenticated;

create function core.actor_id() returns uuid language sql stable security invoker
  set search_path=pg_catalog as $$ select nullif(current_setting('app.user_id',true),'')::uuid $$;
create function core.session_id() returns uuid language sql stable security invoker
  set search_path=pg_catalog as $$ select nullif(current_setting('app.session_id',true),'')::uuid $$;
create function core.organization_id() returns uuid language sql stable security invoker
  set search_path=pg_catalog as $$ select nullif(current_setting('app.organization_id',true),'')::uuid $$;
create function core.restaurant_id() returns uuid language sql stable security invoker
  set search_path=pg_catalog as $$ select nullif(current_setting('app.restaurant_id',true),'')::uuid $$;
revoke all on all functions in schema core from public, anon, authenticated;
grant execute on all functions in schema core to donos_api;

create table core.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120 and name=btrim(name)),
  created_at timestamptz not null default now()
);
create index organizations_owner_idx on core.organizations(owner_user_id,id);
alter table core.organizations enable row level security;
alter table core.organizations force row level security;
create policy organizations_read on core.organizations for select to donos_api
  using (owner_user_id=core.actor_id());
create policy organizations_create on core.organizations for insert to donos_api
  with check (owner_user_id=core.actor_id());
grant select,insert on core.organizations to donos_api;

create table core.restaurants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120 and name=btrim(name)),
  created_at timestamptz not null default now(),
  unique(organization_id,id)
);
alter table core.restaurants enable row level security;
alter table core.restaurants force row level security;
create policy restaurants_read on core.restaurants for select to donos_api using (
  organization_id=core.organization_id()
  and (core.restaurant_id() is null or id=core.restaurant_id())
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
create policy restaurants_create on core.restaurants for insert to donos_api with check (
  organization_id=core.organization_id()
  and (core.restaurant_id() is null or id=core.restaurant_id())
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
grant select,insert on core.restaurants to donos_api;

create table core.session_revocations (
  user_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  revoked_at timestamptz not null default now(),
  primary key(user_id,session_id)
);
alter table core.session_revocations enable row level security;
alter table core.session_revocations force row level security;
create policy revocations_read on core.session_revocations for select to donos_api
  using (user_id=core.actor_id() and session_id=core.session_id());
create policy revocations_create on core.session_revocations for insert to donos_api
  with check(user_id=core.actor_id() and session_id=core.session_id());
grant select,insert on core.session_revocations to donos_api;

create table core.request_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  session_id uuid not null,
  organization_id uuid not null,
  restaurant_id uuid not null,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  check(expires_at=created_at+interval '30 minutes'),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);
create index contexts_session_idx on core.request_contexts(user_id,session_id);
alter table core.request_contexts enable row level security;
alter table core.request_contexts force row level security;
create policy contexts_read on core.request_contexts for select to donos_api using (
  user_id=core.actor_id() and session_id=core.session_id()
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
create policy contexts_create on core.request_contexts for insert to donos_api with check (
  user_id=core.actor_id() and session_id=core.session_id()
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
grant select on core.request_contexts to donos_api;
grant insert(user_id,session_id,organization_id,restaurant_id,token_hash) on core.request_contexts to donos_api;

create table core.idempotency_records (
  scope_kind text not null check(scope_kind in ('actor','organization')),
  scope_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid references core.organizations(id) on delete restrict,
  operation text not null check(char_length(operation) between 1 and 80),
  key uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  response_json jsonb,
  created_at timestamptz not null default now(),
  check ((scope_kind='actor' and scope_id=actor_user_id and organization_id is null)
    or (scope_kind='organization' and scope_id=organization_id)),
  primary key(scope_kind,scope_id,operation,key)
);
alter table core.idempotency_records enable row level security;
alter table core.idempotency_records force row level security;
create policy idempotency_scope on core.idempotency_records for all to donos_api using (
  actor_user_id=core.actor_id() and (
    (scope_kind='actor' and scope_id=core.actor_id()) or
    (scope_kind='organization' and organization_id=core.organization_id()
      and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))
  )
) with check (
  actor_user_id=core.actor_id() and (
    (scope_kind='actor' and scope_id=core.actor_id()) or
    (scope_kind='organization' and organization_id=core.organization_id()
      and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id()))
  )
);
grant select,insert on core.idempotency_records to donos_api;
grant update(response_json) on core.idempotency_records to donos_api;

create table core.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references core.organizations(id) on delete restrict,
  restaurant_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('organization.created','restaurant.created','context.selected')),
  entity_id uuid not null,
  request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check(metadata='{}'::jsonb),
  created_at timestamptz not null default now(),
  foreign key(organization_id,restaurant_id) references core.restaurants(organization_id,id) on delete restrict
);
create index audit_organization_idx on core.audit_events(organization_id,created_at);
alter table core.audit_events enable row level security;
alter table core.audit_events force row level security;
create policy audit_read on core.audit_events for select to donos_api using (
  organization_id=core.organization_id()
  and (restaurant_id is null or core.restaurant_id() is null or restaurant_id=core.restaurant_id())
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
create policy audit_create on core.audit_events for insert to donos_api with check (
  actor_user_id=core.actor_id() and organization_id=core.organization_id()
  and (restaurant_id is null or core.restaurant_id() is null or restaurant_id=core.restaurant_id())
  and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
grant select,insert on core.audit_events to donos_api;

revoke all on all tables in schema core from public,anon,authenticated;
