# Evidências — Ciclo 02 Inventory

Autorização humana: “Revisado! siga!”, em 15/10/2026, após entrega do PR core #1. Plano/spec/ADR0003 aprovados. Base revisada `2df79f9cd8a94848cdf0814a333a22279a9bb8e6`, branch `codex/ciclo-02-inventory`, raiz DONOS_NEXT_CODEX_MULTIAGENTES_KIT. Somente remote makollykalk/Donos_next; nenhum merge/deploy/produção/legado autorizado.

## Task 1 — contratos

RED real: `node node_modules/vitest/vitest.mjs run tests/unit/inventory-contracts.test.ts`, 3 falhas por schemas ainda ausentes. Não equivale a prova funcional financeira/SQL.

Task1 GREEN: 3 testes aprovados, typecheck e lint exit0. Novo workspace ligado por install frozen; nenhuma dependência externa adicionada. Commit37c3f99.

## Task3 — schema

Destino consultado em15/10: DONOS Next DEV kfthwjrvgslnsjigqnyc ACTIVE_HEALTHY PG17.11. RED via conexão donos_api real: inventory-schema.test.ts falha porque0 das9 tabelas existem, não por rede/credencial. CLI2.121.0 gerou os caminhos exatos, antes de escrever SQL:

- M_INV_SCHEMA: supabase/migrations/20261015143719_inventory_schema.sql
- M_INV_INTEGRITY: supabase/migrations/20261015143722_inventory_integrity.sql

Aplicações por MCP exclusivamente no DEV novo. Histórico retornou versões finais: `20261015143958_inventory_schema.sql`, `20261015144127_inventory_integrity.sql`; arquivos locais renomeados ao histórico real, sem reescrever SQL aplicado. Antes de integrity, regressão RED demonstrou que projeção isolada conseguia COMMIT. Esse único probe sintético seq0/sem ledger foi explicitamente reconduzido a zero antes das constraints; nenhuma trilha foi apagada. Após integrity, 2 testes schema/grants passaram.

Revisão independente encontrou divisão numeric de coeficiente por10^12 com perda de escala em valores altos. SELECT real devolveu123456789012345679 em vez de123456789012345678.901234567891. Regressão RED confirmou, nova migration geradaCLI `20261015144353_inventory_exact_quantum.sql`, aplicada e reconciliada ao histórico `20261015144412_inventory_exact_quantum.sql`; converte coeficiente por multiplicação decimal exata. GREEN da consulta de custo; teste de recebimento/baixa real de valor alto adicionado. Migrations anteriores preservadas.

## Task2 — motor puro

Agente inventory_engine escreveu somente motor/testes exclusivos. RED por módulos ausentes; GREEN15testes em3arquivos, repetido pelo coordenador; typecheck/lint passaram. Revisor independente executou os15 e aprovou política cumulativa. Commitdd1b87b. Não conta sozinho como prova SQL.

## Tasks4–7 — transações e API

Canônico real T03 passou: ledger−2/−40, Q8/V160/ref200/10; após recebimento Q15/V335/ref335/15, somas exatas. API1teste passou com18rotas sem login, JWT A/B distintos, IDs forjados,400estrito e403semplano. Idempotência paralela/replay e conflito entre unidades passaram. Concorrência com barreira em duas conexões:6+6sobre10 → umsucesso/umINSUFFICIENT_STOCK/Q4/V80/2eventos. Ainda não representam suíte final.

Revisor de backend não identificou bloqueador estrutural; achadoUUIDuppercase permitia duplicata noDTO, protegido pelaUNIQUE porém status incorreto. RegressãoRED eGREEN após normalização lowercase em schemasInventory. ApiFailure409de estoque também teveRED→GREEN de mensagem específica. UI liberada apenas nos contratos/arquivos exclusivos; sem acesso ao banco enquanto coordenador roda integração.

SQLexato segue PostgreSQL17: [numeric e coerção de escala](https://www.postgresql.org/docs/17/datatype-numeric.html), [constraint triggers diferidos](https://www.postgresql.org/docs/17/sql-createtrigger.html). Replay em Supabase descartável ainda não executado (Docker/WSL ausentes); não substituir por reset cloud. FixturesDEV sintéticas persistem; script de provisionamento separado do runtime em tests/integration/sql/inventory-fixtures.sql.

## Verificação integrada e retomada em15/10

Suíte principal: `dp test:integration`, **49 PASS/30 arquivos**,718.36s, exit0, `.tools/inventory-integration-first-full.log`. Inclui canônico, fracionários, reais40001/40P01 do core, concorrência, guards de projeção/ledger, segurança/JWTs e demais regressões do core. Os casos acrescentados após início dessa execução foram comprovados por `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-numeric-boundaries.test.ts tests/integration/inventory-rollback.test.ts`: **5 PASS/2 arquivos**,228.31s, exit0, `.tools/inventory-integration-complement.log`. Duas provas de rollback foram repetidas; há52 cenários únicos em31 arquivos ao todo, não uma execução única de54 testes.

O complemento confirma rollback do rascunho após cabeçalho/primeira linha, nenhuma chave órfã, custo zero explícito, underflow positivo recusado, contagem fracionável opt-in e total da unidade exatamente100000000000000000000000000, maior que o limite individual. Nenhum valor foi convertido em Number.

Verificação de15/10 às15:41 com Node24.22.0/pnpm11.25.0:

| Comando | Resultado real / log ignorado |
|---|---|
| dp install --frozen-lockfile |exit0,12workspaces; inventory-install-final.log |
| dp typecheck |exit0; inventory-typecheck-final.log |
| dp lint |exit0,zero warnings; inventory-lint-final.log |
| dp test:unit |116 PASS/14arquivos; inventory-test-unit-final.log |
| dp build |exit0,API/pacotes/trêsapps; inventory-build-final.log |
| dp audit --json |249dependências,0vulnerabilidades reportadas; inventory-audit-final.log |
| scan local de credenciais |224fontes+6bundles,0vazamentos; não imprime valores secretos |

Revisor independente `inventory_final_review` inspecionou tracked+untracked, migrations/motor/repositórios/serviços/API/UI e executou116unitários/typecheck/lint, todos aprovados; sem novo bloqueador. Não executou DB/E2E nem alterou arquivos. Não confundido com aprovação de produção ou merge.

## UI — verificação concluída

Agente UI em arquivos exclusivos, coordenador único dono de SQL/contratos. Revisão encontrou corrida de abertura de documentosA/B, conversão não atualizada e paginação antiga após filtro; foram acrescentadas guardas de geração, confirmação por receiptId e invalidação de consultas. Unitários de UI6PASS. Primeiro comando E2E nesta retomada falhou no harness por resolução @donos/db antes do teste. Playwright passou a usar tsconfig.tests.json; esse erro de harness não foi contado como RED funcional.

Regressão da corrida de documentos: retirada controlada da guarda de geração provocou RED real (resposta A substituiu B revisado); restauração byte a byte da correção resultou GREEN. Logs ignorados `inventory-ui-receipt-red.log` e `inventory-ui-receipt-green.log`. Histórico filtrado e confirmação após perda de resposta passaram isoladamente2/2. No segundo caso, a API efetivamente confirmou no banco antes da resposta503 simulada; retry preservou chave/payload e houve somente um movimento, Q3/V21.

Suíte completa intermediária encontrou falhas de espera de abertura do formulário: os GETs reais ainda estavam em andamento quando a asserção de15s expirou. Helpers passaram a aguardar as quatro respostas reais de catálogo/saldo antes da asserção. Timeout do cliente20s, expect geral15s e retries0 foram preservados. Uma consulta duplicada de saldo/total foi removida da UI: o total vem da mesma resposta SQL da página de saldos. O canônico UI/API passou em2,4min nessa execução:10×20, saída2, nova compra7×25 →15/R$335/razão335/15; também cobriu embalagem nova sem reseleção, recebimento multitem, saldo insuficiente, estorno tardio negado e estorno integral elegível com histórico preservado.

**Suíte final browser:18/18 PASS,6,6min, exit0**, um worker e zero retries, `.tools/inventory-ui-e2e-final.log`. Inclui os sete casos Inventory e onze regressões core; canônico repetido passou em1,9min. A execução anterior15PASS/3FAIL foi preservada em `.tools/inventory-ui-e2e-bootstrap-failure.log`, sem ocultar falhas por retry.

Após o agente liberar o DEV e congelar as edições, coordenador repetiu `dp typecheck`, `dp lint`, `dp test:unit` e `dp build`: todos exit0, **116 unitários/14 arquivos**. Logs `.tools/inventory-close-{typecheck,lint,test-unit,build}.log`. Novo scan:225 arquivos de origem+6 bundles, zero vazamentos. UI commitfc5b379. A revisão React verificou consultas independentes paralelas, invalidação por contexto/geração, inputs com labels e bloqueio de submissão concorrente; não introduziu dependência ou refatoração fora do escopo.

Consulta final de metadados DEV:20 tabelas core,20 com RLS habilitada e forçada; zero funções SECURITY DEFINER; anon/authenticated sem USAGE no schema core; donos_api sem superuser/BYPASSRLS. Advisor security retornou somente WARN `auth_leaked_password_protection`: [orientação oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nenhum alerta de RLS retornado. Essa consulta administrativa verifica configuração; as provas de acesso continuam os testes sob runtime/JWT distintos.

Commits até o gate de UI:37c3f99contratos,dd1b87bmotor,c7d2775schema,02b4009persistência,5e7db5atransações/estornos,69e01b7API,f771383conteúdo protegido. Sem merge/deploy nem Ciclo03.

## Rastreabilidade dos critérios e segurança

Os arquivos abaixo estão em `tests/integration/`; executam contra Auth/PostgreSQL DEV reais, com conexão `donos_api`, TLS verificado e sem BYPASSRLS. Fixtures A/B usam JWTs distintos; A também possui a organização C e unidades distintas. As suítes não usam a conexão administrativa do MCP para provar RLS.

| Critério | Prova executada na suíte SQL |
|---|---|
| T-01/T-02 | `inventory-tenant-security.test.ts`, `inventory-api.test.ts`: contexto explícito, A/B, A/C do mesmo dono, A1/A2, referências forjadas, fornecedores organizacionais e estoque local |
| T-03 | `inventory-canonical.test.ts`: baixa de R$40, saldo8/R$160 e nova entrada7/R$175 → saldo15/R$335, razão335/15, somas de ledger iguais à projeção |
| T-04 | `inventory-fractional.test.ts`, `inventory-decimal.test.ts`, `inventory-numeric-boundaries.test.ts`: oráculo SQL independente, precisão alta, escala/faixa/não finitos recusados, sem float |
| T-05 | `inventory-idempotency.test.ts`: replay original, concorrência da mesma chave, conflito de payload/unidade; gates antes do replay |
| T-06 | `inventory-concurrency.test.ts`: duas conexões com barreira, saídas6+6 sobre10, uma rejeitada; primeiros recebimentos multitem em ordem inversa preservados |
| T-07 | `inventory-conversions.test.ts`, `inventory-catalog.test.ts`: unidades compatíveis, versão/snapshot de embalagem, incompatibilidade e referência alheia recusadas |
| T-08 | `inventory-zero-balance.test.ts`: esgotamento Q/V=0 e nova referência de custo sem apagar histórico |
| T-09/T-10 | `purchase-receipts.test.ts`, `purchase-price-history.test.ts`: rascunho sem efeitos, confirmação explícita atômica, histórico por fornecedor e preços anteriores preservados |
| Falha de persistência | `inventory-rollback.test.ts`: falhas após ledger/projeção/preço/status/auditoria/resposta idempotente, falha diferida no COMMIT e falha de rascunho; tudo ou nada |
| Imutabilidade e integridade | `inventory-ledger-grants.test.ts`, `inventory-ledger-integrity.test.ts`, `inventory-schema.test.ts`: DELETE/TRUNCATE/UPDATE recusados nas trilhas, cadeia e projeção conferidas no COMMIT, RLS/FKs/grants |
| Compensação | `inventory-reversals.test.ts`: restauração completa com sequência crescente, origens intactas, recebimento multitem inteiro ou nenhum, sucessores bloqueados |

T-23 não se aplica: nenhum Storage foi usado. T-11 em diante, fora os cenários core reaproveitados, não são declarados implementados pelo Ciclo02.

Arquivos principais alterados: contratos em `packages/contracts/src/inventory*.ts`; motor/comandos em `packages/domain-inventory/` e `packages/domain-purchases/`; repositórios em `packages/db/src/*inventory*` e `purchase-repository.ts`; serviço/rotas em `apps/api/src/services/inventory*` e `apps/api/src/routes/inventory.ts`; slot protegido em `packages/auth-client/src/OwnerApp.tsx`; UI em `apps/estoque/src/inventory/`; testes unitários, SQL e browser correspondentes. Lista exata: `git diff --name-only 2df79f9...HEAD` após os commits finais.

## Limites operacionais para revisão

- Não houve merge, deploy, cobrança real, integração paga ou acesso ao legado/produção. Apenas DEV autorizado, API/apps locais e dados sintéticos.
- Supabase local/replay das migrations do zero continuam **não verificados**, pois Docker/WSL não estão disponíveis. Não foi executado reset remoto para contornar essa lacuna.
- Correções com movimentos posteriores exigem revaloração futura: este ciclo as bloqueia. Recebimento parcial, rateio automático, transferências, fichas, contagem física, PDF, Premium, IA e motor de precificação estão fora.
- As fixtures DEV acumulam histórico imutável; não há limpeza destrutiva automatizada. Credenciais sintéticas/runtime ficam somente em arquivos ignorados, nunca no relatório ou PR.
- O alerta Auth de proteção contra senhas vazadas permanece pendente no plano Free; nenhuma contratação foi realizada. O acesso atual é para desenvolvimento, não aprovação de produção.
- A política atual de entitlement bloqueia o módulo inclusive para leituras, preservando os dados. Leitura histórica após cancelamento permanece decisão comercial pendente em IMP-009.

## Fechamento técnico — 15/10/2026

Comando final SQL: `dp exec vitest run --config vitest.integration.config.ts tests/integration/inventory-cumulative-sql.test.ts tests/integration/inventory-tenant-security.test.ts tests/integration/inventory-reversals.test.ts` → **4 PASS/3 arquivos**,155,76s, exit0, `.tools/inventory-integration-final-guards.log`. Executado somente após encerramento dos18E2E; não houve disputa de fixtures entre agentes.

Essa execução acrescenta uma prova nova e repete três cenários reforçados: baixa fragmentada de razão1/3 com deltas−0.333333333333/−0.333333333334/−0.333333333333 e Q/V finais exatamente0; recebimento10kg/R$200 emA1 com saldo/valor zero emA2/C/B; duas compensações concorrentes com chaves distintas geram um sucesso e um REVERSAL_ALREADY_APPLIED. O teste de fornecedores agora percorre todas as páginas, sem depender da posição do UUID nas fixtures acumuladas.

**Total de integração comprovado:53 cenários distintos em32 arquivos**, obtido pelas execuções49+5+4 acima, com cinco repetições. Não equivale a uma única execução de58 testes. Unitários finais116/14arquivos, E2E finais18/18, typecheck/lint/build exit0. Não houve alteração de código após essas verificações; somente documentação de fechamento.

| Commit | Entrega |
|---|---|
| 37c3f99 | Contratos Inventory |
| dd1b87b | Motor exato cumulativo |
| c7d2775 | Schema/RLS/integridade e correção do quantum SQL |
| 02b4009 | Repositórios de catálogo/estoque/compras |
| 5e7db5a | Comandos transacionais, idempotência e compensação |
| 69e01b7 | API protegida, contratos estritos e erros |
| f771383 | Conteúdo protegido vinculado ao contexto ativo |
| fc5b379 | UI mínima e provas browser |
| 1c5cd27 | Provas SQL de esgotamento, saldo isolado e estorno concorrente |

Coordenador manteve SQL/contratos/integração; agentes trabalharam no motor puro, UI e revisões em arquivos disjuntos. Revisão independente não substitui a aprovação humana do PR. Este fechamento entrega somente Ciclo02 para revisão; Ciclo03 permanece não iniciado.
