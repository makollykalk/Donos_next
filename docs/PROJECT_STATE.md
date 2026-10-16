# Estado do projeto DONOS Next

Atualizado em 2026-10-16.

## Ciclo atual

- **Ciclo 05 — App 02 Precificação de Produtos e Combos:** implementação de contratos, cálculo, persistência, API, UI, combos, snapshots históricos e integração de fichas concluída e commitada na branch `codex/ciclo-05-pricing`; gates finais e revisão independente executados em 2026-10-16. PR draft #5 aberto; não houve merge, deploy ou início do Ciclo 06.
- Ver [spec aprovada](superpowers/specs/2026-10-16-pricing-design.md), [plano TDD aprovado](superpowers/plans/2026-10-16-pricing.md) e [ADR 0004 aprovada](adr/0004-pricing-incidence-and-combos.md). IMP-016/017 e o vínculo atual da ficha foram aprovados em 2026-10-16. O fundador autorizou testes e migrations aditivas do Ciclo 05 somente no DEV `kfthwjrvgslnsjigqnyc`; sem reset, produção ou legado.
- Escopo do prompt: produtos/variações/combos, custo manual ou custo de ficha autorizado, perfis de canal, simulações e snapshots históricos; T-15 a T-18.
- Migrations aditivas `20261016144858_cycle05_pricing` e `20261016150625_cycle05_pricing_variant_snapshot.sql` aplicadas somente ao DEV autorizado `kfthwjrvgslnsjigqnyc`; o histórico remoto confirmou a migration de snapshot. Nenhum reset foi executado.
- Verificação final: `pnpm test:unit` 169/169; integração de pricing em 5 arquivos/6 testes passou (API, histórico, tenant/security, schema e locks concorrentes); E2E de combo 1/1, `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check` passaram. Consulte [evidências do Ciclo 05](evidence/ciclo-05-pricing.md).
- Revisão independente final sem blockers. Risco residual P2: a coerência concorrente depende de as escritas usarem os métodos do repositório, que atualizam primeiro o registro-pai; DML direto nas tabelas-filhas não adquire esse lock automaticamente.

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
