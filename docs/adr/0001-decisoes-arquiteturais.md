# ADR 0001 — Fundação limpa, API central e isolamento por organização/unidade

Data: 14/10/2026. Estado: proposta técnica para revisão humana; não autoriza implementação nem infraestrutura. DEC-001 a DEC-013 permanecem aprovadas e inalteradas. Esta ADR resolve propostas técnicas para o plano; pendências comerciais e de ciclos futuros estão no [registro](../05-REGISTRO-DE-DECISOES.md).

## Contexto e decisão recomendada

O kit novo não possui Git, código ou dependências declaradas. O legado foi auditado estaticamente e não é uma base segura para migração automática ([relatório](../00-AVALIACAO-LEGADO.md)). Recomenda-se monorepo pnpm, três frontends React/Vite (portal, estoque, precificação), API TypeScript/Fastify e um PostgreSQL/Supabase compartilhado por ambiente. Dois apps comerciais continuam independentes; portal não é um terceiro produto cobrável.

O backend é um monólito modular. Cada domínio controla sua escrita; pacotes puros não importam UI/SDK de IA. Infraestrutura de DEV/STAGING/PROD deverá ser separada quando aprovada. Nesta rodada e no Ciclo 01 proposto, somente ambiente local e dados sintéticos. Nenhum vínculo com makollykalk/Donos-Saas, don_madruga, domínio ou banco antigo.

## Alternativas comparadas

| Alternativa | Vantagens | Custo/risco | Conclusão |
|---|---|---|---|
| React/Vite + Fastify central + SQL explícito | Fronteira clara entre UI/domínios; build independente dos apps; transações e RLS verificáveis | Sessão, CORS e contexto precisam de contrato; sem SSR automático | Recomendada: produto autenticado sem requisito atual de SEO/SSR. |
| Next.js nos três frontends + API central | SSR e convenções de rotas; ecossistema integrado | Risco de duplicar regras em Server Actions; cache/SSR e cookies exigem disciplina; mais superfícies de servidor | Viável se SSR se tornar requisito, sem ganho demonstrado agora. |
| React/Vite + PostgREST/RPC de domínio exposta | Menos serviço HTTP próprio | RPC passa a ser API pública e precisa conter todos os gates; SECURITY INVOKER não torna uma RPC exclusiva do servidor | Não escolhida. Não misturar escrita direta no browser com escrita da API. |

Para dados: SQL com `pg` foi escolhido sobre ORM completo neste ciclo pela visibilidade de transações, grants e RLS; um ORM adicionaria geração/mapeamento sem eliminar SQL de segurança. Banco separado por app contraria DEC-012; microsserviços são custo sem necessidade demonstrada.

## Stack candidata e compatibilidade consultada

Consulta em 14/10/2026. Versões abaixo são propostas reproduzíveis, não dependências instaladas nem combinação testada. Metadados foram obtidos do registro público npm; no Ciclo 01 registrar licenças, engines/peers e vulnerabilidades, instalar versões exatas e gerar `pnpm-lock.yaml` antes de validar build. Nenhum `latest`, caret ou tilde no manifesto final.

| Componente | Pin candidato | Justificativa / evidência |
|---|---|---|
| Node | 24.22.0 | Linha LTS indicada na [tabela oficial](https://nodejs.org/en/about/previous-releases). Local observado: 24.15.0; atualização não realizada. |
| pnpm | 11.25.0 | Versão já disponível; workspaces e lock único. Não adotar major 12 só por ser latest. |
| TypeScript | 6.0.3 | `typescript-eslint` consultado aceita >=4.8.4 e <6.1.0; latest TS 7.0.2 não é compatível com esse peer. |
| React / React DOM | 19.3.1 / 19.3.1 | Mesma versão; interfaces pequenas sem dependência de domínio. |
| Vite / plugin-react | 8.3.4 / 6.1.2 | Plugin declara Vite ^8; [Vite](https://vite.dev/guide/) exige Node 20.19+ ou 22.12+. Node mínimo do conjunto será 24.22.0. |
| Fastify / cors | 5.12.7 / 11.3.1 | API central, validação por contratos e allowlist de origem. Conferir matriz do plugin no checkpoint de instalação. |
| Supabase JS / CLI | 2.117.3 / 2.121.0 | Auth e ambiente local. SDK exige Node >=22; sem SDK privilegiado no browser. |
| pg / @types/pg | 8.23.1 / 8.23.1 | SQL parametrizado e transação em conexão única; numeric/bigint retornam strings. |
| Zod | 4.6.7 | Contratos de entrada e saída estritos; rejeitar propriedades desconhecidas. |
| Vitest | 5.0.4 | [Requer Vite >=6.4 e Node >=22.12](https://vitest.dev/guide/); peers aceitam Vite 8 e Node 24. |
| Playwright | 1.64.1 | Testes de login, troca de contexto e dois apps; navegador local precisa de instalação posterior. |
| ESLint / typescript-eslint | 10.12.0 / 8.71.2 | Peer ESLint inclui 10; TS fica em 6.0.3. |
| @types/node | 24.19.2 | Tipos da linha de runtime 24, evitando usar latest 26 por acidente. |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | Tipos correspondentes ao React 19. |
| decimal.js | 10.6.0, reservado ao Ciclo 02 | Não instalar no core: este ciclo não calcula dinheiro. Comparar com coeficientes inteiros/razões exatas antes de escolher motor. |

Fontes dos pins: `https://registry.npmjs.org/<pacote>/<versão>` (metadados públicos consultados); [manifesto TypeScript 6.0.3](https://registry.npmjs.org/typescript/6.0.3), [peer typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.71.2), [peer plugin React](https://registry.npmjs.org/@vitejs/plugin-react/6.1.2), [peer Vitest](https://registry.npmjs.org/vitest/5.0.4). Pacotes auxiliares que se revelem necessários exigem justificativa/pin antes da instalação, sem silenciosamente ampliar a lista.

A documentação React contempla [Vite para construção própria](https://react.dev/learn/build-a-react-app-from-scratch), mas deixa routing/data fetching ao projeto. O core usa rotas mínimas nativas e fetch, sem introduzir biblioteca de estado. Next.js exige [Node >=20.9](https://nextjs.org/docs/app/getting-started/installation), mas esse mínimo não basta para todo o conjunto atual. A política [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/) cobre linhas Node suportadas, embora sua tabela enumere 20/22; integração em Node 24 é checkpoint obrigatório, não inferência de teste passado.

PostgreSQL: alvo de major 17 para Supabase local; confirmar versão e digest da imagem efetiva com CLI fixado antes de migrations. A documentação PostgreSQL current aponta para 18, o que não prova que o Supabase local execute 18. O [changelog Supabase](https://supabase.com/changelog) registra mudança de defaults self-hosted para 17. Não fixar um digest inventado.

Mudanças atuais relevantes: [Supabase retirou suporte a Node 20](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20); [novas tabelas exigem grants explícitos na Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). O índice `.md` do changelog falhou no acesso; a página HTML e os avisos vinculados foram consultados. Nada deve depender de grants automáticos.

Vercel permanece opção futura, não recurso configurado: [Fastify é suportado como uma Function](https://vercel.com/docs/frameworks/backend/fastify), sujeita aos limites dessa plataforma. Pool transacional, cold start e budgets de conexões exigem teste de staging autorizado; SDK de deploy não é dependência do core.

## Estrutura e propriedade

`apps/portal`, `apps/estoque`, `apps/precificacao`, `apps/api`; `packages/contracts`, `packages/db`, `packages/domain-core`, `packages/domain-billing`, `packages/auth-client`. Criar somente os pacotes usados no Ciclo 01; os demais domínios da V3 entram nos seus ciclos. Não criar CRUD genérico, design system, telas de estoque/preços, PWA offline ou motor financeiro agora.

Coordenador possui contratos, SQL, grants e migrations. Depois de congelá-los, UI pode ser delegada em arquivos exclusivos; revisor independente apenas lê e testa. Não compartilhar banco mutável entre implementadores paralelos. Gates entre tarefas dependentes e revisão independente antes de merge.

## API exclusiva e RLS efetiva

Frontend usa Supabase apenas para Auth; dados de negócio passam por `/v1` da API. Runtime conecta como `donos_api`: LOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT, NOCREATEDB, NOCREATEROLE, sem ownership/membership privilegiado. Role de migrations é separada, nunca carregada pela API. Runtime não recebe CREATE nos schemas, TRUNCATE, ALTER nem funções arbitrárias.

Schema `core` não exposto na Data API. Revogar acesso de PUBLIC/anon/authenticated e defaults de execução; desativar Data API quando desnecessária, mas testar grants mesmo assim. RLS habilitada e forçada nas tabelas de aplicação. Grants limitam operações; policies limitam linhas. [RLS PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) documenta as exceções de owner/BYPASSRLS, que precisam ser inspecionadas nos testes.

API valida token e propriedade, abre transação, usa `set_config(..., true)` parametrizado para sub/org/unidade verificados e executa toda operação na mesma conexão. Commit/rollback elimina contexto. Consultas sem contexto negam por padrão. Ausência de unidade só é permitida nas operações explicitamente organizacionais. A configuração local de sessão é mecanismo de confiança da API, não assinatura: vazamento da credencial ou SQL injection continuam riscos; prevenir ambos e não aceitar SQL de cliente/IA.

RLS de organizations permite descobrir empresas do próprio dono; tabelas organizacionais exigem também organização ativa; dados locais exigem organização + unidade ativa. Propriedade é relida do banco. `owner_user_id`, `organization_id` e vínculos de unidade são imutáveis por grants de coluna/constraints. FKs compostas incluem unidade quando o objeto é local. Não usar `user_metadata` para autorizar. Ver [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Sessão e contexto propostos para desenvolvimento local

Email/senha pelo Supabase Auth local, contas sintéticas confirmadas, cadastro anônimo desativado. JWT enviado em Authorization; API usa getClaims validado contra projeto/issuer/audience esperados e getUser para identidade corrente. Nenhum getSession isolado autoriza operação. Token e refresh ficam em sessionStorage por origem/aba; não aparecem em URL/log. Isso continua exposto a XSS: CSP, ausência de HTML arbitrário e dependências auditadas são necessários. Não há promessa de SSO entre origens neste ciclo; shells reutilizam componente de login.

Logout da API registra `session_id` revogado e confirma o commit; depois o browser chama `signOut({scope:'local'})` no client que possui a sessão. Novas autorizações daquela sessão são negadas mesmo com token ainda válido; operações já autorizadas podem terminar. Falha no provedor não remove a revogação local. Não purgar revogações pela expiração do primeiro JWT: refresh pode conservar session_id. Logout em outro dispositivo/fora da API não é prometido por esse mecanismo. Decidir BFF/cookie HttpOnly/SSO antes de piloto remoto.

Seleção retorna contexto opaco, curto (30 minutos), vinculado a usuário, sessão, organização e unidade. Cliente manda `X-Donos-Context` além do JWT; backend revalida propriedade e correspondência dos IDs da rota. Cada aba mantém seleção própria, descarta respostas atrasadas e não envia formulário antigo sob nova unidade. Tokens de contexto são aleatórios, persistidos somente como SHA-256 e não substituem autenticação.

## Contratos entre apps

Envelope de erro: `{ error: { code, message, requestId } }`; sem SQL, token ou identificador de outro tenant. Datas UTC ISO-8601; IDs UUID; decimal como string canônica e contadores inteiros como string. Chaves de idempotência vinculadas a operação, ator/organização, unidade e hash do payload normalizado.

- Core: sessão, empresas/unidades, contexto e capabilities. Nenhum app pode conceder seu próprio plano.
- App 01: estoque/fichas/compras Base; reposição editável/exportável Premium; IA como adicional com confirmação humana. É a única fonte do custo integrado.
- App 02: produtos/combos e simulação por canal; custo manual suficiente para funcionar sem App 01. Não consulta diretamente tabelas do estoque.
- Contrato futuro `RecipeCostSnapshotV1`: organização/unidade, recipeVersionId, source=`recipe`, validationStatus, measuredAt, calculatedAt, currency=`BRL`, costComponents (ingredientes/embalagem), totalCost em string, valuationRevision. Se indisponível/não validado/sem inventory_core, retornar estado explícito e permitir custo manual; nunca transformar custo ausente em zero. Implementar somente nos Ciclos 03/05.
- Snapshots históricos são imutáveis e preservados no cancelamento. Cancelar bloqueia novas ações pagas; matriz de leitura/exportação pós-cancelamento precisa de decisão comercial anterior aos módulos pagos.

## Dinheiro, quantidade e motores posteriores

No core, implementar somente formato decimal canônico em string, com no máximo 18 dígitos inteiros e 12 fracionários; rejeitar NaN, Infinity, notação científica, vírgula, sinal +, -0 e casas excessivas. UI pode converter entrada localizada para esse formato sem usar Number. Não aprovar escalas comerciais de estoque implicitamente por esse envelope.

Proposta para Ciclo 02: kg/L/unidade como bases estáveis, quantidade numeric(24,6), valor numeric(38,12), intermediários exatos e half-even explícito; valores finais exibidos em centavos. PostgreSQL numeric não é float, mas sua divisão/rounding finitos não substituem uma política matemática ([numeric](https://www.postgresql.org/docs/current/datatype-numeric.html)). Não instalar motor decimal no core.

Conservar razão de valoração `Vref/Qref` após entrada. Para baixas acumuladas x: `B(x)=round12(x*Vref/Qref)`; custo da próxima baixa q = `B(x+q)-B(x)`. Ledger reconcilia com o valor remanescente; última baixa esgota exatamente o valor. Nova entrada forma referência com valor remanescente + aquisição. Essa proposta exige ADR/testes do Ciclo 02 e não está implementada.

Canônico: 10×20 = 200; baixa 2 custa 40, sobram 8/160; entrada 7×25 = 175; saldo 15, valor 335, média exata representável como razão 335/15. Não reconstruir 335 a partir de 22,33 nem de média truncada.

Transação futura: autenticar/autorizar → disputar chave idempotente → garantir e travar linhas de saldo em ordem determinística → revalidar saldo/gates → ledger, saldo, preço histórico, auditoria e resultado num commit. Duplicata idêntica retorna original; payload diferente dá 409; falha intermediária dá rollback. Linha inexistente exige insert protegido por unicidade antes da trava. Sem saldo negativo e sem edição/exclusão de movimentos. Estorno tardio e rateio são pendências de Ciclo 02, não SQL legado reutilizável.

Rendimento: bruto/líquido/final medidos; custo total consumido dividido pelo peso final, sem aplicar a perda duas vezes. Ganho de peso por hidratação pode ser legítimo. Receitas versionadas, sem ciclos; pré-preparo estocado consome matéria-prima e produz lote numa transação relacionada.

Preço: cenário proporcional usa `P_margem=(C_insumo+C_variavel_fixo)/(1-t-i-m)` e `P_cmv=C_insumo/c`; ambas as metas ativas levam ao maior preço mínimo. Denominador não positivo e CMV inválido são erro. Preço sugerido arredonda para cima ao centavo e recalcula métricas. Bases diferentes/descontos/faixas exigem decomposição; não aplicar soma ingênua. Definir “líquido” antes de Ciclo 05. Combos distinguem embalagem individual efetiva, embalagem exclusiva e taxa por venda.

## Entitlements e metering

Entitlements pertencem à organização, com as seis chaves V3. Runtime lê; fixtures locais administram concessões sem endpoint público de ativação. Ausência, cancelamento ou validade encerrada nega ação paga. `pricing_core` não depende de `inventory_core`; shopping/IA dependem do core de estoque.

Metering tem reserve/settle/release idempotentes, bucket com lock e inteiro exato. Testes internos com provedor fake comprovam que gate e reserva ocorrem antes da chamada; não existe chamada paga nem endpoint público de fake. Resultado desconhecido mantém reserva para reconciliação; não reexecutar/liberar automaticamente. Consumo de extração e confirmação de estoque são eventos distintos. Política comercial da franquia fica pendente.

## Consequências, riscos e aprovação

Benefícios esperados: uma fronteira de escrita, isolamento testável em API e SQL, independência comercial e ausência de dependência da infraestrutura legada. Custos: SQL de segurança exige manutenção; runtime restrito exige provisionamento local; sessão/contexto e metering têm testes de concorrência indispensáveis.

Bloqueios verificáveis antes de executar: aprovação humana; Git novo local; Docker funcional; validação dos pins e imagem Postgres. Sem banco não declarar RLS ou transações aprovadas. Remote Git, deploy, infraestrutura paga, DB remoto, cobrança e WhatsApp exigem autorização específica posterior. A decisão de iniciar apenas Ciclo 01 deve citar a [spec](../superpowers/specs/2026-10-14-core-multitenant-design.md) e o [plano](../superpowers/plans/2026-10-14-core-multitenant.md).
