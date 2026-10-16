# Registro de sprints DONOS Next

## Ciclo 04 — locais de estoque e auditoria física

- **Período:** 2026-10-15 a 2026-10-16.
- **Estado:** implementação, gates e revisão independente concluídos; branch aguarda publicação e abertura de PR para revisão humana.
- **Decisões:** movimentos dos itens contados bloqueados; locais reais particionam o estoque; valor positivo de item sem custo médio exige valor total e confirmação do dono; Supabase DEV hospedado autorizado.
- **Migrations DEV:** `20261016030907_stock_locations_audit`, `20261016122412_cycle04_count_adjustment_average_guard`, `20261016122802_cycle04_location_foreign_key_indexes`, `20261016122959_cycle04_count_location_and_observation_guards`, `20261016131804_cycle04_restaurant_default_location_guard`, `20261016133113_cycle04_location_count_archive_lock`.
- **Testes finais:** inventário de contagem 5/5; bootstrap de organização 5/5; canônico 1/1; E2E de auditoria 1/1; unitários 137/137; typecheck, lint, build e diff check aprovados conforme evidência.
- **Integração ampla:** primeira execução teve quatro falhas em fixtures/queries antigas após `location_id` tornar-se obrigatório; foram corrigidas e os quatro arquivos reexecutados com sucesso. Os demais 35 arquivos passaram na primeira execução. Não declarar uma única execução integral totalmente verde.
- **Evidência:** `docs/evidence/ciclo-04-stock-locations-audit.md`.

## Ciclos anteriores

Consulte `docs/evidence/ciclo-01.md`, `docs/evidence/ciclo-02-inventory.md` e `docs/evidence/ciclo-03-recipes-yield.md`.
