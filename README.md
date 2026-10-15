# DONOS Next — Core e Estoque Base

Fundação para proprietários, organizações e unidades, com Estoque Base do Ciclo02. Portal, Estoque e Precificação são apps locais independentes e consomem uma API central. Resultados e limites: [core](docs/evidence/ciclo-01.md) e [estoque](docs/evidence/ciclo-02-inventory.md). Precificação continua como shell protegido; seu motor pertence a outro ciclo.

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

Core inclui organização/primeira unidade idempotentes, contexto, entitlements de demonstração e metering com fake apenas em testes. Não há rota para conceder plano, chamar IA ou cobrar. O core foi revisado pelo fundador e o [plano Inventory](docs/superpowers/plans/2026-10-15-inventory-valuation.md) aprovado; o Ciclo02 foi implementado e validado para revisão humana. Resultados:116 unitários,53 cenários SQL distintos em execuções documentadas e18E2E; typecheck/lint/build aprovados. Nenhuma vinculação com legado/produção, deploy ou merge automático.

## Operar o Estoque Base

1. Entre no app Estoque e selecione empresa e unidade com inventory_core de demonstração. Insumos/saldos/extrato pertencem à unidade; fornecedores são compartilhados somente na mesma organização.
2. Cadastre insumo com base kg, L ou un. Base e permissão de fracionar unidades são imutáveis; nome e estado de arquivamento podem ser atualizados. Embalagens têm fatores versionados por insumo; massa/volume não se misturam por inferência.
3. Cadastre fornecedor e salve um rascunho com quantidade, unidade e custo efetivo em reais por unidade original. Não há rateio automático de encargos. Preço zero exige motivo. O rascunho não altera saldo nem histórico de preços.
4. Abra o recebimento, confira todas as linhas e confirme explicitamente a mercadoria recebida. A transação grava todos os itens, custos, saldo, histórico e auditoria ou nenhum efeito.
5. Registre saída com motivo; o servidor calcula o custo. Consulte saldo/valor, razão exata do custo médio, ledger e histórico por fornecedor. Valores críticos trafegam como strings, com quantidade6 casas e valor12; UI usa BigInt/string para formatação.
6. Estorne somente a última saída elegível ou o recebimento inteiro cujas linhas continuem últimas. A compensação exige motivo e preserva origens/preços. Sucessores bloqueiam estorno; não há revaloração retroativa, DELETE de movimento ou edição de recebimento.

A API fica sob `/v1/organizations/:organizationId/restaurants/:restaurantId/inventory`; toda rota exige Bearer, X-Donos-Context e entitlement no servidor. Mutações exigem Idempotency-Key UUID. Em timeout, repetir o mesmo comando com a mesma chave; não gerar outra por simples retry. Contratos completos na [spec](docs/superpowers/specs/2026-10-15-inventory-valuation-design.md).

Fora deste ciclo: fichas/rendimento, contagem física/PDF, listas Premium, IA/WhatsApp, motor de precificação, pedidos/recebimento parcial, transferências, cobrança e deploy. Nenhum próximo ciclo é iniciado autonomamente.
