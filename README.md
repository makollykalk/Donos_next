# DONOS Next — Ciclo 01

Fundação para proprietários, organizações e unidades. Portal, Estoque e Precificação são apps locais independentes, com uma API central. Consulte [evidências](docs/evidence/ciclo-01.md) para resultados e limites; shells não são motores comerciais prontos.

## Requisitos

- Node 24.22.0 (definido em `.node-version`).
- pnpm 11.25.0 (definido em `packageManager`).
- Supabase DEV dedicado já criado pelo fundador: `kfthwjrvgslnsjigqnyc`, DONOS Next DEV, PostgreSQL17.11, região us-east-1. A reprodução Supabase local com CLI requer Docker/WSL e ainda não foi comprovada nesta máquina.

## Comandos

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm dev
```

Integração exige os arquivos privados de DEV abaixo e dados sintéticos provisionados. E2E exige Chromium (`pnpm exec playwright install chromium`) e os quatro servidores iniciados por `pnpm dev` em outro terminal. Rodar integração e E2E sequencialmente, sem disputar o mesmo banco. Ambiente ausente causa falha explícita; unit/build não comprovam RLS.

Nesta instalação Windows, o wrapper global pnpm invoca outro Node. As verificações usam o Node local e o entrypoint pnpm diretamente:

```powershell
$taskNode = Join-Path (Get-Location) '.tools/node-v24.22.0-win-x64/node.exe'
$taskPnpm = 'C:/Users/Matheus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs'
$env:PATH = (Split-Path $taskNode) + ';' + $env:PATH
function dp { & $taskNode $taskPnpm @args }
dp typecheck
dp test:unit
dp test:integration
```

Use `dp` no lugar de pnpm nos demais comandos quando esse wrapper estiver presente. Em outra máquina, instale os pins declarados e confira `node --version`/`pnpm --version`.

## Configuração DEV privada

`scripts/dev.mjs` lê `.local/dev.json`, valida o destino antes de iniciar processos, fornece à API a conexão restrita e passa aos frontends somente Auth público/API local. Formato do arquivo, com valores substitutos:

```json
{"projectRef":"kfthwjrvgslnsjigqnyc","supabaseUrl":"https://kfthwjrvgslnsjigqnyc.supabase.co","publishableKey":"<publishable key>","databaseUrl":"postgresql://donos_api.kfthwjrvgslnsjigqnyc:<senha-runtime>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full"}
```

`.local/supabase-ca.crt` contém a CA oficial com verificação TLS obrigatória (origem/hash na evidência). Nunca usar rejectUnauthorized=false. A role donos_api tem senha própria e não possui ownership/BYPASSRLS/membership privilegiada. API não recebe a senha postgres nem service_role.

`.local/fixtures.json` contém `{ "actors": [{"name":"a","id":"<UUID sintético A>","email":"<email .invalid>","password":"<senha sintética>"},{"name":"b","id":"<UUID sintético B>","email":"<email .invalid>","password":"<senha sintética>"}] }`. Esses usuários foram preparados fora do runtime, e os logins são verificados contra o Auth real. Não versionar esse arquivo nem enviá-lo ao frontend. Fixtures SQL e seu propósito estão em `tests/integration/sql/`; somente o coordenador as provisiona no DEV confirmado. Migrações são forward-only nesta entrega; não executar reset remoto nem seed sobre outro projeto.

URLs locais: portal5173, estoque5174, precificação5175 e API3001, todas em127.0.0.1. Cada app pede login próprio, guarda sessão em sessionStorage por aba/app e exige seleção explícita de empresa/unidade. O token opaco de contexto permanece em memória. Logout confirma a revogação na API antes de signOut local; dados não ficam em cache compartilhado.

O diretório `.tools/` pode conter runtime/downloads/logs locais, todos ignorados pelo Git. Credenciais devem ficar apenas em arquivos ignorados ou variáveis de ambiente; nunca em DTOs, logs, README ou bundles.

## Escopo

Core inclui criação idempotente de organização/primeira unidade, unidades adicionais, contexto, entitlements de demonstração e metering com fake apenas em testes. Não há rota para conceder plano, chamar IA ou cobrar. Fornecedores/estoque/fichas/preços não estão implementados no Ciclo01. O [plano Inventory](docs/superpowers/plans/2026-10-15-inventory-valuation.md) foi aprovado, com execução condicionada ao fechamento do core. Nenhuma vinculação com o legado/produção, deploy ou merge automático.
