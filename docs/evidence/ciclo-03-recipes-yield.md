# Evidências — Ciclo 03: fichas e rendimentos

Data: 2026-10-15

Branch: `codex/ciclo-03-recipes-yield`

Spec aprovada: `docs/superpowers/specs/2026-10-15-recipes-yield-design.md`

Plano aprovado: `docs/superpowers/plans/2026-10-15-recipes-yield.md`

## Entrega

O App Estoque agora permite criar fichas técnicas versionadas de produto e pré-preparo, associar insumos ou versões exatas de pré-preparos, registrar transformações e rendimentos medidos, confirmar a validação separadamente e consultar custo pelo rendimento final. Estimativas ficam no histórico e não validam uma ficha. Criar uma versão nova gera identificadores novos para seus componentes e etapas.

O cálculo usa racionais/inteiros (`BigInt` no domínio e `numeric` no Postgres), conversões congeladas, custo médio móvel vigente do saldo e rendimento final medido. Ciclos são serializados no banco; custo de pré-preparo sem medição validada fica indisponível. Snapshots de validação são append-only e únicos por tenant, unidade, evento e ingrediente. A API exige identidade/contexto e entitlement `inventory_core`; tabelas usam FKs compostas, `FORCE ROW LEVEL SECURITY` e permissões sem acesso público ao schema.

O contrato de leitura de custo está no App 01/API. O App 02 não foi alterado. Este ciclo não inclui produção/baixa por receita, telas Premium, IA, pagamento, nem cobrança real.

## Evidências de negócio e isolamento

- `tests/integration/recipe-cost-graph.test.ts` executou no Postgres DEV um pré-preparo Ragù compartilhado por lasanha, pizza e hambúrguer, com medições finais distintas (1,8 kg; 0,52 kg; 0,47 kg; 0,3 kg). O teste conferiu custo exato do lote e por unidade final antes e depois de uma compra que elevou o custo médio do queijo.
- `tests/integration/recipe-commands.test.ts` passou no Postgres DEV: estimativa não pode ser validada; medição real pode; validar produto com pré-preparo ainda não validado persiste a medição do produto, mas mantém o custo indisponível; snapshot é registrado na validação; escrita histórica direta é rejeitada.
- `tests/integration/recipe-tenant-security.test.ts` passou com `donos_api`, credenciais reais de teste e contextos A1/A2/B: leituras/custos não cruzam organização ou unidade e escrita com IDs forjados é rejeitada.
- `tests/integration/recipe-graph-concurrency.test.ts` passou com transações distintas: as conexões concorrentes não confirmam simultaneamente arestas que formariam ciclo.
- A restrição de snapshot UNIQUE foi conferida no índice do Postgres DEV. Revisão independente confirmou que os antigos achados de IDs reutilizados, validação de descendente sem medição e ciclos concorrentes foram corrigidos e cobertos.
- A revisão inicial identificou EXECUTE público em dez funções de trigger da nova migration. A causa foi a ausência de revogação explícita após a criação dessas funções. A migration `20261015210000_recipes_revoke_public_function_exec.sql` foi aplicada apenas no DEV; `inventory-schema.test.ts` então passou e confirmou zero EXECUTE de `anon`/`authenticated` em `core`.

## Verificações executadas

| Comando/caso | Resultado observado |
|---|---|
| `pnpm typecheck` | Aprovado (`tsc -b` e `tsc -p tsconfig.tests.json --noEmit`) |
| `pnpm lint` | Aprovado (`eslint . --max-warnings 0`) |
| `pnpm test:unit` | 16 arquivos, 130 testes aprovados |
| `pnpm build` | Aprovado nos três targets Vite; runtime de build 24.22.0 |
| `pnpm exec playwright test tests/e2e/recipe-flow.spec.ts` | 1/1 aprovado; criação, cocção medida, rendimento de 0,8 kg, confirmação, custo R$10/lote e R$12,50/kg, histórico e segunda versão |
| `pnpm test:integration` — segunda execução integral | 37/38 arquivos e 58/59 testes aprovados; o único timeout foi o teste preexistente `inventory-ledger-grants.test.ts` após 60 s |
| `inventory-ledger-grants.test.ts` isolado | 1/1 aprovado em 29,6 s |
| `core-api.test.ts` isolado | 3/3 aprovados em 38,9 s após timeout de hook na primeira suíte integral |
| `inventory-concurrency.test.ts` isolado | 2/2 aprovados em 46,7 s após timeout na primeira suíte integral |
| `inventory-schema.test.ts` | Falhou por grants públicos residuais antes da migration de correção; depois passou isolado e também na segunda suíte integral |
| `git diff --check` | Aprovado |

A primeira execução integral teve 35 arquivos aprovados e falhas em dois timeouts e no schema de grants. A segunda eliminou o problema de grants e passou os dois testes que haviam expirado, mas outro teste antigo do Ciclo 02 excedeu o timeout global. Cada caso que falhou na execução integral foi aprovado em repetição isolada. Portanto, a suíte integral não é declarada verde; as integrações relevantes ao Ciclo 03 e as repetições isoladas foram aprovadas.

O comando `pnpm` do host ainda mostra aviso de engine porque o shim usa Node 24.19.0, abaixo do mínimo declarado. O build foi repetido com `.tools/node-v24.22.0-win-x64` no `PATH` e reportou runtime 24.22.0. Typecheck, lint e testes unitários passaram com o aviso do shim.

## Limites e ambiente

As migrations e consultas de integração foram executadas no projeto Supabase DEV autorizado. Não houve alteração no legado, migration em produção, deploy ou alteração de cobrança. Os dados usados nos testes são sintéticos. O fluxo E2E requer ambiente Supabase DEV e processo local da API; a primeira tentativa encontrou API local desatualizada, que foi reiniciada antes da execução aprovada.

O PR permanece sujeito à revisão humana. Ciclo 04 não foi iniciado.
