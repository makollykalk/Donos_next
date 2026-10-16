# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 06 — listas de compras Premium do App 01:** implementação e releitura independente concluídas; [PR #6](https://github.com/makollykalk/Donos_next/pull/6) aberto para revisão humana, sem merge.
- Escopo: alertas e limites Base, listas Premium, sugestões, confirmação explícita de compra, compromissos, recebimento parcial associado, histórico, CSV/impressão e interface do App 01.
- Decisão aprovada: somente compras explicitamente confirmadas pelo dono contam como compromisso; rascunhos e recebimentos ficam fora. Ver [DECISIONS](DECISIONS.md), [ADR-0005](adr/0005-shopping-commitments.md), [spec](superpowers/specs/2026-10-16-shopping-design.md) e [plano TDD](superpowers/plans/2026-10-16-shopping.md).
- Migrations `20261016162828`, `20261016164932` e `20261016165528` aplicadas somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`. Nenhuma alteração em produção, legado, deploy ou cobrança.
- Evidências e limitações: [Ciclo 06](evidence/ciclo-06-shopping.md). Sem merge.

## Estado Git e próximo passo

- Branch: `codex/ciclo-06-shopping`, baseada no histórico local do Ciclo 04. Checkout principal permanece separado; implementação ocorre no worktree listado acima.
- Passaram 150 testes unitários, 6 testes de integração selecionados, E2E mockado 1/1, typecheck, lint, build e diff check. Revisão independente não encontrou bloqueadores; lacuna remanescente de cobertura RLS está descrita na evidência.
- PR #6 compara `codex/ciclo-06-shopping` com `codex/ciclo-04-stock-locations-audit`; estado aberto e mergeable na última consulta. Não fazer merge nem deploy automaticamente.

## Ambiente e ressalvas

- Node do ambiente v24.19.0 e build runtime v24.15.0, abaixo de `>=24.22.0 <25`; comandos concluíram com aviso. Repetir gates no runtime suportado.
- Sem Docker/Podman nem DB descartável; replay integral desde banco vazio permanece pendente. Integrações selecionadas foram executadas no DEV autorizado com fixtures sintéticas.
- A UI não tem endpoint para consultar entitlement no carregamento; após cancelamento Premium, bloqueia ações quando recebe 403. A primeira abertura pode exibir ações até a tentativa protegida retornar 403.
