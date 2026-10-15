# Evidências do Ciclo 01

Estado: em execução; ciclo ainda não validado. Autorização: mensagem do usuário “Execute somente o Ciclo 01”, nesta conversa, após entrega do plano. Autorização posterior: Supabase DEV novo na nuvem, em makollykalk's Org, conforme ADR 0002. Produção, projetos preexistentes e custos pagos permanecem fora do escopo.

## Preflight

- Raiz nova confirmada. Não havia Git; `git init -b main` e branch `feat/ciclo-01-core-multitenant` criados localmente, sem remote.
- Nome/email Git estavam ausentes. Usuário forneceu `Luankolly@gmail.com`; esse valor literal foi usado como nome e email somente na configuração deste repositório, sem inventar um nome civil. Commit inicial do kit: `c4c41d5`.
- WSL informa não instalado; Docker não encontrado; sessão Windows sem administrador. Usuário posteriormente autorizou Supabase na nuvem e escolheu `makollykalk's Org`; ADR 0002 substitui a restrição local exclusivamente para projeto DEV novo, criado pelo próprio usuário.
- Node observado 24.15.0; alvo local 24.22.0 em `.tools/`, sem alterar runtime global. Metadados npm dos pins da Task 1 reconsultados; licenças MIT e TypeScript Apache-2.0.
- Repositório legado, produção, pagamentos e integrações não foram acessados nesta execução.

## Progresso

- Task 1: concluída e revisada no commit `d611c0b`. Harness: Node 24.22.0 baixado do domínio oficial, SHA-256 conferido; pnpm 11.25.0. O wrapper global do pnpm usa Node 24.19.0 internamente, portanto os comandos de verificação passaram a invocar o entrypoint pnpm.mjs com o Node local 24.22.0.
- Task 2: preparação iniciada após criação pelo usuário do DEV cloud `kfthwjrvgslnsjigqnyc`; get_project e consulta de versão/ausência de tabelas conferidos. Tasks 3–7 ainda não iniciadas; não atravessar o checkpoint SQL sem execução real.
- Testes T-01/T-02 e RLS real: ainda não executados. T-23 será não aplicável enquanto não houver Storage.

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
- Conexão TCP direta IPv6 expirou. Session pooler `aws-0-us-east-1.pooler.supabase.com:5432` comprovado por conexão autenticada como `donos_api`, no projeto aprovado. TLS exige rejectUnauthorized e CA oficial; nenhuma verificação foi desabilitada.

### Complemento Task 2 — conexão real e revisão

- CA obtida no endereço de certificado publicado no código oficial Supabase Studio: `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA256 do arquivo: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. Certificado válido até 26/04/2031. Cópia e credenciais somente em `.local/`, ignorado.
- Config pooler RED: 1 failed/23 passed. GREEN via integração direta: **2 arquivos/3 testes PASS**, runtime conectado por senha própria NOBYPASSRLS, grants/RLS consultados e duas credenciais Auth distintas autenticadas. Não é teste como postgres.
- Fixtures persistentes sintéticas: owner-a/owner-b no domínio `.invalid`, dono A com organizações A/C e unidades A1/A2/C1, dono B com B/B1. Senhas aleatórias independentes fora do Git. Login real confirmou as duas identidades; nenhum email ou dado real usado. Seed Auth feito pelo conector administrativo no DEV, separado da API; não alterou schema Auth nem desativou confirmação global.
- Revisão independente encontrou CHECK com NULL e auditoria sem unidade. Regressões SQL falharam antes da correção e passaram após `20261014232709_core_idempotency_scope_constraint.sql`. Não houve edição retroativa de migration aplicada. Revisor confirmou ambas as correções em leitura e executou 72 unitários PASS.
- IDs da fixture transacional `tenant-references.sql` isolados em prefixos 710/720 para não conflitar com fixture persistente 100/200. Scripts SQL de rollback são provas separadas da suíte Node, não contados nela.
- Limitação: replay completo em banco local descartável não executado (Docker ausente). Não executar reset remoto para substituir essa prova.
- Usuário autorizou remote novo `https://github.com/makollykalk/Donos_next.git`; ls-remote retornou vazio com exit0. Nenhum conteúdo legado herdado.
