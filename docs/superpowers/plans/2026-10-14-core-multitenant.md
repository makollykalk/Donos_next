# Core multitenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. O método solicitado é coordenador com subagentes especializados; contratos, migrations e integração permanecem exclusivamente com o coordenador.

**Goal:** Provar localmente autenticação de donos, criação/seleção de empresas e unidades, isolamento API/RLS e entitlements/medição simulados, com três frontends mínimos e uma API.

**Architecture:** Monorepo pnpm, React/Vite, API Fastify e PostgreSQL/Supabase local. Schema privado core com role de runtime NOBYPASSRLS, transações contextuais e serviços explícitos. Apps só consomem API de negócio e Auth; não escrevem tabelas diretamente.

**Tech Stack:** Pins candidatos da ADR 0001: Node 24.22.0, pnpm 11.25.0, TypeScript 6.0.3, React 19.3.1, Vite 8.3.4, Fastify 5.12.7, Supabase JS 2.117.3/CLI 2.121.0, pg 8.23.1, Zod 4.6.7, Vitest 5.0.4, Playwright 1.64.1, PostgreSQL major 17 local a confirmar.

**Spec:** [2026-10-14-core-multitenant-design.md](../specs/2026-10-14-core-multitenant-design.md). Ler junto à [ADR](../../adr/0001-decisoes-arquiteturais.md), V3, aceite, roadmap e AGENTS antes da execução.

Status em 14/10/2026: somente plano. Todas as caixas abaixo estão abertas. Nenhum teste de produto, instalação, SQL, build, commit ou deploy foi executado nesta rodada.

## Global Constraints

- Implementação só após aprovação do plano. Criar Git exclusivamente nesta raiz nova, sem remote herdado, e branch `feat/ciclo-01-core-multitenant`.
- Pins candidatos da ADR: Node 24.22.0; pnpm 11.25.0; TypeScript 6.0.3; versões exatas e lockfile, compatibilidade real condicionada a instalação/teste.
- PostgreSQL major 17 local, confirmar imagem/digest efetivos antes de SQL. Docker não foi encontrado no PATH nesta auditoria.
- Schema `core` não exposto; runtime `donos_api` NOBYPASSRLS e não owner; role de migrations separada. Sem `service_role` no browser ou no runtime normal da API.
- SQL parametrizado, transação numa conexão; contexto via configuração local à transação; nenhum JWT/contexto global compartilhado entre requests.
- Apenas dados sintéticos e Supabase em loopback. Scripts rejeitam hosts remotos, referências de projetos reais e execução destrutiva fora de ambiente de teste explicitamente nomeado.
- Dinheiro/quantidade em string decimal; counters bigint em string JSON. Sem float em cálculos críticos. Sem cálculo monetário no core.
- Nenhuma instalação de integração paga, cobrança, chamada de modelo, WhatsApp, alteração de produção ou leitura de dumps.

## Review Focus

1. Pool reutilizado após exception/rollback não pode conservar ator, empresa ou unidade — Task 3.
2. Logout com refresh ainda válido e request já iniciado deve obedecer à garantia explícita da spec — Task 4.
3. Criação simultânea com mesma chave e falha entre empresa/unidade/auditoria não deixa duplicata ou parcial — Task 5.
4. Cancelamento, virada de período e timeout depois de despacho não liberam quota indevida nem duplicam chamada — Task 6.
5. Resposta atrasada/formulário aberto em A1 não reaparece nem é enviado como A2 — Task 7.

## Checkpoint 0 — aprovação, Git e pré-requisitos

- [ ] Obter aprovação humana desta spec/plano, sem inferir autorização para remoto/produção. Registrar no relatório do ciclo a mensagem que aprovou.
- [ ] Repetir `Get-Location`, `git rev-parse --show-toplevel`, `git remote -v`, `git branch --show-current`, `git status --short --branch`. A raiz autorizada é `C:/Users/Matheus/Documents/ChatGPT/Donos 2/DONOS_NEXT_CODEX_MULTIAGENTES_KIT`. Se existir Git novo, preservar alterações e verificar remotes; se apontar para legado, parar sem editar.
- [ ] Na ausência de Git, inicializar somente local com `git init -b main`; conferir identidade disponível, sem inventá-la. Commit inicial apenas dos 22 arquivos do kit/documentação inspecionados, adicionados por caminhos explícitos (nunca git add .); criar `feat/ciclo-01-core-multitenant`. Ignores de código entram na Task 1. Sem GitHub/remote/PR ainda. Se identidade faltar, continuar preparo sem commit e pedir dado necessário.
- [ ] Conferir Node/pnpm e Docker engine (`docker version`, não apenas comando instalado). Node alvo 24.22.0; não atualizar globalmente sem necessidade/registro. Se Docker depender de instalação/licença/ação do usuário, resolver esse pré-requisito antes do gate SQL; não usar banco remoto como atalho.
- [ ] Registrar baseline de arquivos e confirmar ausência de `.vercel`, projeto Supabase linkado ou credenciais legadas. Não abrir nem copiar .env legado.

Git passa a ter conteúdo somente depois desta aprovação; as instruções de commit abaixo não foram executadas. Criar remote/PR ficará pendente de destino novo autorizado; até lá, entregar commits locais e diff para revisão, sem merge automático.

## Mapa de arquivos e responsabilidade

Todos os caminhos abaixo são relativos à raiz nova. Não existem ainda, salvo os documentos desta rodada. Os arquivos exatos estão discriminados nas Tasks; este mapa fixa fronteiras:

| Área | Responsável | Responsabilidade |
|---|---|---|
| packages/contracts | Coordenador | DTOs v1, schemas estritos, erros, formatos decimais |
| packages/db + supabase/migrations | Coordenador | SQL, grants/RLS, pool, transações, repositórios |
| packages/domain-core | Coordenador | Propriedade, bootstrap, unidades, contexto, idempotência |
| packages/domain-billing | Coordenador | Gates e reserve/settle/release, sem cobrança |
| apps/api | Coordenador | Auth, rotas, CORS, logs e erros |
| packages/auth-client + apps/portal, estoque, precificacao | Subagente UI após contratos congelados | Login e navegação mínima, contexto por aba |
| tests e docs/evidence | Coordenador + revisor em leitura | Evidência de unidade, SQL real, API e browser |

Migrations têm nomes gerados pela CLI, não timestamps inventados: M01 é saída de `pnpm exec supabase migration new core_identity`; M02, `core_commercial_simulation`. Antes de escrever cada SQL, registrar o caminho exato emitido em `docs/evidence/ciclo-01.md` e substituir a referência M01/M02 deste plano pelo caminho. Essa resolução de nome no checkpoint é a única exceção aos caminhos fixos; não é autorização para inventar migrations nem editar schema fora do diretório versionado. Validar `--help` da CLI fixada antes dos comandos.

## Task 1 — Contratos, API mínima e ferramentas reproduzíveis

**Create:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `.node-version`, `.gitignore`, `.env.example`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts`; `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/core.ts`, `packages/contracts/src/schemas.ts`, `packages/contracts/src/errors.ts`, `packages/contracts/src/index.ts`; `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/config.ts`; `tests/unit/contracts.test.ts`, `tests/unit/config.test.ts`, `tests/unit/health.test.ts`; `docs/evidence/ciclo-01.md`.

**Interfaces:** Produz tipos/schemas da spec e `buildApp(deps: AppDependencies): FastifyInstance`; `AppDependencies` começa vazio e recebe Auth/serviços por Tasks posteriores. `loadConfig(env: Record<string,string|undefined>): ApiConfig` aceita somente URLs loopback em development/test. Não haverá enum comercial além das seis chaves V3. `DecimalString` valida representação, não implementa aritmética.

- [ ] Preparar apenas harness de teste/configuração; consultar e fixar dependências necessárias listadas na ADR, com save-exact e peer checking estrito. Não instalar decimal.js, PWA, UI kit, providers ou SDK de deploy. Registrar a justificativa e resolver peers antes de executar código do produto.
- [ ] Escrever primeiro os testes com import das interfaces ainda ausentes. Assertions mínimas:

```ts
expect(CreateOrganizationSchema.safeParse({name:' Loja ', firstRestaurant:{name:'Matriz'}}).success).toBe(true);
expect(CreateOrganizationSchema.safeParse({name:'Loja', firstRestaurant:{name:'Matriz'}, owner_user_id: B}).success).toBe(false);
for (const bad of ['NaN','Infinity','1e3','1,25','+1','-0','01','1.0','0.1234567890123'])
  expect(DecimalStringSchema.safeParse(bad).success).toBe(false);
expect(DecimalStringSchema.parse('22.333333333333')).toBe('22.333333333333');
expect(IntegerStringSchema.safeParse('9223372036854775808').success).toBe(false);
expect(() => loadConfig({...localEnv, DATABASE_URL:'postgres://x@example.com/db'})).toThrow();
expect((await buildApp({}).inject('/health')).json()).toEqual({status:'ok'});
```

- [ ] Rodar `pnpm exec vitest run tests/unit/contracts.test.ts tests/unit/config.test.ts tests/unit/health.test.ts`; registrar FAIL pela ausência/comportamento do contrato. Erro de instalação não é red funcional; corrigir harness antes de marcar o red.
- [ ] Implementar os arquivos de contrato/config/API mínima. Fastify escuta loopback em dev; nenhum acesso de domínio. Fixar nomes públicos da spec; erros sem stack/SQL. Config não imprime env. Scripts raiz: `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e`, `build`; scripts de integração/E2E falham explicitamente enquanto indisponíveis, sem passWithNoTests.
- [ ] Reexecutar comando de teste, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Esperado: todos os testes especificados PASS, sem erro de peers/tipos. `pnpm install --frozen-lockfile` deve reproduzir resolução. Registrar versões efetivas, licenças e auditoria de dependências; vulnerabilidade relevante bloqueia o checkpoint até tratar.
- [ ] `git diff --check`; stage somente arquivos listados desta Task e commit `chore: establish core contracts and local toolchain`.

**Checkpoint 1:** contrato de schemas aceito; pins/lock compatíveis na execução. Mudança de TypeScript/React/Vite major pede revisão desta ADR antes de seguir. Coisas que não forem instaladas/testadas ficam explicitamente não verificadas.

## Task 2 — Schema de identidade e RLS sem privilégios implícitos

**Create:** `supabase/config.toml`, `vitest.integration.config.ts`; migration M01 `core_identity` gerada pela CLI; `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/types.ts`; `scripts/assert-local.mjs`, `scripts/db-local.mjs`, `scripts/seed-local.mjs`; `tests/helpers/local-db.ts`, `tests/helpers/fixtures.ts`, `tests/integration/schema.test.ts`, `tests/integration/grants.test.ts`; atualizar `package.json` e `docs/evidence/ciclo-01.md`.

**Interfaces:** `assertLocalTarget(url:string, projectId:string): void` recusa não loopback/projeto diferente de `donos-next-local`; `createFixtures(): Promise<FixtureSet>` cria A/A1/A2/C/C1/B/B1 com Auth local e contas confirmadas. Fixtures usam credencial administrativa apenas do ambiente local, nunca importada em apps. `connectRuntime(): Promise<PoolClient>` conecta com donos_api. `Tx`/`ParameterizedQuery` conforme spec; admin fixture e runtime são conexões distintas.

- [ ] Usar CLI fixada/help para iniciar Supabase exclusivamente local. Configurar projeto `donos-next-local`, Auth local e major PG17; registrar versões/digest e connection roles sem segredos. Nunca `link`, `db push` remoto ou `db reset` sem `--local` e guardas. `db-local.mjs` exige loopback, project ID correto e flag explícita de ambiente descartável antes de reset; sem exclusão de diretórios.
- [ ] Escrever testes contra banco novo sem M01: tabelas/policies ausentes devem falhar. Assertions: organizations admite dono com duas empresas; owner é obrigatório; restaurants tem FK composta; DELETE de dono/organização com referência é RESTRICT; role runtime não é owner, superuser nem BYPASSRLS; nenhuma membership privilegiada; anon/authenticated/PUBLIC não possuem domínio/EXECUTE; trilha não aceita UPDATE/DELETE.
- [ ] Rodar `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/schema.test.ts tests/integration/grants.test.ts`. Esperado FAIL por objetos inexistentes, não por conexão indisponível. Config de integração não é incluída em test:unit; testes SQL têm fixtures isoladas e execução serial entre arquivos, paralelismo apenas controlado dentro dos testes de concorrência.
- [ ] Criar M01 pela CLI, registrar caminho, escrever apenas schema core de identidade da spec: organizations, restaurants, session_revocations, request_contexts, idempotency_records, audit_events; índices, FKs, checks, grants e policies. Provisionar roles sem senha no SQL versionado; segredo local gerado pelo provisionador e guardado fora do Git. Role migration dona do schema não é runtime. Helpers invoker para leitura segura de app.user_id/org/unit. Inicialmente negar caminhos sem contexto.
- [ ] Aplicar M01 em local descartável via wrapper; executar testes, incluindo query direta com runtime e JWT/anon via Data API que deve ser negada. Se Data API desativada, testar privilégio SQL real em complemento, sem confundir indisponibilidade com RLS. Inspecionar grants/default privileges e uso de FORCE RLS. Esperado PASS com rows vazias/42501/23503 conforme caso, assertando estado final intacto.
- [ ] Recriar banco local descartável e reaplicar M01 para provar bootstrap reproduzível; não criar down que destrua dados reais. `git diff --check`, stage arquivos da Task e commit `feat: add owner and organization schema with restrictive grants`.

**Checkpoint 2:** SQL real funcionando localmente, papéis comprovados e migrations identificadas por caminho exato. Sem Docker/banco, parar este gate; testes unitários não o substituem. Não usar usuário postgres para comprovar isolamento runtime.

## Task 3 — Transações com contexto e isolamento no pool

**Create:** `packages/db/src/pool.ts`, `packages/db/src/transaction.ts`, `packages/db/src/identity-repository.ts`, `packages/db/src/index.ts`; `tests/integration/tenant-transactions.test.ts`, `tests/integration/unit-references.test.ts`. **Modify:** M01 se ainda não distribuída fora deste branch, contrato de dependência local do pacote e `docs/evidence/ciclo-01.md`.

**Interfaces:** Produz `withActorTx`, `withOrganizationTx`, `withRestaurantTx` com assinaturas da spec; verificação do token opaco usa callback interno `resolveContextHash` que Task 4 implementará. Para testar esta Task, fixtures inserem hashes/contextos sintéticos via admin local. Repositório: `listOwnedOrganizations(actor,tx): Promise<Organization[]>`, `listRestaurants(ctx,tx): Promise<Restaurant[]>`; construtores de contextos permanecem internos.

- [ ] Escrever testes com statements reais. Fixtures têm A e C do mesmo dono, B de outro. Com ator A, SELECT da empresa B devolve zero; tentativa de INSERT em B dá erro e zero linhas novas. Com organização A, listRestaurants não retorna C1/B1. Contexto A1 não aceita A2. Criar tabela temporária de teste com FK tripla e provar referência A1→A2 rejeitada; removida automaticamente no rollback.
- [ ] Acrescentar teste de pool max=1: transação A faz throw depois de set_config; próxima transação B e query sem contexto não enxergam A. Repetir com commit e múltiplos requests paralelos. Assertions de identidade separada e nenhum contexto fora da transação.
- [ ] Rodar `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/tenant-transactions.test.ts tests/integration/unit-references.test.ts`; esperado FAIL antes do wrapper (símbolo ausente ou dados fora do escopo).
- [ ] Implementar BEGIN → ator verificado → consulta de propriedade → set_config org/unit parametrizado → callback → COMMIT; exception sempre ROLLBACK/finally release. Não concatenar IDs em SQL. Contexto ausente falha fechado. Ownership de organizations não depende de org ativa; tabelas organizacionais e locais exigem seus contextos. Resultados numeric/bigint não são convertidos para number.
- [ ] Reexecutar esses testes e schema/grants. Incluir teste de SQLSTATE 40001/40P01: até duas novas tentativas somente em wrapper de comando idempotente (Task 5), sem retry genérico de efeitos externos; nesta Task, propagar conflito sem esconder erro. Esperado PASS com estado restaurado depois de falhas.
- [ ] `pnpm typecheck`, `git diff --check`; commit `feat: enforce transaction scoped tenant and unit access` com arquivos desta Task.

**Checkpoint 3:** separação actor/org/restaurant estável; coordenador congela as assinaturas usadas por serviços. Não delegar alterações paralelas de pool, SQL ou contratos.

## Task 4 — Identidade verificada, revogação e contexto opaco

**Create:** `apps/api/src/auth/verify-actor.ts`, `apps/api/src/auth/revocation.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/contexts.ts`, `apps/api/src/http/errors.ts`, `apps/api/src/http/security.ts`; `packages/domain-core/package.json`, `packages/domain-core/tsconfig.json`, `packages/domain-core/src/context.ts`, `packages/domain-core/src/types.ts`, `packages/domain-core/src/index.ts`; `packages/db/src/context-repository.ts`; `tests/unit/auth.test.ts`, `tests/integration/auth-context.test.ts`, `tests/integration/logout.test.ts`. **Modify:** `apps/api/src/app.ts`, config e package manifests necessários.

**Interfaces:** `verifyActor(accessToken,requestId): Promise<VerifiedActor>`; `revokeSession(actor): Promise<void>`; `selectContext(actor,input): Promise<SelectedContext>`; `resolveContextHash(actor,token,tx): Promise<ContextSelection>`; endpoints me/logout/contexts. ContextSelection é DTO, VerifiedActor/contexts têm branding privado; nunca cast de request body.

- [ ] Escrever testes de Auth adapter com mesmo bearer em getClaims/getUser e assert claims.sub=user.id. Rejeitar expired/issuer/audience errados, session_id ausente, metadata admin, anônimo e não confirmado. Dependência indisponível → 503, zero queries de negócio. Integração inclui dois JWTs reais do Auth local e token adulterado.
- [ ] Escrever testes de contexto: TTL de 30 min pelo banco; token CSPRNG tem 32 bytes e somente SHA-256 é persistido; token de outra sessão não funciona; rota A2 com token A1 →409; token expirado→409 CONTEXT_EXPIRED; logs não contêm Authorization/token/context/refresh. Instância Auth server não guarda sessão entre requests.
- [ ] Escrever teste de logout: revogação confirma antes do client signOut local; request autorizada depois do commit dá401; request já autorizada pode concluir (barreira determinística). Token renovado com mesmo session_id continua bloqueado. Logout repetido dá204. Não há limpeza automática por exp. Falha de gravação dá503 e não promete revogação; falha posterior do provedor não apaga revogação.
- [ ] Rodar `pnpm exec vitest run tests/unit/auth.test.ts` e `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth-context.test.ts tests/integration/logout.test.ts`; esperado FAIL nos casos acima.
- [ ] Implementar validação, redaction/no-store/CORS allowlist e rotas. Resolver revogação/contexto em actor scope antes de configurar tenant. Use Node crypto para token/hash, não UUID previsível como segredo. O endpoint logout só grava revogação; o client autenticado chama Supabase signOut local na Task 7.
- [ ] Rodar testes Auth/context/logout + Tasks 1–3. Esperado PASS e ausência de qualquer token nos logs capturados. `pnpm typecheck`, `pnpm lint`, `git diff --check`.
- [ ] Stage arquivos da Task; commit `feat: verify owner sessions and bind explicit unit contexts`.

## Task 5 — Bootstrap atômico e criação de unidades idempotente

**Create:** `packages/domain-core/src/organizations.ts`, `packages/domain-core/src/restaurants.ts`, `packages/db/src/idempotency.ts`, `packages/db/src/audit-repository.ts`, `apps/api/src/routes/organizations.ts`; `tests/unit/idempotency-hash.test.ts`, `tests/integration/organization-commands.test.ts`, `tests/integration/core-api.test.ts`. **Modify:** app.ts e exports dos pacotes core/db.

**Interfaces:** createOrganization/createRestaurant da spec; `executeIdempotent<T>(scope: IdempotencyScope, operation:string, key:string, input:unknown, fn:(tx:Tx)=>Promise<T>): Promise<T>`; `IdempotencyScope = {kind:'actor';actor:VerifiedActor} | {kind:'organization';context:OrganizationContext}` fica em `packages/db/src/idempotency.ts`, nunca escolhido pelo cliente. `appendAudit(ctx, event:{action,entityId,requestId,metadata},tx): Promise<void>`. Hash usa payload validado/normalizado, operação e unidade quando existente.

- [ ] Escrever testes de comando: owner recebido no DTO→400; bootstrap de A produz organization.owner=A e uma unidade; duas chamadas simultâneas com mesma key/hash devolvem IDs idênticos e uma auditoria; mesma key/dados diferentes→409. Mesma chave sob outro ator/org não recupera resultado alheio.
- [ ] Injetar falhas após criar organização, após primeira unidade e antes de resposta idempotente: zero linhas parciais após rollback. Inserção concorrente perde disputa de chave e aguarda commit; rollback do vencedor permite retry seguro. Tentar criar/listar unidade em B com token A→404; own org C não aparece na consulta A.
- [ ] Rodar `pnpm exec vitest run tests/unit/idempotency-hash.test.ts` e `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/organization-commands.test.ts tests/integration/core-api.test.ts`; esperado FAIL antes dos serviços/rotas.
- [ ] Implementar rotas exatas da spec, sem PATCH/DELETE/CRUD universal. Idempotency-Key obrigatória nas duas criações. Disputar chave na transação antes das escritas; no conflito comparar hash e devolver resposta persistida após reautorizar. Criar organização e primeira unidade + auditoria + resultado no mesmo commit. Não conceder planos no bootstrap.
- [ ] Implementar retry limitado de 40001/40P01 na operação idempotente inteira, com duas novas tentativas; teste barreiras determinísticas e estado após exaustão 503. Reexecutar unit/integration pertinentes. Assert 201/body original no replay, não apenas contagem de registros.
- [ ] `pnpm typecheck`, `pnpm lint`, `git diff --check`; stage da Task e commit `feat: create organizations and units atomically with idempotency`.

**Checkpoint 4:** endpoints de core e contexto congelados, teste entre contas e empresas do mesmo dono passou em API/SQL. UI pode começar em arquivos exclusivos depois deste checkpoint; se coordenador ainda alterar contratos, suspender UI até sincronizar versão.

## Task 6 — Gates de acesso e metering simulado transacional

**Create:** migration M02 `core_commercial_simulation` pela CLI; `packages/domain-billing/package.json`, `packages/domain-billing/tsconfig.json`, `packages/domain-billing/src/entitlements.ts`, `packages/domain-billing/src/usage.ts`, `packages/domain-billing/src/index.ts`; `packages/db/src/billing-repository.ts`; `apps/api/src/routes/capabilities.ts`, `apps/api/src/routes/module-access.ts`; `tests/helpers/fake-provider.ts`, `tests/unit/entitlements.test.ts`, `tests/integration/entitlements.test.ts`, `tests/integration/usage-concurrency.test.ts`, `tests/integration/usage-transitions.test.ts`. **Modify:** fixtures/seed-local, app.ts, manifests e relatório.

**Interfaces:** requireEntitlement/reserveUsage/settleUsage/releaseUsage/markUsageUnknown da spec. Reserve retorna `{reservation,created}`; a repetição não concede novo despacho. `listCapabilities(ctx,tx): Promise<Capability[]>`. Fake somente nos testes: `runFakeOperation(ctx,input): Promise<Reservation>` chama reserva, commit, gate anterior ao despacho, fake e liquidação; não é endpoint do produto.

- [ ] Escrever testes de gates: ausência/expiração/cancelamento nega; pricing_core funciona sem inventory_core; shopping e add-ons sem base negam; runtime não altera plano/limite mesmo sendo dono; acesso direto REST/RPC negado. Fake recebeu zero chamadas sem entitlement/quota.
- [ ] Escrever testes concorrentes reais: bucket de limite1, duas operationKeys em barreira → uma reserva, outra429; mesma operationKey/hash simultânea→created true apenas uma vez e uma chamada fake; hash/contexto diferente→409. Organização B não consulta/liquida reserva A.
- [ ] Escrever transições: reserve5/settle3 produz reserved0/settled3; repetir settle3 conserva ledger; settle4 ou release depois de settled dá409; release antes de despacho devolve quota uma vez; actual>max e zero max negados. Virada de período liquida no bucket original. Cancelamento impede nova reserva mas permite settle. Timeout após despacho mantém quota e pending_reconciliation; retry não chama fake; TTL não libera. Falha antes de commit da reserva não chama fake.
- [ ] Rodar `pnpm exec vitest run tests/unit/entitlements.test.ts` e `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/entitlements.test.ts tests/integration/usage-concurrency.test.ts tests/integration/usage-transitions.test.ts`; antes de M02/serviço, esperado FAIL por schema/função ausente. Criar M02 pela CLI e registrar caminho antes de escrever.
- [ ] Implementar subscriptions/entitlements/buckets/reservas/ledger conforme spec, FKs compostas, checks e grants de coluna. Fixtures comerciais somente locais e claramente simulation. Bloquear bucket em ordem estável; settle libera toda reserva e soma apenas consumo real; ledger e counters na mesma transação. Provisionador de buckets trava organização, consulta sobreposição de intervalos e rejeita antes de inserir; runtime não tem INSERT em buckets. Teste de fixture adulterada por admin com dois buckets ativos deve produzir503 e zero reserva/chamada, sem escolher arbitrariamente. Unicidade de início não substitui essa validação.
- [ ] Implementar rotas capabilities e module-access e integração de entitlements sob contexto. Não criar rota para editar concessões ou fake/provider, não chamar IA. Testar perda do processo entre reserva e despacho conservando reserva para revisão.
- [ ] Reexecutar unit, integração completa e replay das duas migrations num banco local descartável; esperado PASS e counters conciliados com ledger. `pnpm typecheck`, `pnpm lint`, `git diff --check`; commit `feat: enforce simulated entitlements and atomic usage reservations`.

**Checkpoint 5:** mecanismo comprovado com fake. Não equivale à idempotência de provedor real, cobrança ou movimento de estoque. Preços/franquias comerciais continuam pendentes. Coordenador revisa grants antes de disponibilizar UI.

## Task 7 — Portal mínimo e shells independentes dos dois apps

**Create:** `packages/auth-client/package.json`, `packages/auth-client/tsconfig.json`, `packages/auth-client/src/client.ts`, `packages/auth-client/src/api-client.ts`, `packages/auth-client/src/context-store.ts`, `packages/auth-client/src/LoginForm.tsx`, `packages/auth-client/src/index.ts`; `apps/portal/package.json`, `apps/portal/tsconfig.json`, `apps/portal/index.html`, `apps/portal/vite.config.ts`, `apps/portal/src/main.tsx`, `apps/portal/src/App.tsx`, `apps/portal/src/OrganizationPicker.tsx`, `apps/portal/src/OrganizationForm.tsx`, `apps/portal/src/RestaurantForm.tsx`; `apps/estoque/package.json`, `apps/estoque/tsconfig.json`, `apps/estoque/index.html`, `apps/estoque/vite.config.ts`, `apps/estoque/src/main.tsx`, `apps/estoque/src/App.tsx`; `apps/precificacao/package.json`, `apps/precificacao/tsconfig.json`, `apps/precificacao/index.html`, `apps/precificacao/vite.config.ts`, `apps/precificacao/src/main.tsx`, `apps/precificacao/src/App.tsx`; `playwright.config.ts`, `tests/unit/context-store.test.ts`, `tests/e2e/core.spec.ts`, `tests/e2e/context-race.spec.ts`, `tests/e2e/module-access.spec.ts`.

**Interfaces:** `createAuthClient(config): SupabaseClient` por app/aba; `apiRequest<T>(path,options): Promise<T>` adiciona bearer/context sem log; `ContextStore.select(input): Promise<SelectedContext>`, `snapshot(): {selection,generation}`, `clear(): void`; UI nunca recebe conexão DB. Rotas locais `/login`, `/organizations`, `/organizations/:org/restaurants/:unit`; scaffolds de apps usam mesmas escolhas com endpoint de acesso, sem tela operacional.

- [ ] Coordenador congela contratos/rotas antes de delegar UI. Subagente UI escreve somente arquivos desta Task; coordenador mantém SQL/contratos. Revisor roda leitura/teste em banco separado ou serializado, nunca disputa fixtures mutáveis com implementação.
- [ ] Escrever unit test: selecionar A1→iniciar fetch→selecionar A2→resolver fetch A1 não atualiza estado de A2. Formulário que guardou generation antiga não envia. Logout limpa seleção/cache. Token de contexto não vai para URL/localStorage/log.
- [ ] Escrever Playwright primeiro: login do dono A; criar empresa/unidade; alternar A1/A2; outra aba fica A1; dono B não vê A/C; shell estoque permitido só com inventory_core; precificação permitida só com pricing_core sem inventory_core. Forjar path/context dá erro sem dados. Logout chama API antes de signOut local e uma nova request com token antigo é negada. Testar 503/redirecionamento/reload/contexto expirado e erro de credencial de forma legível.
- [ ] Rodar `pnpm exec vitest run tests/unit/context-store.test.ts`; `pnpm exec playwright test tests/e2e/core.spec.ts tests/e2e/context-race.spec.ts tests/e2e/module-access.spec.ts`. Esperado FAIL por comportamento não implementado; se browser não inicia, resolver instalação antes de considerar red funcional.
- [ ] Implementar somente fluxos da spec: email/senha, criar/listar/selecionar, botão adicionar unidade, estado sem acesso e shell com nome da unidade. Sem telas/tabelas de estoque/preço, dashboard inventado, checkout ou botão conceder plano. Usar labels e navegação por teclado; estados loading/error explícitos. App auth-client consulta capability mas API sempre revalida. CORS origens locais fixas; Vite em portas 5173/5174/5175, API 3001.
- [ ] Implementar logout: API204→signOut({scope:'local'})→limpar estado. Falha API exibe que encerramento remoto não foi confirmado; falha provider depois da API não reativa sessão. CSP e escaping padrão; não renderizar HTML arbitrário. Conteúdo autenticado não recebe cache de service worker.
- [ ] Rodar unit/E2E, `pnpm typecheck`, `pnpm lint`, `pnpm build` dos três apps/API. Esperado PASS nos três frontends independentes, incluindo pricing sem inventory. Verificar bundles sem segredo DB/role/admin (strings sintéticas usadas apenas por fixtures não entram no bundle).
- [ ] Stage arquivos desta Task e commit `feat: add owner portal and independently gated app shells`.

## Checkpoint final — revisão independente, evidências e entrega

- [ ] Coordenador realiza self-review spec→Tasks: se requisito sem teste, adicionar teste red e correção no task dono antes de prosseguir. Nenhum item fica marcado por suposição.
- [ ] Solicitar revisor independente de multi-tenant/grants, precisão dos formatos e concorrência. Ele lê diff e executa testes sem editar migrations/contratos. Rever sobretudo contexto do pool, JWT de outro projeto, revogação, ausência de escrita direta, grants de entitlements, dupla reserva e rollback. Finanças do core se limitam a formatos/counters; não atestar motor de estoque inexistente.
- [ ] Resolver achados em commits pequenos com regressão falhando→correção→teste. Revisão final somente depois dos fixes; não marcar finding como resolvido sem evidência.
- [ ] Executar a partir de lockfile: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`, `git diff --check`. Registrar saída/exit/counts em `docs/evidence/ciclo-01.md`; cada script deve falhar se dependência local estiver ausente, nunca pular silenciosamente integração/E2E.
- [ ] Confirmar ausência de buckets/Storage, tabelas/motores dos ciclos seguintes, chaves em bundles/logs/Git e referências operacionais ao legado. Demonstrar API e RLS com duas contas e duas empresas do mesmo dono.
- [ ] Registrar arquivos alterados, commits, testes reais, revisão de segurança, limitações e riscos. Gerar `git diff main...HEAD` e log para revisão local. Se remoto novo estiver autorizado, criar PR e anexá-lo ao chat; caso contrário registrar “PR pendente de remoto”, sem criar projeto externo.
- [ ] Pedir revisão do Ciclo 01 e não iniciar Ciclo 02. Só considerar pronto quando os testes reais do ciclo e revisão independente passarem; publicação continua fora do escopo.

## Matriz de rastreabilidade e limites

| Critério | Task / prova | Situação hoje |
|---|---|---|
| Contratos, owners apenas, formato decimal | 1/4/5 | Planejado, não executado |
| T-01 API/RLS e empresa C do mesmo dono | 2/3/4/5 | Planejado |
| Fundação de T-02 entre unidades | 2/3/4/7 | Planejado; compra/saldo só Ciclo 02 |
| Idempotência/bootstrap e rollback | 5 | Planejado; T-05 estoque só Ciclo 02 |
| Entitlement/API direta | 6/7 | Planejado; exportação Premium T-19 só Ciclo 06 |
| Metering antes de fake | 6 | Planejado; T-22 real só Ciclo 07 |
| Independência App02 | 6/7 | Planejado como gate/shell; preço T-15/16 só Ciclo 05 |
| T-23 Storage | Fora do core | Não aplicável sem Storage; não alegar aprovado |
| T-03 canônico e precisão financeira T-04 | Ciclo 02 | Não implementado nem executado |
| T-06–14,17–21,24 | Ciclos de domínio | Não implementados nem executados |

## Falhas previstas e recuperação

| Condição | Ação permitida | Gate |
|---|---|---|
| Docker/local DB indisponível | Resolver pré-requisito; manter diagnóstico explícito | Não aprovar Tasks SQL com mocks |
| Peer/engine incompatível ou vulnerabilidade relevante | Atualizar proposta/pins e rerodar instalação/testes | Não ignorar engines/peers |
| URL aponta a remoto ou legado | Abort sem conexão/mutação; corrigir config local | Nunca usar DB real como teste |
| RLS passa só como admin | Corrigir fixture/role e executar como runtime/A/B | Segurança não aprovada |
| Deadlock/serialization | Retry máximo descrito; preserva chave; erro503 após limite | Sem efeitos externos no retry |
| Auth/DB indisponível | Falhar fechado, sem autorização por cache indefinido | Não devolver sucesso parcial |
| Provider fake retorna desconhecido | Conservar reserva e reconciliar por caso explícito | Não liberar/reexecutar automaticamente |
| Browser bloqueado | Resolver ambiente e repetir E2E | Build não substitui fluxo completo |
| Remoto novo não definido | Entregar branch/commits/diff locais | Não inventar PR/merge/deploy |

Ao término desta rodada de planejamento, a única solicitação ao fundador é revisar os cinco documentos e aprovar ou corrigir o Ciclo 01 local. Nenhum comando de implementação deste plano foi executado.
