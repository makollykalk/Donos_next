# Evidências do Ciclo 01

Estado: em execução; ciclo ainda não validado. Autorização: mensagem do usuário “Execute somente o Ciclo 01”, nesta conversa, após entrega do plano. Autorização posterior: Supabase DEV novo na nuvem, em makollykalk's Org, conforme ADR 0002. Produção, projetos preexistentes e custos pagos permanecem fora do escopo.

## Preflight

- Raiz nova confirmada. Não havia Git; `git init -b main` e branch `feat/ciclo-01-core-multitenant` criados localmente, sem remote.
- Nome/email Git estavam ausentes. Usuário forneceu `Luankolly@gmail.com`; esse valor literal foi usado como nome e email somente na configuração deste repositório, sem inventar um nome civil. Commit inicial do kit: `c4c41d5`.
- WSL informa não instalado; Docker não encontrado; sessão Windows sem administrador. Usuário posteriormente autorizou Supabase na nuvem e escolheu `makollykalk's Org`; ADR 0002 substitui a restrição local exclusivamente para projeto DEV novo. Nenhum projeto foi criado/alterado até o momento.
- Node observado 24.15.0; alvo local 24.22.0 em `.tools/`, sem alterar runtime global. Metadados npm dos pins da Task 1 reconsultados; licenças MIT e TypeScript Apache-2.0.
- Repositório legado, produção, pagamentos e integrações não foram acessados nesta execução.

## Progresso

- Task 1: implementação e testes em andamento de revisão. Harness: Node 24.22.0 baixado do domínio oficial, SHA-256 conferido; pnpm 11.25.0. O wrapper global do pnpm usa Node 24.19.0 internamente, portanto os comandos de verificação passaram a invocar o entrypoint pnpm.mjs com o Node local 24.22.0.
- Tasks 2–7: não iniciadas; não atravessar o checkpoint SQL sem execução real.
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
