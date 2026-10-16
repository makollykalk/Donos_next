-- Supabase PG17 creates ADMIN=true but SET=false for the role creator.
-- Permit the migration identity to test AS the restricted runtime, never vice versa.
grant donos_api to postgres with set true;
