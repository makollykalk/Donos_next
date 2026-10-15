# Inventory valuation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Coordenador é dono de contratos, migrations, RLS e integração; subagentes têm posse de arquivos disjuntos. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar somente Estoque Base do Ciclo02, com canônico335/15 comprovado no PostgreSQL e fluxo mínimo no App01.

**Architecture:** Motor puro com coeficientes bigint; API central existente executa comandos em transações contextualizadas; ledger imutável e projeção atômica no schema core privado. Fornecedor é organizacional; insumo, recebimento, saldo e movimento são locais à unidade.

**Tech Stack:** Node24.22.0, pnpm11.25.0, TypeScript6.0.3, pg8.23.1, Zod4.6.7, Fastify5.12.7, React19.3.1/Vite8.3.4, PostgreSQL17 do DEV autorizado, Vitest5.0.4/Playwright1.64.1. Nenhuma dependência financeira nova.

**Spec:** [2026-10-15-inventory-valuation-design.md](../specs/2026-10-15-inventory-valuation-design.md), com [ADR0003](../../adr/0003-inventory-valuation.md), V3 e T-03..T-10. **Plano proposto, não aprovado; nenhuma tarefa abaixo executada nesta rodada.**

## Global Constraints

- Não iniciar código enquanto o Ciclo01 não estiver fechado e revisado.
- Coordenador possui migrations, RLS, contratos e integração. Motor puro e revisão de testes podem ser delegados em arquivos exclusivos; UI somente após checkpoint de contrato/API, sem banco mutável compartilhado entre agentes.
- API e frontends locais. DB/Auth somente DEV novo autorizado `kfthwjrvgslnsjigqnyc`, com TLS validado, ou Supabase local expressamente configurado. Nunca Donos-Saas, don_madruga ou outro projeto.
- Dados sintéticos; runtime donos_api NOBYPASSRLS/não owner. Nenhuma credencial administrativa no app/browser/Git.
- Nenhum number/parseFloat/Number/toFixed nos cálculos de quantidade, preço ou valor. Quantidade6 casas, valor12 casas, half-even explícito, média econômica racional e baixas cumulativas.
- Mesmo BEGIN/COMMIT/conexão para chave idempotente, ledger, projeção, preço e auditoria. Nada de provider/rede dentro da transação ou retry.
- Somente catálogo/fornecedor, recebimento, saída, saldo/extrato/preço histórico e estorno conservador. Sem lista Premium, IA, pedido genérico, fichas, preço de venda, Storage ou deploy.
- DEC-001..DEC-013 permanecem inalteradas. Estorno tardio não implica revaloração automática.

## Review Focus

1. Fragmentar uma baixa com dízima não pode criar deriva acumulada ou deixar resíduo ao zerar — Tasks2/6.
2. Rascunho antigo conserva fator de embalagem/preço, mas não permite receber insumo/fornecedor arquivado nem de outra unidade — Tasks4/5.
3. Duas compras multi-item em ordem inversa e duas primeiras entradas não perdem saldo nem ficam em deadlock permanente — Tasks5/6.
4. Estorno após sucessor deve falhar inteiro, e estorno elegível restaura a base cumulativa sem retroceder sequência — Task7.
5. Formulário A1 aberto, resposta tardia ou timeout após commit não pode escrever em A2 nem duplicar movimento — Tasks5/8.

---

## Preflight e comandos

Usar o runtime fixado, sem wrapper global pnpm que nesta máquina invoca outro Node. Exemplo PowerShell já compatível com a instalação atual, conferir caminhos antes de uso:

```powershell
$taskNode = Join-Path (Get-Location) '.tools/node-v24.22.0-win-x64/node.exe'
$taskPnpm = 'C:/Users/Matheus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs'
$env:PATH = (Split-Path $taskNode) + ';' + $env:PATH
function dp { & $taskNode $taskPnpm @args }
```

`dp` abaixo significa essa invocação; em outra máquina usar Node/pnpm nos mesmos pins. Teste com status diferente de zero bloqueia o checkpoint. Import ausente comprova red de wiring; após o harness existir, comprovar também red comportamental antes da correção. Não contar falha de rede/instalação como teste funcional red.

Migrations serão geradas **apenas depois da aprovação** pela CLI fixada:

- `dp exec supabase migration new inventory_schema` → alias M_INV_SCHEMA.
- `dp exec supabase migration new inventory_integrity` → alias M_INV_INTEGRITY.

Antes de escrever SQL, registrar neste plano e em evidências os caminhos exatos retornados pela CLI. Se aplicar por MCP ao DEV, reconciliar o nome local à versão realmente retornada no histórico, sem reescrever migration aplicada. Esse timestamp gerado é a única resolução posterior de caminho permitida; os demais caminhos abaixo são exatos. Nenhuma migration Inventory foi criada no planejamento.

## Responsabilidades e paralelismo

| Responsável | Posse exclusiva / momento |
|---|---|
| Coordenador | contracts, domain-inventory/src/types.ts, domain-purchases, db/repositórios, migrations, API/services/inventory.ts, configuração raiz, shared OwnerApp/API errors e integração |
| Agente motor puro | domain-inventory/src/decimal.ts, units.ts, valuation.ts e testes unitários correspondentes, depois da Task1 |
| Agente casos de teste/revisor | Análise independente em leitura; depois pode executar testes serializados sem modificar SQL/contratos nem disputar fixtures |
| Agente UI | apps/estoque/src/inventory/**, App.tsx e testes browser definidos, depois do checkpoint Task7 e slot coordenador; não altera auth/contratos |

Tasks2 e3 podem ocorrer em paralelo após Task1: motor só escreve arquivos puros; coordenador é o único usuário do banco mutável. API/comandos seguem depois de ambos passarem. UI não começa durante indefinição de schema/DTO. Qualquer contrato alterado exige pausa/sincronização do consumidor.

## Task 0 — Fechar core e obter aprovação de Inventory

**Modify:** `docs/evidence/ciclo-01.md` durante fechamento já autorizado; documentos Inventory/ADR0003 se revisão exigir. Não incluir código Inventory nesta task.

- [ ] Confirmar Get-Location, top-level, remote, branch e git status. Recusar escrita se raiz/remote for legado. Preservar todas as alterações atuais de core; não fazer reset/checkout que as descarte.
- [ ] Resolver no Ciclo01 o E2E pendente de contexto expirado, concluir revisão dos fixes de metering e executar sua suíte final real. Conferir que a prova chamada “cancelamento” exercita status cancelado, e não só ausência de entitlement. Atualizar evidência, commits/PR do core, riscos e desvios de reprodução local. Não atribuir resultados de core ao estoque.
- [ ] Obter revisão humana do core e aprovação conjunta deste plano/spec/ADR0003, incluindo recebimento em duas etapas, fornecedor organizacional, política decimal e limite de estorno. A mensagem que pediu planejamento não aprova execução.
- [ ] Criar branch `codex/ciclo-02-inventory` a partir do commit core aprovado; conferir status e isolamento antes de worktree se necessário. Não herdar mudanças não revisadas. Registrar SHA base e caminho da raiz.

**Checkpoint0:** core comprovado, base conhecida e aprovação Inventory registrada. Sem isso, entregar só planejamento.

## Task 1 — Congelar contratos e tipos financeiros

**Create:** `packages/contracts/src/inventory.ts`, `packages/contracts/src/inventory-schemas.ts`; `packages/domain-inventory/package.json`, `packages/domain-inventory/tsconfig.json`, `packages/domain-inventory/src/types.ts`; `apps/api/src/services/inventory-types.ts`; `tests/unit/inventory-contracts.test.ts`; `docs/evidence/ciclo-02-inventory.md`.

**Modify:** `packages/contracts/src/index.ts`, `packages/contracts/src/errors.ts`, `tsconfig.json`, `tsconfig.tests.json`, `vitest.config.ts`, `vitest.integration.config.ts`, `pnpm-lock.yaml` somente para os novos workspaces. Coordenador define tudo antes de delegar motor.

**Interfaces:** tipos/DTOs da spec seção7. Fixar `MovementSnapshot` com id/sequence/kind/ingredientId/before/after/origin; `MovementCalculation` com before/after/deltas/averageCostRatio/policyVersion. `ConversionSnapshot` contém ingredientId, baseUnit, allowFractionalCount, inputUnit, factorToBase e conversionId/version nullable. Exportar `InventoryService` em inventory-types.ts com as assinaturas completas da tabela da spec. Leitura recebe CatalogQuery/SequenceQuery validadas, sem key.

- [ ] Escrever `strict input and numeric envelopes`: owner/tenant/value/sequence extras negados; quantity `0.0000001` negada; quantidade0 para movimento negada; price0 sem motivo negado; value com26 inteiros aceito no schema próprio sem alterar DecimalStringSchema do core. Receipt com0/51 linhas ou insumo duplicado negado.
- [ ] Rodar `dp exec vitest run tests/unit/inventory-contracts.test.ts`; registrar red esperado de interfaces/validação ausentes.
- [ ] Implementar schemas estritos e tipos. Adicionar códigos de erro da spec e schema para receive com literaltrue. Names1..120, contact≤240, reason1..240, reference≤120; documentDate é data civil válida YYYY-MM-DD, separada de ordem de estoque.
- [ ] Reexecutar esse teste, `dp typecheck`, `dp lint`. Confirmar que código core permanece compatível; nenhuma dependência nova nem SQL.
- [ ] Commit explícito dos arquivos da task: `feat: define inventory commands and exact numeric contracts`.

**Checkpoint1:** publicar DTOs congelados para agente do motor; interfaces puras não importam db/Auth/UI. Registrar a proposta aprovada da ADR0003 como decisão de implementação; não marcar DEC nova.

## Task 2 — Motor puro exato (agente especializado)

**Create:** `packages/domain-inventory/src/decimal.ts`, `packages/domain-inventory/src/units.ts`, `packages/domain-inventory/src/valuation.ts`, `packages/domain-inventory/src/index.ts`; `tests/unit/inventory-decimal.test.ts`, `tests/unit/inventory-units.test.ts`, `tests/unit/inventory-valuation.test.ts`.

**Consumes:** ValuationState, MovementSnapshot/Calculation, ConversionSnapshot da Task1.
**Produces:** `roundHalfEven(n:bigint,d:bigint):bigint`; codecs parse/format de coeficientes; calculateAcquisitionValue/normalizeQuantity/calculateReceipt/calculateIssue/calculateEligibleReversal das assinaturas da spec. Não importar db nos três arquivos puros; consumidores de UI não importam o índice deste pacote.

- [ ] Escrever teste canônico: receber10/200, baixar2 produz deltaValue−40 e Q8/V160, receber7/175 produz Q15/V335 e razão335/15. Assert estados de referência e sequências em strings.
- [ ] Escrever vetores de cinco movimentos T-04 da spec; fragmentar saída de estoque Q3/V1 em0.1 atézerar versus uma saída inteira. A soma dos custos deve ser1 exatamente, sem resíduo. Testar empates `roundHalfEven(5n,2n)=2n` e `(7n,2n)=4n`, sinais, limite e denominadorzero rejeitado.
- [ ] Escrever conversões g/kg, mL/L e caixa5kg; fator errado/zero/dimensão incompatível/quantidade inexata rejeitados. Embalagem versionada recebida antes não muda ao trocar snapshot posterior.
- [ ] Escrever estorno de última saída restaura Q/V/Qref/Vref/x anteriores com sequence atual+1; sucessor e REVERSAL como origem negados. Entrada positiva que vira valorzero gera underflow; estoque gratuito explícito continua válido.
- [ ] Rodar `dp exec vitest run tests/unit/inventory-decimal.test.ts tests/unit/inventory-units.test.ts tests/unit/inventory-valuation.test.ts`; registrar red comportamental antes dos corpos finais.
- [ ] Implementar somente coeficientes BigInt, B(x) cumulativo, limites e formatação. Não instalar decimal.js nem fazer fetch/SQL/relógio. Evitar arredondar quantidade e média intermediária.
- [ ] Reexecutar comando e typecheck/lint. Coordenador/revisor confere que custo de saída é diferença de arredondamentos cumulativos e que erro documentado é por valor, não promessa incorreta de média V/Q constante.
- [ ] Commit: `feat: implement exact cumulative moving average valuation` com esses arquivos.

**Checkpoint2:** motor puro aprovado por vetores. Não conta como prova de T-03 no banco.

## Task 3 — Schema, RLS e integridade (coordenador)

**Create:** M_INV_SCHEMA e M_INV_INTEGRITY nos caminhos gerados; `tests/helpers/inventory-fixtures.ts`, `tests/integration/sql/inventory-fixtures.sql`, `tests/integration/inventory-schema.test.ts`, `tests/integration/inventory-ledger-grants.test.ts`, `tests/integration/inventory-tenant-security.test.ts`.
**Modify:** `tests/helpers/local-db.ts` apenas se necessário para fixture manifest/timeout; `tests/integration/schema.test.ts` para manter assertions explícitas das11 tabelas core e FORCE RLS de todas as tabelas, sem exigir que o total global continue11 após Inventory; `docs/evidence/ciclo-02-inventory.md`.

**Produces:** nove tabelas/domínios/índices/FKs/policies da spec5; helpers invoker de integridade; audit actions locais; `createInventoryFixtures(): Promise<InventoryFixtures>` com logins A/B, A1/A2/C1/B1 e contextos verificados. Fixtures têm organizações sintéticas próprias, distintas do core; papel administrativo só provisiona, nunca comprova isolamento.

- [ ] Confirmar por consulta somente leitura o ref/nome/version e ausência de tabelas Inventory. Rodar schema test antes de M_INV_SCHEMA: falhar por42P01/objetos ausentes, não por credencial/rede.
- [ ] Gerar os dois caminhos pela CLI e registrá-los. Implementar schema sem copiar legado: campos/uniques completos para as FKs org/unit/ingredient, estados e domínios sem coerção de escala. Inserir apenas saldozero inicial; nenhuma seed comercial em migrations.
- [ ] Aplicar schema somente ao DEV autorizado; preparar fixtures através do conector administrativo separado e guardar manifest sem segredo versionado. Helpers criam unidade nova por teste/run via API para não compartilhar saldos. Concessões inventory_core são somente de fixture. Não usar reset/purge do cloud; dados sintéticos append-only podem acumular, registrar isso.
- [ ] Escrever testes SQL com runtime: todas as tabelas FORCE RLS; nenhuma consulta sem contexto; A não vê B/C; contextoA1 não vê A2. FKs rejeitam ingrediente/conversão/item/movimento de outro escopo. Fornecedor A é visível em A1/A2, não C/B.
- [ ] Antes dos triggers finais, escrever e comprovar red: UPDATE isolado da projeção seguido de COMMIT e INSERT de ledger sem projeção não podem confirmar. Implementar M_INV_INTEGRITY com cadeia sob lock, integridade diferida, domínios/faixas/half-even racional e imutabilidade. Confirmar `UPDATE/DELETE/TRUNCATE` de ledger e preço negados; cabeçalho recebido/itens não são editáveis. Nenhum SECURITY DEFINER.
- [ ] Rodar `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-schema.test.ts tests/integration/inventory-ledger-grants.test.ts tests/integration/inventory-tenant-security.test.ts`; PASS com conexões runtime reais e contextos distintos. Testar numeric `0.0000001`, NaN e Infinity por SQL real e rollback após falha.
- [ ] Conferir advisors/grants/default privileges. Reproduzir migrations numa instância descartável quando disponível; no cloud existente não afirmar replay do zero sem fazê-lo. Se gate de reprodução não puder ser cumprido, registrá-lo para revisão, sem trocar por reset remoto.
- [ ] Commit: `feat: add isolated inventory schema and ledger integrity guards`.

**Checkpoint3:** schema e motor puros passaram separadamente. Antes de seguir, ambos estão no mesmo commit base testável. Nada de UI ou movimento de negócio ainda.

## Task 4 — Catálogo, fornecedores e conversões versionadas

**Create:** `packages/db/src/inventory-catalog-repository.ts`, `packages/domain-inventory/src/catalog.ts`, `tests/integration/inventory-catalog.test.ts`.
**Modify:** `packages/db/src/index.ts`, `packages/db/src/audit-repository.ts`, `packages/domain-inventory/src/index.ts`.

**Interfaces:** repositório recebe `(ctx:RestaurantContext,input/ids,tx:Tx)` e devolve DTO validado; `createIngredient`, `patchIngredient`, `createSupplier`, `patchSupplier`, `createConversion` não iniciam transação. `appendInventoryAudit(ctx,event,tx):Promise<void>` exige unidade e action enumerada. Fachada da Task5 fornece auth/entitlement/idempotência e transaction boundary.

- [ ] Escrever testes criação de ingrediente+saldozero sem ledger; base/fração não editáveis; archive/reopen não exclui; supplierA compartilhado A1/A2 e isoladoC/B. Tentar owner/tenant extras e PATCH de campos vedados.
- [ ] Escrever teste versões de mesma embalagem com fatores5 e4: anterior permanece5; concorrentes geram versões distintas sob lock do insumo; ID de conversão de outro item negado. Rodar teste e registrar FAIL antes de implementar.
- [ ] Implementar repositório/serviços/auditoria com campos em allowlist. Updates parametrizados com SQL estático por campo/combinação, sem chave SQL recebida do usuário. Criação de ingrediente insere saldozero na mesma transação. Nenhum DELETE.
- [ ] Rodar `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-catalog.test.ts` e Tasks2/3 pertinentes. Confirmar banco/ledger após cada teste, typecheck/lint.
- [ ] Commit: `feat: add unit ingredients and organization suppliers`.

## Task 5 — Rascunho e recebimento atômico

**Create:** `packages/domain-purchases/package.json`, `packages/domain-purchases/tsconfig.json`, `packages/domain-purchases/src/receipts.ts`, `packages/domain-purchases/src/index.ts`; `apps/api/src/services/inventory.ts`; `packages/db/src/inventory-balance-repository.ts`, `packages/db/src/inventory-ledger-repository.ts`, `packages/db/src/purchase-repository.ts`; `tests/integration/purchase-receipts.test.ts`, `tests/integration/purchase-price-history.test.ts`, `tests/integration/inventory-canonical.test.ts`, `tests/integration/inventory-idempotency.test.ts`, `tests/integration/inventory-rollback.test.ts`.
**Modify:** manifests/refs/aliases necessários; exports db/inventory; `docs/evidence/ciclo-02-inventory.md`.

**Interfaces:** `createInventoryService(db): InventoryService` vive em apps/api/src/services/inventory.ts e implementa a tabela completa da spec. `createReceipt(...):Promise<ReceiptDetail>`; `receiveReceipt(...,receiptId, {receivedConfirmed:true},key):Promise<ReceiptPosted>`. domain-purchases usa motor/repositórios; domain-inventory nunca importa domain-purchases. A API compõe os dois, sem ciclo de referências TS. Métodos de leitura recebem query em vez de key.

- [ ] Escrever T-09: draft persistido tem0 movimentos,0 preços, saldozero; confirmfalse negado. Escrever recebimento de10kg×20 e histórico do fornecedor, snapshots e custo normalizado. Registrar red funcional com serviço ainda ausente/inoperante.
- [ ] Escrever duplicata paralela/sequencial e body/status original, chave alterada409, segunda confirmação com outro key409; mesma chave emA2 conflita e não retornaA1. Timeout simulado após commit seguido de retry devolve IDs originais. Operação manual não altera usage_ledger nem chama provider/fake; verificar antes/depois no contexto de teste exclusivo.
- [ ] Escrever falhas injetadas após header/primeiro item/movimento/saldo/histórico/auditoria/resposta idempotente. Receipt de2itens: nenhum efeito parcial após qualquer falha; rascunho continua draft. Falha não ocupa chave definitivamente; retry pode concluir. Testar falha no COMMIT por constraint diferida.
- [ ] Implementar fachada com withRestaurantTx→inventory_core→executeIdempotent organizacional. Hash inclui restaurante, DTO, receiptId/operação conforme spec. Repositórios não fazem COMMIT, rollback parcial ou query via pool fora de Tx.
- [ ] Implementar ordem header→fornecedor→ingredientes UUID ordenados→saldos ordenados. Resolver/validar conversão na criação do rascunho e conservar snapshots; revalidar ativo/pertença na efetivação. Uma linha por insumo, máximo50. Preço ausente não vira0; zero explícito exige motivo; encargos desconhecidos negados.
- [ ] Gravar status/ledger/projeção/preços/auditoria/resposta no mesmo commit. Dados de preço original e razão normalizada permanecem depois de editar nome do fornecedor/insumo ou criar nova conversão. Timestamp não ordena custo retroativamente.
- [ ] Rodar `dp exec vitest run --config vitest.integration.config.ts tests/integration/purchase-receipts.test.ts tests/integration/purchase-price-history.test.ts tests/integration/inventory-idempotency.test.ts tests/integration/inventory-rollback.test.ts`. Esperado PASS; T-03 completo aguarda saída Task6.
- [ ] Commit: `feat: receive purchases atomically with immutable supplier prices`.

## Task 6 — Saídas, canônico no banco e concorrência

**Create:** `packages/domain-inventory/src/issues.ts`, `packages/db/src/inventory-read-repository.ts`; `tests/integration/inventory-decimal.test.ts`, `tests/integration/inventory-concurrency.test.ts`, `tests/integration/inventory-conversions.test.ts`, `tests/integration/inventory-zero-balance.test.ts`.
**Modify:** `apps/api/src/services/inventory.ts`, `tests/integration/inventory-canonical.test.ts`, repositórios/exports da Task5.

**Interfaces:** `issue(actor,selection,token,input:IssueInput,key):Promise<MovementResult>` na fachada; cálculos usam calculateIssue. `listBalances/listMovements/listPriceHistory` devolvem DTOs com strings, cursor de sequência/highWatermark; totais calculados por SQL numeric na mesma fotografia da lista.

- [ ] Completar teste T-03 real: após entrada10/200, issue2 deve gravar delta−2/−40 e snapshotQ8/V160/média20; receber7/175 resulta Q15/V335 e razão335/15. Consultar SQL por runtime e comparar deltas/saldo; não basta resultado do JS nem UI22,33.
- [ ] Escrever T-04 com cinco vetores e baixa fragmentada de dízima; oráculo independente SQL por coeficientes/div/mod e half-even, não chamar o mesmo helper JS para esperado. `sum(delta_quantity)=Q` e `sum(delta_value)=V` devem ser exatamente iguais. Todos os números pg permanecem string.
- [ ] Escrever T-06 com duas conexões e barreira: saldo10, duas saídas6 → uma201, outra409 INSUFFICIENT_STOCK, Q4; sem saldo negativo ou evento órfão. Duas primeiras entradas simultâneas e recebimentos multitem com ordem de input inversa preservam todas as linhas e evitam deadlock permanente.
- [ ] Escrever T-07/T-08: conversões corretas e incompatíveis, quantidade abaixo do quantum, un fracionária não autorizada; zerar exatamente e comprar de novo a preço diferente, com nova referência e histórico anterior intacto.
- [ ] Rodar esses testes antes do comando final, registrar RED. Implementar saída sem valor enviado pelo cliente, custo cumulativo e snapshots. Não adquirir locks fora da ordem; retries somente40001/40P01, atéduas novas tentativas. Após exaustão503 sem sucesso parcial.
- [ ] Rodar `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-canonical.test.ts tests/integration/inventory-decimal.test.ts tests/integration/inventory-concurrency.test.ts tests/integration/inventory-conversions.test.ts tests/integration/inventory-zero-balance.test.ts`; typecheck/lint. SQL real PASS é obrigatório.
- [ ] Commit: `feat: issue stock with exact valuation and concurrency protection`.

## Task 7 — Estorno conservador e API protegida

**Create:** `packages/domain-inventory/src/reversals.ts`, `apps/api/src/routes/inventory.ts`; `tests/integration/inventory-reversals.test.ts`, `tests/integration/inventory-api.test.ts`; `tests/unit/inventory-api-errors.test.ts`.
**Modify:** `apps/api/src/services/inventory.ts`, exports; `apps/api/src/app.ts`, `apps/api/package.json`, `apps/api/tsconfig.json`, `packages/auth-client/src/api-client.ts` (coordenador, antes de UI).

**Interfaces:** `reverseIssue(...,movementId,input:ReversalInput,key):Promise<MovementResult>` e `reverseReceipt(...,receiptId,input,key):Promise<{reversalId:string;movements:MovementResult[]}>`. Registrar rotas e statuses exatos da spec7. Reusar Auth/contexto core, não criar middleware tenant paralelo.

- [ ] Escrever estorno de última saída e recebimento, com restauração Q/V/Qref/Vref/x e sequence+1; origem continua byte-equivalente. Mesma key reexecuta; outra key não compensa duas vezes. Movimento com sucessor, estorno de REVERSAL e estorno isolado de linha RECEIPT são negados.
- [ ] Escrever multitem com uma origem elegível e outra com sucessor: falha409 e nenhuma compensação/header/status parcial. Duas tentativas concorrentes de estorno têm um único efeito. Repetir sob A/B/A1/A2 e FKs forjadas.
- [ ] Rodar testes para RED; implementar header/compensações sem apagar eventos nem revalorar sucessores. Histórico sinaliza compensação por JOIN. Verificar imutabilidade de preço/recebimento confirmado por SQL direto.
- [ ] Escrever API com JWT real de A/B: todas as rotas sem login401, org/unidade alheia404, token divergente409, entitlement negado403, owner/valor extra400. Testar acesso direto a endpoints, sem confiar no shell. Gates/contexto antes do replay.
- [ ] Implementar rotas estritas, parâmetros/paginação, no-store e erros sem SQL/nome alheio. Atualizar ApiFailure para diferenciar INSUFFICIENT_STOCK e REVERSAL_REQUIRES_REVALUATION de CONTEXT_EXPIRED; teste unit confirma mensagens distintas e nenhuma limpeza de contexto por conflito de negócio.
- [ ] Rodar `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-reversals.test.ts tests/integration/inventory-api.test.ts tests/integration/inventory-tenant-security.test.ts tests/integration/inventory-ledger-grants.test.ts` e unit de erros; revisão independente antes de liberar UI.
- [ ] Commit: `feat: expose protected inventory API and compensating reversals`.

**Checkpoint4:** contratos, comando transacional, RLS, canônico e API passaram e foram revisados. Coordenador congela versão e entrega fixtures/contratos ao agente UI. Nada de mudar SQL enquanto outro agente usa o mesmo DB para testes.

## Task 8 — UI mínima do estoque (após contrato consolidado)

**Modify (coordenador primeiro):** `packages/auth-client/src/OwnerApp.tsx`, `packages/auth-client/src/index.ts`; **Create:** `tests/unit/protected-content.test.ts` para abertura/limpeza do slot. Slot opcional de conteúdo protegido recebe api/contextStore/selection; defaults dos três shells preservados. Falta de acesso nunca renderiza operações Inventory.

**Create (agente UI):** `apps/estoque/src/inventory/InventoryWorkspace.tsx`, `apps/estoque/src/inventory/IngredientsView.tsx`, `apps/estoque/src/inventory/SuppliersView.tsx`, `apps/estoque/src/inventory/ConversionForm.tsx`, `apps/estoque/src/inventory/ReceiptsView.tsx`, `apps/estoque/src/inventory/ReceiptForm.tsx`, `apps/estoque/src/inventory/IssueForm.tsx`, `apps/estoque/src/inventory/StockLedgerView.tsx`, `apps/estoque/src/inventory/PriceHistoryView.tsx`, `apps/estoque/src/inventory/inventory-client.ts`, `apps/estoque/src/inventory/decimal-input.ts`; `tests/unit/inventory-input.test.ts`; `tests/e2e/inventory-flow.spec.ts`, `tests/e2e/inventory-context.spec.ts`.
**Modify (agente UI):** `apps/estoque/src/App.tsx`. UI não escreve shared auth/contratos/SQL/lockfile.

**Interfaces:** `createInventoryClient(api:ApiClient,store:ContextStore)` encapsula endpoints congelados. Leituras usam store.read e invalidam dados/erros tardios; submissão usa generation capturada e seleção/token originais. `normalizeDecimalInput(text,scale):string` aceita vírgula decimal sem agrupamento; `formatRatioForDisplay(ratio,scale):string` usa BigInt só para exibição half-even. Ambos vivem em decimal-input.ts, sem Number e sem importar backend/motor pelo índice do pacote. Não calculam saldo/custo de movimento na UI.

- [ ] Escrever testes unit de entrada decimal, limites e payload; E2E primeiro para login→insumo kg→fornecedor→rascunho sem saldo→confirmar10×20→baixa2→compra7×25→saldo15/R$335/médiaR$22,33. Conferir API335/15 e ledger, não só texto arredondado.
- [ ] Escrever E2E formulárioA1 seguido de trocaA2, resposta A1 atrasada, timeout de confirmação/retrymesmakey, entitlement403, sessão/contexto expirado e saldo insuficiente. A1 nunca é submetida como A2. Criar/dois cliques em confirmar resulta em um movimento por item.
- [ ] Rodar unit/E2E para RED de comportamento com browser operacional; não tratar Chromium ausente como regressão de produto. Só coordenador inicia/encerra servidores e serializa testes no DEV.
- [ ] Implementar somente fluxos da spec9, labels/teclado/loading/errors. UI diferencia rascunho/recebido/estornado e aviso de que custo é efetivo; confirmação explícita de recebimento e motivo de saída/estorno. Não desenhar dashboard nem listas/IA.
- [ ] Reexecutar testes e builds dos três apps/API, conferir precificação independente. Revisar bundles sem DB/role/admin/senhas; SDK Auth e publishable key não são acesso a tabelas. CSP mantém somente origens DEV/local autorizadas.
- [ ] Commit: `feat: add minimal received purchase and stock operation UI`.

**Checkpoint5:** browser→API→PostgreSQL demonstrado, sem mock substituindo canônico. Mocks de503/expiração só comprovam estado de UI; expiração/RLS reais permanecem integração.

## Task 9 — Revisão final, evidências e PR

**Modify:** `docs/evidence/ciclo-02-inventory.md`, `README.md`, esta checklist; `docs/05-REGISTRO-DE-DECISOES.md` só para remover pendências resolvidas ou registrar as ainda abertas, sem alterar DEC.

- [ ] Autoauditar spec→tasks→testes, inclusive todas as escritas sob failure injection. Teste ausente bloqueia o requisito; não marcar apenas pela existência do código. Revisão independente cobre matemática, constraints diferidas, lock order, tenant/unidade e resposta idempotente.
- [ ] Revisor lê diff e roda testes em janela exclusiva, sem editar migrations. Achado vira regressão RED→fix→GREEN e commit pequeno. Depois nova revisão do fix, antes de merge.
- [ ] Executar sequencialmente `dp install --frozen-lockfile`, `dp typecheck`, `dp lint`, `dp test:unit`, `dp test:integration`, `dp test:e2e`, `dp build`, `dp audit --json`, `git diff --check`. Integration/E2E não rodam simultâneos no mesmo banco mutável. Registrar saída/exit/contagem e timestamp sem token/senha. A suíte deve falhar se ambiente faltar, nunca skip silencioso.
- [ ] Consultar SQL real e registrar T-03..T-10, A/B/A1/A2/C, Q/V/soma ledger e razãoexata. Incluir limites: sem revaloração tardia, sem rateio automático, sem pedidos/parcial, sem Storage/IA/Premium. Reprodução do zero só é afirmada se feita; não usar reset cloud para obter essa evidência.
- [ ] Conferir advisors, objetos/grants expostos, ausência de tabelas dos próximos ciclos e ausência de segredos em Git/bundle/log. Listar arquivos, versões, commits e riscos; evidência de uso apenas do DEV autorizado.
- [ ] Publicar branch somente no remote novo já autorizado, abrir PR com base correta e anexá-lo ao chat. Não merge/deploy automático. Corpo do PR descreve problema/comportamento/testes/limites, sem memória/credenciais.
- [ ] Entregar relatório e pedir revisão do Ciclo02. **Não iniciar Ciclo03 autonomamente.**

## Matriz e recuperação

| Gate / falha | Prova / resposta |
|---|---|
| T-03/T-04 | Tasks2/5/6; unidade pura e SQL real independentes, soma exata ledger/projeção |
| T-05 | Task5/7/8; repetição/concorrência/timeout/replay, resposta original e unicidade |
| T-06 | Task6; barreiras com conexões distintas, ordem de lock e retry limitado |
| T-07 | Tasks2/4/5/6; snapshots/versão e rejeição de mistura de dimensão/tenant |
| T-08 | Task6; Q/V zero e nova referência sem alterar histórico |
| T-09/T-10 | Task5; rascunho real, confirmação atômica, histórico por fornecedor |
| Código core com gate vermelho | Task0; fechar primeiro, não trabalhar sobre erro conhecido |
| DB indisponível/timeout antes commit | Rollback503; repetir mesma key depois; nenhum sucesso parcial |
| Timeout depois commit | Replay com mesma key; não gerar nova por simples retry |
| Limite/escala/quantidade incompatível |400 específico e zero escrita, não truncar/normalizar silenciosamente |
| Sucessor no estorno |409 e orientação explícita; nenhuma revaloração/DELETE automático |
| Recebimento multitem com erro |Todos ou nenhum; status continua draft se primeira confirmação falha |
| Browser/dependência ausente | Resolver ambiente e repetir; build/unit não substituem E2E/SQL |
| Projeto/host/role divergente | Abort antes da conexão/mutation; nenhum fallback para legado |

Este plano e a spec foram escritos juntos por solicitação expressa do fundador, para revisão conjunta. A execução por coordenador+agentes especializados já foi escolhida; falta a aprovação do conteúdo e o fechamento do ciclo anterior.
