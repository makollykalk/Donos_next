# Avaliação do kit novo e do legado DONOS

Data: 14/10/2026. Status: auditoria estática para planejamento; não certifica produção. Fontes de verdade: [V3](01-PRODUTO-V3.md), [limites](02-ARQUITETURA-E-LIMITES.md), [aceite](03-CRITERIOS-DE-ACEITE.md) e [roadmap](04-ROADMAP.md), lidos integralmente com `AGENTS.md`.

## 1. Estado observado

O diretório novo é `C:/Users/Matheus/Documents/ChatGPT/Donos 2/DONOS_NEXT_CODEX_MULTIAGENTES_KIT`. `git rev-parse --show-toplevel`, `git remote -v`, `git branch --show-current` e `git status --short --branch` retornaram `not a git repository`. Portanto não há remote, branch, commit ou diff Git do projeto novo a apresentar. Nenhum Git foi inicializado nesta rodada.

O inventário inicial encontrou 17 arquivos: documentação, prompts e configuração de exemplo do Codex. Não existem `package.json`, lockfile, aplicações, migrations do Next ou testes. Dependências instaladas do projeto: nenhuma declarada; não confundir ferramentas da máquina com dependências do produto.

Ferramentas verificadas: Git 2.54.0.windows.1; Node 24.15.0; npm 11.12.1; pnpm 11.25.0. `docker --version` não foi reconhecido no PATH. Isso não prova ausência de qualquer instalação, mas impede afirmar que Supabase local está operacional. Nenhuma instalação foi realizada.

A cópia legada foi localizada em `C:/Users/Matheus/Downloads/App_don-20260516T193344Z-3-001/App_don`. Sua configuração local aponta para `https://github.com/makollykalk/Donos-Saas.git`, branch `main`, HEAD `9e2b1da7c64d53691a8a56789f72d4b96a5a2089`. Não houve fetch nem verificação de igualdade com GitHub/produção.

Estado legado inicial e final informado pela auditoria: `M supabase/.temp/cli-latest`, `?? artifacts/`, `?? tmp/`. São alterações preexistentes, preservadas. O legado possui 252 arquivos rastreados e 60 SQLs; os padrões `tests/`, `test/`, `__tests__/`, `.test.*`, `.spec.*` não localizaram testes rastreados. Isso não exclui testes externos.

## 2. Organização efetiva da análise

O coordenador leu os documentos, inventariou o kit, consultou fontes oficiais e escreveu exclusivamente documentação. Três subagentes nativos trabalharam em paralelo, todos sem permissão de escrita:

- Auditor legado: leitura de regras, fluxos, manifesto/lock e SQL local.
- Arquiteto de dados e segurança: propriedade, unidades, RLS, grants, contratos e metering.
- Arquiteto de motores: custo médio, precisão, rendimento, CMV/contribuição e combos.

Os resultados foram consolidados pelo coordenador. Nenhum agente recebeu propriedade de migrations ou contratos compartilhados. Não houve banco mutável compartilhado entre agentes.

## 3. Dependências existentes no legado

Evidências abaixo são caminhos relativos à raiz legada identificada acima; os números são linhas da cópia auditada. Não são arquivos do Next.

| Dependência | Resolvida no lock | Evidência |
|---|---:|---|
| React / React DOM | 19.2.4 | `package-lock.json:5616`, `:5625` |
| Vite | 6.4.1 | `package-lock.json:6803` |
| TypeScript | 5.8.3 | `package-lock.json:6624` |
| Supabase JS | 2.39.7 | `package-lock.json:2782` |
| Zod | 4.3.6 | `package-lock.json:7425` |
| vite-plugin-pwa | 1.2.0 | `package-lock.json:6878` |
| @google/genai | 1.48.0 | `package-lock.json:2049` |
| xlsx | 0.18.5 | `package-lock.json:7397` |

`package.json:6-9` declara apenas dev/build/preview; `:12-32` usa intervalos para várias dependências. Lockfile v3 em `package-lock.json:4`. Nenhuma dependência é aprovada por herança. Não foram executados audit de vulnerabilidades, instalação ou testes de compatibilidade no legado. A comparação e os pins candidatos do Next estão na [ADR 0001](adr/0001-decisoes-arquiteturais.md).

## 4. Matriz reaproveitar / reescrever / descartar / não verificado

| Área | Classificação | Evidência local | Decisão para Next |
|---|---|---|---|
| Média ponderada pelo saldo remanescente | Reaproveitar regra | `src/hooks/useCostEngine.ts:209-218`; `src/hooks/useStock.ts:37-40`; `migrations/013_inventory_stock_movement_rpc.sql:126-136` | Reexpressar fórmula sob DEC-005 e provar canônico; não copiar implementação. |
| Movimentos transacionais | Reescrever | `migrations/013_inventory_stock_movement_rpc.sql:28-80` | Preservar requisito de trava/negativo bloqueado; acrescentar organização, idempotência e snapshot de custo. |
| Ledger e reversão | Reescrever | `src/App.tsx:1819-1846`; `migrations/007_rls_restaurant_id.sql:44-93`; `supabase_mvp_migrations.sql:34-58` | Retirar exclusão/edição do razão e cascatas; usar compensação. |
| Multi-tenant | Reescrever | `migrations/007_rls_restaurant_id.sql:78-118`; `migrations/002_create_product_ingredients_and_purchase_history.sql:7-16` | Organização primária, contexto de unidade e FKs compostas. Busca em src e árvores de migrations não encontrou `organization_id`. |
| Fichas/variações/pré-preparo | Reaproveitar composição; reescrever domínio | `src/hooks/usePizzaEngine.ts:45-108` | Custo por quantidade e rendimento medido/versionado; impedir ciclos e dupla contagem. |
| Conversões | Reaproveitar regras básicas; reescrever validação | `src/utils/unitConversion.ts:10-16` | kg/g e L/mL úteis; unidade desconhecida deve falhar, não conservar silenciosamente a quantidade. |
| Histórico de compra | Reaproveitar campos; reescrever persistência | `migrations/002_create_product_ingredients_and_purchase_history.sql:50-61`; `migrations/006_dual_cost_functions_and_views.sql:11-53` | Separar documento/pedido de recebimento confirmado. |
| Lista inteligente | Reaproveitar fluxo editável/impressão; reescrever algoritmo/gate | `src/components/ShoppingListManager.tsx:103-136` | Estoque-alvo explícito, pendências válidas e embalagem normalizada; Premium no servidor. |
| Preço | Reaproveitar separação de métricas; reescrever motor | `src/components/PricingEngine.tsx:18-53` | Usar metas editáveis de CMV/contribuição, não igualar lucro ao balcão como regra geral. |
| Combos | Reaproveitar composição; reescrever cálculo | `src/hooks/usePizzaEngine.ts:162-185` | Custo decomposto, quantidades, embalagem exclusiva, taxa por venda e snapshots. |
| Scanner de nota | Reaproveitar revisão humana; reescrever efetivação | `src/components/InvoiceReviewPanel.tsx:228-281`; `src/App.tsx:3273-3313` | Proposta confirmada chama comando único; sem financeiro automático. |
| Voz | Não verificado como fluxo funcional; UI desabilitada | `src/components/VoiceAssistant.tsx:11-25` | Botão “Em breve”; callbacks não demonstram funcionalidade. |
| Auditoria física completa | Não verificado | Inspeção de StockManager e DeviationReport | Não localizado ciclo completo de contagem/corte/reconciliação/ajuste. Especificar do zero no Ciclo 04. |
| PDV/financeiro/funcionários/PIN | Descartar do escopo MVP | `src/App.tsx:25-39`, `:3620`, `:3699`, `:3712`; `migrations/001_create_restaurants.sql:23` | Não migrar modelos/telas; DEC-004/010/013 prevalecem. |
| SQL de limpeza/backfill legado | Descartar | Lista abaixo | Não importar, adaptar ou executar contra Next ou legado. |

Nenhum trecho de código foi aprovado para reutilização. “Reaproveitar regra” significa recriar a regra validada pela V3 com testes novos.

## 5. Riscos demonstrados pela leitura estática

1. **Baixa sem valoração correta:** `src/App.tsx:3704` passa custo zero para usage; a RPC grava `p_unit_cost` em `migrations/013_inventory_stock_movement_rpc.sql:102-122`; o total usa quantidade × custo em `supabase_mvp_migrations.sql:40-41`. Esse caminho não atende ao custo de baixa de R$40 do canônico.
2. **Duplicação:** assinatura da RPC em `migrations/013_inventory_stock_movement_rpc.sql:5-12` não contém chave idempotente; inserção em `:102-124` não recupera resultado anterior.
3. **Vários escritores de saldo:** manual usa RPC (`src/App.tsx:2506-2514`), scanner e offline usam hook local (`:3260-3280`) e sync grava custo/saldo do browser (`src/hooks/useCloudSync.ts:387-400`, `:435`). Transação num caminho não protege os demais.
4. **Saída excessiva ocultada:** `src/hooks/useStock.ts:66-69`, `:81-84` aplica clamp em zero e registra quantidade solicitada inteira. Next deve rejeitar com saldo preservado.
5. **Precisão antecipadamente perdida:** RPC arredonda média a quatro casas em `:135-136`; cálculos locais usam number/rounding em `src/hooks/useCostEngine.ts:115-125`, `:144-153`. Compra de custo zero não recalcula média em `migrations/013_inventory_stock_movement_rpc.sql:126-148`.
6. **RLS e FKs insuficientes para V3:** política permite restaurante autorizado OU usuário próprio; FKs independentes de produto/ingrediente não impõem organização/unidade comum. É risco de desenho observado, não exploração em produção comprovada.
7. **Sync sem unidade em todas as consultas:** `src/hooks/useCloudSync.ts:419-423`, `:444-458` usa usuário/tipo/external_id/nome sem restaurante em caminhos de atualização.
8. **Rendimento presumido:** `src/components/PrePrepManager.tsx:22-28`, `:52`, `:79` usa 1 como padrão/fallback. SQL e hook aplicam regras diferentes (`migrations/006_dual_cost_functions_and_views.sql:96-105`; `src/hooks/useCostEngine.ts:81-112`).
9. **Embalagem ambígua na reposição:** `src/components/ShoppingListManager.tsx:113`, `:130-136` calcula em saldo/mínimo, rotula como embalagem e arredonda para baixo, sem conversão explícita.
10. **IA sem gate pago demonstrado:** `supabase/functions/invoice-ocr/index.ts:155-231` autentica e busca job, depois chama modelo; nesse caminho não foi encontrado entitlement/franquia anterior à chamada. Confirmação, atualização local e estado do job são separados (`InvoiceReviewPanel.tsx:249-281`).

## 6. SQL destrutivo identificado, nunca executado

- `supabase/migrations/01_cleanup_all.sql:10-30`: enumera e remove tabelas/views com CASCADE; `:35-41` remove views/funções.
- `supabase/migrations/15_app_roles.sql:2`: DROP TABLE com CASCADE.
- `scripts/cleanup_duplicate_orders.sql:19`: remoção de pedidos.
- `scripts/final_cleanup_financial.sql:40`, `scripts/final_cleanup_v2.sql:5`, `scripts/rebuild_financial_from_orders.sql:6`: remoções de dados financeiros.

Há duas árvores SQL e scripts na raiz; sem banco ou histórico de implantação, não se sabe quais foram aplicados. Arquivos identificados como backup/dump não tiveram conteúdo aberto. Credenciais, .env e dados reais não foram copiados.

## 7. Evidências e limites da entrega

Executado: inventário de arquivos, leitura integral das fontes obrigatórias, comandos Git somente de inspeção, versões das ferramentas, análise estática do legado, leitura de manifesto/lock, consulta de documentação oficial e metadados públicos de pacotes. Comparação SHA-256 confirmou os 17 arquivos originais intactos e exatamente cinco novos Markdown. Links locais dos documentos e fechamento dos blocos de código foram conferidos. O coordenador também releu amostras dos achados críticos e confirmou HEAD/status do legado.

Revisão independente concluída: análise dos três especialistas e uma revisão adicional da ADR pelo agente de segurança; ajustes de logout, contexto e metering incorporados. As duas tentativas de revisão adicional da versão final da spec/plano não terminaram por limite de uso dos subagentes. A conferência final dos documentos foi feita pelo coordenador; não equivale a aprovação independente final nem à revisão de código exigida antes de merge.

Não executado: testes unitários, integração, RLS real, concorrência, build, audit de dependências, instalação, chamada paga, SQL, migração, fetch, deploy ou consulta a produção. Não é possível atestar configuração efetiva de RLS, Storage, função em produção ou resultado do canônico em banco.

Entrega de código nesta rodada: nenhuma. Apenas cinco documentos de planejamento novos. Branch/commit/PR não existem, pois o kit não tem Git e a rodada autoriza somente documentação. Próxima etapa: revisão humana da [spec](superpowers/specs/2026-10-14-core-multitenant-design.md) e do [plano](superpowers/plans/2026-10-14-core-multitenant.md), antes do Ciclo 01.
