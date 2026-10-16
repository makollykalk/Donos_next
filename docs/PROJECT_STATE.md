# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 04 — locais de estoque e auditoria física:** implementação concluída na branch `codex/ciclo-04-stock-locations-audit`; aguardando revisão humana antes de merge e antes de iniciar outro ciclo.
- Escopo: locais físicos, partição de saldo/movimentos/custos, bloqueio durante contagem, contagem guiada cega, divergências compensatórias e relatório imprimível.
- Especificação e plano aprovados; ver [spec](superpowers/specs/2026-10-15-stock-locations-audit-design.md), [plano TDD](superpowers/plans/2026-10-15-stock-locations-audit.md) e [evidências](evidence/ciclo-04-stock-locations-audit.md).
- Migrations aplicadas somente em Supabase DEV `kfthwjrvgslnsjigqnyc`. Nenhuma alteração de produção/legado/deploy.
- Revisão independente final não encontrou bloqueador remanescente; corrida entre abertura e arquivamento foi coberta por teste concorrente e migration `20261016133113`.

## Estado Git e próximo passo

- Base: commit `9433116` (`docs: clarify location audit invariants`), com histórico do Ciclo 03 preservado.
- Alterações do Ciclo 04 foram organizadas em commits pequenos; após publicação, abrir PR para revisão humana.
- Revisão independente final do diff concluída para tenant/RLS, precisão financeira e concorrência; não há bloqueadores remanescentes. Não fazer merge nem iniciar Ciclo 05 automaticamente.

## Ambiente e ressalvas

- Node disponível no shim é 24.19.0, abaixo do engine mínimo `>=24.22.0 <25`; build concluiu com aviso.
- Sem Docker/Podman; replay local de todas as migrations desde vazio permanece pendente. Integração foi validada no DEV autorizado.
- Advisories DEV: Auth leaked-password protection desabilitada (WARN) e avisos informativos de FKs sem índice/índices ainda não usados; detalhes na evidência do Ciclo 04.
