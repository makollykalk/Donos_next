export type ApiConfig = Readonly<{
  environment: 'development' | 'test';
  host: '127.0.0.1';
  port: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  databaseUrl: string;
  databaseTls: boolean;
  databaseCaFile?: string;
  corsOrigins: readonly string[];
}>;

function invalid(field: string): never {
  throw new Error(`Configuração inválida: ${field}`);
}

function requireValue(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value || value.trim() !== value) return invalid(name);
  return value;
}

function localUrl(value: string, field: string, database = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { return invalid(field); }
  const protocols = database ? ['postgres:', 'postgresql:'] : ['http:', 'https:'];
  if (!protocols.includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.search || url.hash) return invalid(field);
  if (database) {
    if (url.username !== 'donos_api' || !url.password || url.pathname !== '/postgres') return invalid(field);
  } else if (url.username || url.password || url.pathname !== '/') return invalid(field);
  return url;
}

function publishableKey(value: string): string {
  if (value.startsWith('sb_secret_')) return invalid('SUPABASE_PUBLISHABLE_KEY');
  if (value.includes('.')) {
    const segments = value.split('.');
    if (segments.length !== 3 || !segments[1]) return invalid('SUPABASE_PUBLISHABLE_KEY');
    let payload: unknown;
    try { payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')); }
    catch { return invalid('SUPABASE_PUBLISHABLE_KEY'); }
    if (typeof payload !== 'object' || !payload || !('role' in payload) || payload.role !== 'anon') {
      return invalid('SUPABASE_PUBLISHABLE_KEY');
    }
  }
  return value;
}

const approvedDevRef = 'kfthwjrvgslnsjigqnyc';
function cloudUrls(env: Record<string, string | undefined>, authUrl: string, databaseUrl: string): void {
  if (env.SUPABASE_PROJECT_REF !== approvedDevRef) return invalid('SUPABASE_PROJECT_REF');
  if (authUrl !== `https://${approvedDevRef}.supabase.co`) return invalid('SUPABASE_URL');
  let db: URL;
  try { db = new URL(databaseUrl); } catch { return invalid('DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(db.protocol)
    || !((db.hostname === `db.${approvedDevRef}.supabase.co` && db.username === 'donos_api')
      || (db.hostname === 'aws-0-us-east-1.pooler.supabase.com' && db.username === `donos_api.${approvedDevRef}`))
    || !db.password || db.pathname !== '/postgres'
    || (db.port !== '' && db.port !== '5432') || db.hash
    || db.search !== '?sslmode=verify-full') return invalid('DATABASE_URL');
}

export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const environment = env.NODE_ENV ?? 'development';
  if (environment !== 'development' && environment !== 'test') return invalid('NODE_ENV');
  const rawPort = env.PORT ?? '3001';
  if (!/^[1-9][0-9]{0,4}(?![\s\S])/u.test(rawPort)) return invalid('PORT');
  const port = Number(rawPort); // TCP port, never money or a domain quantity.
  if (port > 65535) return invalid('PORT');
  const supabaseUrl = requireValue(env, 'SUPABASE_URL');
  const databaseUrl = requireValue(env, 'DATABASE_URL');
  const mode = env.SUPABASE_MODE ?? 'local';
  if (mode === 'cloud-dev') {
    cloudUrls(env, supabaseUrl, databaseUrl);
    requireValue(env,'DATABASE_CA_FILE');
  }
  else if (mode === 'local') {
    localUrl(supabaseUrl, 'SUPABASE_URL');
    localUrl(databaseUrl, 'DATABASE_URL', true);
  } else return invalid('SUPABASE_MODE');
  const corsOrigins = requireValue(env, 'CORS_ORIGINS').split(',');
  for (const origin of corsOrigins) {
    const parsed = localUrl(origin, 'CORS_ORIGINS');
    if (origin !== parsed.origin) return invalid('CORS_ORIGINS');
  }
  return Object.freeze({
    environment, host: '127.0.0.1', port, supabaseUrl, databaseUrl, databaseTls: mode === 'cloud-dev',
    ...(mode === 'cloud-dev' ? {databaseCaFile:requireValue(env,'DATABASE_CA_FILE')} : {}),
    supabasePublishableKey: publishableKey(requireValue(env, 'SUPABASE_PUBLISHABLE_KEY')),
    corsOrigins: Object.freeze(corsOrigins),
  });
}
