# Estoque Base — inventory valuation design

Data: 15/10/2026. **Aprovada pelo fundador em 15/10/2026, condicionada ao fechamento e à revisão do Ciclo 01. Implementação Inventory autorizada após revisão do core; validada para revisão do PR, com limites e comandos no relatório de evidências.**

Fontes lidas: [AGENTS](../../../AGENTS.md), [V3](../../01-PRODUTO-V3.md), [arquitetura](../../02-ARQUITETURA-E-LIMITES.md), [T-03 a T-10](../../03-CRITERIOS-DE-ACEITE.md), [roadmap](../../04-ROADMAP.md), [ADR 0001](../../adr/0001-decisoes-arquiteturais.md), [DEV cloud](../../adr/0002-ambiente-supabase-dev-cloud.md) e [ADR 0003 proposta](../../adr/0003-inventory-valuation.md). DEC-001 a DEC-013 não são alteradas.

## 1. Resultado e gate anterior

O dono consegue cadastrar insumo/fornecedor, registrar e confirmar compra recebida, lançar saída manual, consultar saldo/valor/custo médio, histórico por fornecedor e extrato; pode compensar movimento elegível. Tudo passa pela API e por RLS com contexto de unidade explícito.

Inclui somente Estoque Base do Ciclo 02. Fora: ficha/rendimento, produção de pré-preparo, contagem/auditoria física/PDF, lista Premium, IA, WhatsApp, motor de preços, transferências entre unidades, múltiplos locais, pedidos/cotações, impostos calculados, cobrança, deploy e produção. App 02 continua independente e não ganha CRUD de estoque.

**Gate do Ciclo 01 cumprido antes da implementação.** Core validado com 90 unitários, 28 integrações e 11 E2E aprovados; revisão independente sem bloqueador e [PR #1](https://github.com/makollykalk/Donos_next/pull/1) entregue. O fundador concluiu a revisão humana e autorizou este ciclo com “Revisado! siga!”. O preflight do planejamento ainda apontava verificações pendentes do core; esse estado foi superado pelo fechamento registrado em [evidências do Ciclo 01](../../evidence/ciclo-01.md). Nenhum merge ou deploy foi autorizado por essa revisão.

Implementação em branch `codex/ciclo-02-inventory`, criada a partir do commit do core aprovado pelo usuário (`2df79f9`). Aprovar este plano não aprova merge do core nem ignora testes pendentes.

## 2. Limites globais

- Coordenador possui migrations, RLS, contratos e integração. Motor puro e revisão de testes podem ser delegados em arquivos exclusivos; UI somente após checkpoint de contrato/API, sem banco mutável compartilhado entre agentes.
- Reusar Node24.22.0/pnpm11.25.0/TS6.0.3, pg8.23.1, Fastify5.12.7, Zod4.6.7, React19.3.1/Vite8.3.4, Vitest5.0.4/Playwright1.64.1. Nenhuma dependência de produção nova proposta; lock/pins permanecem exatos.
- API e frontends locais. DB/Auth somente DEV novo autorizado `kfthwjrvgslnsjigqnyc`, com TLS validado, ou Supabase local expressamente configurado. Nunca Donos-Saas, don_madruga ou outro projeto. Revalidar ref/nome/ambiente antes de toda migration. A rodada de planejamento não aplicou migrations; a implementação aprovada aplicou somente as migrations Inventory no DEV autorizado, conforme relatório.
- Dados de testes sintéticos; credenciais administrativas fora da API/browser/Git. Runtime donos_api, NOBYPASSRLS, não owner. SQL parametrizado na mesma conexão; nenhum efeito externo dentro da transação/retry.
- Nenhum number/parseFloat/Number/toFixed nos cálculos de quantidade, preço ou valor. UI usa campos text/inputMode decimal e formatação por strings/coeficientes.

## 3. Modelo de domínio e visibilidade

Insumo é local à unidade. Fornecedor é organizacional: A1/A2 compartilham fornecedores da empresa A, mas não os da empresa C do mesmo dono nem os de B. Recebimentos/histórico/saldos/extrato são sempre locais. Não existe consulta “sem unidade = todas”.

Base de insumo: `kg`, `L`, `un`, imutável desde criação. Para `un`, `allowFractionalCount` default false; escolha explícita true permite fração em seis casas. Para kg/L, frações são permitidas. Nome pode mudar; arquivar/desarquivar é possível, sem excluir. Item arquivado não aceita novo recebimento/saída; estorno elegível continua possível para correção. Catálogo, fornecedor e conversão são revalidados sob lock antes de efetivar.

Conversões padrão: kg→kg=1, g→kg=0.001; L→L=1, mL→L=0.001; un→un=1. Rejeitar g em L e vice-versa; nenhuma densidade inferida. Embalagem tem ID vinculado ao insumo, rótulo e fator positivo para a base, versionado por rótulo. Fator não é enviado livremente em recebimento. Nova versão não reescreve anterior; novos rascunhos usam versão vigente, rascunho existente preserva seu snapshot para confirmação explícita.

Quantidade original×fator deve produzir quantidade-base exata com até seis casas. Excesso não zero é erro, sem arredondar quantidade. Custos positivos que se quantizariam para zero na aquisição são recusados por underflow; preço literalmente zero é aceito só com motivo. Saída parcial pode registrar custo zero por quantização: não confundir isso com custo ausente.

## 4. Precisão e motor puro

Proposta numérica v1:

| Campo | Faixa / representação |
|---|---|
| Quantidade original/base/referência/baixada | string canônica, 0≤q<10^18, até6 casas; comando exige q>0 |
| Preço efetivo por unidade de compra | string canônica, 0≤p<10^18, até12 casas |
| Valor de saldo/referência/linha | string canônica, 0≤v<10^26, até12 casas |
| Deltas do ledger | mesmas escalas/faixas em módulo, sinal explícito conforme operação |
| Sequência/revisão | bigint SQL, string JSON, até9223372036854775807 |
| Média | razão exata `{numerator: value, denominator: quantity}`; null quando vazio |

Schemas Inventory específicos ampliam o envelope de valor do core (que tem18 inteiros); não afrouxar `DecimalStringSchema` existente. Quantidades com escala7, expoente, separador de milhar, NaN/Infinity, sinal+, -0 e zeros não canônicos são negados na API. Normalização de UI aceita vírgula decimal sem agrupadores e serializa string canônica. Nenhum arredondamento implícito de input.

PostgreSQL: domínios sobre numeric sem escala declarada, com CHECK de limite finito e igualdade a trunc na escala. Evita arredondamento de coerção de numeric(p,s), documentado no [PostgreSQL17](https://www.postgresql.org/docs/17/datatype-numeric.html). Valores agregados continuam strings numeric exatas; API não os converte para o schema de preço unitário nem para float.

Motor puro usa coeficientes BigInt e divisão inteira com resto; arredondamento **half-even** somente no quantum de R$10^-12. Não usar `round(numeric)` como equivalente: empates têm outra regra. Uma função isolada determina o arredondamento de sinal e de empates. A integração guarda o resultado validado e o compara a oráculo SQL independente nos testes.

Estado `S=(Q,V,Qref,Vref,x,sequence)`; vazio é tudo zero, média null. Após entrada q e valor de aquisição a=halfEven12(qOriginal×unitPrice), novo estado é `Q'=Q+q`, `V'=V+a`, `Qref'=Q'`, `Vref'=V'`, `x'=0`. A fonte é V registrado, nunca Q×média exibida.

Na saída q, exigir 0<q≤Q. Definir `B(x)=halfEven12(x×Vref/Qref)`. Custo registrado = B(x+q)−B(x); Q'=Q−q; V'=V−custo; x'=x+q; referências permanecem. Ao esgotar, Q'=V'=0 e referências/x são zerados. Esse ramo entrega exatamente todo valor restante, inclusive resíduo.

A média econômica Vref/Qref permanece na época. A razão V/Q do saldo quantizado pode diferir; limite de erro do valor por estado é R$0,0000000000005 e do custo de uma baixa é R$0,000000000001. Não prometer limite absoluto de erro de média independente da quantidade. Baixas fragmentadas telescopam; novo recebimento absorve o valor remanescente registrado numa nova referência. Estorno restaura **Q/V/Qref/Vref/x anteriores**, não só Q/V; sequence aumenta e o ponteiro passa à compensação.

### Vetores de aceite

| Operação | Quantidade | Valor | Média econômica |
|---|---|---|---|
| Receber10kg×20 | 10 | 200 | 200/10=20 |
| Baixar2kg | 8 | 160; custo da baixa40 | 200/10=20 |
| Receber7kg×25 | 15 | 335 | 335/15 |

Guardar razão335/15, não “22.33” como autoridade. UI pode exibir R$22,33/kg; teste de banco consulta snapshots, ledger, projeção e preço histórico.

T-04 mínimo: receber0.3×1.1 →Q0.3/V0.33; sair0.1 →Q0.2/V0.22/custo0.11; receber0.2×1.3 →Q0.4/V0.48; sair0.15 →Q0.25/V0.3/custo0.18; receber0.05×1.7 →Q0.3/V0.385/média77/60. Acrescentar dízimas, empates half-even e zeragem fragmentada, sem aceitar tolerância de centavos para reconciliação.

## 5. Schema proposto

Tudo no schema privado core; todas as tabelas abaixo ENABLE+FORCE RLS. PK UUID; datas timestamptz UTC; RESTRICT nas FKs; sem cascata em trilhas. IDs/owner/tenant e números derivados não são campos editáveis de DTO.

| Tabela | Campos e constraints principais | Escrita runtime |
|---|---|---|
| ingredients | id,organization_id,restaurant_id,name,base_unit,allow_fractional_count,archived,created_at; UNIQUE(org,unit,id); FK(org,unit) restaurants | INSERT; UPDATE apenas nome/archived; base/configuração imutáveis |
| suppliers | id,organization_id,name,contact nullable,archived,created_at; UNIQUE(org,id); FK org | INSERT; UPDATE nome/contact/archived |
| ingredient_conversions | id,org,unit,ingredient_id,label,version,factor_to_base,created_at; UNIQUE(org,unit,id), UNIQUE(org,unit,ingredient,label,version); FK tripla ingrediente; fator>0 | INSERT; nenhum UPDATE/DELETE |
| purchase_receipts | id,org,unit,supplier_id,supplier_name_snapshot,document_date nullable,document_reference nullable,status draft/received,created_by,created_at,received_by/at nullable; UNIQUE(org,unit,id); FK(org,supplier); status coerente com received_by/at | INSERT de rascunho; UPDATE somente transição draft→received e campos de efetivação; imutável depois |
| purchase_receipt_items | id,org,unit,receipt_id,ingredient_id,ingredient_name_snapshot,original_quantity,original_unit,unit_price,zero_cost_reason nullable,conversion_id nullable,label/version/factor snapshots,base_quantity,line_value; UNIQUE(org,unit,id); UNIQUE(org,unit,receipt,ingredient); FKs triplas receipt/ingredient/conversion | INSERT; imutável, inclusive rascunho |
| stock_balances | org,unit,ingredient_id PK; Q,V,Qref,Vref,x,sequence,last_movement_id nullable; FK tripla ingrediente; domínios/estado coerentes | INSERT zero e UPDATE só projeção; constraint diferida exige ledger correspondente |
| stock_movements | id,org,unit,ingredient_id,sequence,kind RECEIPT/ISSUE/REVERSAL,quantity_delta,value_delta,state_before/state_after em colunas numéricas tipadas,reason,actor_user_id,created_at,receipt_item_id nullable,reversal_of_id/reversal_id nullable,command_key; UNIQUE(org,unit,id), UNIQUE(org,unit,ingredient,sequence), UNIQUE(org,unit,receipt_item_id), UNIQUE(org,unit,reversal_of_id); snapshots base/política | INSERT; sem UPDATE/DELETE/TRUNCATE |
| purchase_price_history | id,org,unit,ingredient_id,supplier_id,supplier_name_snapshot,receipt_item_id,receipt_movement_id,posted_sequence,original_quantity/unit/price,base_quantity,line_value,conversion snapshots,posted_at; UNIQUE(org,unit,receipt_item_id); FKs compostas; preço normalizado é razão line_value/base_quantity | INSERT; sem UPDATE/DELETE |
| stock_reversals | id,org,unit,origin_movement_id ou origin_receipt_id exatamente um,reason,actor_user_id,created_at; UNIQUE por origem; FKs triplas | INSERT; imutável |

`state_before/state_after` representam colunas quantity/value/reference_quantity/reference_value/issued_quantity; não JSON financeiro livre. Um recebimento tem no máximo50 linhas e um insumo por linha; repetir insumo é erro de validação/UNIQUE, não ordem de média implícita. JSON snapshots livres/float não substituem campos tipados.

FK da conversão inclui org/unit/ingredient/conversion, com UNIQUE correspondente; não basta conversion_id global. Vínculos movement→receipt_item e history→movement/item validam também o ingrediente (UNIQUE das origens incluindo ingrediente); reversal_of valida org/unit/ingredient/origem e reversal_id aponta ao header local. CHECK de kind exige receipt_item apenas em RECEIPT, e reversal_of/reversal_id apenas em REVERSAL. Ponte last_movement_id usa FK diferida para a mesma combinação. Fornecedor organizacional usa FK(org,supplier), deliberadamente não FK de unidade.

Índices: ingredientes(org,unit,archived,id); fornecedores(org,archived,id); conversões(org,unit,ingredient,label,version); movimentos(org,unit,ingredient,sequence DESC); histórico(org,unit,ingredient,supplier,posted_sequence DESC); recebimentos(org,unit,created_at,id). Sequência pertence ao saldo, não timestamp/global sequence. Cursor de histórico usa sequência do movimento, sem roundtrip de timestamp por Date JS.

Policies locais exigem owner via organizations, app.organization_id E app.restaurant_id. Inserts com actor_user_id/created_by e efetivação com received_by exigem igualdade ao ator verificado, também por WITH CHECK/trigger, não por campo editável do cliente. Suppliers exigem owner+org ativa. Todos PUBLIC/anon/authenticated ficam sem USAGE/grants/EXECUTE de domínio, inclusive novas funções e domínios. Runtime não altera tenant/FKs/limites/ownership.

Triggers SECURITY INVOKER: rejeitar UPDATE/DELETE de trilhas; conferir cadeia do novo movimento sob lock (estado anterior e sequence=anterior+1, deltas, snapshots); no COMMIT conferir projeção igual ao último ledger, ou zero inicial sem movimento. Validar Q=Qref−x e V=Vref−B(x), usando CASE para o estado vazio sem divisão por zero. Alterar projeção isoladamente e inserir movimento sem projeção falham no commit. Sem função de correção privilegiada. Soma completa do ledger é prova de reconciliação em teste/diagnóstico, não varredura em cada comando.

Auditoria core existente ganha ações explícitas inventory.ingredient.created/updated, inventory.supplier.created/updated, inventory.conversion.created, inventory.receipt.drafted/received, inventory.issue.posted, inventory.reversal.posted. Para essas ações restaurant_id é obrigatório por CHECK; a unidade identifica o contexto da alteração mesmo em fornecedor compartilhado. Metadados continuam `{}`; dados comerciais em tabelas próprias, sem corpo arbitrário/log. Coordenador atualiza constraint e helper de auditoria em migration nova, nunca M01 já aplicada.

## 6. Recebimento, saídas e estorno

Rascunho contém fornecedor obrigatório, documento opcional e linhas completas com quantidade/unidade/preço. Salvar rascunho grava somente cabeçalho/itens/snapshots e auditoria: **zero saldo, movimento e histórico**. Não é pedido de compra; não há CRUD genérico de pedidos nem promessa de recebimento parcial.

Confirmar exige `{receivedConfirmed:true}` após revisão de mercadoria/custo/unidade. Revalidar fornecedor/insumos ativos e pertença; snapshot de conversão e preço do rascunho não é substituído por cadastro posterior. Falha numa linha reverte status, todas as entradas, preços, projeções e auditoria. Segundo recebimento com chave diferente conflita, sem duplicar. Rascunho não é editado neste recorte; correção prévia cria outro rascunho sem efeitos de estoque.

unitPrice é custo efetivo BRL por unidade original de compra. Sem frete/desconto/tributo automático; campos de cabeçalho desse tipo são rejeitados. A UI informa que o valor efetivo por linha deve estar conferido. Preço ausente é erro; preço zero exige zeroCostReason de1–240 caracteres. Não inferir imposto recuperável ou rateio. documentDate não reordena estoque; receivedAt/sequence são do servidor.

Saída manual tem ingrediente, quantidade/unidade e motivo obrigatório (consumo/perda/devolução manual, sem integrações). Não aceita valor/custo médio enviado pelo cliente. Quantidade maior que saldo retorna409 INSUFFICIENT_STOCK, sem evento parcial. Devolução não é estorno automático de preço antigo: se for operação corrente usa a média corrente e motivo; UI diferencia as duas ações.

Estorno de ISSUE somente se origem ainda é última e não foi compensada. Gravar REVERSAL com deltas inversos e restaurar todo estado anterior, mantendo sequence crescente. Estorno de RECEIPT é exclusivamente do recebimento inteiro: todas as origens devem continuar últimas, sem compensação. Trava todos os insumos em ordem; cria header de estorno e compensações, tudo ou nada. Não estornar REVERSAL nem itens individuais do recebimento. Sucessores implicam409 REVERSAL_REQUIRES_REVALUATION; outro key para origem já compensada implica409 REVERSAL_ALREADY_APPLIED. Mesma key/payload reexecuta resposta original.

Recebimentos, movimentos e preços originais permanecem. Status “estornado” e vínculo à compensação são derivados por JOIN, sem apagar ou mudar o preço anterior. Não recalcular acontecimentos posteriores nem interpretar data antiga como permissão de retroatividade.

## 7. Contratos públicos e internos

DTOs novos em `packages/contracts/src/inventory.ts`; schemas estritos em `inventory-schemas.ts`. Tipos QuantityString/PriceString/InventoryValueString têm os limites da seção4. BaseUnit, InputUnit e textos são enumerados/limitados. Paginação limit1..100, default50; query desconhecida é400.

```ts
type InputUnit = {kind:'standard';code:'kg'|'g'|'L'|'mL'|'un'}
  | {kind:'package';conversionId:UUID};
type CreateIngredientInput = {name:string;baseUnit:'kg'|'L'|'un';allowFractionalCount:boolean};
type PatchIngredientInput = {name?:string;archived?:boolean}; // ao menos um campo
type CreateSupplierInput = {name:string;contact?:string};
type PatchSupplierInput = {name?:string;contact?:string|null;archived?:boolean};
type CreateConversionInput = {label:string;factorToBase:PriceString};
type ReceiptLineInput = {ingredientId:UUID;quantity:QuantityString;unit:InputUnit;
  unitPrice:PriceString;zeroCostReason?:string};
type CreateReceiptInput = {supplierId:UUID;documentDate?:string;documentReference?:string;
  items:ReceiptLineInput[]};
type IssueInput = {ingredientId:UUID;quantity:QuantityString;unit:InputUnit;reason:string};
type ReversalInput = {reason:string};
type ValuationState = {quantity:QuantityString;value:InventoryValueString;
  referenceQuantity:QuantityString;referenceValue:InventoryValueString;
  issuedQuantity:QuantityString;sequence:IntegerString};
type StockBalance = ValuationState & {ingredientId:UUID;lastMovementId:UUID|null;
  averageCostRatio:{numerator:InventoryValueString;denominator:QuantityString}|null};
type MovementResult = {movementId:UUID;balance:StockBalance};
type ReceiptPosted = {receiptId:UUID;status:'received';movements:MovementResult[]};
```

Ingredient/Supplier/Conversion DTOs retornam id/nome/configuração/archived e escopo apropriado; ReceiptDetail retorna cabeçalho, linhas e snapshots, status draft/received/reversed, receivedAt e reversalId nullable. MovementDTO retorna tipo, sequência, deltas, before/after, autor/data/motivo e vínculo de origem. PriceHistoryDTO retorna fornecedor/snapshot, data documental/efetiva, unidade/preço original, fator, quantidade/valor normalizados e razão normalizada, mais reversalId nullable. Nenhum DTO recebe state/sequence/tenant/owner/custo derivado como entrada.

Prefixo de todas as rotas: `/v1/organizations/:organizationId/restaurants/:restaurantId/inventory`. Bearer + X-Donos-Context obrigatórios; **inventory_core verificado no backend em toda rota**, inclusive leitura e replay. Sem entitlement não há consulta de negócio. Manter política atual de bloqueio com preservação de dados; acesso histórico após cancelamento é decisão comercial futura.

| Método / sufixo | Entrada / saída |
|---|---|
| GET, POST /ingredients | lista paginada; CreateIngredientInput→201 Ingredient |
| PATCH /ingredients/:ingredientId | PatchIngredientInput→200 Ingredient, sem reparent/base editável |
| GET, POST /ingredients/:ingredientId/conversions | lista; CreateConversionInput→201 ConversionVersion |
| GET, POST /suppliers | lista da organização; CreateSupplierInput→201 Supplier |
| PATCH /suppliers/:supplierId | PatchSupplierInput→200 Supplier |
| POST /receipts | CreateReceiptInput→201 ReceiptDetail em draft |
| GET /receipts | lista paginada dos cabeçalhos da unidade, status opcional draft/received/reversed; permite retomar rascunho por ID |
| GET /receipts/:receiptId | ReceiptDetail do contexto |
| POST /receipts/:receiptId/receive | `{receivedConfirmed:true}`→201 ReceiptPosted |
| POST /issues | IssueInput→201 MovementResult |
| POST /movements/:movementId/reversal | ReversalInput→201 MovementResult; somente ISSUE |
| POST /receipts/:receiptId/reversal | ReversalInput→201 `{reversalId,movements:MovementResult[]}` |
| GET /balances | ingredientes e saldos paginados, zero para item sem movimento; totalValue exato da unidade, numa única fotografia SQL |
| GET /ingredients/:ingredientId/movements | cursor por sequência, highWatermark, extrato do insumo |
| GET /ingredients/:ingredientId/price-history | cursor beforeSequence/highWatermark, supplierId opcional validado; somente unidade ativa |

Todas as mutações exigem Idempotency-Key UUID; replay preserva body/status200 ou201 original. PATCH hash contém DTO+ID+org+unit. Capacidade/contexto/propriedade são revalidados antes de replay. Chave organizacional reutilizada em outra unidade com mesma operação conflita409, nunca entrega resultado antigo. Não há endpoint de saldo direto, UPDATE/DELETE de movimento ou grant comercial.

Erros adicionados ao contrato core: INSUFFICIENT_STOCK409, UNIT_INCOMPATIBLE400, QUANTITY_PRECISION400, NUMERIC_RANGE400, VALUATION_UNDERFLOW400, RESOURCE_CONFLICT409, REVERSAL_REQUIRES_REVALUATION409 e REVERSAL_ALREADY_APPLIED409. Restante usa códigos existentes: validação400, login401, escopo alheio404, contexto409, plano403, indisponibilidade503. JSON malformado não vira503. ApiFailure deve distinguir conflito de estoque de expiração de contexto, sem mandar selecionar unidade por qualquer409.

Interfaces internas, instâncias/factories explícitas:

```ts
normalizeQuantity(quantity:QuantityString, unit:InputUnit, conversion:ConversionSnapshot):QuantityString;
roundHalfEven(numerator:bigint, denominator:bigint):bigint;
calculateAcquisitionValue(quantityOriginal:QuantityString, unitPrice:PriceString):InventoryValueString;
calculateReceipt(state:ValuationState, baseQuantity:QuantityString, lineValue:InventoryValueString):MovementCalculation;
calculateIssue(state:ValuationState, baseQuantity:QuantityString):MovementCalculation;
calculateEligibleReversal(state:ValuationState, original:MovementSnapshot):MovementCalculation;
createInventoryService(db:Database): InventoryService;
// InventoryService: métodos com (actor,selection,contextToken,input/ids,key)
// createIngredient, patchIngredient, createSupplier, patchSupplier, createConversion,
// createReceipt, receiveReceipt, issue, reverseIssue, reverseReceipt;
// listIngredients, listSuppliers, listConversions, getReceipt, listBalances,
// listMovements e listPriceHistory recebem query validada e não recebem key.
```

MovementCalculation contém before/after, deltas assinados, média econômica de origem, política `moving-average-cumulative-v1`; não conhece SQL, sessão, relógio ou entitlement. ConversionSnapshot resolve enum padrão ou versão de embalagem da mesma unidade/insumo; o motor não acessa banco. Fachada de aplicação em `apps/api/src/services/inventory.ts` controla transação; repositórios recebem ctx/Tx e não iniciam transações aninhadas.

Dependências: contracts→nenhum domínio; db→contracts; domain-inventory→db/contracts (arquivos puros usam somente contracts); domain-purchases→domain-inventory/db/contracts; API compõe todos. Não colocar a fachada em domain-inventory importando domain-purchases, pois criaria ciclo entre os pacotes. Db não importa tipos de domínio: DTOs financeiros públicos ficam em contracts; shapes de escrita de repositório ficam em db. UI importa contracts/auth-client; formatação local de exibição por BigInt não importa o índice de domínio/backend.

Assinaturas completas de `InventoryService`, declaradas em `apps/api/src/services/inventory-types.ts`. Os três primeiros parâmetros de cada método são sempre `(actor:VerifiedActor, selection:ContextSelection, contextToken:string)`; a tabela fixa os restantes e o retorno, sem parâmetros financeiros numéricos:

| Método | Parâmetros depois de actor/selection/token | Retorno Promise |
|---|---|---|
| createIngredient | input:CreateIngredientInput,key:string | Ingredient |
| patchIngredient | ingredientId:UUID,input:PatchIngredientInput,key:string | Ingredient |
| createSupplier | input:CreateSupplierInput,key:string | Supplier |
| patchSupplier | supplierId:UUID,input:PatchSupplierInput,key:string | Supplier |
| createConversion | ingredientId:UUID,input:CreateConversionInput,key:string | ConversionVersion |
| createReceipt | input:CreateReceiptInput,key:string | ReceiptDetail |
| receiveReceipt | receiptId:UUID,input:{receivedConfirmed:true},key:string | ReceiptPosted |
| issue | input:IssueInput,key:string | MovementResult |
| reverseIssue | movementId:UUID,input:ReversalInput,key:string | MovementResult |
| reverseReceipt | receiptId:UUID,input:ReversalInput,key:string | {reversalId:UUID,movements:MovementResult[]} |
| listIngredients / listSuppliers | query:CatalogQuery | {items:Ingredient[]/Supplier[],nextCursor:UUID\|null} |
| listConversions | ingredientId:UUID | {items:ConversionVersion[]} |
| getReceipt | receiptId:UUID | ReceiptDetail |
| listReceipts | query:CatalogQuery & {status?:'draft'\|'received'\|'reversed'} | {items:ReceiptHeader[],nextCursor:UUID\|null} |
| listBalances | query:CatalogQuery | {items:StockBalance[],totalValue:string,nextCursor:UUID\|null} |
| listMovements | ingredientId:UUID,query:SequenceQuery | {items:MovementDTO[],highWatermark:IntegerString,nextCursor:IntegerString\|null} |
| listPriceHistory | ingredientId:UUID,query:SequenceQuery & {supplierId?:UUID} | {items:PriceHistoryDTO[],highWatermark:IntegerString,nextCursor:IntegerString\|null} |

CatalogQuery: `{limit?:number,cursor?:UUID,includeArchived?:boolean}`; limit é inteiro técnico1..100/default50, cursor por id em ordem ascendente. SequenceQuery: `{limit?:number,beforeSequence?:IntegerString,highWatermark?:IntegerString}`, ordem descendente e watermark máximo da primeira página. totalValue inclui todo estoque da unidade, inclusive arquivados, mesmo se a lista estiver filtrada; UI informa isso. Schemas de saída financeiros preservam strings canônicas, inclusive soma numeric que não cabe no envelope de um preço de compra.

## 8. Transação e concorrência

1. Validar DTO/IDs/chave; verificar identidade e contexto opaco pelo core; BEGIN na conexão do runtime e set_config LOCAL.
2. Verificar inventory_core dentro dessa transação. Disputar idempotência por org/operation/key antes de lock de negócio; hash inclui unidade, IDs e DTO normalizados. Replay reautorizado retorna imediatamente.
3. Quando há recebimento/estorno de recebimento, travar header do receipt. Quando necessário, travar fornecedor **antes** do catálogo de ingredientes; ingredientes em ordem lexicográfica UUID. Nenhum caminho adquire receipt/fornecedor depois de ingrediente. Conversão versionada é imutável; criação de versão também trava seu ingrediente. Cadastro de fornecedor trava só fornecedor; criação de rascunho usa fornecedor→ingredientes e cria header novo sem disputa por ID existente.
4. Garantir saldo zero na mesma transação de criação do insumo; comandos posteriores exigem essa projeção existente e recusam saldo ausente, sem recriar silenciosamente estado corrompido. Travar todos os saldos `(org,unit,ingredient)` com SELECT FOR UPDATE na mesma ordem. Nenhum cálculo usa estado lido antes dessas travas. Leitura de entidades/grants deve confirmar a mesma organização/unidade.
5. Validar estado ativo, snapshot/quantidade/saldo e elegibilidade de estorno. Calcular com motor puro e validar faixas do resultado. Guardar custos e before/after imutáveis.
6. Gravar movimentos, projeção, histórico e status do recebimento, auditoria e resposta idempotente. Constraints diferidas validam cadeia/projeção no commit. Qualquer falha dá rollback inteiro; não capturar erro e confirmar transação parcialmente.
7. Somente após COMMIT responder sucesso. Timeout após commit é recuperável pela mesma chave. Retry no máximo duas novas tentativas para40001/40P01 da operação inteira, nunca validação/saldo insuficiente e sem efeito externo. Depois do limite503.

Não executar Promise.all de queries/comandos na mesma Tx. Concorrência de testes usa conexões separadas e barreiras, sem sleeps frágeis. [Locks PostgreSQL17](https://www.postgresql.org/docs/17/explicit-locking.html) orientam a ordem; ordem de UUID escolhida é decisão do projeto, não garantia automática do banco. SET LOCAL não passa para próxima request do pool. Locks de fornecedor podem serializar recebimentos do mesmo fornecedor; aceitar no MVP e medir antes de otimizar.

## 9. UI mínima e divisão de trabalho

Coordenador abre slot opcional de conteúdo protegido em OwnerApp, mantendo os shells de portal/precificação intactos. Slot recebe api/contextStore/seleção; somente app estoque o ocupa. Depois de API/DTOs congelados, agente UI escreve exclusivamente `apps/estoque/src/inventory/**`, `apps/estoque/src/App.tsx` e testes UI combinados. Listagem mínima de recebimentos permite voltar a um rascunho salvo depois de reload, sempre revalidando a unidade antes de abrir/confirmar.

Fluxos: catálogo nome/base/fração de un/arquivar; fornecedor nome/contato; embalagem fator e versão; rascunho de recebimento com fornecedor/linhas e revisão de custo/unidade; botão “Confirmar recebimento” com confirmação explícita; saída com quantidade/motivo; tabela de saldo/valor/média, extrato por insumo e histórico por fornecedor; estorno elegível com motivo e aviso de bloqueio de sucessores. Sem dashboard, pedido genérico, Premium, IA ou operação de preços.

Mostrar unidade ativa em todos os formulários. Mudança de contexto invalida geração do formulário e respostas atrasadas; nunca enviar rascunho A1 como A2. Cada comando conserva chave enquanto payload não muda e não conclui; após timeout repetir a mesma chave. Campos de custo não usam valueAsNumber. Histórico sinaliza estorno por vínculo e mantém linha original. Erros de saldo, precisão, plano e estorno são legíveis. Todos os nomes escapados pelo React.

## 10. Verificação e saída

| Critério | Prova necessária |
|---|---|
| T-03 | Canônico gravado por serviço/API em PostgreSQL; queries ledger/projeção/histórico e razão335/15 |
| T-04 | Cinco operações acima, dízimas/empates, fragmentação e reconciliação exata de deltas; zero sem resíduo |
| T-05 | Duplicatas sequenciais/paralelas, payload diferente, timeout pós-commit, retry após rollback; um evento/histórico por item |
| T-06 | Saídas6+6 sobre10 em duas conexões: só uma, saldo4; primeiras entradas concorrentes; compra multitem em ordem inversa |
| T-07 | g/kg, mL/L, embalagem do item e troca de versão; dimensão errada, conversão alheia e normalização inexata rejeitadas |
| T-08 | Esgotamento total/fracionado; próxima compra inicia nova referência; último preço histórico preservado |
| T-09 | Rascunho persistido não muda estoque; só confirmação true efetiva; falha/repetição não duplica |
| T-10 | Fornecedor anterior/novo, unidade original distinta, snapshots preservados após edição do cadastro |
| T-01/T-02 | JWTs reais A/B, A/C do mesmo dono, A1/A2, FK cruzada, SQL runtime, rota/token forjados, sessão revogada, gate API |
| Estorno | Compensação nova, motivo/ator, origem preservada, restauração da base cumulativa, sucessores negados, multitem all-or-nothing |
| Integridade | UPDATE/DELETE/TRUNCATE ledger negados; UPDATE isolado da projeção ou movimento isolado falha no COMMIT |
| Falhas | Injeções em cada escrita e na resposta idempotente; zero parcial e retry seguro; pool limpo |
| Browser | Fluxo canônico, dupla confirmação, unidade trocada com form/fetch abertos, sessão/contexto expirado, plano403 |

T-23 não aplicável sem Storage. Critérios definidos no planejamento; resultados efetivamente executados estão em docs/evidence/ciclo-02-inventory.md. Não interpretar a matriz como aprovação automática de cada cenário. Unit puro não substitui canônico/concorrência/RLS no banco. Rodar typecheck, lint, unit, integraçãoSQL/API e E2E, builds três apps/API, audit e diffcheck; registrar comandos/saídas/commits e revisão independente de segurança/precisão/concorrência. Não iniciar Ciclo03 sem revisão humana do Ciclo02.

Plano: [2026-10-15-inventory-valuation.md](../plans/2026-10-15-inventory-valuation.md). A aprovação humana registrada inclui políticas de precisão, rascunho/recebimento, escopos e estorno conservador acima; não presume infraestrutura adicional ou produção.
