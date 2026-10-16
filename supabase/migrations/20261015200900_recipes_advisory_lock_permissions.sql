-- All recipe graph writes serialize through the organization/unit advisory lock.
-- Remove redundant SELECT FOR UPDATE reads on immutable version rows, which would
-- require UPDATE privileges on a table intentionally immutable to donos_api.
do $$
declare function_oid oid; definition text;
begin
 for function_oid in
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='core' and p.proname in ('recipe_component_guard','recipe_transformation_guard','recipe_measurement_guard','recipe_transformation_measurement_guard','recipe_validation_guard')
 loop
  definition:=pg_get_functiondef(function_oid);
  definition:=regexp_replace(definition,E'\\n\\s*perform 1 from core\\.recipe_versions[^;]*for update;\\n',E'\n','g');
  execute definition;
 end loop;
end $$;
