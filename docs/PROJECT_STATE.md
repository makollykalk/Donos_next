# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 05 — App 02 Precificação de Produtos e Combos:** spec/plano TDD e decisões financeiras aprovados. Task 1 (contratos e cálculo exato) concluída no commit `480a65f`; Task 2 (decomposição exata do custo da ficha) concluída no commit `c4872f1`; Task 3 (schema/repository/isolamento/histórico) implementada e validada no checkout atual. API, UI e E2E ainda não iniciadas.
- Ver [spec aprovada](superpowers/specs/2026-10-16-pricing-design.md), [plano TDD aprovado](superpowers/plans/2026-10-16-pricing.md) e [ADR 0004 aprovada](adr/0004-pricing-incidence-and-combos.md). IMP-016/017 e o vínculo atual da ficha foram aprovados em 2026-10-16. O fundador autorizou testes e migrations aditivas do Ciclo 05 somente no DEV `kfthwjrvgslnsjigqnyc`; sem reset, produção ou legado.
- Escopo do prompt: produtos/variações/combos, custo manual ou custo de ficha autorizado, perfis de canal, simulações e snapshots históricos; T-15 a T-18.
- Migration `20261016144858_cycle05_pricing` aplicada somente ao DEV autorizado `kfthwjrvgslnsjigqnyc`. Integrações direcionadas de schema, segurança multi-tenant e histórico combo passaram 3/3; `pnpm test:unit` passou 160/160. Typecheck, lint e diff check passaram; Node 24.19.0 emite aviso por estar abaixo do mínimo `>=24.22.0 <25`.

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
- Nenhuma decisão do Ciclo 04 autoriza produção/legado/deploy. Autorização remota do Ciclo 05 está limitada ao projeto DEV `kfthwjrvgslnsjigqnyc`; nenhum acesso a produção ou legado foi autorizado.
