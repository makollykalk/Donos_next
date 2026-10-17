# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 06 — listas de compras Premium do App 01:** implementação, gates e revisão humana concluídos; [PR #6](https://github.com/makollykalk/Donos_next/pull/6) merged em 2026-10-16 no commit `d8a9f51`.
- Escopo: alertas e limites Base, listas Premium, sugestões, confirmação explícita de compra, compromissos, recebimento parcial associado, histórico, CSV/impressão e interface do App 01.
- Decisão aprovada: somente compras explicitamente confirmadas pelo dono contam como compromisso; rascunhos e recebimentos ficam fora. Ver [DECISIONS](DECISIONS.md), [ADR-0005](adr/0005-shopping-commitments.md), [spec](superpowers/specs/2026-10-16-shopping-design.md) e [plano TDD](superpowers/plans/2026-10-16-shopping.md).
- Migrations `20261016162828`, `20261016164932` e `20261016165528` aplicadas somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`. Nenhuma alteração em produção, legado, deploy ou cobrança.
- Evidências e limitações: [Ciclo 06](evidence/ciclo-06-shopping.md). Sem deploy.

## Próximo subciclo

- **Ciclo 07A — proposta de estoque por texto no App 01:** spec, plano TDD e política de retenção aprovados pelo usuário. Tarefas 1–3 concluídas e revisadas; Tarefa 4 implementada no commit `e20b634` nesta branch `codex/ciclo-07-ai-text`, mas seu gate de revisão permanece aberto por falta de prova em PostgreSQL real.
- Escopo da spec: uma ação/um insumo por proposta, mock determinístico apenas em desenvolvimento/testes, confirmação explícita e medidor existente `ai_text_whatsapp`; não autoriza integração real, WhatsApp ou uso remoto.
- A spec está em [2026-10-16-ai-text-in-app-design.md](superpowers/specs/2026-10-16-ai-text-in-app-design.md), o plano em [2026-10-16-ai-text-in-app.md](superpowers/plans/2026-10-16-ai-text-in-app.md) e ADR [0006](adr/0006-ai-text-in-app.md). Tarefa 1: commits `72625a6` a `9dc0f20`, review round 2 limpo. Tarefa 2: migrations aditivas autorizadas em C07-DEV, revisão limpa. Tarefa 3: commit `42e6e58`, revisão limpa após duas rodadas de correções. Tarefa 4: commit `e20b634`; os testes focados e unitários passam, porém a revisão independente mantém o gate aberto até validar concorrência/rollback com Postgres descartável. Não iniciar Tarefa 5 antes disso.
- Política aprovada: dados estruturados de proposta removidos 30 dias após estado terminal; propostas abertas expiram em 30 dias da criação. Aplicar Apple Design skill ao iniciar frontend (Tarefa 5).
- Tarefa 2 aplicada somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`: migrations `20261016190345_cycle07_ai_text_proposals` e `20261016190427_cycle07_ai_proposal_reservation_fk_index`; sem reset, produção, legado, deploy ou integração paga. Replay desde DB local vazio segue pendente.

## Gate atual da Tarefa 4

- Branch ativa: `codex/ciclo-07-ai-text`, commit da Tarefa 4 `e20b634`. Nenhuma alteração de código pendente após esse commit; esta sessão atualiza apenas a documentação de estado/evidência.
- Tarefa 4: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/ai-text-api.test.ts tests/integration/ai-text-concurrency.test.ts` passou 17/17; `pnpm test:unit` passou 178/178; `pnpm typecheck` e `git diff --check` passaram.
- Revisão independente: NEEDS FIXES no gate de prova, sem defeito de código identificado. A concorrência e o rollback são modelados por adapter em memória e operações stub; não provam locks, RLS, ledger ou rollback SQL real. Evidência em [Ciclo 07A Tarefa 4](evidence/ciclo-07a-task-4.md).
- Próximo passo: obter ambiente PostgreSQL descartável e executar integração real conforme o gate da Tarefa 4, ou revisar formalmente spec/plano com aprovação humana antes de qualquer avanço dependente. Tarefa 5 não iniciada.

## Base do ciclo e estado geral

- Branch de base: `codex/ciclo-04-stock-locations-audit` no merge do PR #6. O Ciclo 07A está isolado no worktree `ciclo-07-ai-text`.
- Passaram 150 testes unitários, 6 testes de integração selecionados, E2E mockado 1/1, typecheck, lint, build e diff check. Revisão independente não encontrou bloqueadores; lacuna remanescente de cobertura RLS está descrita na evidência.
- PR #6 foi merged para `codex/ciclo-04-stock-locations-audit`; não houve deploy.

## Ambiente e ressalvas

- Node do ambiente v24.19.0 e build runtime v24.15.0, abaixo de `>=24.22.0 <25`; comandos concluíram com aviso. Repetir gates no runtime suportado.
- Sem Docker/Podman nem DB descartável; replay integral desde banco vazio permanece pendente. Integrações selecionadas foram executadas no DEV autorizado com fixtures sintéticas.
- A UI não tem endpoint para consultar entitlement no carregamento; após cancelamento Premium, bloqueia ações quando recebe 403. A primeira abertura pode exibir ações até a tentativa protegida retornar 403.
