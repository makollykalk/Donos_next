# Evidências — Ciclo 04: locais de estoque e auditoria física

Data: 2026-10-16
Branch: `codex/ciclo-04-stock-locations-audit`
Base preservada: `9433116 docs: clarify location audit invariants` (sobre o histórico do Ciclo 03)
Spec aprovada: `docs/superpowers/specs/2026-10-15-stock-locations-audit-design.md`
Plano aprovado: `docs/superpowers/plans/2026-10-15-stock-locations-audit.md`

## Entrega

O App Estoque possui locais físicos reais por unidade. Saldo, ledger, recebimento, estorno, histórico de compra e custo corrente de ficha ficam no escopo de local. Unidades legadas recebem local padrão preservando os registros existentes. A criação de unidade garante um local padrão e a constraint diferida rejeita unidade confirmada sem exatamente um local padrão ativo.

O proprietário pode abrir contagem física guiada (inclusive cega), imprimir folha de contagem, registrar quantidades/observações e recontar/revisar divergências. Uma contagem aberta por local bloqueia movimentos nos itens incluídos. Fechamento gera somente ajustes compensatórios divergentes e auditoria atomicamente; cancelamento não altera o ledger. Saldo zero sem média exige valor total informado e confirmação explícita. UI, API, contratos e banco validam organização, unidade e local.

## Decisões aprovadas

- Bloquear movimentos dos itens em contagem até fechamento ou cancelamento (IMP-015 resolvida).
- Adicionar locais reais e particionar saldos/movimentos/custos agora.
- Para divergência positiva sem custo médio, exigir valor total informado e confirmado pelo dono.
- Usar exclusivamente o projeto Supabase **DONOS Next DEV** `kfthwjrvgslnsjigqnyc`.

## Migrations e invariantes no DEV

Migrations presentes no histórico remoto:

| Versão | Nome |
|---|---|
| `20261016030907` | `stock_locations_audit` |
| `20261016122412` | `cycle04_count_adjustment_average_guard` |
| `20261016122802` | `cycle04_location_foreign_key_indexes` |
| `20261016122959` | `cycle04_count_location_and_observation_guards` |
| `20261016131804` | `cycle04_restaurant_default_location_guard` |
| `20261016133113` | `cycle04_location_count_archive_lock` |

Consulta final no DEV em 2026-10-16 encontrou 311 unidades e zero violações em cada invariante: unidade sem exatamente um local padrão ativo; saldo sem local válido; movimento sem local válido; recebimento e item com locais distintos; estorno em local distinto da origem; snapshot de custo de receita sem local. A tabela real dos snapshots é `core.recipe_cost_snapshot_lines`.

A migration final também corrigiu unidades sintéticas criadas por testes de bootstrap anteriores à garantia do local padrão. Ela não removeu registros. O novo teste de bootstrap confirmou o guard diferido no Postgres DEV.

## Verificações executadas

| Comando/caso | Resultado observado |
|---|---|
| `pnpm typecheck` | Aprovado após correção de propriedade opcional no formulário e remoção de variável sem uso |
| `pnpm lint` | Aprovado (`eslint . --max-warnings 0`) após a mesma correção |
| `pnpm test:unit` | 18 arquivos, 137 testes aprovados no estado final |
| `pnpm build` | Os três targets Vite concluíram usando runtime Node 24.22.0. Aviso de chunk de 503,21 kB; o launcher `pnpm` ainda emite aviso por detectar Node 24.19.0 no host, embora o script de build informe o runtime fixado 24.22.0 |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/inventory-counts.test.ts` | 5/5 aprovados no Postgres DEV; inclui bloqueio de movimentos, valor positivo sem média, cancelamento, isolamento, autor de observação e serialização entre abertura e arquivamento |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/organization-commands.test.ts` | 5/5 aprovados no Postgres DEV; inclui rejeição de unidade sem local padrão |
| `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/inventory-canonical.test.ts` | 1/1 aprovado: 10×20, baixa 2, entrada 7×25 => 15, R$335, razão 335/15 |
| `pnpm exec playwright test tests/e2e/inventory-audit-flow.spec.ts` | 1/1 aprovado; contagem cega, valor positivo confirmado, recontagem, revisão e fechamento |
| `git diff --check` | Aprovado após o fechamento documental |

### Suíte de integração ampla

A primeira execução `pnpm test:integration` teve 35 dos 39 arquivos e 59 dos 63 testes aprovados. Quatro falhas vieram de fixtures/expectativas antigas após `location_id` tornar-se obrigatório: `inventory-tenant-security`, `inventory-ledger-grants`, `inventory-ledger-integrity` e `inventory-api`. Os quatro arquivos foram corrigidos e reexecutados juntos, todos aprovados. Os outros 35 arquivos passaram na execução ampla. Como a suíte ampla não foi repetida de ponta a ponta depois das correções, ela não é declarada integralmente verde; os testes de contagem, bootstrap e canônico relevantes foram repetidos isoladamente no estado final.

## Revisão de segurança e concorrência

Uma revisão independente examinou isolamento de tenant/unidade/local, precisão financeira e locks. A segunda leitura encontrou uma corrida entre abertura e arquivamento de local. Um teste RED confirmou que `FOR NO KEY UPDATE NOWAIT` podia adquirir o local enquanto a abertura estava em andamento. A migration `20261016133113` adiciona `FOR SHARE` no trigger de criação de sessão, e o repositório obtém o mesmo lock antes de travar os saldos. O teste então passou e o revisor confirmou que o achado foi resolvido. Os demais achados também foram corrigidos: média após ajuste negativo preserva a base até saldo zero; local arquivado não recebe contagem; autor da observação é comparado à identidade da sessão; validação de itens, arquivo e escopo RLS/constraints compostas são protegidos no banco. Testes de contagem cobrem movimento bloqueado, local arquivado, autor forjado, valor obrigatório, isolamento entre organizações e a corrida reprodutível.

O advisor de segurança do Supabase mostrou um aviso: **Leaked Password Protection está desabilitada** em Auth (configuração do projeto, fora do escopo da migration do Ciclo 04). O advisor de performance mostrou 36 FKs sem índice de cobertura e 11 índices ainda não usados, incluindo índices recém-adicionados. São avisos informativos a revisar com carga real; não foram removidos índices sem evidência de uso. Links: [proteção contra senhas comprometidas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [advisor de FKs sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [advisor de índice não usado](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Limitações e riscos

- Não havia Docker/Podman neste host; não foi realizado replay de todas as migrations desde banco local vazio. Migrações e testes Postgres foram feitos somente no Supabase DEV autorizado, sem reset remoto.
- O launcher `pnpm` ainda avisa que seu Node detectado é 24.19.0, abaixo do engine mínimo. O build foi executado com Node 24.22.0; convém confirmar o runtime efetivo dos subprocessos de typecheck/testes em CI antes de merge.
- O build mantém chunk de aproximadamente 503 kB; divisão de bundle fica para otimização separada.
- Advisories Auth e performance descritos acima permanecem abertos.
- O código foi organizado em commits pequenos; após publicá-los, a abertura do PR para revisão humana é o próximo gate. Não houve deploy, migration em produção, alteração no legado ou cobrança.

## Arquivos e áreas alterados

- `packages/contracts`, `packages/db`, `packages/domain-*`: contratos, repositórios, valuation e operações por local/contagem.
- `apps/api`: rotas e serviços de inventário, receitas e contagem física.
- `apps/estoque`: seleção de local, fluxo de contagem, recontagem, relatório imprimível e campos de local nos fluxos existentes.
- `supabase/migrations`: locais, contagens, guards, índices, RLS e garantia do local padrão.
- `tests`: cobertura unitária, integração, fixtures e E2E do Ciclo 04 e regressões de local.
- `docs`: spec/plano aprovados, decisões, estado do projeto, sprint log e esta evidência.
