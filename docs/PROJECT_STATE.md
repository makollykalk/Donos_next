# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 05 — App 02 Precificação de Produtos e Combos:** spec/plano TDD e decisões financeiras aprovados. Task 1 (contratos e cálculo exato) concluída no commit `480a65f`; Task 2 (decomposição exata do custo da ficha) implementada e validada por testes unitários, pronta para commit após revisão independente. Integração DB, API, UI e E2E ainda não iniciadas.
- Ver [spec aprovada](superpowers/specs/2026-10-16-pricing-design.md), [plano TDD aprovado](superpowers/plans/2026-10-16-pricing.md) e [ADR 0004 aprovada](adr/0004-pricing-incidence-and-combos.md). IMP-016/017 e o vínculo atual da ficha foram aprovados em 2026-10-16; DDL/integração aguardam alvo de banco isolado autorizado.
- Escopo do prompt: produtos/variações/combos, custo manual ou custo de ficha autorizado, perfis de canal, simulações e snapshots históricos; T-15 a T-18.
- Verificações do checkout em 2026-10-16: `pnpm test:unit` 159/159, `pnpm typecheck`, `pnpm lint` e `git diff --check` aprovados. Node 24.19.0 emite aviso por estar abaixo do mínimo do projeto. Nenhum teste de integração foi executado.

## Ciclo anterior e estado Git

- **Ciclo 04 — locais de estoque e auditoria física:** implementação concluída, revisada independentemente e merged no PR #4 em 2026-10-16. Merge commit `c0b19024ea87041a971cabe018cf8d005c82eb46`; base `codex/ciclo-03-recipes-yield`.
- Ver [spec](superpowers/specs/2026-10-15-stock-locations-audit-design.md), [plano TDD](superpowers/plans/2026-10-15-stock-locations-audit.md) e [evidências](evidence/ciclo-04-stock-locations-audit.md).
- Checkout atual do Ciclo 05: branch `codex/ciclo-05-pricing`, criada a partir da branch-base após o merge do PR #4. O histórico do Ciclo 04 está incluído.
- PR #4: [Ciclo 04: locais de estoque e auditoria física](https://github.com/makollykalk/Donos_next/pull/4).

## Ambiente e ressalvas herdadas

- Node disponível no shim é 24.19.0, abaixo do engine mínimo `>=24.22.0 <25`; a suíte unitária local concluiu com aviso.
- Sem Docker/Podman; replay local de todas as migrations desde vazio permanece pendente. Não usar reset remoto para substituir essa prova.
- No Ciclo 04, os testes de integração específicos foram aprovados no Supabase DEV autorizado. A suíte ampla não foi repetida inteira depois de quatro correções; não declarar uma única execução integral totalmente verde.
- Advisories DEV: Auth leaked-password protection desabilitada (WARN) e avisos informativos de FKs sem índice/índices ainda não usados; detalhes na evidência do Ciclo 04.
- Nenhuma decisão do Ciclo 04 autoriza produção/legado/deploy. O Ciclo 05 não recebeu autorização para operar em banco remoto.
