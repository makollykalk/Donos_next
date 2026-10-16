# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 06 — listas de compras Premium do App 01:** implementação, gates e revisão humana concluídos; [PR #6](https://github.com/makollykalk/Donos_next/pull/6) merged em 2026-10-16 no commit `d8a9f51`.
- Escopo: alertas e limites Base, listas Premium, sugestões, confirmação explícita de compra, compromissos, recebimento parcial associado, histórico, CSV/impressão e interface do App 01.
- Decisão aprovada: somente compras explicitamente confirmadas pelo dono contam como compromisso; rascunhos e recebimentos ficam fora. Ver [DECISIONS](DECISIONS.md), [ADR-0005](adr/0005-shopping-commitments.md), [spec](superpowers/specs/2026-10-16-shopping-design.md) e [plano TDD](superpowers/plans/2026-10-16-shopping.md).
- Migrations `20261016162828`, `20261016164932` e `20261016165528` aplicadas somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`. Nenhuma alteração em produção, legado, deploy ou cobrança.
- Evidências e limitações: [Ciclo 06](evidence/ciclo-06-shopping.md). Sem deploy.

## Próximo subciclo

- **Ciclo 07A — proposta de estoque por texto no App 01:** design e spec aprovados pelo fundador; plano TDD concluído e aguardando revisão humana nesta branch `codex/ciclo-07-ai-text`.
- Escopo da spec: uma ação/um insumo por proposta, mock determinístico apenas em desenvolvimento/testes, confirmação explícita e medidor existente `ai_text_whatsapp`; não autoriza integração real, WhatsApp ou uso remoto.
- A spec está em [2026-10-16-ai-text-in-app-design.md](superpowers/specs/2026-10-16-ai-text-in-app-design.md), o plano em [2026-10-16-ai-text-in-app.md](superpowers/plans/2026-10-16-ai-text-in-app.md) e ADR [0006](adr/0006-ai-text-in-app.md). Nenhum código foi iniciado. O plano propõe apagar propostas/dados estruturados após 30 dias; essa política aguarda aprovação.
- Não há autorização de DEV remoto para Ciclo 07. O plano deverá exigir alvo descartável local e pausar se indisponível; qualquer uso de DEV exige autorização explícita nova.

## Estado Git e próximo passo

- Branch de base: `codex/ciclo-04-stock-locations-audit` no merge do PR #6. O Ciclo 07A está isolado no worktree `ciclo-07-ai-text`.
- Passaram 150 testes unitários, 6 testes de integração selecionados, E2E mockado 1/1, typecheck, lint, build e diff check. Revisão independente não encontrou bloqueadores; lacuna remanescente de cobertura RLS está descrita na evidência.
- PR #6 foi merged para `codex/ciclo-04-stock-locations-audit`; não houve deploy.

## Ambiente e ressalvas

- Node do ambiente v24.19.0 e build runtime v24.15.0, abaixo de `>=24.22.0 <25`; comandos concluíram com aviso. Repetir gates no runtime suportado.
- Sem Docker/Podman nem DB descartável; replay integral desde banco vazio permanece pendente. Integrações selecionadas foram executadas no DEV autorizado com fixtures sintéticas.
- A UI não tem endpoint para consultar entitlement no carregamento; após cancelamento Premium, bloqueia ações quando recebe 403. A primeira abertura pode exibir ações até a tentativa protegida retornar 403.
