## Ciclo 06 — listas de compras Premium

- **Período:** 2026-10-16.
- **Estado:** implementação e gates executados; revisão humana concluída e PR #6 merged em 2026-10-16 no commit `d8a9f51`; sem deploy.
- **Decisão:** somente compromissos confirmados explicitamente pelo dono contam na reposição; rascunhos e recebimentos não contam. Recebimento parcial vinculado consome pendência e registra estoque/ledger/histórico atomicamente.
- **Alvo:** migration aditiva e testes autorizados apenas em Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`.
- **Migrations DEV:** `20261016162828_cycle06_shopping`, `20261016164932_cycle06_shopping_item_guard_fix`, `20261016165528_cycle06_shopping_supplier_guard`.
- **Testes:** unitários 150/150; integrações selecionadas 6/6 em cinco arquivos; E2E mockado 1/1; typecheck, lint, build e `git diff --check` aprovados. Detalhes e limites em `docs/evidence/ciclo-06-shopping.md`.
- **Correções da revisão:** criticidade usa comparação decimal; compromisso mantém conversão congelada depois de uma nova versão no cadastro; fornecedor confirmado é validado na API e guard SQL; reidratação preserva o indicador crítico.
- **Limitações:** runtime Node abaixo do engine; sem replay local desde vazio; integração não foi rodada integralmente; RLS dos recursos filhos verificada no código/policies e metadados, mas cobertura direta de cada recurso filho/export forjado ainda falta; UI não descobre cancelamento Premium antes do 403.

## Ciclo 07A — proposta por texto no App 01

- **Período:** 2026-10-16.
- **Estado:** Tarefas 1–3 concluídas e revisadas. Tarefa 4 implementada em `e20b634`; em 2026-10-23, a prova T4R runtime em C07-DEV passou 5/5 como `donos_api`, seguida de revisão independente final PASS. Tarefa 5 concluída no commit `bf1e69d`, E2E sintético 8/8, typecheck, build App 01 e revisão independente PASS. Tarefa 6: gates locais aprovados em 2026-10-23 (unitários 184/184, integrações em memória 17/17, E2E mockado 8/8, typecheck, lint, três builds diretos e diff check), seguida de revisão independente estática PASS. T4R/T6 em commits próprios `16ea596`/`b1c145d`; [PR draft #7](https://github.com/makollykalk/Donos_next/pull/7) aberto contra a base do Ciclo 06. Evidências: [T5](evidence/ciclo-07a-task-5.md), [T6](evidence/ciclo-07a-task-6.md).
- **Decisões aprovadas:** uma ação e um insumo por proposta; medidor/entitlement `ai_text_whatsapp` no protótipo sem WhatsApp; extrator determinístico apenas em desenvolvimento/testes; confirmação explícita e movimento transacional.
- **Implementação Tarefa 1:** contratos e domínio puro, commits `72625a6` a `9dc0f20`; revisão round 2 sem achados Important/Critical. `pnpm test:unit` 173/173, `pnpm typecheck` e `git diff --check` passaram. Naquele checkpoint, o frontend ainda não havia começado; a Apple Design skill foi aplicada na Tarefa 5.
- **Migrations Tarefa 2:** `20261016190345_cycle07_ai_text_proposals` e `20261016190427_cycle07_ai_proposal_reservation_fk_index`, aplicadas somente ao Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`, alvo autorizado para migrations aditivas C07 e testes sintéticos. Commit local `4fc3a31`. Proibidos reset, produção, legado, deploy e integrações pagas.
- **Verificação Tarefa 2:** `pnpm test:unit` 24 arquivos/178 testes; integrações `ai-proposal-schema` e `ai-text-tenant-security` 2/2; guarda de alvo 5/5; `pnpm typecheck`, TypeScript dos testes e `git diff --check` passaram. Revisão independente sem bloqueadores; advisor sem FK C07 sem índice. Evidência em [Ciclo 07A Tarefa 2](evidence/ciclo-07a-task-2.md).
- **Tarefa 4:** `confirmProposal` e rota explícita implementadas; chamadas de recebimento/baixa, liquidação de uso, terminalização e auditoria recebem o mesmo `Tx`. A T4R passou 5/5 no PostgreSQL DEV autorizado. Testes focados 17/17, unitários 180/180, `pnpm typecheck`, TSC dos testes e `git diff --check` passaram com Node portátil v24.22.1. Revisão independente final PASS após reforçar comparação de estado de uso/quota em falha de saldo e documentar settle idempotente no rollback. Ver [evidência da Tarefa 4](evidence/ciclo-07a-task-4.md).
- **Limitações e próximo passo:** replay desde DB local vazio indisponível; testes T2 não fazem referência comportamental entre resultados de locais diferentes, embora FKs compostas e metadata sejam verificadas; `reconciliation_required` pode reter dados estruturados indefinidamente se o dono não resolver e exige acompanhamento operacional. T5/T6 têm E2E mockado; T6 não repetiu PostgreSQL, e não prova RLS/Auth/provedor/WhatsApp. Queda abrupta entre dispatch e conclusão da extração segue sem mecanismo persistente de recuperação e requer desenho operacional antes de piloto. Aguardar revisão pós-correção e preparar commits/PR; sem merge/deploy ou próxima modalidade.
- **Spec:** `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md`; **plano TDD:** `docs/superpowers/plans/2026-10-16-ai-text-in-app.md`; **ADR:** `docs/adr/0006-ai-text-in-app.md`.

## Ciclo 04 — locais de estoque e auditoria física

- **Período:** 2026-10-15 a 2026-10-16.
- **Estado:** PR #4 foi merged na branch do Ciclo 03; ver commit de merge `c0b1902` e histórico posterior. Sem deploy.
- **Decisões:** movimentos dos itens contados bloqueados; locais reais particionam estoque; valor positivo sem custo médio exige valor total e confirmação do dono; Supabase DEV hospedado autorizado.
- **Migrations DEV:** `20261016030907_stock_locations_audit`, `20261016122412_cycle04_count_adjustment_average_guard`, `20261016122802_cycle04_location_foreign_key_indexes`, `20261016122959_cycle04_count_location_and_observation_guards`, `20261016131804_cycle04_restaurant_default_location_guard`, `20261016133113_cycle04_location_count_archive_lock`.
- **Evidência:** `docs/evidence/ciclo-04-stock-locations-audit.md`.

## Ciclos anteriores

Consulte `docs/evidence/ciclo-01.md`, `docs/evidence/ciclo-02-inventory.md` e `docs/evidence/ciclo-03-recipes-yield.md`.
