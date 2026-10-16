# Plano TDD — Ciclo 04: locais de estoque e auditoria física

**Status:** aprovado pelo usuário; execução concluída e verificada no Supabase DEV hospedado em 2026-10-16; sem produção. Evidências em `docs/evidence/ciclo-04-stock-locations-audit.md`.
**Meta:** implementar a spec aprovada do Ciclo 04 sem alterar produção ou legado.
**Spec:** `docs/superpowers/specs/2026-10-15-stock-locations-audit-design.md`
**Prompt:** `prompts/04-AUDITORIA.md`
**Branch:** `codex/ciclo-04-stock-locations-audit`, criada a partir do trabalho do Ciclo 03.
**Decisões do dono:** bloquear movimentos de itens em contagem; criar locais reais e particionar saldos/movimentos; exigir valor total informado e confirmado para divergência positiva sem custo médio.

## Objetivo e arquitetura

Adicionar locais físicos por unidade como dimensão real de saldo, ledger, recebimento, estorno e custo de ficha. Uma sessão aberta congela os itens e saldos de corte de um local e impede movimentos conflitantes no banco até fechamento ou cancelamento. O fechamento grava ajustes compensatórios imutáveis e auditoria numa transação; o cancelamento não altera estoque. A validação de tenant e unidade ocorre na API, em constraints compostas e em RLS.

Fluxo de dependências: preflight de base e ambiente isolado → contratos e fixtures → migration aditiva/backfill → domínio e repositórios de local/estoque → compras e reversões → custo de ficha/snapshots → serviço/API da contagem → UI e impressão → revisão independente → gates finais. O coordenador mantém contratos, migration, locks, transações e integração. O agente principal responde pela integração e pelo resultado final.

## Stack e restrições globais

- Stack existente do monorepo: TypeScript, pnpm, Zod, PostgreSQL/Supabase, React e Playwright; nenhuma dependência nova planejada.
- Dinheiro e quantidades continuam em strings decimais / `numeric` e primitivas exatas já existentes; nenhum cálculo crítico com `number` de ponto flutuante.
- Append-only para ledger e evidências; correções por compensação, sem UPDATE direto de saldo ou histórico.
- Nada de deploy, legado, domínio, cobrança, integração paga, WhatsApp ou bancos de produção.
- Cada microtarefa segue teste primeiro: adicionar teste específico, executar e confirmar falha esperada, implementar o menor passo, reexecutar teste e regressões afetadas, registrar saída real e fazer commit pequeno.
- Exceção autorizada pelo usuário em 2026-10-15: usar o projeto Supabase DEV hospedado identificado pelo `projectRef` em `.local/dev.json` para migration/integration. A configuração documenta `SUPABASE_MODE=cloud-dev`; não usar `db reset --linked`, `db push` contra outro ref, deploy ou qualquer projeto de produção. Antes de cada operação remota, conferir que o project ref ativo corresponde ao DEV autorizado, revisar SQL da migration e limitar alterações ao escopo aditivo aprovado. O segredo nunca deve aparecer em logs/saídas.
- Antes de codificar, confirmar estado/base do PR do Ciclo 03 e a relação entre branches. Não reescrever commits do ciclo anterior; se a base exigir mudança, pedir revisão deste plano.

## Interfaces e arquivos-alvo

### Contratos

Coordenador altera `packages/contracts/src/inventory.ts`, `packages/contracts/src/inventory-schemas.ts`, `packages/contracts/src/recipes.ts`, `packages/contracts/src/recipe-schemas.ts` e `packages/contracts/src/index.ts`.

Adicionar `StockLocation`/DTO, `locationId` em saldo, movimentos, recebimentos, baixas, estornos e consultas de extrato; acrescentar `COUNT_ADJUSTMENT`. Criar contratos para sessão, item, observação de recontagem, abertura, registro/recontagem, validação, revisão, fechamento, cancelamento e relatório. Valores monetários e quantidades são strings. O custo de receita recebe `locationId` obrigatório e o DTO devolve o mesmo local. IDs/versões do tenant não são confiados ao payload sem validação no contexto.

Schemas devem rejeitar número JSON para campos financeiros, valor de ajuste sem motivo/confirmacão exigida, `locationId` ausente em comandos que o exigem e estados inválidos. Separar comandos de dono e leituras de relatório. Não aceitar `organization_id` arbitrário como prova de autorização.

### Banco e repositórios

Coordenador é dono de migration, funções/triggers, RLS, locks e repositórios. Alvos principais:

- Migration aditiva `supabase/migrations/<timestamp>_stock_locations_audit.sql`.
- `packages/db/src/inventory-balance-repository.ts`, `inventory-ledger-repository.ts`, `inventory-read-repository.ts`, `inventory-catalog-repository.ts`, `purchase-repository.ts`, `audit-repository.ts`, `packages/db/src/index.ts`.
- Novos repositórios para locais e sessões/itens de contagem em `packages/db/src/stock-location-repository.ts` e `packages/db/src/inventory-count-repository.ts`, exportados no índice.
- `packages/domain-core/src/restaurants.ts` cria o local padrão na mesma transação de criação da unidade; atualizar `packages/domain-inventory/src/types.ts`, `valuation.ts`, `issues.ts`, `reversals.ts` apenas onde a dimensão local altera interfaces/comandos.
- API: `apps/api/src/routes/inventory.ts`, novo `apps/api/src/routes/inventory-counts.ts`, `apps/api/src/services/inventory.ts`, `inventory-types.ts`, novos `inventory-counts.ts`/`inventory-count-types.ts`, `apps/api/src/routes/recipes.ts`, `apps/api/src/services/recipes.ts`, `recipe-types.ts`, `apps/api/src/app.ts`.

Migration cria locais e contagem com FKs compostas; um local padrão ativo por unidade; índices/constraints de unicidade; RLS ENABLE+FORCE e grants mínimos. Backfill associa todas as linhas existentes ao local padrão por unidade sem trocar IDs, sequência, razões/valores, relações de estorno, recebimentos, histórico de preços ou snapshots de receitas. Ajustes usam ledger existente, incluindo snapshots consistentes e referência à sessão/item. Um trigger/guard no banco bloqueia mudanças para item/local com sessão aberta inclusive fora da API.

O helper de integração não oferece harness aparente de migration histórica. Propor e implementar como parte do checkpoint de migration um teste determinístico em banco descartável com fixture pré-migration e comparação de invariantes antes/depois; preferir runner já existente no repositório. Não fabricar prova com banco já migrado nem executar reset contra destino incerto.

### UI

- `apps/estoque/src/inventory/InventoryWorkspace.tsx`, `inventory-client.ts`, formulários de recebimento/baixa e `StockLedgerView`: seleção/contexto explícito do local.
- Novos módulos sob `apps/estoque/src/inventory/counts/` para workspace, formulário/contagem cega, revisão e resumo; novo componente de relatório imprimível com CSS `@media print`/`@page`, sem dependência PDF.
- `apps/estoque/src/recipes/recipes-client.ts`, `RecipesWorkspace.tsx`, `RecipeCostPanel.tsx`: custo associado ao local selecionado e sem fallback.
- Exibir campos teóricos somente quando a fase e autorização permitem; componente de impressão cega não deve renderizar conteúdo teórico escondido por CSS.

## Tarefas e commits

### Tarefa 0 — preflight, branch e banco isolado (coordenador)

Confirmar `git status`, branch, base/remote e estado do PR/branch Ciclo 03. Revisar `tests/helpers/local-db.ts`, `.local/dev.json` apenas para saber como o harness resolve o destino, sem imprimir segredos. Identificar comando local de reset/start e provar host/database local descartável. Nenhuma migration ou integração roda até esse gate ser demonstrado. Preservar branch e commits do Ciclo 03.

**Checkpoint:** registrar base/estado observado e comando isolado seguro; se não disponível, parar e ajustar infraestrutura/plano antes do DDL. Sem commit de produto.

### Tarefa 1 — testes de contrato e fixtures explícitas

**Teste primeiro:** atualizar `tests/unit/inventory-contracts.test.ts` e `tests/unit/recipe-contracts.test.ts`; adicionar `tests/unit/inventory-count-contracts.test.ts`. Cobrir locationId obrigatório, IDs malformados, dinheiro/quantidade como string, motivo/confirmação, transições permitidas, blind mode e custo de receita por local. Confirmar falha esperada antes de schema/implementação.

**Implementar:** contratos/schemas acima. Atualizar `tests/helpers/inventory-fixtures.ts` para expor o local default e suportar segundo local; `tests/helpers/inventory-operations.ts` deve exigir/passar `locationId` explicitamente, não selecionar implicitamente um local em operações de teste.

**Verificar/commit:** testes unitários de contratos e typecheck do workspace. Commit `feat(contracts): define stock location and count APIs`.

### Tarefa 2 — migration, backfill, constraints e RLS

**Teste primeiro:** ampliar `tests/integration/inventory-schema.test.ts`, `recipe-schema.test.ts`, `inventory-ledger-grants.test.ts`, `inventory-ledger-integrity.test.ts`; cobrir local default por unidade, unicidade do default, FKs compostas contra unidade/tenant/local, FORCE RLS/grants, guard do ledger e proibição de UPDATE/DELETE. Adicionar caso de backfill antes/depois com fixture pré-migration e invariantes de movimento/saldo/recebimento/preço/estorno/snapshot.

**Implementar:** migration definida acima; manter FKs e triggers consistentes com relação composta; localização de preço preserva local do recebimento. `packages/domain-core/src/restaurants.ts` cria local padrão na transação de nova unidade. Snapshot antigo de receita aponta ao local default sem gerar snapshots retroativos para locais novos.

**Verificar/commit:** migration/reset e testes schema/backfill só no destino isolado provado na Tarefa 0; checar invariantes/contagens e diffs das linhas legadas. Commit `feat(db): add stock locations and audit schema`.

### Tarefa 3 — partição do saldo e movimentos existentes

**Teste primeiro:** adaptar/add testes em `tests/integration/inventory-canonical.test.ts`, `inventory-api.test.ts`, `inventory-concurrency.test.ts`, `inventory-idempotency.test.ts`, `inventory-reversals.test.ts`, `inventory-rollback.test.ts`, `inventory-zero-balance.test.ts`, `inventory-tenant-security.test.ts`, `purchase-receipts.test.ts`, `purchase-price-history.test.ts`. Reprovar cross-location e cross-tenant IDs; provar dois locais com médias independentes; reversão herda origem; repetição idempotente e falha transacional não deixam saldo, ledger, preço ou chave parcial.

**Implementar:** repositórios/domínio/API de locais; tornar locationId obrigatório em recibo/baixa/consulta; todos os locks, leituras e idempotency keys abrangem `(organization_id, restaurant_id, location_id, ingredient_id)`. Arquivar local com saldo ou contagem aberta é recusado; troca do default é transacional; novo ingrediente/local materializa saldos zero nas combinações ativas.

**Vetores obrigatórios:** em cada local isolado, 10 kg×R$20, baixa 2 kg, entrada 7 kg×R$25 = 15 kg, valor R$335, médio R$335/15. As mesmas operações em A não alteram saldo/média de B.

**Verificar/commit:** alvos de inventário e compras, concorrência, idempotência, rollback e canônico; commit `feat(inventory): scope stock movements by location`.

### Tarefa 4 — custo corrente e snapshots de receita por local

**Teste primeiro:** adaptar `tests/integration/recipe-commands.test.ts`, `recipe-cost-graph.test.ts`, `recipe-tenant-security.test.ts`, `recipe-version-integrity.test.ts` e `tests/e2e/recipe-flow.spec.ts`. Cobrir custo por média de A e B, ausência de média sem fallback, `locationId` omitido, snapshot por local ativo na validação, incompletude não gera snapshot autoritativo, novo local sem snapshot retroativo e proteção cruzada.

**Implementar:** GET do custo exige e valida locationId dentro do contexto da unidade; grafo/saldos são lidos num mesmo snapshot de banco. DTO e fontes carregam local. Evento de validação continua global e único; snapshots históricos atribuídos ao default na migration, snapshots novos são por local.

**Verificar/commit:** testes de domínio/API de receita e regressão de schema; commit `feat(recipes): scope current cost snapshots by location`.

### Tarefa 5 — serviço transacional e estados de contagem

**Teste primeiro:** criar `tests/integration/inventory-counts.test.ts` e estender `inventory-concurrency.test.ts`, `inventory-ledger-integrity.test.ts`, `inventory-tenant-security.test.ts`. Casos: abrir uma sessão/local apenas, snapshot de todos os insumos ativos inclusive saldo zero, corte imutável, modo cego, recontagem preserva observação/sequência, estados e progresso, fechar incompleto negado, cancelar sem movimento, fechar completo cria só ajustes divergentes, rollback total em falha, idempotência, local/tenant forjado negado.

**Implementar:** serviços/repos novos. Abertura e movimentos compartilham ordem determinística de locks por chave local/insumo; uma sessão aberta bloqueia no DB guard. Fechamento confirma cada item validado, grava `COUNT_ADJUSTMENT` + sessão + auditoria atomicamente. Positivo usa custo médio quando existente; saldo zero sem média exige total informado e confirmação explícita do dono/motivo quando zero. Negativo usa média vigente e saldo final nunca fica negativo. Não contar apenas por validação API.

**Verificar/commit:** testes Postgres reais contra ambiente isolado; commit `feat(inventory): add transactional count audit service`.

### Tarefa 6 — rotas, autorização e relatórios

**Teste primeiro:** `tests/integration/inventory-counts-api.test.ts`, `inventory-tenant-security.test.ts`, e cobertura relatório em novo `inventory-count-report.test.ts`. Validar titularidade servidor-side, claims/contexto, permissão exclusiva do proprietário, IDs locais/unidades/tenants forjados, blind report sem teor, relatório final consistente, ausência de dados de tenant B em resposta/exportação A.

**Implementar:** `inventory-counts.ts` API e rotas, listagem/detalhe/relatório escopados; validar organização/unidade/local em sessão do dono e RLS. A resposta de impressão cega não inclui teor/valor em payload nem DOM; relatório final é consulta autorizada e read-only. Ajustar erros de concorrência e conflicts ao padrão existente.

**Verificar/commit:** integração/API/RLS e inspeção de payloads; commit `feat(api): expose owner-scoped inventory audits`.

### Tarefa 7 — interface mobile-first e impressão

**Trabalho paralelo permitido após congelamento de rotas e DTOs:** agente A pode editar apenas `apps/estoque/src/inventory/counts/**` (workspace/formulários); agente B apenas componente/CSS de relatório imprimível dedicado. Nenhum agente mexe no shell, contratos, API, migration ou banco compartilhado. Coordenador integra em `InventoryWorkspace.tsx` e cliente.

**Teste primeiro:** novo `tests/e2e/inventory-audit-flow.spec.ts` cobre seleção de local, abrir sessão, imprimir folha cega, inserir contagens, revelar divergências após captura, revisar/recontar, valor positivo sem média exigindo confirmação, cancelar e fechar confirmado; provar que a troca de contexto limpa estado e que tenant B não abre IDs A. Atualizar `inventory-flow.spec.ts`, `inventory-context.spec.ts` e `recipe-flow.spec.ts` para seleção explícita de local.

**Implementar:** UI descrita nos alvos, sem guardar teor no markup cego; acessibilidade com labels/erros/foco/status, confirmação explícita, progresso e impressão browser Save as PDF. Seletores e relatórios respeitam unidade/local.

**Verificar/commit:** E2E alvo, typecheck/lint/build; commits pequenos `feat(estoque): add physical count workflow` e `feat(estoque): add printable blind count sheet` se a separação de arquivos permitir.

### Tarefa 8 — revisão independente e gates de encerramento

Agente independente revisa somente diff final com foco em segurança multi-tenant (API/RLS/FKs/relatórios), precisão de valores/quantidades (razões e arredondamento) e concorrência/locks/rollback. Coordenador resolve achados bloqueadores por TDD; achados restantes viram limitações explícitas. Revisão não substitui testes.

Rodar e registrar saídas reais: `pnpm test:unit`; suites afetadas de integração por arquivo; `pnpm test:integration`; `pnpm test:e2e -- inventory-audit-flow`; `pnpm typecheck`; `pnpm lint`; `pnpm build`; `git diff --check`. Confirmar scripts disponíveis no `package.json`; todos os testes de DB usam somente destino isolado. Comparar regressões com o baseline registrado (Cycle 03 integration tinha timeout antigo; separar falhas/timeout em vez de afirmar suíte verde).

**Commit final:** `docs: record cycle 04 verification evidence`, com comandos, contagens, falhas e estado de revisão. Abrir/atualizar PR apenas após validação e revisão; não mesclar nem publicar/deploy. Parar para revisão humana antes de qualquer ciclo seguinte.

## Falhas esperadas e gates de parada

- Não há prova de banco descartável: não aplicar DDL; resolver ambiente/plano primeiro.
- Backfill altera ID, quantidade, valor, sequência, referência de estorno, origem de compra ou snapshot: bloquear migration e preservar dados antes de prosseguir.
- Movimento atravessa local ou grava durante sessão aberta: bloquear checkpoint de estoque; corrigir concorrência no banco, não só na API.
- Falha parcial deixa movimento, preço, sessão, ajuste, auditoria ou idempotency key órfã: corrigir atomicidade antes de UI.
- Qualquer cálculo financeiro usa float, mistura médias de locais ou infere custo faltante: bloquear domínio/serviço.
- RLS/grants permitem cruzamento por organização/unidade/local: bloquear integração e revisão.
- Blind mode inclui teor/valores no payload ou DOM: bloquear E2E/UI.
- PR/base do Ciclo 03 exige reescrita de histórico: parar e pedir decisão antes de alterar histórico compartilhado.

## Foco da revisão do plano

1. Aprovar o escopo da partição real de todos os saldos/movimentos e da migration/backfill histórica.
2. Confirmar que o método planejado para testar backfill será executado somente em banco descartável.
3. Revisar chave de locks/ordem comum entre abertura, fechamento e movimentos e a cobertura de guard no banco.
4. Conferir a regra de snapshots de receita por local e o valor total confirmado para positivo sem média.
5. Confirmar a execução em fases e a fronteira dos agentes; contratos, migrations e integração continuam sob o coordenador.
