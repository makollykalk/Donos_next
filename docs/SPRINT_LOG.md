# Registro de sprints DONOS Next

## Ciclo 04 — locais de estoque e auditoria física

- **Período:** 2026-10-15 a 2026-10-16.
- **Estado:** implementação, gates e revisão independente concluídos; PR #4 merged em 2026-10-16 no merge commit `c0b19024ea87041a971cabe018cf8d005c82eb46`, base `codex/ciclo-03-recipes-yield`.
- **Decisões:** movimentos dos itens contados bloqueados; locais reais particionam o estoque; valor positivo de item sem custo médio exige valor total e confirmação do dono; Supabase DEV hospedado autorizado.
- **Migrations DEV:** `20261016030907_stock_locations_audit`, `20261016122412_cycle04_count_adjustment_average_guard`, `20261016122802_cycle04_location_foreign_key_indexes`, `20261016122959_cycle04_count_location_and_observation_guards`, `20261016131804_cycle04_restaurant_default_location_guard`, `20261016133113_cycle04_location_count_archive_lock`.
- **Testes finais:** inventário de contagem 5/5; bootstrap de organização 5/5; canônico 1/1; E2E de auditoria 1/1; unitários 137/137; typecheck, lint, build e diff check aprovados conforme evidência.
- **Integração ampla:** primeira execução teve quatro falhas em fixtures/queries antigas após `location_id` tornar-se obrigatório; foram corrigidas e os quatro arquivos reexecutados com sucesso. Os demais 35 arquivos passaram na primeira execução. Não declarar uma única execução integral totalmente verde.
- **Evidência:** `docs/evidence/ciclo-04-stock-locations-audit.md`.

## Ciclo 05 — App 02 Precificação de Produtos e Combos

- **Estado:** decisões e plano aprovados na branch `codex/ciclo-05-pricing`. Task 1 foi commitada em `480a65f`; Task 2, em `c4872f1`, revisada independentemente e validada por unidade. Task 3 foi implementada no checkout atual, revisada independentemente e validada no DEV autorizado `kfthwjrvgslnsjigqnyc`; a migration foi aditiva e não houve reset.
- **Prompt:** `prompts/05-PRECIFICACAO.md`; critérios T-15 a T-18 e decisões pendentes IMP-016/IMP-017.
- **Spec:** `docs/superpowers/specs/2026-10-16-pricing-design.md`; aprovada pelo fundador em 2026-10-16.
- **Plano TDD:** `docs/superpowers/plans/2026-10-16-pricing.md`; aprovado pelo fundador em 2026-10-16.
- **Decisões financeiras:** fundador confirmou IMP-016/017 e vínculo à versão corrente validada/local escolhido em 2026-10-16; ADR `docs/adr/0004-pricing-incidence-and-combos.md` aprovada.
- **Gate de banco:** autorização C05-DEV registrada em `docs/DECISIONS.md`; `.local/dev.json` confirmou o projeto `kfthwjrvgslnsjigqnyc`. Migration `20261016144858_cycle05_pricing` aplicada sem reset; histórico remoto confirmou a versão registrada.
- **Verificação Task 3:** `pricing-schema.test.ts`, `pricing-tenant-security.test.ts` e `pricing-history-snapshot.test.ts` passaram 3/3 no DEV com fixtures sintéticas; `pnpm test:unit` passou 160/160; typecheck, lint e `git diff --check` passaram. Node 24.19.0 abaixo do requisito `>=24.22.0 <25`, com aviso do package manager.
- **Advisors após migration:** sem advisory de segurança nas novas tabelas; permanece `auth_leaked_password_protection` WARN preexistente. Há avisos INFO de FKs sem índice (incluindo algumas novas FKs de autoria/local) e índices recém-criados ainda não usados.
- **Limites:** autorização remota limitada a testes e migrations aditivas no DEV acima. Sem produção, legado, reset, cobrança real, integração paga ou deploy.

## Ciclos anteriores

Consulte `docs/evidence/ciclo-01.md`, `docs/evidence/ciclo-02-inventory.md` e `docs/evidence/ciclo-03-recipes-yield.md`.
