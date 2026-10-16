import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { loadConfig } from '../../apps/api/src/config.js';

export const CYCLE07_APPROVED_DEV_REF = 'kfthwjrvgslnsjigqnyc';
const approvedPooler = 'aws-0-us-east-1.pooler.supabase.com';

export type Cycle07TargetInput = Readonly<{
  requestedProjectRef?: string | undefined;
  projectRef: string;
  supabaseUrl: string;
  databaseUrl: string;
  configDirectory: string;
  workspaceRoot: string;
}>;

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

export function assertCycle07Target(input: Cycle07TargetInput): void {
  if (input.requestedProjectRef !== CYCLE07_APPROVED_DEV_REF) {
    throw new Error('Cycle 07 DEV access requires explicit opt-in for the approved project');
  }
  if (input.projectRef !== CYCLE07_APPROVED_DEV_REF
    || input.supabaseUrl !== `https://${CYCLE07_APPROVED_DEV_REF}.supabase.co`) {
    throw new Error('Cycle 07 project does not match the explicitly approved DEV project');
  }
  let database: URL;
  try { database = new URL(input.databaseUrl); }
  catch { throw new Error('Cycle 07 database target is invalid'); }
  const username = decodeURIComponent(database.username);
  if (!['postgres:', 'postgresql:'].includes(database.protocol)
    || database.hostname !== approvedPooler
    || database.port !== '5432'
    || username !== `donos_api.${CYCLE07_APPROVED_DEV_REF}`
    || decodeURIComponent(database.pathname) !== '/postgres'
    || database.searchParams.get('sslmode') !== 'verify-full'
    || [...database.searchParams.keys()].some((key) => key !== 'sslmode')
    || !database.password) {
    throw new Error('Cycle 07 database target is not the approved DEV pooler/database');
  }
  if (isWithin(input.workspaceRoot, input.configDirectory)) {
    throw new Error('Cycle 07 credentials must remain outside the code worktree');
  }
}

type DevSettings = { projectRef: string; supabaseUrl: string; publishableKey: string; databaseUrl: string };
type TestFixtures = { actors: { name: 'a' | 'b'; id: string; email: string; password: string }[] };

function loadCycle07Config() {
  const configDirectory = process.env.DONOS_C07_CONFIG_DIR;
  const requestedProjectRef = process.env.DONOS_C07_APPROVED_PROJECT_REF;
  if (!configDirectory) throw new Error('Set DONOS_C07_CONFIG_DIR to the external protected DEV config directory');
  const devFile = resolve(configDirectory, 'dev.json');
  const fixturesFile = resolve(configDirectory, 'fixtures.json');
  const caFile = resolve(configDirectory, 'supabase-ca.crt');
  if (![devFile, fixturesFile, caFile].every(existsSync)) {
    throw new Error('Cycle 07 DEV config, synthetic fixtures, or CA certificate is missing');
  }
  const settings = JSON.parse(readFileSync(devFile, 'utf8')) as DevSettings;
  assertCycle07Target({
    requestedProjectRef,
    projectRef: settings.projectRef,
    supabaseUrl: settings.supabaseUrl,
    databaseUrl: settings.databaseUrl,
    configDirectory,
    workspaceRoot: process.cwd(),
  });
  const config = loadConfig({
    NODE_ENV: 'test',
    SUPABASE_MODE: 'cloud-dev',
    SUPABASE_PROJECT_REF: settings.projectRef,
    SUPABASE_URL: settings.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: settings.publishableKey,
    DATABASE_URL: settings.databaseUrl,
    DATABASE_CA_FILE: caFile,
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:5175',
  });
  return { config, fixturesFile, caFile };
}

export function runtimePool(max = 4): pg.Pool {
  const { config, caFile } = loadCycle07Config();
  const url = new URL(config.databaseUrl);
  url.search = '';
  return new pg.Pool({
    connectionString: url.toString(), max, connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000, query_timeout: 15_000,
    idle_in_transaction_session_timeout: 20_000,
    ssl: { rejectUnauthorized: true, ca: readFileSync(caFile, 'utf8') },
  });
}

export async function login(name: 'a' | 'b') {
  const { config, fixturesFile } = loadCycle07Config();
  const fixtures = JSON.parse(readFileSync(fixturesFile, 'utf8')) as TestFixtures;
  const actor = fixtures.actors.find((item) => item.name === name);
  if (!actor) throw new Error('Missing synthetic Cycle 07 Auth actor');
  const auth = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email: actor.email, password: actor.password });
  if (error || !data.session || data.user.id !== actor.id) throw new Error('Synthetic Cycle 07 Auth login failed');
  return { auth, token: data.session.access_token, userId: actor.id, issuer: `${config.supabaseUrl}/auth/v1` };
}
