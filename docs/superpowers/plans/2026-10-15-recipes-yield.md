# Plano TDD — Ciclo 03: fichas e rendimentos

**Status:** submetido à revisão humana; implementação depende de aprovação explícita.  
**Spec:** `docs/superpowers/specs/2026-10-15-recipes-yield-design.md`  
**Branch de planejamento:** `codex/ciclo-03-recipes-yield`, derivada de `codex/ciclo-02-inventory` em `189fcbb`.  
**Limites:** somente Ciclo 03; coordenador é dono de contratos, migration, integração e PR. Não aplicar migration em produção, publicar deploy, mesclar PR nem iniciar ciclo seguinte.

## Estratégia de execução

Aplicar TDD em cada tarefa curta: escrever o teste que falha, executar e confirmar a falha esperada, implementar o menor recorte, rodar testes alvo e suíte afetada, então criar um commit pequeno. Cada checkpoint exige `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration` e `pnpm build` aplicáveis; integração somente contra Supabase local descartável ou projeto de teste explicitamente isolado, nunca produção.

Dependências em série: contratos → cálculo puro → migration → repositórios/serviço → API → UI. O teste de cálculo puro e a revisão de UX podem ser paralelos depois que o contrato indicado abaixo estiver congelado; os dois agentes não editam migration/contratos. A revisão UX que já foi feita é consultiva e não altera código. Antes de merge, obter nova revisão independente dos fluxos tenant, exatidão financeira e concorrência, com especial atenção à SQL/RLS.

## Arquivos e contratos

Contratos e schemas (coordenador):

- Editar `packages/contracts/src/recipes.ts` e `packages/contracts/src/recipe-schemas.ts`; exportar em `packages/contracts/src/index.ts`.
- Reutilizar `InputUnit`, `BaseUnit`, `CostRatio`, `UUIDSchema`, `ContextSelectionSchema`, `Page<T>` e strings decimais existentes em `packages/contracts/src/inventory.ts`, `packages/contracts/src/inventory-schemas.ts`.
- Definir `RecipeKind`, `RecipeOutputUnit`, discriminated union `RecipeComponentInput`, `RecipeVersionInput`, `YieldMeasurementInput`, `RecipeSummary`, `RecipeDetail`, `RecipeCostDTO`, erros e `RecipeCostReason`. Valores monetários/quantidades são string; nenhum `number` para quantia.
- Testes em `tests/unit/recipe-contracts.test.ts`: schema rejeita dimensões incompatíveis declaradas, falta de fator/contexto, número JSON, precisão inválida, duplicata sem confirmação, medição incompleta e `kind=estimated` submetido para validação; aceita casos válidos e normaliza apenas unidades canônicas conforme schema.

Pontos de entrada/saídas API:

- Novo `apps/api/src/routes/recipes.ts`, registrado em `apps/api/src/app.ts`.
- Novo `apps/api/src/services/recipes.ts` e `apps/api/src/services/recipe-types.ts`.
- Novos `packages/db/src/recipe-repository.ts` e `packages/db/src/recipe-cost-repository.ts`, exportados em `packages/db/src/index.ts`.
- Novo `packages/domain-recipes/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/units.ts`, `src/graph.ts`, `src/yield.ts`, `src/cost.ts`; registrar workspace e referências TypeScript nos arquivos de raiz pertinentes (`package.json`, `pnpm-workspace.yaml`, `tsconfig.json`). Não criar dependência npm sem versão fixada/lockfile.
- Os métodos do domínio são puros: `convertRecipeQuantity(input, conversion)`, `validateRecipeGraph(parentVersionId, childVersionId, adjacency)`, `validateYieldMeasurement(version, measurement)`, `calculateRecipeCost(graph, balances, measurement)`.
- Os métodos de serviço seguem o padrão do Ciclo 02: `listRecipes`, `createRecipe`, `getRecipe`, `createRecipeVersion`, `recordYieldMeasurement`, `validateYieldMeasurement`, `getRecipeCost`; todos recebem ator/contexto verificado. Escritas usam `withRestaurantTx`, exigem `inventory_core`, `Idempotency-Key` e escrevem auditoria. Custo GET é leitura autorizada e sem idempotência/mutação.
- Rotas: `GET/POST .../recipes`, `GET .../recipes/:recipeId`, `POST .../recipes/:recipeId/versions`, `POST .../recipes/:recipeId/measurements`, `POST .../recipes/:recipeId/measurements/:measurementId/validate`, `GET .../recipes/:recipeId/cost` sob `/v1/organizations/:organizationId/restaurants/:restaurantId`.

Banco sob posse do coordenador:

- Criar com CLI conforme `pnpm exec supabase migration new recipes_yield`; preencher `supabase/migrations/<timestamp>_recipes_yield.sql` com `recipes`, `recipe_versions`, `recipe_transformations`, `recipe_components`, `recipe_yield_measurements`, `recipe_transformation_measurements`, `recipe_validation_events`, índices e grants/policies/FKs/triggers.
- Trigger de ciclo serializa com advisory xact lock pelo contexto; recursão percorre versões exatas; valida profundidade/nós; verificar corrida usando duas conexões no teste. Incluir `FORCE ROW LEVEL SECURITY`, funções invoker e nenhuma rotina privilegiada.
- Imutabilidade: `UPDATE/DELETE` negados em versões, componentes/transformações, medições, eventos de validação e snapshot; atualização da identidade só permite `current_version_id`/arquivamento de acordo com a autorização e transação.
- Integrar ações de auditoria `recipe.version.created`, `recipe.measurement.recorded`, `recipe.measurement.validated` na restrição existente sem relaxar ações atuais; usar idempotência já existente do Ciclo 02.
- Adicionar fixture SQL `tests/integration/sql/recipe-fixtures.sql`; adaptar `tests/helpers/recipe-fixtures.ts` com pelo menos dois tenants e duas unidades com JWT/contextos reais do harness; não colocar chave privilegiada no app/browser.

## Tarefas pequenas e commits

### 0. Preflight e base isolada

1. Confirmar `git status`, branch, base e remote; garantir checkout do DONOS Next e confirmar que o caminho legado não está como destino de qualquer comando. Não alterar legado.
2. Confirmar que o plano está aprovado e que integração aponta a banco local descartável/teste. Sem aprovação, encerrar antes de iniciar esta tarefa.
3. Commit esperado de documentos já preparado antes de abrir implementação; manter PR do ciclo anterior separado.

### 1. Contratos executáveis

**Teste primeiro:** `tests/unit/recipe-contracts.test.ts`, conforme casos acima; executar `pnpm test:unit -- recipe-contracts` e observar falhas por módulo/schema ausente.

**Implementar:** arquivos contracts listados; validar por Zod runtime e exportar tipos. Fazer schemas distintas para versão, medição e validação; não aceitar `validated: true` no payload de criação/edição.

**Verificar/commit:** contratos unitários, `pnpm typecheck`, lint; commit `feat(contracts): define recipe and measured yield APIs`.

### 2. Núcleo exato, conversão, rendimento e grafo (agente de fórmulas; coordenador revisa)

**Fronteira congelada:** `@donos/domain-recipes` recebe os tipos e snapshots definidos na tarefa 1; o agente só edita `packages/domain-recipes/**` e `tests/unit/recipe-calculation.test.ts`. Não toca contratos, SQL, migrations, DB/API ou UI.

**Teste primeiro:** cenários de molho, lasanha, pizza e hambúrguer do spec; conversões kg-g/L-mL/un; conversão por fator congelado; half-even/scale/range; cada custo por saída com rendimento distinto; ciclos, profundidade 17, expansão 501, duplicata confirmada, ingrediente/embalagem explícita e zero sem saldo. Asserções decimais string exatas (12 casas quando serializadas), sem tolerância float. Executar testes e verificar falhas esperadas.

**Implementar:** `domain-recipes` puro com `BigInt`/racionais; para evitar duplicar o arredondamento crítico do estoque, propor extrair primitivas determinísticas compartilhadas de `packages/domain-inventory/src/decimal.ts` para `packages/domain-numeric/` (arquivos `package.json`, `tsconfig.json`, `src/index.ts`) e manter compatibilidade por re-export do pacote Inventory. Esta extração só prossegue se os testes existentes de decimal/valuation do Ciclo 02 provarem equivalência; o coordenador aprova a fronteira antes da edição. Sem extração, `domain-recipes` implementa os mesmos vetores/escala com decisão registrada, nunca usa floats.

**Verificar/commit:** `pnpm test:unit -- recipe-calculation`, `pnpm test:unit -- inventory-decimal inventory-valuation`, typecheck/lint; commit `feat(recipes): calculate exact yield-based recipe costs`.

### 3. Schema, RLS, referências e integridade (coordenador)

**Teste primeiro:** `tests/integration/recipe-schema.test.ts`, `recipe-tenant-security.test.ts` e `recipe-graph-concurrency.test.ts`; adicionar SQL de teste para FKs inválidas, grants, policies/RLS forçada, referências A→B e corrida de ciclos. Confirmar falha por relação ausente/invariante não implementada.

**Implementar:** migration e fixtures SQL listadas; restrições explícitas de quantidade/unidade/contexto; trigger de ciclo seguro contra corrida; triggers de append-only; índices de leitura e caminhos recursivos; políticas de dono conforme implementação atual. Nenhum DDL em ambiente cloud/produção.

**Verificar/commit:** `pnpm supabase:test:reset`/comando efetivamente documentado no repo contra instância local, integração SQL, grants, tenant e corrida; commit `feat(db): add isolated recipe and yield schema`.

### 4. Repositório e comandos de versão/medição (coordenador)

**Teste primeiro:** `tests/integration/recipe-commands.test.ts`: criar ficha, criar nova versão, registrar estimativa/medição, não validar estimativa, validar real, corrigir por medição sucessora, idempotência, payload conflitante, falha de etapa reverte tudo, contexto A1/A2 e tenant B. Esperar falhar em chamadas inexistentes.

**Implementar:** `recipe-repository.ts`, ações de auditoria, serviço de domínio/repositorio para escrita, autorização + `inventory_core` e chaves idempotentes. Locking concorrente por ficha durante geração de número de versão/medição. Não permitir update/delete de histórico.

**Verificar/commit:** testes reais no Postgres, suíte inventory sem regressão, typecheck/lint; commit `feat(recipes): persist immutable recipe versions and measurements`.

### 5. Custo atual, snapshot histórico e API somente leitura (coordenador)

**Teste primeiro:** `tests/integration/recipe-cost-api.test.ts` com os quatro cálculos PostgreSQL do spec, versão atual não validada, versão antiga, zero de estoque, qualquer custo faltante, sub-preparo compartilhado em dois pais, unidades inválidas, source/sequence/timestamp, tenant/unidade, sessão ausente, `inventory_core` off, ID forjado e nenhum efeito colateral do GET. Confirme leitura na mesma consulta/snapshot DB e sem mock do saldo.

**Implementar:** repositório de custo recursivo e `getRecipeCost`, cálculo puro compartilhado, rotas Zod com autorização padrão, DTO com valores strings e origem. Ao validar medição, registrar snapshot imutável dos saldos/sequências disponíveis sem impedir validação quando não houver saldo; leitura corrente retorna indisponível se não conseguir valorar todas as folhas. Não implementar consumidor App02 ou `pricing_core` neste ciclo.

**Verificar/commit:** integração SQL/API, T-11/T-12/T-16, tenant, inventário e unit; commit `feat(api): expose authorized current recipe cost`.

### 6. Operação mínima no App 01 (após contrato e rotas congelados)

**Teste primeiro:** expandir `tests/e2e/recipe-flow.spec.ts`: proprietário abre fichas, cria rascunho, adiciona linhas de insumo ou pré-preparo, mede bruto/líquido/final, vê estimativa destacada, tentativa de validar sem medição real fica bloqueada com explicação, mede/valida e vê custo/fonte/data; context switch não carrega dados anteriores; tenant B não acessa IDs de A. E2E não substitui integração SQL.

**Implementar:** `apps/estoque/src/recipes/recipes-client.ts`, `RecipesWorkspace.tsx`, `RecipeEditor.tsx`, `YieldMeasurementForm.tsx`, `RecipeCostPanel.tsx`; incorporar link/estado em `apps/estoque/src/inventory/InventoryWorkspace.tsx` ou roteamento atual em `apps/estoque/src/App.tsx` conforme desenho existente. UI mínima acessível e protegida, sem criar CRUD genérico, lista Premium, IA ou telas de preço/App02.

**Execução opcional de UI por agente:** depois que contratos/rotas forem congelados, UX agent pode editar apenas `apps/estoque/src/recipes/**`; coordenador faz a integração do shell (App/InventoryWorkspace), revisa diff e executa E2E. Agente não altera contratos, SQL nem serviços.

**Verificar/commit:** E2E alvo, lint/typecheck/build; commit `feat(estoque): add measured recipe workflow`.

### 7. Revisão independente e encerramento do Ciclo 03

**Teste primeiro:** rodar testes de regressão e revisar gates listados; consertar defeitos como tarefas TDD pequenas, com novos testes de regressão.

**Revisão:** agente independente lê diff/SQL/contratos/fluxo e retorna achados priorizados sobre RLS/FKs, custo racional e arredondamento, concorrência de ciclos, imutabilidade e fronteira App02. Coordenador resolve todos os bloqueadores; comentários não confirmados ficam registrados como limitação.

**Verificação final (registrar saídas reais):** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e -- recipe-flow`, `pnpm build`, `git diff --check`; se algum comando não existir, registrar o script realmente correspondente do `package.json`, nunca declarar aprovação sem executar. Testar reset local antes de integração final. Não usar URL/credencial da produção.

**Entrega:** commits pequenos na branch `codex/ciclo-03-recipes-yield`, relatório de arquivos/decisões/testes reais/limitações/riscos, publicar branch no remote novo e abrir PR apenas após concluir validações e revisão; anexar PR ao chat. Não mesclar. Parar para revisão humana antes de qualquer ciclo seguinte.

## Falhas esperadas, rollback e checkpoints

- Migration/RLS falhou no banco efêmero: não contornar com grants amplos; identificar policy/FK/trigger e corrigir com teste regressivo. Reset apenas do banco local descartável.
- RLS passa pelo repositório mas falha com papel/JWT real: bloquear milestone até grants/claims e teste cross-tenant passarem. A API validar contexto sozinha não substitui RLS.
- Diferença de custo > escala publicada, float ou perda duplicada: bloquear domínio/API; conferir numerador/denominador, conversão, ocorrência de componente e denominador final.
- Corrida de ciclo, versão ou medição: bloquear milestone; reproduzir com duas conexões concorrentes e manter testes determinísticos.
- Estoque sem média ou versão sem validação: retorno `unavailable` com razão e UI informativa; não cair para fornecedor, custo antigo ou preço estimado.
- Falha de escrita parcial: a transação inteira falha e a chave idempotente não deixa evento/versão órfã. Repetição da mesma chave/payload retorna resultado original; payload diferente conflita.
- PR anterior ainda aberto é base desta branch; não rebasear/mesclar produção nem reescrever commits alheios. Se a base remota divergir, parar e atualizar plano antes de mexer em histórico compartilhado.

## Checkpoints para revisão

1. Aprovação da spec, sobretudo denominator final, repetição confirmada, versão filha fixada e limite de expansão.
2. Aprovação das interfaces Zod/DTO antes de delegar cálculo/UI.
3. Revisão do diff da migration e testes RLS/ciclos antes de migrar banco de teste persistente.
4. Revisão das evidências de quatro receitas no Postgres e isolamento antes de criar PR.
5. Revisão humana do PR para encerrar Ciclo 03; não começar Ciclo 04 sem comando explícito.
