# Design do primeiro subprojeto — core multitenant

Data original:14/10/2026. Estado em15/10: especificação aprovada e implementada no Ciclo01, com adaptação autorizada de Supabase local para DEV cloud (ADR0002). Testes e limites reais em docs/evidence/ciclo-01.md; este texto preserva o desenho aprovado, não uma afirmação de SaaS comercial pronto.

Referências: [V3](../../01-PRODUTO-V3.md), [arquitetura](../../02-ARQUITETURA-E-LIMITES.md), [aceite](../../03-CRITERIOS-DE-ACEITE.md), [roadmap](../../04-ROADMAP.md), [ADR 0001](../../adr/0001-decisoes-arquiteturais.md).

## 1. Resultado e fronteiras

Entregar localmente o Marco 1: um dono entra/sai, cria sua empresa com primeira unidade, adiciona unidades e seleciona explicitamente o contexto. Duas contas não acessam dados uma da outra; uma conta com duas empresas/unidades não mistura operações. Portal e shells independentes de App 01/App 02 consomem a mesma API. Gates de entitlement e mecanismo de medição são comprovados com fixtures e fake interno, sem cobrança.

Inclui: monorepo mínimo, contratos v1, Auth local, owners, organizações, unidades, RLS/grants/FKs, contextos por aba, revogação local de sessão, idempotência de criação, auditoria e entitlements simulados. Não inclui convites, funcionários, RBAC operacional, CRUD genérico, estoque, fichas, listas, precificação, PDV, financeiro, Storage, PDF, IA real, WhatsApp, billing, deploy ou banco remoto. Shells não são apps comerciais prontos.

Somente login, lista/criação/seleção de organização/unidade e acesso/bloqueio de módulo têm comportamento de UI especificado. Não desenhar outras telas. Componentes simples e acessíveis, sem identidade visual nova nesta rodada.

## 2. Ambiente e restrições globais

- Implementação só após aprovação do plano. Criar Git exclusivamente nesta raiz nova, sem remote herdado, e branch `feat/ciclo-01-core-multitenant`.
- Pins candidatos da ADR: Node 24.22.0; pnpm 11.25.0; TypeScript 6.0.3; versões exatas e lockfile, compatibilidade real condicionada a instalação/teste.
- PostgreSQL major 17 local, confirmar imagem/digest efetivos antes de SQL. Docker não foi encontrado no PATH nesta auditoria.
- Schema `core` não exposto; runtime `donos_api` NOBYPASSRLS e não owner; role de migrations separada. Sem `service_role` no browser ou no runtime normal da API.
- SQL parametrizado, transação numa conexão; contexto via configuração local à transação; nenhum JWT/contexto global compartilhado entre requests.
- Apenas dados sintéticos e Supabase em loopback. Scripts rejeitam hosts remotos, referências de projetos reais e execução destrutiva fora de ambiente de teste explicitamente nomeado.
- Dinheiro/quantidade em string decimal; counters bigint em string JSON. Sem float em cálculos críticos. Sem cálculo monetário no core.
- Nenhuma instalação de integração paga, cobrança, chamada de modelo, WhatsApp, alteração de produção ou leitura de dumps.

## 3. Modelo de dados e invariantes

UUIDs não substituem autorização. Todas as referências sensíveis usam organização e, quando local, unidade. Nomes têm 1–120 caracteres após trim; sem unicidade global de nome. Datas são timestamptz UTC, originadas pelo servidor/banco. IDs, owner e vínculos de tenant nunca são editáveis neste ciclo.

| Tabela no schema core | Chave/campos | Regras |
|---|---|---|
| organizations | id PK; owner_user_id FK auth.users; name; created_at | Um dono possui 0..N empresas. INSERT deriva owner da identidade verificada. SELECT por dono. Sem UPDATE/DELETE no runtime deste ciclo. |
| restaurants | id PK; organization_id; name; created_at | UNIQUE(organization_id,id); FK organização RESTRICT; empresa criada com primeira unidade na mesma transação. Sem reparent/delete. |
| session_revocations | (user_id,session_id) PK; revoked_at | Escopo de identidade, não de tenant: revoga sessão em todas as empresas do dono. Runtime SELECT/INSERT próprio; sem delete. Não armazenar token. |
| request_contexts | id PK; user_id; session_id; organization_id; restaurant_id; token_hash UNIQUE; expires_at | FK composta organização/unidade; hash SHA-256 de 32 bytes aleatórios; 30 minutos; identidade/sessão e propriedade revalidadas. Só SELECT/INSERT próprio. |
| subscriptions | id; organization_id; source='simulation'; status; starts_at; ends_at; revision | Somente fixture local administra. Sem preço/cartão/customer real. Não é prova de contratação. |
| entitlements | (organization_id,feature_key) PK; enabled; valid_from; valid_until; revision; source='simulation' | Chave nas seis DEC/V3. Runtime somente SELECT. Ausente/desabilitado/vencido nega ação. |
| usage_buckets | (organization_id,meter_key,period_start) PK; period_end; limit_units; reserved_units; settled_units | bigint não negativo; reserved+settled <= limit; períodos [start,end) sem sobreposição por org/meter. Limite/período somente fixture; runtime altera apenas counters. |
| usage_reservations | id PK; organization_id; restaurant_id; meter_key; period_start; operation_key; request_hash; max_units; actual_units; status | FKs compostas para bucket e restaurante; UNIQUE(org,operation_key); UNIQUE(org,id); sem deslocar bucket após virada de período. |
| usage_ledger | id; organization_id; reservation_id; event_kind; units; created_at | FK(org,reservation_id); reserve/settle/release; UNIQUE(org,reservation_id,event_kind); INSERT/SELECT, nunca UPDATE/DELETE. |
| idempotency_records | scope_kind; scope_id; actor_user_id; organization_id opcional; operation; key; request_hash; response_json | PK(scope_kind,scope_id,operation,key). kind actor exige scope_id=actor e org NULL; kind organization exige scope_id=org. Resultado sem tokens/segredos. Escrita na mesma transação do comando. |
| audit_events | id; organization_id; restaurant_id opcional; actor_user_id; action; entity_id; request_id; created_at; metadata | FK(org,restaurant) quando não nulo; append-only. Metadados em allowlist, sem corpo livre da requisição. |

`auth.users` é a credencial do proprietário; não criar tabela employees ou users com papéis. `session_revocations` é exceção explícita ao escopo organizacional por proteger identidade transversal. Contextos e idempotência de bootstrap também têm políticas por ator para resolver o tenant antes de ele existir/estar selecionado.

Índices: organizations(owner_user_id,id); restaurants(organization_id,id); request_contexts(token_hash), (user_id,session_id); tabelas de domínio por organization_id; reservas por (organization_id,meter_key,period_start,status). Sem cascata destrutiva em trilhas. Retenção de produção é decisão posterior; no local não purgar revogações/idempotência durante o ciclo.

Modelo futuro de referência local: `ingredients UNIQUE(organization_id,restaurant_id,id)` e FK tripla nos movimentos. Não criar essas tabelas agora. Teste de schema usa tabela temporária sintética de referência para demonstrar que a FK tripla rejeita A1→A2, sem montar CRUD de estoque.

## 4. Autorização no servidor e no banco

`verifyActor` valida assinatura, expiração, issuer do Supabase esperado, audience authenticated, sub UUID, session_id UUID; consulta usuário corrente usando o mesmo bearer e exige claims.sub=user.id, conta não anônima e email confirmado. `user_metadata` nunca participa da autorização. Falha de Auth/JWKS/rede retorna indisponibilidade sem autorizar. Não logar token ou senha; redigir Authorization, X-Donos-Context e Cookie. Token de contexto é gerado por CSPRNG com 32 bytes de entropia.

As policies usam helpers invoker de `current_setting('app.user_id',true)`, `app.organization_id` e `app.restaurant_id`; ausente/vazio vira NULL e nega. Helpers não recebem SQL e têm search_path fixo. O runtime não lê auth.users diretamente: comprovação de dono usa FK e organizations, e identidade vem do Auth.

`withActorTx` instala somente ator; permite listar empresas e idempotência de bootstrap. `withOrganizationTx` verifica dono, instala organização e unidade vazia; permite listar unidades e capabilities. `withRestaurantTx` verifica contexto opaco + dono + unidade, instala ambos; somente então chama serviço de unidade. Nenhuma query de domínio usa pool.query fora desses wrappers.

Runtime recebe somente grants necessários da tabela da seção 3. RLS ENABLE + FORCE em todas as tabelas de aplicação, inclusive auxiliares. Para UPDATE dos counters/reservas, USING e WITH CHECK preservam organização/unidade e checks de estado; grants por coluna impedem mudar limites/identidade. Testar privilégios de roles, tabela e função. PUBLIC/anon/authenticated não acessam schema/tabelas/funções de domínio, mesmo com JWT válido. Funções SECURITY DEFINER não são necessárias no core e não devem ser adicionadas como correção de permissões.

Requests de outra organização retornam 404 genérico após autenticar; falta de login 401; contexto divergente 409; entitlement negado 403; quota 429; validação 400; dependência indisponível 503. Não devolver nome/SQL/constraint/linha de outro tenant. Endpoints não implementados retornam 404/405 sem simular CRUD.

## 5. Contratos públicos e internos

Tipos exportados de `packages/contracts/src/core.ts`:

```ts
type UUID = string; // validado por schema antes de branding interno
type DecimalString = string; // canônico, até 18 inteiros / 12 fracionários
type IntegerString = string; // dígitos, inteiro não negativo, <= bigint SQL
type FeatureKey = 'inventory_core' | 'shopping_premium' | 'ai_text_whatsapp'
  | 'ai_photo' | 'ai_voice' | 'pricing_core';
type Organization = { id: UUID; name: string };
type Restaurant = { id: UUID; organizationId: UUID; name: string };
type CreateOrganizationInput = { name: string; firstRestaurant: { name: string } };
type CreateRestaurantInput = { name: string };
type ContextSelection = { organizationId: UUID; restaurantId: UUID };
type SelectedContext = ContextSelection & { token: string; expiresAt: string };
type Capability = { feature: FeatureKey; allowed: boolean;
  reason: 'ACTIVE' | 'NOT_GRANTED' | 'EXPIRED' | 'BASE_REQUIRED' };
type ApiErrorCode = 'UNAUTHENTICATED' | 'RESOURCE_NOT_FOUND' | 'CONTEXT_MISMATCH'
  | 'CONTEXT_EXPIRED' | 'ENTITLEMENT_REQUIRED' | 'QUOTA_EXCEEDED'
  | 'IDEMPOTENCY_CONFLICT' | 'VALIDATION_ERROR' | 'DEPENDENCY_UNAVAILABLE';
```

DTOs estritos rejeitam owner_user_id, organization_id extra, role, plano e propriedades não declaradas. `DecimalString` não faz cálculo; não aceita expoente/vírgula/NaN/Infinity/+/-0, zeros iniciais ou fração terminada em zero (normalização anterior deve produzir formato único; zero é `0`). Negativos são sintaticamente aceitos salvo -0; regra de positividade pertence ao comando futuro. IntegerString deve ser <=9223372036854775807; conversão por BigInt, nunca parseFloat.

| Endpoint | Entrada | Saída / regra |
|---|---|---|
| GET /health | Sem login | `{status:'ok'}` sem dados/configuração. |
| GET /v1/me | Bearer | `{userId}`; sem cache compartilhado. |
| POST /v1/auth/logout | Bearer | 204 após commit da revogação local; browser então chama signOut com scope local. Idempotente. |
| GET /v1/organizations | Bearer | `{items: Organization[]}` do dono. |
| POST /v1/organizations | Bearer, Idempotency-Key, CreateOrganizationInput | 201 `{organization,restaurant}`; replay mesmo status/body. Bootstrap atômico. |
| GET /v1/organizations/:organizationId/restaurants | Bearer | `{items: Restaurant[]}` após propriedade. |
| POST /v1/organizations/:organizationId/restaurants | Bearer, Idempotency-Key, CreateRestaurantInput | 201 Restaurant; nenhuma concessão comercial automática. |
| POST /v1/contexts | Bearer, ContextSelection | 201 SelectedContext; não idempotente, pode emitir novo token. Nunca persistir token em texto puro. |
| GET /v1/organizations/:organizationId/capabilities | Bearer | `{items: Capability[]}` da organização verificada. |
| GET /v1/organizations/:organizationId/restaurants/:restaurantId/access/:app | Bearer + X-Donos-Context, app estoque ou precificacao | `{allowed:true,organizationId,restaurantId,app}` se entitlement do módulo; caso contrário erro 403. |

Headers de sucesso/erro autenticados: Cache-Control no-store. CORS permite somente origens locais configuradas dos três apps, sem wildcard. CORS não substitui Auth. Idempotency-Key: UUID v4 gerado pelo cliente; hash SHA-256 de JSON canônico do DTO validado + operação + contexto; nomes trim antes do hash. Não existe endpoint de grant, fake AI, SQL ou metering arbitrário.

Interfaces internas, construídas exclusivamente pelo servidor:

```ts
type VerifiedActor = Readonly<{ userId: UUID; sessionId: UUID; requestId: UUID }>;
type OrganizationContext = Readonly<{ actor: VerifiedActor; organizationId: UUID }>;
type RestaurantContext = OrganizationContext & Readonly<{ restaurantId: UUID }>;
type Tx = { query: ParameterizedQuery }; // wrapper de pg.PoolClient; não DTO público
verifyActor(accessToken: string, requestId: UUID): Promise<VerifiedActor>;
withActorTx<T>(actor: VerifiedActor, fn: (tx: Tx) => Promise<T>): Promise<T>;
withOrganizationTx<T>(actor: VerifiedActor, organizationId: UUID,
  fn: (ctx: OrganizationContext, tx: Tx) => Promise<T>): Promise<T>;
withRestaurantTx<T>(actor: VerifiedActor, selection: ContextSelection, token: string,
  fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T>;
createOrganization(actor: VerifiedActor, input: CreateOrganizationInput, key: string)
  : Promise<{organization: Organization; restaurant: Restaurant}>;
createRestaurant(actor: VerifiedActor, organizationId: UUID,
  input: CreateRestaurantInput, key: string): Promise<Restaurant>;
selectContext(actor: VerifiedActor, input: ContextSelection): Promise<SelectedContext>;
requireEntitlement(ctx: OrganizationContext, feature: FeatureKey, tx: Tx): Promise<void>;
```

`ParameterizedQuery` fica em `packages/db/src/types.ts`: função genérica que recebe texto SQL estático e array readonly de parâmetros e retorna `{rows, rowCount}`. Não expor essa interface para pacotes de UI; não construir SQL a partir de input. `Tx` é interno ao backend. Tipos de identidade/contexto internos ficam nesse mesmo arquivo, evitando dependência circular de db em domain-core; `packages/domain-core/src/types.ts` apenas os reexporta para consumidores de domínio. Dependências: contracts → nenhuma camada interna; db → contracts; domain-core/domain-billing → db + contracts; API → domínios/db/contracts; UI → contracts/auth-client. Não exportar VerifiedActor como DTO de entrada.

## 6. Sessão, seleção e idempotência

Auth-client cria uma instância por app/aba e usa sessionStorage. URLs não transportam JWT/refresh/context token. Cada app pode pedir login próprio; SSO remoto não faz parte do aceite local. Após 204 da API, o browser chama `supabase.auth.signOut({scope:'local'})`, nunca o escopo global implícito. Logout limpa storage/cache e token de contexto mesmo se signOut do provedor falhar depois da revogação local. Se API não confirmar revogação, UI informa falha de encerramento remoto e limpa estado local; não promete invalidação remota.

Revogações são consultadas em toda requisição autenticada, no escopo de ator antes do tenant. Depois do commit da revogação, novas autorizações são negadas; comandos já autorizados podem concluir. Validação criptográfica e getUser não bastam para provar logout imediato. Endpoint logout aceita repetição de sessão já revogada como 204, sem permitir outros comandos. Não purgar revogações por expiração do JWT: refresh pode preservar session_id. Sessão expirada exige renovação válida ou novo login. Logout realizado fora desta API não tem garantia adicional além das propriedades do Auth; resolver revogação global/BFF antes do piloto.

Contexto expira por relógio do banco, não do browser; deve ser novamente selecionado. Troca de unidade cancela leituras quando possível e invalida resultados de geração anterior; request iniciado em A1 nunca é reinterpretado em A2. Duas abas podem manter contextos diferentes legitimamente. Token de A1 + rota A2 produz 409 e nenhuma consulta de domínio. Token emitido a outro usuário/sessão não funciona.

Bootstrap usa escopo de idempotência por ator (a organização ainda não existe). Demais criações usam organização. Chave é disputada antes da escrita; conflito de inserção espera o commit concorrente e recupera resultado, ou prossegue se houve rollback. Hash diferente retorna 409. Revalidar autenticação/titularidade antes de replay; nunca usar chave como autorização. Falha na primeira unidade/auditoria/resultado causa rollback da empresa. Não persistir erros transitórios como sucesso.

## 7. Entitlements e medição simulados

Sem tela de plano/edit-grant. Fixtures de teste podem atribuir seis chaves, limites e períodos; runtime não altera concessão. UI exibe “acesso de demonstração” quando concedido localmente. pricing_core funciona sem inventory_core. shopping_premium e três add-ons requerem inventory_core além da chave específica. Validade temporal avaliada em cada comando, não em cache duradouro ou claims.

Contrato de medição interno de `packages/domain-billing/src/usage.ts`:

```ts
type Reservation = { id: UUID; status: 'reserved' | 'settled' | 'released'
  | 'pending_reconciliation'; maxUnits: IntegerString; actualUnits: IntegerString | null };
type ReservationResult = { reservation: Reservation; created: boolean };
reserveUsage(ctx: RestaurantContext, input: {feature: FeatureKey; operationKey: UUID;
  requestHash: string; maxUnits: IntegerString}, tx: Tx): Promise<ReservationResult>;
settleUsage(ctx: RestaurantContext, reservationId: UUID, actualUnits: IntegerString,
  tx: Tx): Promise<Reservation>;
releaseUsage(ctx: RestaurantContext, reservationId: UUID, reason: 'NOT_DISPATCHED',
  tx: Tx): Promise<Reservation>;
```

Somente as três chaves IA são meters. Testes usam `ai_photo`, inventory_core e quota sintética de 1 ou 5 unidades; valores não são decisão comercial. maxUnits > 0; actualUnits entre 0 e maxUnits. Reserve bloqueia bucket, exige entitlement vigente, intervalo ativo e limite; concorrência tem um único vencedor na última unidade. Reserve repetido retorna created=false e não executa fake de novo. Serviço de teste chama fake exclusivamente quando created=true e depois do commit da reserva; revalida entitlement imediatamente antes do despacho. Nenhum executor de provedor real é criado no core. Falha do processo entre reserva e despacho conserva a reserva para revisão; não há promessa de execução externa exatamente uma vez.

Settle move reservado para consumido e adiciona ledger uma vez; release libera somente antes do despacho. Estados terminais repetidos idênticos retornam original; transição incompatível/actual diferente retorna conflito. Cancelamento bloqueia nova reserva, mas não impede liquidar consumo já ocorrido. Virada do período liquida no bucket original. Timeout após despacho mantém reserved e marca pending_reconciliation; sem retry automático ou liberação por TTL. Interface de marcar desconhecido é interna ao repositório de uso, testada via adaptador fake; implementar `markUsageUnknown(ctx,reservationId,tx): Promise<Reservation>` no mesmo arquivo.

Como apenas fixtures locais criam buckets no core, o provisionador serializa por organização, valida intervalos sem sobreposição e só então insere. O serviço exige exatamente um bucket ativo; se uma fixture adulterada via admin inserir intervalos sobrepostos, falha com DEPENDENCY_UNAVAILABLE e nenhuma reserva/chamada. Não apresentar unicidade de period_start como prova de ausência de sobreposição. Um futuro provisionamento comercial exige constraint ou mecanismo transacional equivalente próprio, antes de exposição.

Não medir custo real nem criar catálogo de preços de IA. Franquia por extração/confirmacão e suporte a texto no app versus chave WhatsApp ficam no registro de pendências para Ciclo 07.

## 8. Matriz de verificação e limites do aceite

Fixtures: dono A → empresa A (A1/A2), empresa C (C1); dono B → empresa B (B1). Usuários são criados somente via Auth local pelo provisionador de teste, fora do runtime.

| Grupo | Provas obrigatórias | Limite |
|---|---|---|
| Identidade | Sem token, token malformado/vencido/outro issuer, anônimo, email não confirmado, metadata forjada, usuário indisponível/deletado, logout e replay | Mocks para ramos; login/JWT reais no Supabase local também necessários. |
| Tenant | API A não lista/lê/cria em B; próprio dono A não mistura A/C; SQL runtime nega consulta/mutação cruzada | T-01 nos endpoints existentes; PATCH/DELETE não são implementados e não contam como prova de autorização. |
| Unidade | Contexto A1 não é usado em A2/B1; FK composta rejeita cruzamento; pool não conserva sessão após commit/rollback | Fundação de T-02; saldo/compra continuam Ciclo 02. |
| Privilégios | Runtime não é owner/BYPASSRLS; REST/RPC diretos bloqueados; grants não permitem alterar owner/tenant/planos/limites/trilhas | Executar com role real; teste como postgres não prova RLS. |
| Criação | Bootstrap e nova unidade idempotentes; payload divergente; duas requisições paralelas; falha entre escritas rollback | Resultado da duplicata igual ao original; uma só organização/unidade/auditoria. |
| Entitlements | Não concedido/vencido/cancelado; pricing isolado; shopping/IA sem base; duas organizações com gates distintos | T-15 apenas independência de acesso; motor de preço é Ciclo 05. |
| Metering | Gate antes fake, última quota concorrente, retry/settle/release, desconhecido, virada de período | Fundação de T-05/T-22; não certifica provider/estoque. |
| Browser | Login/logout, criar/selecionar, duas abas/contextos, resposta atrasada, reload, 403/503, shells independentes | Sem telas de domínio. |

T-03/04/06–14/16–21/24 dependem dos ciclos de domínio e não podem ser marcados aprovados aqui. T-23 é não aplicável no core porque não existe Storage/bucket: provar que não foram criados nem expostos. Antes de introduzir Storage, T-23 torna-se gate obrigatório.

## 9. Falhas e critério de saída

Banco indisponível/timeout → rollback, 503, sem resposta de sucesso parcial. Retry de conflito transacional é limitado a duas novas tentativas, apenas para operações idempotentes e SQLSTATE 40001/40P01; nenhuma chamada externa dentro da transação reexecutada. Esgotado limite, 503 e cliente pode repetir a mesma chave. Revogação, contexto, entitlement e saldo futuro são revalidados no início da transação; nenhuma atualização em memória substitui commit.

Critério de saída: typecheck, lint, unit, integração local real, E2E e build executados sem falhas; migrations reproduzíveis em banco local descartável; privilégios e isolamento comprovados; revisão independente documentada; evidência de todos os grupos acima; aprovação humana antes de Ciclo 02. Sem Docker/credencial local/teste de browser, registrar bloqueio, não substituir teste por mock e chamar pronto.

Não há resultados de testes nesta especificação. [Plano implementável](../plans/2026-10-14-core-multitenant.md) descreve arquivos, ciclos red/green, commits e checkpoints. Aprovação requerida limita-se ao desenvolvimento local deste Ciclo 01.
