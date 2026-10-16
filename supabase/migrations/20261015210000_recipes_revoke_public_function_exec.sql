-- Recipe trigger functions are owned by postgres but are not directly callable
-- by browser roles. Keep the core schema's no-public-function-execution rule
-- after adding this migration's functions.
revoke all on all functions in schema core from public, anon, authenticated;
