# Ciclo 07A — Implementação de proposta por texto no App 01

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use a fresh reviewer at each meaningful gate; the coordinator owns contracts, migrations, services, and integration.

**Goal:** Permitir ao proprietário gerar, corrigir e confirmar uma proposta de recebimento ou baixa por texto, sem alterar estoque antes da confirmação explícita.

**Architecture:** Contratos estritos e extrator determinístico isolado alimentam propostas persistidas com tenant/unidade/local e estado explícito. API reserva entitlement/franquia antes da extração; confirmação compõe proposta, uso, estoque e auditoria no mesmo `Tx`. O mock só roda em desenvolvimento/testes; a UI do App 01 mantém revisão, acessibilidade e contexto visíveis.

**Tech Stack:** TypeScript, Zod 4.6.7, React, Fastify, PostgreSQL/Supabase, Vitest, Playwright; sem dependência npm nova. A Tarefa 2 usa somente o C07-DEV explicitamente autorizado, pois não existe runtime local neste ambiente.

**Spec:** `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md`

**Status:** plano e política de retenção aprovados pelo usuário em 2026-10-16. Tarefa 1 concluída e revisada. Em 2026-10-16, o usuário autorizou migrations aditivas e testes sintéticos da Tarefa 2 somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc` (C07-DEV); sem reset, produção, legado, deploy ou integração paga.

## Global Constraints

- Usar `ai_text_whatsapp` no protótipo, sem habilitar WhatsApp; uma proposta contém uma ação e um insumo.
- Nenhum provedor, segredo, chamada paga/remota, deploy, produção ou legado neste subciclo. A única migration remota permitida é a aditiva da Tarefa 2 em C07-DEV, por autorização explícita registrada; nenhum reset ou outra migration remota é permitido.
- Não executar integração contra `.local/dev.json`/`tests/helpers/local-db.ts`; esse helper aponta para o Supabase DEV hospedado.
- Antes de qualquer conexão, comprovar o alvo exato: projectRef e URL Supabase iguais a `kfthwjrvgslnsjigqnyc`, e hostname/credencial Postgres vinculados ao mesmo projeto. Tarefa 2 pode operar somente nesse DEV autorizado; negar qualquer outra configuração. Nunca executar reset nem migrations pendentes fora do Ciclo 07A.
- Proprietário, sessão, `organization_id`, `restaurant_id` e local são validados no servidor e RLS; nunca confiar em IDs/políticas retornados pelo extrator.
- Nunca efetivar movimento antes de confirmação explícita. Ledger append-only, idempotência e rollback completo; sem saldo negativo.
- Quantidade/dinheiro ficam em strings decimais, unidade-base ou razão exata; sem `number` binário em cálculos críticos.
- Nenhum dado bruto ou credencial nos logs/browser; sem `service_role` no cliente.
- Sem dependência nova. Dependência nova futura exige justificativa, versão fixa e lockfile.
- Resultado de teste só pode ser relatado depois de execução observada. Não declarar integração inteira verde se apenas casos selecionados forem repetidos.

## Review Focus

1. **Prompt injection no texto:** instruções no conteúdo não podem alterar tenant, autorização, confirmação nem criar campos executáveis. Cobrir em `tests/unit/ai-text-extractor.test.ts` e `tests/integration/ai-text-api.test.ts`.
2. **Preço total vs. unitário e decimal brasileiro:** `5 kg por R$ 190` precisa resultar em `R$ 38/kg` por cálculo exato. Cobrir em `tests/unit/ai-text-extractor.test.ts` e `tests/unit/ai-proposal-validation.test.ts`.
3. **Fornecedor/insumo/local ausente ou ambíguo:** manter proposta incompleta até correção explícita; nunca inventar cadastro/seleção. Cobrir no domínio, API e `tests/e2e/ai-text-flow.spec.ts`.
4. **Retries, dispatch interrompido e confirmação concorrente:** mesma chave/versão não pode duplicar chamada mock, uso, movimento ou resultado; timeout pós-dispatch não reenvia automaticamente. Cobrir em `tests/integration/ai-text-api.test.ts` e `tests/integration/ai-text-concurrency.test.ts`.
5. **Troca de contexto e tenant cruzado:** resposta atrasada ou ID da organização B não pode ser exibido/confirmado pela organização A. Cobrir em `tests/integration/ai-text-tenant-security.test.ts` e E2E de troca de contexto.

---

## Arquivos e interfaces por tarefa

### Tarefa 0 — Baseline e gate de ambiente local

**Arquivos:** nenhum.

**Interfaces:** nenhuma.

- [x] **Passo 1: verificar branch, estado limpo e runtime.** Branch `codex/ciclo-07-ai-text` sobre `d8a9f51`; runtime pnpm Node 24.19.0 abaixo de `>=24.22.0 <25`.
- [x] **Passo 2: executar baseline unitário.** `pnpm test:unit` passou 150/150 após build/bootstrap do workspace.
- [x] **Passo 3: comprovar destino local.** Docker, Podman, Postgres e Supabase CLI indisponíveis; loopback 5432/54321/54322 sem serviço.
- [x] **Checkpoint de ambiente:** não há DB/Auth descartável local (Docker/Podman ausentes; portas loopback livres). Usuário autorizou explicitamente o projeto DEV `kfthwjrvgslnsjigqnyc` para migrations aditivas e fixtures sintéticas da Tarefa 2. O helper da tarefa deverá negar qualquer outro alvo e nenhuma operação de reset será usada.

### Tarefa 1 — Contratos e domínio puro (RED → GREEN)

**Arquivos:**

- Criar `packages/contracts/src/ai-schemas.ts`, `packages/contracts/src/ai.ts`.
- Modificar `packages/contracts/src/index.ts`.
- Criar `packages/domain-ai/package.json`, `packages/domain-ai/tsconfig.json`, `packages/domain-ai/src/index.ts`, `packages/domain-ai/src/text-extractor.ts`, `packages/domain-ai/src/proposal-validation.ts`.
- Modificar `tsconfig.json`, `tsconfig.tests.json`, `vitest.config.ts`, `apps/api/tsconfig.json` e `pnpm-lock.yaml` somente para registrar `@donos/domain-ai`; `vitest.integration.config.ts` herda o alias da config unitária. A dependência `@donos/contracts` é workspace-local e não adiciona pacote externo.
- Criar `tests/unit/ai-text-contracts.test.ts`, `tests/unit/ai-text-extractor.test.ts`, `tests/unit/ai-proposal-validation.test.ts`.

**Interfaces produzidas:**

- `AiTextAction = 'receipt' | 'issue'`; candidate/proposal action is nullable until the owner resolves ambiguity; status `interpreting | needs_review | ready | confirmed | discarded | reconciliation_required`.
- `AiTextProposal` contém `id`, `organizationId`, `restaurantId`, `locationId`, `action`, `candidate`, `missingFields`, `status`, `version`, `createdAt`, `updatedAt`, `expiresAt` e `resultId`; não inclui `sourceText` persistido. Candidatos incluem ação, descrição, quantidade/unidade/valores decimais como strings anuláveis, motivo, indicador de ambiguidade e explicações; schema estrito rejeita chaves extras.
- `extractInventoryText(text: string): AiTextCandidate` é síncrona/determinística; recebe no máximo 2.000 caracteres, retorna somente o DTO de candidato estrito e não acessa rede, SQL, tenant ou autorização.
- `validateInventoryCandidate(candidate: AiTextCandidate, catalog: readonly InventoryCatalogEntry[], selection: { supplierId?: string; locationId?: string }): ValidatedInventoryProposal` resolve apenas correspondência exata única em catálogo ativo. `InventoryCatalogEntry = { id: string; name: string; baseUnit: 'kg' | 'L' | 'un'; active: boolean }`; resultado contém `ingredientId: string | null`, `unitPrice: string | null`, `missingFields: AiTextMissingField[]` e `status: 'needs_review' | 'ready'`. Preço total é dividido pela quantidade usando inteiros/BigInt e arredondamento half-even para 12 casas decimais; nenhum fornecedor é inferido.

**Interfaces consumidas:** schemas existentes de inventário/unidades e representações de quantidade/preço em `packages/contracts/src/inventory-schemas.ts`.

- [x] **Tarefa 1 concluída:** contratos e domínio puros implementados em RED→GREEN, commit `9dc0f20`; revisão independente round 2 sem findings Important/Critical. Evidência atual: extrator 11/11, unitários 173/173, `pnpm typecheck` e `git diff --check` passaram. Node 24.19.0 ainda abaixo do requisito.
- [ ] **Passo 4: executar RED.** `pnpm exec vitest run tests/unit/ai-proposal-validation.test.ts`; esperado: falha pelos exports ainda inexistentes.
- [ ] **Passo 5: implementar schemas e funções.** Manter parser determinístico e separado da validação de catálogo; limitar texto a 2.000 caracteres e uma ação/um insumo.
- [ ] **Passo 6: executar unitários focados e typecheck.** Rodar os dois arquivos Vitest e `pnpm typecheck`; esperado: todos passam sem mudar contratos de estoque existentes.
- [ ] **Passo 7: commit.** `feat(ai): define text proposal contracts and parser`.

**Checkpoint:** contrato de proposta congelado; coordenador revisa interfaces antes de paralelizar domínio puro e UI.

### Tarefa 2 — Persistência, RLS e retenção mínima (RED → GREEN)

**Arquivos:**

- Criar `supabase/migrations/20261016190345_cycle07_ai_text_proposals.sql` (o versionamento do executor remoto gerou este timestamp).
- Criar migration aditiva corretiva `20261016190427_cycle07_ai_proposal_reservation_fk_index.sql` após advisor identificar índice filho ausente para a FK composta da reserva.
- Criar `packages/db/src/ai-proposal-repository.ts`; exportar em `packages/db/src/index.ts`.
- Criar `tests/helpers/cycle07-local-db.ts` com guarda que aceita exclusivamente o projectRef/URL DEV `kfthwjrvgslnsjigqnyc`, database `postgres` e configuração protegida fora do repo; recusa qualquer outro projeto/host e não tem caminho de reset. Nunca reutilizar `tests/helpers/local-db.ts`.
- Criar `tests/integration/ai-proposal-schema.test.ts`, `tests/integration/ai-text-tenant-security.test.ts`.

**Interface produzida:** `aiProposalRepository.insert(ctx,input,tx)`, `get(ctx,id,tx,forUpdate?)`, `updateReview(ctx,id,expectedVersion,input,tx)`, `markTerminal(ctx,id,expectedVersion,result,tx)` e `list(ctx,query,tx)`. Toda consulta recebe `RestaurantContext` e `Tx`; todo SQL é parametrizado.

**Schema proposto:** `core.ai_text_proposals` com UUID, `organization_id`, `restaurant_id`, `location_id`, `actor_user_id`, `operation_key`, `request_hash`, `usage_reservation_id`, `status`, `version`, candidato/revisão em JSONB com strings decimais, resultado vinculado e timestamps. Não persistir texto bruto nem hash simples do texto de origem, que permitiria tentativa por dicionário. FKs compostas, limites de tamanho, unicidade idempotente e RLS `ENABLE` + `FORCE`.

**Política de retenção aprovada:** não persistir o texto bruto no servidor; mantê-lo somente no estado do formulário durante a revisão. Persistir hash de requisição para idempotência (não hash simples do texto bruto), candidato estruturado, correções do dono, confirmação e IDs de resultado. Apagar a proposta e os dados estruturados 30 dias após confirmação ou descarte; propostas abertas expiram 30 dias após criação. `reconciliation_required` é exceção operacional: permanece disponível e não é apagada automaticamente até confirmação ou descarte pelo dono; após resolução começa a retenção terminal de 30 dias. Se nunca for resolvida, pode permanecer indefinidamente, portanto exige acompanhamento operacional e revisão periódica. A limpeza roda diariamente e nunca toca ledger, auditoria ou estoque. O ledger e a auditoria seguem suas próprias regras e não guardam texto bruto nem cópia integral da proposta. Leituras/confirmações de propostas expiradas são recusadas. A janela de 30 dias foi aprovada antes da Tarefa 1.

- [x] **Passo 1: registrar teste RED de schema e constraints.** RED confirmado antes da migration; teste cobre escopo tenant/unidade/local, estados, unicidade, FKs e grants.
- [x] **Passo 2: registrar teste RED de RLS.** A/B entre organizações, A1/A2, escrita forjada e lifecycle/versionamento ficam em uma transação que sempre termina em `ROLLBACK`.
- [x] **Passo 3: executar RED no alvo guardado.** Testes falharam pela tabela ausente sem persistir fixture; alvo exato guardado no helper e C07-DEV autorizado.
- [x] **Passo 4: implementar migration aditiva e repositório.** RLS `ENABLE` + `FORCE`, grants mínimos, versionamento otimista, FKs tenant/unidade/local/reserva/resultado; sem `SECURITY DEFINER`. Cron diário usa `pg_cron` 1.6.4; purge não toca ledger/auditoria/estoque. `reconciliation_required` é exceção não expirada até resolução e exige revisão operacional se persistir.
- [x] **Passo 5: aplicar somente migrations aditivas do Ciclo 07A no DEV autorizado.** Aplicadas `20261016190345_cycle07_ai_text_proposals` e `20261016190427_cycle07_ai_proposal_reservation_fk_index`; histórico confirmado antes/depois, sem reset ou outras migrations. Testes sintéticos terminaram sem propostas persistidas.
- [x] **Passo 6: executar gate RLS/schema.** Integrações schema e tenant passaram; advisor confirmou que não resta FK sem índice nesta tabela.
- [x] **Passo 7: commit.** `feat(db): persist tenant-scoped ai text proposals` (`4fc3a31`).

**Checkpoint:** não avançar sem RLS/constraints passando e retenção aprovada. O replay integral desde DB local vazio permanece pendente por falta de runtime local; documentar essa limitação, sem resetar ou substituir a prova com o DEV. A autorização C07-DEV cobre somente a migration aditiva e testes sintéticos desta tarefa.

### Tarefa 3 — Serviço de geração, entitlement e rotas (RED → GREEN)

**Arquivos:**

- Criar `apps/api/src/services/ai-text-types.ts`, `apps/api/src/services/ai-text.ts`, `apps/api/src/routes/ai-text.ts`.
- Modificar `apps/api/src/app.ts`, `apps/api/src/http/security.ts`, `apps/api/package.json`.
- Criar `tests/integration/ai-text-api.test.ts`.

**Interfaces produzidas:**

- `TextExtractor = (input: { text: string; requestId: string }) => Promise<unknown>`; produção sem implementação configurada retorna `DEPENDENCY_UNAVAILABLE`, sem cair no mock.
- `createAiTextService(db, extractor)` expõe `createProposal(args, {locationId,text}, key)`, `getProposal(args,id)`, `updateProposal(args,id,input,key)`, `discardProposal(args,id,key)`.
- Rotas sob `/v1/organizations/:organizationId/restaurants/:restaurantId/inventory/ai/text/proposals` usam `X-Donos-Context`, `Idempotency-Key` e schemas estritos.

**Interfaces consumidas:** contratos da Tarefa 1, `reserveUsage/markUsageDispatched/settleUsage/releaseUsage/markUsageUnknown`, `withRestaurantTx`, repositório da Tarefa 2 e catálogo atual.

- [ ] **Passo 1: escrever testes RED de gate e lifecycle.** Sem `inventory_core`, `ai_text_whatsapp` ou cota: extractor chamado zero vezes; com fixtures válidas: uma reserva, um dispatch, uma proposta; input repetido retorna a mesma proposta; chave com hash/contexto diferente conflita.
- [ ] **Passo 2: escrever teste RED de falha/recuperação.** Falha antes do dispatch libera uso; timeout após dispatch marca `reconciliation_required`, preserva reserva e não reexecuta extractor; resultado inválido continua sem movimento.
- [ ] **Passo 3: executar RED focado.** Rodar `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/ai-text-api.test.ts`; esperado: exports/rotas ainda não existem.
- [ ] **Passo 4: implementar serviço e rotas.** Reservar/dispatch em transações curtas; chamar extrator fora de `retryIdempotent`; revalidar entitlement ao persistir/editar; converter erros em `DomainError` sem vazar conteúdo.
- [ ] **Passo 5: configurar mock somente em desenvolvimento/testes.** `apps/api/src/server.ts` fornece extrator determinístico apenas quando `NODE_ENV` é `development`/`test`; produção sem configuração responde indisponível e deixa formulário manual disponível.
- [ ] **Passo 6: executar API/integration e typecheck.** Esperado: gate antes do extractor, sem chamada duplicada e erros esperados; `pnpm typecheck` passa.
- [ ] **Passo 7: commit.** `feat(api): add gated ai text proposal lifecycle`.

**Checkpoint:** nenhuma chamada de modelo externo; proposta só persiste revisão estruturada e hash, sem texto bruto.

### Tarefa 4 — Confirmação transacional de recebimento/baixa (RED → GREEN)

**Arquivos:**

- Modificar `apps/api/src/services/ai-text.ts`, `apps/api/src/services/ai-text-types.ts`, `apps/api/src/routes/ai-text.ts` se necessário.
- Modificar `packages/db/src/audit-repository.ts` para ações tipadas de IA ou criar `packages/db/src/ai-audit-repository.ts` se a enumeração existente ficar grande; exportar novo módulo se criado.
- Criar `tests/integration/ai-text-concurrency.test.ts` e ampliar `tests/integration/ai-text-api.test.ts`.

**Interface produzida:** `confirmProposal(args, proposalId, { expectedVersion, supplierId?, confirmed: true }, key)` bloqueia proposal e usa o mesmo `Tx` para `draftReceipt` + `receiveReceipt` ou `issueStock`, status, uso e auditoria.

**Interfaces consumidas:** `draftReceipt(ctx,input,tx)`, `receiveReceipt(ctx,id,key,tx)`, `issueStock(ctx,input,key,tx)`, entitlement e repo.

- [ ] **Passo 1: escrever testes RED de confirmação.** Compra canônica gera 5 kg × R$38/kg, exige fornecedor/item/local, estoque permanece igual antes da confirmação e muda somente depois da confirmação explícita; baixa exige motivo e preserva bloqueio de saldo negativo.
- [ ] **Passo 2: escrever testes RED de idempotência/concorrência.** Repetição com mesma chave retorna resultado original; confirmações concorrentes com chaves distintas, versão antiga, status terminal ou tenant cruzado produzem no máximo um movimento.
- [ ] **Passo 3: escrever teste RED de rollback.** Injetar falha após movimento antes de atualizar proposta/auditoria; confirmar que ledger, saldo, preço, reserva e estado da proposta revertem juntos.
- [ ] **Passo 4: executar RED focado no DB local.** Rodar `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/ai-text-api.test.ts tests/integration/ai-text-concurrency.test.ts`.
- [ ] **Passo 5: implementar confirmação atômica.** Reter locks em ordem consistente; validar versão/status/tenant, catálogo atual e entitlement; chamar funções de domínio no mesmo `Tx`; não encadear `InventoryService` com outra transação.
- [ ] **Passo 6: executar suite focada e T-05/T-20/T-21/T-22.** Esperado: exatamente um movimento, R$38/kg, nenhuma escrita antes da confirmação, isolamento e rollback completo.
- [ ] **Passo 7: commit.** `feat(ai): confirm text proposals atomically`.

**Checkpoint:** antes de UI, revisão independente de transação, ledger, idempotência e isolamento dos novos comandos.

### Tarefa 5 — Interface Apple Design para App 01

**Arquivos:**

- Criar `apps/estoque/src/ai/ai-client.ts`, `AiTextWorkspace.tsx`, `AiProposalReview.tsx`, `ai-text.css`.
- Modificar `apps/estoque/src/inventory/InventoryWorkspace.tsx`, `apps/estoque/src/main.tsx`.
- Criar `tests/e2e/ai-text-flow.spec.ts`.

**Interface produzida:** `AiTextWorkspace` recebe cliente, lista de insumos/fornecedores ativos e contexto atual; renderiza estados texto, interpretando, revisão e resultado; envia cada mutação com chave idempotente. Mudança de geração do contexto descarta resposta antiga.

**Interfaces consumidas:** contratos aprovados da Tarefa 1, rotas da Tarefa 3 e contexto/geração de `inventory-client.ts`.

- [ ] **Passo 1: escrever E2E RED mockado.** Texto canônico, interpretação, fornecedor ausente, edição/revisão, confirmação explícita e resultado; afirmar que nenhuma chamada de confirmação ocorre antes do clique.
- [ ] **Passo 2: escrever E2E RED de falhas e contexto.** Erro de entitlement/cota mantém texto e oferece formulário manual; troca de unidade/local invalida proposta antiga; teclado/foco e `prefers-reduced-motion` não impedem uso.
- [ ] **Passo 3: executar RED.** `pnpm exec playwright test tests/e2e/ai-text-flow.spec.ts`; esperado: falha porque a área de IA não existe.
- [ ] **Passo 4: implementar componentes e estilos.** Foco visível, alvos confortáveis, tipografia do sistema, mensagens `role=status/alert`, `aria-busy`, sem sucesso prematuro. CSS oferece layout móvel/desktop, sem biblioteca nova; `prefers-reduced-motion` remove deslocamento.
- [ ] **Passo 5: executar E2E e typecheck.** Esperado: fluxo completo via API mockada, sem chamadas reais ou dados persistidos de produção.
- [ ] **Passo 6: commit.** `feat(estoque): add accessible ai text proposal flow`.

**Checkpoint:** UI não interpreta erro de rede/timeout como falha definitiva de movimento; oferece verificação/retentativa idempotente.

### Tarefa 6 — Integração, evidências e revisão independente

**Arquivos:**

- Possível ajuste em `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`, `docs/SPRINT_LOG.md` e criar `docs/evidence/ciclo-07-ai-text.md`.
- Nenhum ajuste automático em `docs/05-REGISTRO-DE-DECISOES.md` sem decisão de produto aprovada.

- [ ] **Passo 1: execução integrada local.** Rodar unitários, integração local selecionada, E2E, `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`; anotar runtime e cada resultado.
- [ ] **Passo 2: auditoria independente read-only.** Revisar RLS/API contra ID forjado/duas organizações, matemática/unidades/preço total, reserva/dispatch/settle e corrida de confirmação/rollback. Não usar banco compartilhado mutável.
- [ ] **Passo 3: corrigir achados com teste RED antes do fix.** Reexecutar os alvos afetados após cada correção.
- [ ] **Passo 4: registrar evidência e limites.** Diferenciar unitário, integração local selecionada, E2E mockado e replay completo; declarar explicitamente que nenhum provedor real/WhatsApp foi validado.
- [ ] **Passo 5: preparar commits/PR do ciclo.** Atualizar estado e sprint log, criar PR contra o merge do Ciclo 06; não fazer merge/deploy nem iniciar Foto/Voz/WhatsApp.

**Checkpoint final:** evidência reproduzível, revisão sem bloqueador, gates locais executados no Node suportado e nenhuma ação fora do escopo autorizado.

## Estratégia de agentes e execução

- O coordenador mantém contratos, migração, repositório, uso/serviço API, confirmação transacional, testes de integração e integração final.
- Após congelar Task 1 interfaces, subagente pode implementar somente `packages/domain-ai/src/**` e testes unitários desse domínio; outro pode implementar somente `apps/estoque/src/ai/**` e E2E mockado depois de receber os DTOs finais.
- `InventoryWorkspace.tsx`, `app.ts`, migration, DB e transações não são compartilhados entre escritores; integração fica com o coordenador. Não paralelizar tasks que dependam do DB mutável.
- Método recomendado: subagent-driven com checkpoints após cada tarefa. O erro em confirmação pode criar movimento ou duplicar custo; contratos e transação centralizados justificam a revisão frequente.
- Gate humano satisfeito: plano e retenção aprovados em 2026-10-16; implementação de Tarefa 1 iniciada após aprovação. C07-DEV autoriza somente a Tarefa 2 no projeto DEV indicado, com migration aditiva e dados sintéticos; confirmar guard do alvo antes de cada conexão. Aplicar Apple Design skill na Tarefa 5, quando o trabalho de frontend começar.
