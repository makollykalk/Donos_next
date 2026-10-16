# Evidências do Ciclo 01

Estado em15/10/2026: **gate técnico do Ciclo01 validado no DEV autorizado**, revisão independente sem bloqueador; PR para revisão, sem merge/deploy. Autorização: mensagem “Execute somente o Ciclo01”, após plano, seguida de autorização do DEV cloud novo e remote Donos_next. Usuário aprovou em15/10 a spec/plano Inventory, condicionando execução ao fechamento deste ciclo. Produção, projetos preexistentes e custos pagos permanecem fora do escopo.

## Preflight

- Raiz nova confirmada. Não havia Git; `git init -b main` e branch `feat/ciclo-01-core-multitenant` criados localmente, sem remote.
- Nome/email Git estavam ausentes. Usuário forneceu `Luankolly@gmail.com`; esse valor literal foi usado como nome e email somente na configuração deste repositório, sem inventar um nome civil. Commit inicial do kit: `c4c41d5`.
- WSL informa não instalado; Docker não encontrado; sessão Windows sem administrador. Usuário posteriormente autorizou Supabase na nuvem e escolheu `makollykalk's Org`; ADR 0002 substitui a restrição local exclusivamente para projeto DEV novo, criado pelo próprio usuário.
- Node observado 24.15.0; alvo local 24.22.0 em `.tools/`, sem alterar runtime global. Metadados npm dos pins da Task 1 reconsultados; licenças MIT e TypeScript Apache-2.0.
- Repositório legado, produção, pagamentos e integrações não foram acessados nesta execução.

## Progresso

- Task 1: concluída e revisada no commit `d611c0b`. Harness: Node 24.22.0 baixado do domínio oficial, SHA-256 conferido; pnpm 11.25.0. O wrapper global do pnpm usa Node 24.19.0 internamente, portanto os comandos de verificação passaram a invocar o entrypoint pnpm.mjs com o Node local 24.22.0.
- Tasks2–7 implementadas e verificadas no DEV novo. As seções históricas abaixo preservam os resultados parciais; o fechamento final é a autoridade sobre o estado atual.
- T-01 nos endpoints existentes e fundação de T-02: API/JWTs reais A/B, dono A com A/C, contextos A1/A2, SQL como donos_api e FK tripla demonstrados. Compra/saldo T-02 completos pertencem ao Ciclo02; não foram aprovados por antecipação. T-23 não aplicável: consulta real retornou zero buckets Storage.

## Decisões operacionais

- Execução nesta raiz nova e branch aprovada; não criar worktree extra para um repositório recém-inicializado e vazio. Custo se inadequado: isolamento de checkout adicional ausente; branch e escopo local continuam explícitos.
- Coordenador implementa contratos/backend/SQL; subagente de segurança somente lê. UI será delegada somente depois de contratos e gates anteriores aprovados por testes.

## Evidência Task 1 — red/green

- `node node_modules/vitest/vitest.mjs run`: primeiro red de importação, 3 arquivos sem módulos. Esse resultado não foi tratado como prova funcional.
- Após interfaces mínimas sem comportamento: mesmo comando, **38 failed / 32 passed**, 3 arquivos falhando. Entre os erros: health404 em vez de200, validação/normalização de DTO e representação canônica ausentes. Log local ignorado `.tools/task1-red-behavior.log`.
- Implementação: corrigida falha detectada em IntegerString (refine executava BigInt apesar de validação anterior falha); pipeline agora só converte texto sintaticamente válido.
- Mesmo comando após implementação: **70 passed, 3 arquivos**. Log `.tools/task1-green.log`. Nenhuma conexão SQL/Auth foi usada.
- `node node_modules/typescript/bin/tsc -b` e `node node_modules/typescript/bin/tsc -p tsconfig.tests.json --noEmit`: exit0.
- Primeira execução lint: um erro de argumento `_deps` não usado; regra passa a reconhecer argumento reservado de interface com prefixo `_`. Reexecução ainda será registrada.

Os comandos `node` acima usaram `.tools/node-v24.22.0-win-x64/node.exe`. Lockfile gerado com pins exatos; `pnpm install --frozen-lockfile` reproduzido: exit0. Licenças dos pacotes diretos: MIT; TypeScript Apache-2.0. `pnpm audit --json`: exit0, vulnerabilidades info/low/moderate/high/critical = 0/0/0/0/0, 200 dependências reportadas (inclui opcionais). Não é garantia de ausência de toda vulnerabilidade.

Reexecução de lint após ajuste: exit0, zero warnings. Build/typecheck: exit0. Scripts integration/e2e permanecem indisponíveis de forma explícita; não foram tratados como testes aprovados.

Revisor independente `review_ciclo01`: spec compliance e qualidade da Task 1 aprovadas, sem achado bloqueante de código. Leu diff/código/logs sem repetir suíte ou acessar banco. Apontou frase desatualizada de autorização na abertura desta evidência, corrigida. Parecer não cobre RLS/Auth/concorrência nem suporte cloud.

## Evidência Task 2 — schema e SQL cloud DEV (parcial)

Destino único: `kfthwjrvgslnsjigqnyc`, DONOS Next DEV, criado pelo usuário. PostgreSQL 17.11; public/core inicialmente vazios. SQL executado pelo conector Supabase no projeto novo, sem SQL nos demais projetos.

- RED real: `select id,owner_user_id,name from core.organizations limit 0` →42P01; `tests/integration/sql/core-identity.sql` →P0001 “core.organizations missing”.
- CLI2.121.0 gerou M01. Aplicação por apply_migration foi bem-sucedida. Os arquivos locais foram alinhados às versões retornadas pelo histórico remoto: `supabase/migrations/20261014232305_core_identity.sql` e `20261014232342_core_runtime_test_role.sql`. Nada foi reescrito numa migration já aplicada.
- Primeira execução do teste de papel encontrou42501 ao SET ROLE. Diagnóstico pg_auth_members: creator postgres tinha ADMIN=true, INHERIT=false, SET=false. Segunda migration concede apenas SET de donos_api ao migrador postgres, preservando o runtime sem membership privilegiada. Não concede postgres ao runtime.
- `tests/integration/sql/core-identity.sql` via execute_sql → PASS: seis tabelas com ENABLE+FORCE RLS, runtime NOBYPASSRLS/não owner, grants restritos, catálogo privado e sem leitura sem contexto.
- `tests/integration/sql/tenant-references.sql` via execute_sql → PASS: duas identidades sintéticas em transação, dono A com empresas A/C, dono B com B, unidade A1 isolada de A2/C1/B1, owner/tenant forjados rejeitados, FK composta rejeita cruzamento e audit não permite delete. Transação revertida, sem fixtures persistidas.
- `get_advisors(type=security)` após M01: nenhuma lint retornada. Isso não substitui os testes acima.
- Limite: SET ROLE real dentro da sessão do migrador prova policies/grants, mas ainda falta integração por conexão autenticada diretamente como donos_api e JWTs Auth distintos. Task 2 não está integralmente concluída; Task 3 ainda não iniciada.
- O limite acima era o estado parcial dessa execução; foi resolvido pelo complemento runtime/Auth e pela suíte final abaixo.
- Conexão TCP direta IPv6 expirou. Session pooler `aws-0-us-east-1.pooler.supabase.com:5432` comprovado por conexão autenticada como `donos_api`, no projeto aprovado. TLS exige rejectUnauthorized e CA oficial; nenhuma verificação foi desabilitada.

### Complemento Task 2 — conexão real e revisão

- CA obtida no endereço de certificado publicado no código oficial Supabase Studio: `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA256 do arquivo: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. Certificado válido até 26/04/2031. Cópia e credenciais somente em `.local/`, ignorado.
- Config pooler RED: 1 failed/23 passed. GREEN via integração direta: **2 arquivos/3 testes PASS**, runtime conectado por senha própria NOBYPASSRLS, grants/RLS consultados e duas credenciais Auth distintas autenticadas. Não é teste como postgres.
- Fixtures persistentes sintéticas: owner-a/owner-b no domínio `.invalid`, dono A com organizações A/C e unidades A1/A2/C1, dono B com B/B1. Senhas aleatórias independentes fora do Git. Login real confirmou as duas identidades; nenhum email ou dado real usado. Seed Auth feito pelo conector administrativo no DEV, separado da API; não alterou schema Auth nem desativou confirmação global.
- Revisão independente encontrou CHECK com NULL e auditoria sem unidade. Regressões SQL falharam antes da correção e passaram após `20261014232709_core_idempotency_scope_constraint.sql`. Não houve edição retroativa de migration aplicada. Revisor confirmou ambas as correções em leitura e executou 72 unitários PASS.
- IDs da fixture transacional `tenant-references.sql` isolados em prefixos 710/720 para não conflitar com fixture persistente 100/200. Scripts SQL de rollback são provas separadas da suíte Node, não contados nela.
- Limitação: replay completo em banco local descartável não executado (Docker ausente). Não executar reset remoto para substituir essa prova.
- Usuário autorizou remote novo `https://github.com/makollykalk/Donos_next.git`; ls-remote retornou vazio com exit0. Nenhum conteúdo legado herdado.

## Task 3 — transações

`tenant-transactions.test.ts` escrito antes do wrapper: RED por módulo ausente. Após implementação, integração **3 arquivos/6 testes PASS**, consultas reais NOBYPASSRLS. Inclui A/C do mesmo dono, B separado, ID forjado negado pelo RLS, pool max1 após commit/rollback e requests paralelos. TypeScript build exit0. A factory `createDatabase(pool)` mantém dependências explícitas por instância; nenhum contexto global. Contexto usa mesma conexão e set_config LOCAL. Testes adicionais de unidade/contexto seguem na Task4; replay local continua não executado.

## Task 4 — Auth e contexto

Testes antes da implementação falharam por módulos ausentes. Unit Auth: **10 PASS** (mesmo bearer, issuer/aud/exp/session/sub, usuário inconsistente/anônimo/não confirmado, indisponibilidade). Integração real **2 arquivos/2 PASS**: JWT adulterado negado, hash/TTL30min, A1 não interpretado como A2, sessão diferente negada; logout idempotente e refresh com mesmo session_id continuam bloqueados pelo banco. Validação usa getClaims + getUser conforme documentação oficial consultada nesta execução. Nenhum token/senha registrado. Rotas me/logout/contexts implementadas, sem logger de requests. API responde no-store e CORS local. Integração de rotas completa é gate da Task5.

## Task 5 — bootstrap/API

API RED funcional: 2 testes falharam (404 em vez de401/201). Após rotas/serviços: **2 PASS**, bootstrap e nova unidade com requisições simultâneas e mesma chave retornaram201/body idêntico; payload divergente409; owner extra400; ID de B404; dono A lista A/C. Testes de rollback adicionados depois como caracterização: **3 PASS**, falhas injetadas antes de unidade, auditoria e resultado idempotente deixam zero empresas parciais. TypeScript build exit0. Hash canônico, INSERT ON CONFLICT antes de efeitos e até duas novas tentativas apenas para40001/40P01. Nenhum provider dentro de retry. Contratos HTTP da spec congelados para UI; capabilities/access serão implementados na Task6 sem mudar DTOs.

## Tasks6/7 e fechamento em15/10/2026

Entitlements simulados, capabilities e gates API dos dois apps; metering interno reserve/dispatch/settle/release/unknown, sem provider real. Reservas usam lock organizacional, bigint e savepoint por comando; erro JS/SQL não deixa parcial mesmo se o chamador o capturar. period_start permanece texto exato para preservar microssegundos; updates de counters exigem rowCount1. Testes exercitam última quota concorrente, duplicata, estados terminais, desconhecido, expiração, sobreposição, bucket antigo e assinatura realmente cancelada. Fixtures são de demonstração, não concessão comercial.

Portal e shells independentes implementados com Auth por aba/app, contexto em memória, seleção explícita, proteção de geração contra respostas tardias e API logout antes do signOut local. Primeiro E2E teve8/10; segundo9/10 porque503 no carregamento impedia alcançar a unidade, não porque contexto expirado liberou acesso. Novo teste determinístico RED confirmou ausência de recuperação legível; botão de retry apenas da leitura foi implementado, GREEN e suíte completa11/11. Não há retry automático de escrita. Logs RED/GREEN `.tools/core-ui-retry-red.log` e `.tools/core-ui-retry-green.log`.

O build inicial acionava wrapper pnpm com Node24.19 apesar do processo principal24.22; warning foi observado. `scripts/build.mjs` agora usa process.execPath para tsc/Vite, valida configuração pública e não passa env de DB/secret aos frontends. Build final registrou Node24.22.0, sem esse warning. Public key é pública; senha/URL de DB nunca entram no bundle.

Comandos via Node24.22 local + entrypoint pnpm11.25.0 descritos no README:

| Comando | Resultado real / log ignorado |
|---|---|
| pnpm install --frozen-lockfile |exit0; core-frozen-final.log |
| pnpm typecheck |exit0; core-typecheck-final.log |
| pnpm lint |exit0, zero warnings; core-lint-final.log; repetido após script build |
| pnpm test:unit |90 PASS /7 arquivos; core-unit-final.log |
| pnpm test:integration |28 PASS /13 arquivos,174.45s; core-integration-final.log |
| pnpm test:e2e |11 PASS,1.5m; core-ui-e2e-final.log; Chromium real, sem retries |
| pnpm build |exit0, API/pacotes e3apps; core-build-final.log |
| pnpm audit --json |exit0,249dependências,0 vulnerabilidades em todas as severidades; core-audit-final.json |
| git diff --check e git diff main --check |exit0 após remover nove linhas vazias finais detectadas na checagem do diff completo |
| scan local de segredos |152arquivos fonte +6arquivos de bundle,0 vazamentos de credenciais reais conhecidas e0 marcadores DB/runtime no browser |

Integração inclui SQLSTATE40001 real com dois bootstraps SERIALIZABLE e40P01 real por deadlock de locks de teste; ambos passam pelo retry idempotente/rollback no PostgreSQL. Não é só mock. JWT real de B não lista nem cria em A; dono A não mistura A/C; contexto A1 não opera em A2; pool max1 limpa contexto após commit/rollback; logout/refresh e request já autorizada exercitados.

Revisor independente `close_core_review`: leu última delta, confirmou logs/code e executou90unitários/typecheck/lint, sem bloqueador para commit/PR. Agente `close_core_ui` executou E2E em janela exclusiva; coordenador executou integração em outra janela. Nenhum agente alterou SQL nem disputou banco mutável.

Consulta administrativa somente de metadados:11tabelas core,0Storage. Advisor security não reportou ausência de RLS; reportou **Leaked Password Protection Disabled**. [Recurso disponível no Pro ou superior](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); mantido Free, sem upgrade/custo autorizado. Senhas sintéticas aleatórias não substituem hardening de piloto.

Limitações explícitas: replay completo em Supabase local descartável não executado sem Docker/WSL; migrations foram aplicadas em ordem no DEV inicialmente vazio e histórico conferido, sem reset remoto. Provisionamento administrativo de fixtures foi pelo conector e não pertence à API. Logs locais ignorados não são artefatos públicos de CI. Não houve deploy, merge, produção, legado, cobrança, IA real nem estoque. Retenção de dados sintéticos/segredos locais e Auth/BFF/SSO para piloto continuam decisões operacionais futuras.

As Tasks6/7 compartilham wiring de workspace/API e são integradas num commit coerente; testes e documentação de fechamento ficam identificados na entrega. Próximo código autorizado: somente Inventory após este gate, conforme ADR0003 e plano aprovado. Custo médio canônico ainda precisa de prova no banco no Ciclo02.

## Entrega para revisão humana

PR [#1 — Ciclo 01](https://github.com/makollykalk/Donos_next/pull/1) aberto em 15/10/2026, base main, branch feat/ciclo-01-core-multitenant. Commits funcionais d611c0b, b68171d, 3c64c86, 292045a, 030bab8 e 1ea856f; fechamento documental aafa375. Branch publicada apenas no remote novo. Revisão independente sem bloqueador; merge/deploy não executados. Nova execução dos 90 unitários, typecheck e lint após remoção das linhas finais: todos exit0. O plano Inventory está aprovado condicionalmente; aguarda revisão humana deste PR, conforme gate da sua spec. Nenhum código ou migration Inventory foi iniciado.
