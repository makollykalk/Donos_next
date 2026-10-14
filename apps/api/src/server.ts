import { buildApp } from './app.js';
import { loadConfig } from './config.js';

try {
  const config = loadConfig(process.env);
  const app = buildApp({});
  const shutdown = async () => { await app.close(); };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
  await app.listen({ host: config.host, port: config.port });
  console.info(`DONOS Next API em http://${config.host}:${String(config.port)}`);
} catch {
  console.error('A API não iniciou. Confira a configuração local e a porta.');
  process.exitCode = 1;
}
