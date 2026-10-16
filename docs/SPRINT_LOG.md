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

- **Estado:** implementação commitada na branch `codex/ciclo-05-pricing`; gates finais e revisão independente concluídos em 2026-10-16. PR pendente; não houve merge, deploy ou início de novo ciclo.
- **Prompt:** `prompts/05-PRECIFICACAO.md`; critérios T-15 a T-18 e decisões pendentes IMP-016/IMP-017.
- **Spec:** `docs/superpowers/specs/2026-10-16-pricing-design.md`; aprovada pelo fundador em 2026-10-16.
- **Plano TDD:** `docs/superpowers/plans/2026-10-16-pricing.md`; aprovado pelo fundador em 2026-10-16.
- **Decisões financeiras:** fundador confirmou IMP-016/017 e vínculo à versão corrente validada/local escolhido em 2026-10-16; ADR `docs/adr/0004-pricing-incidence-and-combos.md` aprovada.
- **Gate de banco:** autorização C05-DEV registrada em `docs/DECISIONS.md`; `.local/dev.json` confirmou o projeto `kfthwjrvgslnsjigqnyc`. Migrations aditivas `20261016144858_cycle05_pricing` e `20261016150625_cycle05_pricing_variant_snapshot.sql` aplicadas sem reset; o histórico remoto confirmou a migration de snapshot.
- **Verificação:** `pnpm test:unit` 169/169; integração de pricing em 5 arquivos/6 testes passou no DEV com dados sintéticos (API, schema, tenant/security, histórico e locks); E2E de combo 1/1; typecheck, lint, build e diff check passaram. O teste relacionado ao contrato central de ficha também foi executado separadamente; evidências em `docs/evidence/ciclo-05-pricing.md`.
- **Revisão independente:** sem blockers em isolamento, exatidão financeira, snapshots, locks e acesso de catálogo recipe. Risco P2: DML direto nas tabelas-filhas fora dos métodos de repositório não adquire o lock do registro-pai automaticamente.
- **Commits de implementação:** `a3546b8` snapshots/migration, `4c83e3c` API/cálculo/concorrência, `1eea03c` UI/E2E.
- **Ambiente:** Node 24.19.0 abaixo do requisito `>=24.22.0 <25`; build runtime 24.15.0. Os comandos passaram com avisos de engine; bundle do App 02 ultrapassa 500 kB minificados.
- **Advisors após migration:** sem advisory de segurança nas novas tabelas; permanece `auth_leaked_password_protection` WARN preexistente. Há avisos INFO de FKs sem índice (incluindo algumas novas FKs de autoria/local) e índices recém-criados ainda não usados.
- **Limites:** autorização remota limitada a testes e migrations aditivas no DEV acima. Sem produção, legado, reset, cobrança real, integração paga ou deploy.

## Ciclos anteriores

Consulte `docs/evidence/ciclo-01.md`, `docs/evidence/ciclo-02-inventory.md` e `docs/evidence/ciclo-03-recipes-yield.md`.
