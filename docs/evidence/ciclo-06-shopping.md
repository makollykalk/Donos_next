# Evidências — Ciclo 06: listas de compras Premium

Atualizado em 2026-10-16. Branch `codex/ciclo-06-shopping`, worktree gerenciado `ciclo-06-shopping`, base Ciclo 04. Implementação no App 01 apenas. Nenhuma ação em produção, legado, deploy, domínio, cobrança ou integração paga.

## Entrega

- Limites/alertas Base e listas Premium; geração usa saldo por local, conversão válida, última compra não estornada e apenas compromissos confirmados pelo dono. Rascunhos/recebidos não diminuem reposição.
- Confirmação/cancelamento explícitos, compromisso com snapshot de unidade/conversão/fornecedor, recebimento parcial associado ao fluxo existente e atualização atômica do saldo/ledger/histórico/pendência.
- Histórico, exportação CSV com escape e neutralização de fórmula, impressão do navegador, rotas server-side e UI App 01.
- Migrations aditivas aplicadas somente ao Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`: `20261016162828_cycle06_shopping`, `20261016164932_cycle06_shopping_item_guard_fix`, `20261016165528_cycle06_shopping_supplier_guard`.
- `shopping_commitment_guard`/tabelas mantêm RLS forçado, contexto e titularidade. Serviços verificam `inventory_core`; ações Premium validam entitlement server-side antes da operação. Nenhum `service_role` no client.

## Verificações executadas

- `pnpm test:unit`: 20 arquivos, 150 testes aprovados.
- `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/shopping-commitment-concurrency.test.ts tests/integration/shopping-api.test.ts tests/integration/purchase-receipts.test.ts tests/integration/shopping-schema.test.ts tests/integration/shopping-tenant-security.test.ts`: 5 arquivos, 6 testes aprovados no DEV com fixtures sintéticas. Prova recebimento parcial/idempotente, corrida de dois recebimentos acima do restante (somente um conclui), confirmação Premium mockada para o caminho positivo, negação Base pela verificação real do serviço, conversão histórica congelada, fornecedor divergente recusado, schema e política RLS.
- `pnpm exec playwright test tests/e2e/shopping-flow.spec.ts`: 1/1 aprovado; login/contexto e APIs de produto mockados, fluxo Base/Premium, confirmação explícita, rascunho de recebimento vinculado, CSV e bloqueio após 403.
- `pnpm typecheck`: aprovado (`tsc -b` e `tsc -p tsconfig.tests.json --noEmit`).
- `pnpm lint`: aprovado sem warnings.
- `pnpm build`: três aplicações Vite construídas.
- `git diff --check`: aprovado.
- Revisão independente identificou e motivou correções para criticidade lexicográfica, recebimento após atualização da conversão e fornecedor divergente. Releitura independente confirmou que os três fixes e a regressão de reidratação estão presentes, sem bloqueadores remanescentes neste escopo.

## Limitações e riscos

- Node local v24.19.0 e runtime do build v24.15.0; projeto exige `>=24.22.0 <25`. Comandos concluíram com aviso de engine, mas a matriz deve ser repetida no runtime suportado.
- Sem Docker/Podman/banco local descartável: replay integral desde banco vazio não foi validado. O ciclo usou o DEV autorizado e dados sintéticos.
- Testes de integração selecionados, não a suíte integral de integração.
- E2E é mockado e não comprova fluxo browser contra APIs reais. A UI não consegue detectar cancelamento Premium antes da primeira resposta 403, porque não há sinal de entitlement em endpoint de leitura.
- Revisão apontou que os testes verificam metadados/FKs das tabelas-filhas mas não tentam acesso cruzado individual a listas/itens/compromissos ou exportação por ID forjado; as policies e filtros de tenant foram revisados, essa lacuna de teste permanece.
- PR #6 está aberto para revisão humana contra `codex/ciclo-04-stock-locations-audit`; branch publicada com commits pequenos. Não fazer merge nem deploy sem revisão humana.
