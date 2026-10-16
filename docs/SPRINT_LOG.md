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
- **Estado:** design/spec aprovada pelo fundador; plano TDD concluído e aguardando revisão humana; implementação não iniciada.
- **Decisões aprovadas:** uma ação e um insumo por proposta; medidor/entitlement `ai_text_whatsapp` no protótipo sem WhatsApp; extrator determinístico apenas em desenvolvimento/testes; confirmação explícita e movimento transacional.
- **Pendências:** revisar/aprovar plano e política proposta (apagar proposta estruturada 30 dias após estado terminal; abertas expiram 30 dias após criação); comprovar DB local descartável antes de testes de integração; não há autorização C07 para Supabase remoto.
- **Spec:** `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md`; **plano TDD:** `docs/superpowers/plans/2026-10-16-ai-text-in-app.md`; **ADR:** `docs/adr/0006-ai-text-in-app.md`.

## Ciclo 04 — locais de estoque e auditoria física

- **Período:** 2026-10-15 a 2026-10-16.
- **Estado:** PR #4 foi merged na branch do Ciclo 03; ver commit de merge `c0b1902` e histórico posterior. Sem deploy.
- **Decisões:** movimentos dos itens contados bloqueados; locais reais particionam estoque; valor positivo sem custo médio exige valor total e confirmação do dono; Supabase DEV hospedado autorizado.
- **Migrations DEV:** `20261016030907_stock_locations_audit`, `20261016122412_cycle04_count_adjustment_average_guard`, `20261016122802_cycle04_location_foreign_key_indexes`, `20261016122959_cycle04_count_location_and_observation_guards`, `20261016131804_cycle04_restaurant_default_location_guard`, `20261016133113_cycle04_location_count_archive_lock`.
- **Evidência:** `docs/evidence/ciclo-04-stock-locations-audit.md`.

## Ciclos anteriores

Consulte `docs/evidence/ciclo-01.md`, `docs/evidence/ciclo-02-inventory.md` e `docs/evidence/ciclo-03-recipes-yield.md`.
