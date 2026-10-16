-- Cycle 05: preserve the exact commercial inputs used by each single-variant simulation.
-- Existing snapshots remain intact; this additive column is populated by new API writes.
begin;

alter table core.pricing_combos
  add column list_price numeric(38,12)
  check(list_price is null or (list_price>0 and list_price<100000000000000000000000000));
grant update(list_price) on core.pricing_combos to donos_api;

alter table core.pricing_simulations
  add column variant_snapshot jsonb
  check(variant_snapshot is null or jsonb_typeof(variant_snapshot)='object');

alter table core.pricing_simulations
  add constraint pricing_simulations_variant_snapshot_required_check
  check((variant_id is not null and variant_snapshot is not null)
     or (combo_id is not null and variant_snapshot is null)) not valid;

commit;
