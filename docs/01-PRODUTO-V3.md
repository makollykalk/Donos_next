# DONOS Next — Especificação de Produto e Arquitetura V3

**Data:** 14/10/2026  
**Status:** decisões funcionais validadas pelo fundador; especificação de desenho para revisão; não implementada.  
**Referência legada:** `don_madruga` na Vercel, repositório privado `makollykalk/Donos-Saas`. O legado é fonte de regras de negócio e fluxos comerciais; qualquer código a reaproveitar precisa de revisão, testes e adaptação. Não copiar o schema ou dados legados automaticamente.

## 0. Registro de decisões aprovadas

| Código | Decisão | Estado |
|---|---|---|
| DEC-001 | **App 01** agrega Estoque, Compras, Fichas Técnicas e rendimentos. Histórico de preços de compra é do App 01. | Aprovado |
| DEC-002 | **Lista de compras inteligente** é recurso Premium do App 01. | Aprovado |
| DEC-003 | Alimentação e baixa de estoque por **IA (texto/WhatsApp, foto e voz)** são adicionais pagos, com revisão humana antes da efetivação. | Aprovado |
| DEC-004 | **App 02** é somente Precificação de Produtos e Combos; funciona sozinho com custos manuais ou integrado ao App 01. | Aprovado |
| DEC-005 | **Custo de estoque por média móvel ponderada pelo saldo remanescente**, recalculada a cada entrada valorizada. | Aprovado |
| DEC-006 | A ficha técnica pede **medições reais** do usuário para rendimento bruto/líquido e preparo. | Aprovado |
| DEC-007 | Auditoria de estoque com **relatório imprimível** e **modo de contagem guiada** com registro e conferência de divergências. | Aprovado |
| DEC-008 | Estoque mínimo e estoque-alvo configuráveis pelo dono; Premium gera lista de reposição editável. | Aprovado |
| DEC-009 | Precificação tem **taxas por canal, margem de contribuição alvo e CMV alvo**, todos configuráveis pelo dono. | Aprovado |
| DEC-010 | Apenas **proprietário** utiliza os apps; sem cadastro de funcionário, PIN e RBAC operacional no MVP. | Aprovado |
| DEC-011 | **Multi-tenant obrigatório**, isolamento completo entre empresas e unidades, com uma conta de dono que pode ter mais de uma empresa/unidade. | Aprovado |
| DEC-012 | Dois apps independentes com **núcleo de dados e APIs compartilhado**; evolução futura para PDV/Financeiro sem implementá-los agora. | Aprovado |
| DEC-013 | **Nova infraestrutura e reimplementação limpa** por domínio; aproveitar regras comerciais, e só reaproveitar trechos de código após auditoria e testes. Legado em produção permanece intacto. | Aprovado |

## 1. Fronteiras dos produtos e monetização

### App 01 — Estoque, Fichas Técnicas e Compras

**Base:**
- Insumos, categorias, unidades-base, fatores de conversão, embalagens, localização de estoque e fornecedores.
- Entrada de compras recebidas, baixas, consumo, perdas, devoluções, estornos, saldo e extrato de movimentações.
- Histórico de preços de compra por insumo/fornecedor, data, unidade, quantidade, custo unitário original e normalizado; progressão e comparação.
- Custo médio móvel do saldo e valor total de estoque.
- Fichas técnicas de produtos, variações, ingredientes, pré-preparos, medidas reais de rendimento e custo atualizado.
- Estoque mínimo, alertas de itens críticos e inventários/contagens físicas.
- Relatório imprimível para contagem e modo auditoria no aplicativo.

**Premium:** geração e edição de listas de compras automáticas, com estoque mínimo/alvo, pedidos pendentes confirmados (quando existirem), múltiplos de embalagem e agrupamento por fornecedor. Impressão/compartilhamento de listas está incluído no Premium. O alerta simples de estoque crítico continua na Base.

**Adicionais de IA:** texto no WhatsApp integrado por canal oficial/autorizado, foto no app, voz no app. Em todos os casos, extrair **proposta estruturada** e exigir conferência/confirmação antes de efetivar movimentação. Sem add-on a entrada manual funciona normalmente.

### App 02 — Precificação de Produtos e Combos

- Catálogo de produtos vendáveis, versões/variações, composição de combos.
- Custos atuais de ficha técnica via API compartilhada se App 01 ativo; custo digitado pelo dono quando App 02 isolado.
- Perfis de canal: salão/balcão, retirada, delivery próprio e marketplaces configuráveis; taxas percentuais e fixas, maquininhas, tributos aplicáveis, descontos e embalagens.
- Usuário edita **margem de contribuição desejada** e **CMV alvo** por produto/canal; o sistema demonstra o efeito de ambos, avisa sobre metas incompatíveis e recomenda preço que cumpra as restrições viáveis.
- Simulador de preço sugerido, preço atual, CMV projetado, contribuição projetada, tarifas e histórico de simulações.
- Combos: soma dos custos dos produtos nas quantidades escolhidas, variações e componentes exclusivos (ex.: embalagem do combo), sem duplicar custos.
- **Fora do App 02:** listas de compra, fornecedores, estoque físico, contagens e registro de compras.

### Assinaturas (sem preços em reais definidos)

| Entitlement | Efeito |
|---|---|
| `inventory_core` | App 01 Base |
| `shopping_premium` | Geração, edição e exportação de lista inteligente |
| `ai_text_whatsapp` | Interpretação por texto/WhatsApp, sujeita a franquia |
| `ai_photo` | Extração por foto, sujeita a franquia |
| `ai_voice` | Transcrição/interpretação de voz, sujeita a franquia |
| `pricing_core` | App 02 |

Entitlements e franquias são verificados no backend **por organização** antes de consumir IA ou executar recurso pago, inclusive via API direta. Cancelamento não destrói dados; apenas bloqueia ações não contratadas. A cobrança e a cota exata ficam para validação comercial, mas os mecanismos de medição já fazem parte da fundação.

## 2. Multi-tenant e autenticação do dono

- `auth.users`: credencial/autenticação individual do proprietário.
- `organizations(id, owner_user_id, ...)`: empresa contratante e fronteira primária de isolamento (`organization_id`).
- `restaurants(id, organization_id, ...)`: unidade operacional; estoque, insumos locais, preços e configurações por unidade quando cabível (`restaurant_id`).
- `subscriptions`, `entitlements`, `usage_ledger`, `audit_events`: assinatura, limites e trilhas.
- Em todas as tabelas sensíveis: `organization_id`, e `restaurant_id` onde fizer sentido. Chaves compostas impedem que um registro de uma organização referencie o ingrediente/ficha de outra.
- **Não desenvolver** perfis/convites/controle por funcionários no MVP. Proprietário único autenticado por organização; ele pode possuir várias organizações e alternar o contexto.
- Em Supabase/Postgres: RLS por propriedade + validação na API. Não confiar em tenant IDs enviados pelo frontend ou webhook; resolver titularidade a partir da sessão verificada. Não expor credenciais privilegiadas no browser.
- Os processos de IA, pagamentos e WhatsApp também carregam um contexto de tenant previamente validado.
- Testes obrigatórios: A não pode consultar/mutar B, inclusive por ID forjado, consulta indireta, webhook, Storage, exportação, relatório e entitlements. Titular com múltiplos tenants não mistura contextos.

## 3. Domínio de estoque — custo médio móvel

### 3.1 Fórmula oficial

Para uma entrada de compra efetivamente recebida, considerando o saldo imediatamente anterior:

`novo_custo_medio = (saldo_anterior × custo_medio_anterior + quantidade_recebida × custo_unitario_da_entrada) / (saldo_anterior + quantidade_recebida)`

**Exemplo aprovado pelo fundador:**
1. Entrada inicial: 10 kg × R$ 20/kg = R$ 200,00; custo médio inicial R$ 20/kg.
2. Baixa: 2 kg × R$ 20/kg = R$ 40,00 de custo de consumo. Saldo: **8 kg e R$ 160,00**, custo médio **continua R$ 20/kg**.
3. Nova entrada: 7 kg × R$ 25/kg = R$ 175,00.
4. Novo saldo: **15 kg**, valor em estoque **R$ 335,00**, custo médio **R$ 335/15 = R$ 22,333333… por kg**.

Mostrar R$ 22,33 na interface, mas **não truncar o valor que alimenta cálculos internos**. Persistir `numeric/decimal` com precisão adequada, não `float` binário para dinheiro. Arredondar valores monetários no ponto de registro contábil definido e no preço de venda final, sem acumular erros por arredondamento antecipado.

### 3.2 Regras de movimento

- **Saída:** reduz quantidade e valor pelo custo médio vigente naquele instante; custo médio unitário permanece inalterado. Registrar snapshot do custo usado na baixa.
- **Entrada:** eleva o saldo e recalcula custo médio ponderado usando o valor de aquisição unitário efetivo normalizado; frete, desconto e outros encargos de aquisição, se configurados, precisam de uma regra explícita de rateio. Não confundir imposto recuperável com custo do insumo.
- **Saldo zero:** após zerar, o custo da próxima compra será o custo inicial do novo saldo; o último preço histórico permanece para análise.
- **Estoque negativo:** **bloqueado por padrão**; situações excepcionais entram em fila de correção/conferência, evitando média inválida.
- **Ajustes e estornos:** não apagar movimentos. Gerar eventos compensatórios com motivo, data, autor, vínculo com origem e revisão de valoração quando houver lançamento retroativo. Não reescrever histórico de forma silenciosa.
- **Concorrência:** comando de entrada/saída deve atualizar saldo e extrato de forma atômica em transação, com bloqueio adequado e chave de idempotência; reentrega de WhatsApp ou clique repetido não duplica estoque.
- **Compra ≠ recebimento:** lista/cotação/pedido não muda saldo; apenas mercadoria recebida e conferida gera entrada. Permitir recebimento parcial se esse fluxo for introduzido.
- **Unidades:** converter caixa/fardo/pacote para kg/g, L/mL e unidade com fator do item. Preservar unidade original da compra para auditoria e unidade-base para cálculo.

### 3.3 Modelo conceitual

`ingredients`, `suppliers`, `purchase_receipts`, `purchase_receipt_items`, `purchase_price_history`, `stock_movements`, `stock_balances`, `stock_locations`, `stock_thresholds`, `stock_adjustments`, `inventory_counts`, `inventory_count_items`, `audit_events`.

`stock_balances` pode ser projeção materializada controlada pelo mesmo serviço transacional que grava `stock_movements`. Os movimentos são a trilha auditável de origem; o relatório confere saldo e valor da projeção com o razão de eventos.

## 4. Ficha técnica — rendimento medido de verdade

- Ao criar uma ficha ou subpreparo, solicitar medidas: **peso bruto empregado**, **peso líquido após limpeza**, **peso final após cocção/processamento**, número de porções e **gramatura final por porção** quando aplicável.
- Valores são informados por medição do usuário, não estimados silenciosamente pela IA; o sistema pode pedir nova medição se falta informação essencial.
- Medidas são versionadas e vinculadas ao lote/medição, registrando data e metodologia; dados preenchidos com hipótese devem aparecer como **estimativa não validada**, não como rendimento real.
- Para 10 kg brutos de ingrediente que rendem 8 kg utilizáveis, o custo da preparação por kg útil corresponde ao custo efetivamente consumido dividido por 8 kg. Se houver cozimento com nova perda, registrar peso final separadamente para não contar desperdício duas vezes.
- Pré-preparo é um item de produção ligado a uma receita. Quando o controle de estoque também rastrear o produto preparado, consumo de insumo e entrada do pré-preparo devem ser transações relacionadas, evitando estoque duplicado.
- Receitas e sub-receitas são versionadas; mudanças de preço de insumo recalculam **prévia de custo atual**, mas simulações e baixas históricas preservam seus snapshots.
- Exigir medição real para a ficha ser marcada como **validada para custo por rendimento**. Permitir rascunho incompleto sem fingir precisão.

## 5. Auditoria / contagem física de estoque

### Modalidade A — Relatório de auditoria imprimível

- Proprietário escolhe restaurante, local, categorias e data-base da contagem.
- Imprimir PDF com identificação dos insumos, unidade, coluna para quantidade encontrada, campo de observação e espaço para data/assinatura; opcionalmente **ocultar saldo teórico** para contagem cega.
- Após contagem no papel, o dono digita os valores no app e visualiza diferenças antes da confirmação.

### Modalidade B — Modo Auditoria no app

1. Iniciar sessão de inventário para unidade/local; registrar **snapshot do saldo teórico** e hora de corte.
2. Listar itens com busca/filtro, um por vez ou por categoria; marcar `não contado`, `contado`, `recontar` e `validado`.
3. Informar quantidade contada e observação; exibir progresso, itens faltantes e divergências; permitir modo cego opcional.
4. Antes de fechar, gerar **relatório de conferência** com saldo esperado, físico, diferença, custo médio aplicável e impacto financeiro estimado.
5. Revisar/recontar divergências; ao confirmar, gerar **ajustes de estoque rastreáveis**, nunca alterar saldo silenciosamente.
6. Fechar sessão com relatório imprimível (PDF), histórico e trilha de auditoria.

**Concorrência durante contagem:** definir ponto de corte e contabilizar separadamente movimentos ocorridos após o início. Na V1, recomenda-se aviso para não movimentar os itens durante a contagem ou mecanismo de reconciliação de movimentos posteriores. Contagem não pode sobrescrever recebimentos legítimos ocorridos no intervalo.

**Escopo:** só o dono opera o fluxo; `audit_events` registra sua identidade e origem, sem workflow de aprovação de funcionário.

## 6. Compras e lista inteligente (App 01)

- Histórico de preços por fornecedor e insumo, normalizando preço por unidade comparável; registrar compra original e custo efetivo recebido.
- Saldo mínimo e **estoque-alvo** editáveis para cada ingrediente/local. Base sinaliza `estoque crítico`.
- Premium calcula sugestão inicial: `quantidade_necessaria = max(0, estoque_alvo - saldo_disponivel - recebimentos_pendentes_validos)`; respeitar embalagens mínimas e arredondamento de unidades. No MVP simples, não exigir modelo de demanda/lead time complexo.
- Lista é **rascunho editável**: dono altera quantidade/fornecedor, remove itens, imprime, exporta ou compartilha.
- Criar, exportar ou atualizar uma lista Premium só pode acontecer com entitlement ativo no servidor. Lista não cria movimentação; entrada real ocorre no recebimento.

## 7. Motor de precificação — regras editáveis pelo dono (App 02)

### Conceitos separados na UI

- `C_insumo`: custo atualizado da ficha/receita ou custo manual, por unidade vendida.
- `C_variavel_fixo`: embalagem, adicionais e outros custos variáveis **fixos por venda**, que não devem ser confundidos com custos fixos mensais.
- `t_canal`: total efetivo das taxas percentuais aplicadas sobre a base de venda configurada (marketplace, maquininha etc.).
- `i`: tributos percentuais aplicáveis, quando o regime indicar esse tipo de cálculo.
- `m`: **margem de contribuição alvo** = `(receita - custos variáveis e taxas) / receita`.
- `c`: **CMV alvo** = `custo de ingredientes/receita ÷ preço líquido de venda`, conforme convenção explicitada na interface. CMV projetado e margem de contribuição projetada aparecem separadamente.

**Cenário proporcional simples, antes de descontos complexos:**

`P_margem = (C_insumo + C_variavel_fixo) / (1 - t_canal - i - m)`.

`P_cmv = C_insumo / c`, para `c > 0`.

Quando as duas metas forem restrições mínimas/máximas **simultâneas**, sugerir `P = max(P_margem, P_cmv)` e exibir a diferença para as metas. Se o dono escolher apenas uma meta ativa, otimizar aquela meta e mostrar a outra como métrica informativa. Todos os parâmetros e o critério de prioridade são editáveis por produto/canal, podendo existir defaults por restaurante.

**Alertas obrigatórios:** fórmula com `1 - t_canal - i - m <= 0`, CMV alvo fora da faixa válida, taxas que mudam por faixa, bases de incidência diferentes, descontos, frete subsidiado e encargos fixos. Nesse caso, usar simulador de decomposição de preço específico, não simplesmente somar percentuais incorretamente. Impostos são configurados pelo usuário com suporte contábil; não inferir regime fiscal sozinho.

**Combos:** custo = soma de `(quantidade × custo do produto integrante)` + custos exclusivos do combo. Preço e custos componentes são salvos no cenário histórico. Não somar embalagem/taxa de pagamento de cada produto novamente quando o combo tem cobrança única.

**Contrato entre apps:** App 02 consulta prévia de custo do App 01 pela API central com escopo verificado; se App 01 não contratado ou custo não validado, permitir cadastro manual e indicar sua fonte e última atualização. Cancelamento do App 01 não elimina snapshots de simulações passadas.

## 8. Segurança e operação da IA

1. **Canal autorizado:** WhatsApp Business Platform/fornecedor de API oficial; verificar requisitos comerciais e custos antes de prometer automação de produção. Identificar e vincular o número do dono à sua conta/organização de forma verificada, com seleção inequívoca de restaurante quando houver múltiplos.
2. **Acesso pago:** backend avalia módulo, add-on, limites/franquia e cota, antes de chamar provedor de IA. Registrar metering e custos sem duplicações.
3. **Extração:** texto/foto/áudio -> modelo -> **JSON validado por schema** (ação, item, quantidade, unidade, preço, fornecedor, confiança e campos faltantes). Modelos apenas propõem dados; não executam SQL nem fazem baixa diretamente.
4. **Conferência:** regras determinísticas verificam unidades, item ambíguo, preço total vs unitário, inconsistências, tenant, saldo disponível, data, comandos duplicados e limites. Em caso de dúvida, pedir desambiguação.
5. **Revisão humana:** mostrar resumo e exigir **confirmação explícita do dono** antes de qualquer entrada/saída, inclusive quando a confiança da IA for alta. Respostas fora de contexto e mensagens encaminhadas não valem como confirmação automaticamente.
6. **Commit:** apenas a API central efetiva movimento atômico/idempotente, registrando proposta original, revisão, confirmação e resultado.
7. **Privacidade e prevenção de abuso:** armazenamento restrito de imagens/áudio, prazos de retenção configurados, mascaramento de dados sensíveis em logs, rate limit, webhook autenticado, proteção contra replay e injeção de comandos no conteúdo enviado.

**Exemplo:** “Comprei 5 kg de muçarela por R$ 190” -> propor compra recebida de 5 kg, custo R$ 38/kg, fornecedor não informado, confirmar se foi recebida e a unidade selecionada -> **somente após confirmação**, gravar entrada valorizada; não registrar duas vezes em reprocessamento.

## 9. Arquitetura técnica de referência

**Monorepo / monólito modular**, com deploys independentes dos frontends e API compartilhada:

```text
apps/
  portal/          # login, gestão de restaurantes, planos
  estoque/         # App 01
  precificacao/    # App 02
  api/             # autorização, domínios, entitlements, integração/IA
packages/
  contracts/       # esquemas compartilhados, contratos de API
  domain-inventory/# saldos, movimentos e valuation
  domain-recipes/  # ficha técnica, rendimento
  domain-purchases/# históricos, reposição Premium
  domain-pricing/  # preço de produtos e combos
  domain-billing/  # entitlements e uso de IA
  db/              # acesso ao Postgres, migrations
  ui/              # componentes visuais comuns
supabase/migrations/
tests/unit/
tests/integration/
tests/e2e/
docs/superpowers/specs/
docs/superpowers/plans/
```

**Stack candidata:** TypeScript, React/Next.js ou Vite para apps, API TypeScript, PostgreSQL/Supabase, Vercel, testes Vitest + integração SQL/RLS + Playwright. Fixar versões e validar compatibilidade antes de executar. A ferramenta é secundária aos contratos e invariantes.

**Persistência:** serviços de domínio executam transações críticas de inventário; não espalhar operações de estoque em chamadas diretas de múltiplos frontends. `numeric` para quantidade/custo. RLS e índices por tenant/unidade. Backup e restauração verificados. Não importar scripts destrutivos do legado.

## 10. Plano de execução em ciclos independentes

| Ciclo | Produto executável / critério de saída |
|---|---|
| 0. Auditoria do DONOS | Matriz `aproveitar regra / reescrever / descartar`, mapeamento de telas, fluxos e SQL; sem tocar produção. |
| 1. Núcleo SaaS | Login do dono, tenant, unidades, seleção, RLS, entitlements e testes Cliente A ≠ Cliente B. |
| 2. Estoque Base | Entrada/saída, custo médio móvel, histórico de preços e testes atômicos/concorrência. |
| 3. Fichas Técnicas | Rendimentos medidos, pré-preparos, composição de receitas, versões, custo atualizado. |
| 4. Auditoria física | PDF de contagem, modo auditoria, reconciliação e ajustes auditáveis. |
| 5. App 02 | Produtos, combos, metas de CMV/contribuição, taxas/canais editáveis, custo manual ou integrado. |
| 6. Premium de compras | Reposição por mínimo/alvo, listas editáveis, exportação e gate por assinatura. |
| 7. IA para estoque | Primeiro texto/foto dentro do app, depois voz e WhatsApp autorizado; revisão humana, limite por plano. |
| 8. Piloto | Dois ou mais restaurantes reais de teste, isolamentos, cálculos conciliados, fluxo completo, métricas de uso. |

**Disciplina de implementação:** um pequeno ciclo por vez; testes unitários e de integração antes de merge; commits pequenos; migrations versionadas; prévia de Vercel antes de produção; jamais rodar script `cleanup_all` antigo. Só começar implementação após revisão deste desenho e criação de plano técnico por tarefa para o Codex.

## 11. Critérios de aceite de alto risco

1. **Média ponderada:** dado saldo 8 kg/R$ 160 e compra de 7 kg/R$ 175, novo saldo 15 kg, valor R$ 335 e custo médio R$ 22,333333...; baixa de 2 kg em estoque a R$20/kg preserva custo médio R$20.
2. **Precisão:** sequência de várias compras/baixas fracionadas não acumula deriva por arredondamento precoce; histórico de custo registra snapshots por movimento.
3. **Idempotência:** confirmação repetida ou webhook reentregue causa exatamente um movimento.
4. **Estoque:** sem saldo negativo involuntário, sem referência a ingrediente de outro tenant e sem custo inventado na entrada.
5. **Auditoria:** imprimir ou contar no app; comparar com saldo e registrar ajuste rastreável; proteger movimentações ocorridas durante a contagem.
6. **Rendimento:** ficha não se diz validada sem medição real; transformação não conta o mesmo insumo duas vezes; custo da ficha acompanha média móvel corrente.
7. **App 02:** calcula metas editáveis de margem e CMV, separa taxas por canal, detecta parâmetros inviáveis, combina produtos corretamente e preserva preços históricos.
8. **Premium/IA:** endpoint nega sem assinatura; com assinatura IA nunca modifica estoque sem confirmação humana, e o uso é medido uma só vez.
9. **Multi-tenant:** proprietário A não enxerga B via app, API, Storage, webhook nem relatório. Um proprietário com unidades A1/A2 não mistura movimentos entre unidades.
10. **Independência:** App 02 funciona sem App 01 usando custo manual; quando os dois existem, consome custo corrente compartilhado sem copiar o banco ou duplicar motor de custo.

## 12. Decisões de implementação que ainda exigem especificação, sem bloquear este escopo

- Precificação exata das assinaturas e franquias por canal de IA; estimar com custo real de provedores antes de vender.
- Padrão de casas decimais, arredondamento e rateio de frete/descontos no custo de aquisição; propor regra matemática nos testes antes do lançamento.
- Escolha final de provedor do WhatsApp e forma de comprovar titularidade do número da conta.
- Se contas de vários restaurantes da mesma empresa terão assinaturas por unidade ou apenas por organização. Proposta inicial: por organização com limites de unidades explícitos.
- Se contagens simultâneas serão bloqueadas por local/itens ou reconciliadas temporalmente na V1. Proposta inicial: só uma contagem aberta por local com aviso/controle de movimentos concorrentes.
- Definição da base tributária por canal e do tratamento de desconto/frete em cenários avançados; confirmar com contabilidade para não usar fórmula simplificada fora das hipóteses.

## 13. Limites e próximos passos

Esta V3 substitui a V2 quando houver conflito: sobretudo **custo médio móvel**, **medições reais**, **auditoria física**, **metas de CMV e margem de contribuição editáveis** e **reutilização seletiva do legado**. Não altera projeto Vercel, GitHub ou Supabase. Após revisão/aprovação, decompor em specs separadas (`core-multitenant`, `inventory-valuation`, `recipes-yield`, `inventory-audit`, `pricing`, `shopping-premium`, `ai-ingestion`) e planos de implementação TDD para o Codex.
