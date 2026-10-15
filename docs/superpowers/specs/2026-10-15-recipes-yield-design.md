# Ciclo 03 — fichas técnicas e rendimentos medidos

**Status:** aprovada em 2026-10-15 para implementação do Ciclo 03  
**Escopo:** App 01, fichas de produto e pré-preparo, composição, medições versionadas e custo atual consultável.  
**Base:** V3 DEC-001, DEC-004 a DEC-006 e seção 4; critérios T-11, T-12 e T-16; arquitetura e limites aprovados.

## Problema e resultado esperado

O estoque do Ciclo 02 já guarda quantidades, valores e custo médio móvel com `numeric`/inteiros escalados. O DONOS Next precisa transformar esse custo em custo útil de ficha sem presumir rendimento: o dono informa e mede o lote bruto, o resultado líquido após limpeza e a saída final após preparo. Fichas podem ser estimadas para rascunho, mas somente uma medição observada, completa e versionada pode validá-las. Alterações futuras de composição ou rendimento não apagam o histórico.

Este ciclo acrescenta ao App 01 receitas de produto e de pré-preparo, linhas em unidades compatíveis, transformações medidas, custo derivado do saldo atual e um contrato somente leitura para integração futura. Medir uma receita não consome estoque nem cria uma entrada de produto preparado. Produção e movimentos de estoque relacionados ficam fora deste ciclo, conforme a V3.

## Regras funcionais

1. Cada ficha tem `kind: product | preparation`, identidade estável e versões imutáveis de composição. Uma versão contém componentes, unidade de saída e etapas ordenadas de transformação. Editar composição cria outra versão; nunca altera a versão anterior.
2. Cada componente é explicitamente um insumo do estoque ou uma referência a uma versão exata de pré-preparo. A linha informa quantidade, unidade, papel `ingredient | packaging` e, se for uso repetido do mesmo componente físico, uma justificativa confirmada pelo dono. Componentes repetidos não são deduplicados silenciosamente: duas utilizações legítimas têm custo duas vezes. Embalagem só entra se for uma linha explícita; não existe inclusão automática.
3. Quantidades de componente aceitam conversões canônicas `kg ↔ g`, `L ↔ mL` e `un`. Conversões específicas de embalagem/insumo reutilizam o fator versionado e congelado da conversão do Ciclo 02. Não se infere densidade nem conversão entre massa, volume e unidade. Fatores precisam ser positivos e precisão/range respeitam os limites existentes.
4. Referência a pré-preparo usa `recipe_version_id` exato, dentro da mesma organização e unidade. A quantidade consumida deve converter para a unidade de saída daquela versão. O custo expande recursivamente cada ocorrência e cada quantidade. O mesmo pré-preparo em duas receitas distintas custa em cada receita somente a parcela efetivamente utilizada; perda já incorporada ao rendimento do pré-preparo não é cobrada novamente como uma segunda linha de perda.
5. Transformações ordenadas descrevem limpeza, cocção, perda ou outra etapa. A medição registra entrada e saída observadas em cada etapa na mesma dimensão. Limpeza/perda não podem aumentar a saída; uma etapa `other`/`cooking` pode aumentar o resultado apenas se a medição declarar a razão do ganho. Bruto, líquido e final são medidos diretamente pelo dono, não inferidos pela soma de ingredientes (que podem usar dimensões diferentes). Sem etapa de limpeza, bruto e líquido continuam sendo campos reais e o dono confirma a igualdade observada.
6. Medição tem tipo `estimated | measured`, responsável dono, data observada, unidade de saída, método, valores bruto/líquido/final positivos e uma versão sequencial. Estimativas podem ajudar rascunhos e aparecem como estimativas; nunca satisfazem T-11 nem geram custo integrado como validado. Uma medição medida completa pode ser validada por comando explícito do dono. A validação cria evento imutável vinculado à medição e à versão da ficha. Nova medição acrescenta versão e aponta `supersedes_measurement_id`; não sobrescreve nem apaga histórico.
7. Validação não promete que o estoque contenha os insumos. Se um componente não tiver saldo/custo médio atual (`averageCostRatio = null`), a medição real continua válida, mas o custo é indisponível, sem custo parcial autoritativo e sem fallback ao preço de fornecedor ou à última cotação.
8. Custo atual: normalizar cada linha para a unidade base do insumo ou unidade de saída do pré-preparo; multiplicar quantidades pelos custos médios atuais; expandir pré-preparos por suas versões; somar exatamente; dividir o custo do lote pelo rendimento final medido para obter custo por unidade final. O líquido permanece informativo e não é um segundo denominador. Não se aplicam percentuais de rendimento sucessivos sobre o custo já incorporado. Valores e divisões críticas usam inteiros/`BigInt`, frações racionais e `numeric`, sem `number` binário. Reter precisão internamente e arredondar meio-par para 12 casas decimais apenas ao publicar os campos decimais persistidos/DTO; a UI pode arredondar somente para apresentação.
9. A leitura de custo usa versão corrente da ficha. Se houver uma versão mais nova ainda não validada, retorna `CURRENT_VERSION_NOT_VALIDATED`; não cai automaticamente numa versão antiga. Para versão validada, usa a medição real validada mais recente e o saldo/custo médio vigente num único snapshot MVCC. O DTO informa organização/unidade selecionadas, versão da receita, medição, horário do banco, fonte `inventory_moving_average`, sequências de estoque e razão de indisponibilidade quando aplicável.
10. Rejeitar ciclos transitivos entre receitas, incluindo referências que cheguem à própria ficha por vários níveis. Verificar no serviço e no banco sob trava transacional por organização/unidade; usar referências à versão exata. Definir limites seguros de expansão (profundidade máxima 16 e 500 ocorrências achatadas) com erro explícito, nunca truncar custo.
11. Todas as leituras e gravações exigem sessão de proprietário válida, contexto selecionado e entitlement existente `inventory_core`; não há entitlement novo nem cobrança. Serviço verifica titularidade antes do repositório; RLS força a mesma fronteira `organization_id` e `restaurant_id`. FKs compostas impedem versões, ingredientes, medições e referências cruzadas. Nenhum dado de pagamento, `service_role` no browser, SQL direto por cliente ou acesso a funcionários.
12. O contrato compartilhado expõe apenas uma consulta GET de custo validado/atual no App 01. Nenhum código do App 02 é criado. Quando App 02 existir, a própria API de precificação verificará `pricing_core` e consumirá este DTO por credencial/canal servidor autorizado; App 02 sem App 01 continua com custo manual conforme DEC-004. Não há endpoint de escrita ou sync reversa.

## Interfaces propostas

Os tipos abaixo são strings decimais canônicas para grandezas e valores; `UUID` é validado em toda entrada. Schemas Zod em `@donos/contracts` são a autoridade de runtime.

```ts
type RecipeKind = 'product' | 'preparation';
type RecipeOutputUnit = 'kg' | 'L' | 'un';
type RecipeComponent =
  | { id: string; kind: 'ingredient'; ingredientId: string; quantity: string;
      unit: InputUnit; conversion: ConversionSnapshot | null;
      role: 'ingredient' | 'packaging'; duplicateUseReason?: string }
  | { id: string; kind: 'recipe'; recipeVersionId: string; quantity: string;
      unit: RecipeOutputUnit; role: 'ingredient' | 'packaging'; duplicateUseReason?: string };
type TransformationKind = 'cleaning' | 'cooking' | 'loss' | 'other';
type RecipeVersionInput = {
  name: string; kind: RecipeKind; outputUnit: RecipeOutputUnit;
  components: RecipeComponent[];
  transformations: Array<{ id: string; kind: TransformationKind; label: string; position: number }>;
};
type YieldMeasurementInput = {
  kind: 'estimated' | 'measured'; observedAt: string; method: string;
  grossQuantity: string; netQuantity: string; finalQuantity: string; outputUnit: RecipeOutputUnit;
  transformationResults: Array<{ transformationId: string; inputQuantity: string; outputQuantity: string; unit: RecipeOutputUnit; gainReason?: string }>;
  portionCount?: string; portionQuantity?: string; supersedesMeasurementId?: string;
};
type RecipeCostDTO = {
  status: 'available' | 'unavailable'; reason: 'NO_CURRENT_AVERAGE' | 'NO_VALIDATED_MEASUREMENT' | 'CURRENT_VERSION_NOT_VALIDATED' | null;
  recipeId: string; recipeVersionId: string; measurementId: string | null;
  calculatedAt: string; source: 'inventory_moving_average'; currency: 'BRL';
  finalYield: { quantity: string; unit: RecipeOutputUnit } | null;
  batchCost: string | null; costPerFinalUnit: string | null;
  stockSources: Array<{ ingredientId: string; sequence: string; lastMovementId: string | null; averageCost: CostRatio }>;
};
```

`InputUnit` incorpora as unidades e conversões congeladas de estoque existentes. Conversão do componente composto (pré-preparo) admite apenas a dimensão da saída: massa entre kg/g, volume entre L/mL, ou contagem entre `un`. As quantidades normalizadas devem caber em `numeric(24,6)`; valores de custo em `numeric(38,12)`, alinhados ao Ciclo 02. `averageCost` preserva numerador e denominador como strings para evitar converter média em float.

Rotas propostas sob o contexto já usado pelo inventário:

- `GET /v1/organizations/:organizationId/restaurants/:restaurantId/recipes` lista fichas resumidas e status.
- `POST .../recipes` cria identidade e primeira versão em rascunho; cabeçalho `Idempotency-Key` obrigatório.
- `GET .../recipes/:recipeId` lê versão atual e histórico permitido daquela ficha.
- `POST .../recipes/:recipeId/versions` cria versão imutável; cabeçalho idempotente.
- `POST .../recipes/:recipeId/measurements` acrescenta estimativa/medição; cabeçalho idempotente.
- `POST .../recipes/:recipeId/measurements/:measurementId/validate` valida somente medição real completa; cabeçalho idempotente.
- `GET .../recipes/:recipeId/cost` retorna `RecipeCostDTO`, estritamente leitura e calculado em um snapshot de estoque.

O serviço público em `@donos/domain-recipes` valida conversões, grafo, limites, estágios e custo racional sem I/O. `@donos/db` implementa transações, leitura do grafo e gravação append-only. `apps/api` autoriza ator/contexto/entitlement, aplica idempotência nas escritas e mapeia erros estáveis (`RECIPE_CYCLE`, `RECIPE_EXPANSION_LIMIT`, `RECIPE_MEASUREMENT_REQUIRED`, `RECIPE_ESTIMATE_NOT_VALIDATABLE`, `RECIPE_COMPONENT_UNIT_MISMATCH`, `RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED`, `RECIPE_COST_UNAVAILABLE`). Não se reutiliza um endpoint genérico de CRUD.

## Modelo de dados e segurança

Nova migration `supabase/migrations/<timestamp>_recipes_yield.sql`, sob posse exclusiva do coordenador:

- `recipes`: `(organization_id, restaurant_id, id)`, nome, `kind`, `current_version_id`, arquivamento lógico e timestamps. É identidade; sem exclusão física.
- `recipe_versions`: chave composta de contexto e `(recipe_id, version_id)`, número monotônico, definição imutável, unidade de saída e autor. FKs compostas para receita no mesmo contexto.
- `recipe_transformations`: etapa imutável por versão, sequência única e tipo.
- `recipe_components`: componentes imutáveis por versão e `component_id`; exatamente uma das FKs `ingredient_id` ou `(child_recipe_id, child_version_id)`; unidade, quantidade, papel, fator de conversão congelado e justificativa explícita de uso repetido. Composite FKs levam organização/unidade até ingrediente ou versão filha.
- `recipe_yield_measurements`: versão monotônica por versão de receita, `estimated | measured`, usuário, data/método, bruto/líquido/final positivos, unidade, porções, sucessor opcional e restrições de consistência. Append-only.
- `recipe_transformation_measurements`: valores antes/depois por etapa e medição; dimensões consistentes e monotonicidade para limpeza/perda; ganho requer razão preenchida.
- `recipe_validation_events`: somente evento de validação da medição real, chave única por medição e mesmo contexto; guarda política de custo e snapshot imutável se disponível.
- `recipe_cost_snapshot_lines`: opcional por evento de validação com custo calculado e sequência/razão do saldo por insumo. Não substitui a leitura corrente; não há snapshot falso quando custo atual estiver incompleto.

Cada tabela exposta ao papel da aplicação tem `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`, políticas de proprietário/contexto com `auth.uid()` e contexto verificado, grants mínimos. Sem `SECURITY DEFINER`, `BYPASSRLS`, `service_role` no cliente ou tabela pública sem política. FKs compostas incluem `organization_id` e `restaurant_id` mesmo quando os IDs são UUIDs. O executor PostgreSQL da API não contorna RLS; transação define as claims/contexto no padrão já estabelecido no Ciclo 01/02. Toda escrita roda numa transação e preserva auditoria.

Antes da inserção de componente que aponta para versão de receita, uma trava advisory transacional escopada ao par organização/unidade serializa a validação do grafo. A verificação recursiva busca o caminho da versão filha até a versão pai; concorrência não pode criar ciclo por duas inserções simultâneas. Trigger de imutabilidade bloqueia UPDATE/DELETE em versões, medições, transformações, validações e snapshots; correções criam novos registros. Arquivar identidade não apaga história.

## Consistência de cálculo

- Usar a média canônica já projetada em `inventory_balance.averageCostRatio`, não recalcular preço de compra. Uma linha de insumo converte sua unidade para base com fator congelado e multiplica racionalmente pela média `numerator/denominator`.
- Para uma linha de pré-preparo, custo unitário atual da versão filha é custo total de seus componentes dividido pelo seu rendimento final medido; multiplicar pela quantidade usada. Descer recursivamente até folhas de estoque, preservando cada ocorrência, composição e sequência lida.
- Somar frações com `BigInt`/denominadores comuns; aplicar half-even ao serializar custo total e custo por saída na escala 12. Conversões de quantidade usam escala 6. Nenhuma etapa usa `parseFloat`, `Number` ou cast SQL `real/double precision`.
- Receita atual sem medição medida e validada, componente com estoque zerado ou componente com custo faltante retorna indisponível com razão estável. Custo de versão filha indisponível torna custo pai indisponível.
- Custo salvo na validação é evidência histórica do valor com sequências observadas naquele instante; consulta `GET` é recalculada com saldos atuais e timestamp do banco. Alterar saldo muda apenas projeção atual, preservando o snapshot.
- Medição de rendimento representa lote observado, não movimentação. Custo de produção, baixa de ingredientes, entrada de pré-preparo e reconciliação com estoque serão outro ciclo transacional.

## Testes de aceitação e cenários

Todos os testes de integração usam Supabase/Postgres de teste real, JWTs sintéticos e papéis/grants reais como `tests/helpers/inventory-fixtures.ts`; nenhum teste de isolamento é substituído por mock JS.

1. **T-11:** ficha sem medição real permanece draft/estimated, mostra alerta explícito e API não marca validada. Tentativa de validar estimativa retorna `RECIPE_ESTIMATE_NOT_VALIDATABLE` sem evento; medição real completa cria evento uma vez. Histórico fica imutável após a seguinte medição.
2. **T-12:** pré-preparo de molho utilizado em duas receitas distintas expande suas folhas uma vez por quantidade em cada receita, incluindo perda uma só vez no rendimento medido; duplicação acidental de linha na mesma composição é bloqueada até confirmação/razão, uso intencional permanece cobrado duas vezes. Embalagem explícita dentro do pré-preparo e repetida no pai dispara confirmação.
3. **T-16:** `GET .../cost` de ficha atual validada requer proprietário, contexto e `inventory_core`; responde com fonte, horário, versão, medição e sequências; somente GET, sem side effect. Anônimo, proprietário de outra organização/unidade e ID forjado não recebem custo. Futuro App02 é consumidor servidor, não ator do endpoint neste ciclo.
4. Quatro receitas com custos e saídas diferentes, testadas com Postgres e calculadora:
   - Molho/prep: carne 2 kg × R$12 + cebola 0,5 kg × R$4 = R$26 por lote; bruto 2,5 kg, líquido 2,3 kg, final 1,8 kg; saída R$26/1,8 = R$14,444444444444…/kg.
   - Lasanha: 0,3 kg do molho = R$13/3; massa 0,2 kg × R$10 = R$2; queijo 0,1 kg × R$20 = R$2; total 25/3 (R$8,333333333333…) e rendimento final 0,52 kg; custo/kg = 625/39 (R$16,025641025641…).
   - Pizza: 0,15 kg do molho = R$13/6; massa 0,25 kg × R$8 = R$2; queijo 0,12 kg × R$20 = R$2,40; total 197/30 (R$6,566666666667), saída final 0,47 kg; custo/kg = 13,971631205674… .
   - Hambúrguer: 0,2 kg do molho = R$26/9; pão 0,1 kg × R$12 = R$1,20; queijo 0,05 kg × R$20 = R$1; total 229/45 (R$5,088888888889), saída final 0,30 kg; custo/kg = 458/27 (R$16,962962962963…).
5. Conversão g/kg e mL/L, conversão de pacote congelada, unidade fracionada permitida/bloqueada, massa vs volume inválidos, quantidade fora de precisão e renda zero/negativa. Testar `un` fracionária respeitando `allowFractionalCount` do ingrediente.
6. Ciclo direto, indireto, composto por duas transações concorrentes, profundidade 17 e expansão 501 falham de forma atômica; grafo válido que reutiliza pré-preparo entre pais funciona.
7. Atualizar estoque de um insumo muda custo corrente e não snapshot anterior. Zero saldo remove média atual e não herda último preço. Falha após gravar metade da composição/medição reverte tudo. Repetição idempotente devolve a mesma versão/medição, chave igual com payload diferente conflita.
8. Contextos A1/A2 e tenant B: FKs compostas rejeitam ingrediente, filho de receita, medição e ID forjados de outro escopo; RLS nega SELECT/INSERT/UPDATE/DELETE por identidade cruzada mesmo com JWT autenticado. Nenhuma exclusão física de dado auditável.

## Opções consideradas

| Alternativa | Consequência | Decisão |
|---|---|---|
| Versões imutáveis de grafo, medição append-only, expansão racional em snapshot atual | Preserva histórico, custo e linhagem; exige controle de ciclos e limite de expansão | **Recomendada** |
| Sobrescrever composição/rendimento e armazenar custo na ficha atual | Simples no primeiro CRUD, mas perde histórico e torna difícil saber qual medição sustentou custo | Rejeitada |
| Materializar custo de cada linha já arredondado e somar valores exibidos | Pode acumular erro de arredondamento e esconder linhagem de perda/pré-preparo | Rejeitada |

## Fora de escopo e dúvidas reais

Fora: estoque de produção, consumo/debito, entrada de pré-preparo, fichas de variação/combo (App02), preço/margem/CMV do App02, telas de listas Premium, IA, cobrança, Storage, deploy e banco de produção. A interface de ciclo deste plano é somente a mínima para autor operar ficha e medição no App 01.

Resoluções aprovadas: saída final medida é o denominador de custo pronto; rendimento líquido fica registrado como etapa; componente repetido é permitido com confirmação e justificativa; consulta ao custo da versão atual não usa fallback de versão antiga; medição não movimenta estoque; estimativa nunca valida; arredondamento half-even em 12 casas.
