-- Regression: SQL CHECK accepts UNKNOWN; explicitly reject NULL organization scope.
alter table core.idempotency_records drop constraint idempotency_records_check;
alter table core.idempotency_records add constraint idempotency_scope_shape_check check (
 (scope_kind='actor' and scope_id=actor_user_id and organization_id is null)
 or (scope_kind='organization' and organization_id is not null and scope_id=organization_id)
);

-- Unit audit entries require a unit context. Organization events have restaurant_id NULL.
alter policy audit_read on core.audit_events using (
 organization_id=core.organization_id()
 and (restaurant_id is null or restaurant_id=core.restaurant_id())
 and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
alter policy audit_create on core.audit_events with check (
 actor_user_id=core.actor_id() and organization_id=core.organization_id()
 and (restaurant_id is null or restaurant_id=core.restaurant_id())
 and exists(select 1 from core.organizations o where o.id=organization_id and o.owner_user_id=core.actor_id())
);
