# Ciclo 05 — App 02 Precificação de Produtos e Combos

**Status:** desenho, plano TDD e decisões IMP-016/017/vínculo da ficha aprovados pelo fundador em 16/10/2026; DDL/integração aguardam o gate de banco isolado.
**Base:** DONOS Next V3, DEC-004, DEC-009 a DEC-013; critérios T-15 a T-18; `prompts/05-PRECIFICACAO.md`.
**Ciclo anterior:** Ciclo 04 merged no PR #4, merge commit `c0b19024ea87041a971cabe018cf8d005c82eb46`.

## Intenção e resultado

O App 02 permitirá ao proprietário manter produtos vendáveis, variações, combos e perfis de canal; informar custos manualmente quando o App 01 não estiver contratado; simular preços com metas editáveis de margem de contribuição e CMV; e consultar o custo atual de uma ficha do App 01 pela API central quando a organização tiver o entitlement correspondente. Cada simulação guardará um snapshot reproduzível de custo, composição, bases, taxas, metas, preço sugerido e métricas resultantes.

O App 02 continua independente do estoque e das compras. Não cria, altera nem consulta diretamente tabelas internas de inventário ou receitas. O shell, autenticação, seleção de unidade, contexto e gate `pricing_core` já existem; o fluxo de negócio e motor de precificação ainda não existem.

## Abordagens consideradas

1. **Domínio de preço isolado no monorepo, API central e UI fina (recomendada).** Criar um pacote puro `domain-pricing`, contratos explícitos, persistência/RLS no Postgres existente, rotas Fastify e telas no shell Vite de Precificação. O backend obtém custo de ficha através de serviço central existente, valida os entitlements e persiste snapshots. Mantém cálculos testáveis e uma única fronteira de autorização.
2. **Cálculo dentro de rotas e serviços Fastify.** Menos pacote inicial, mas mistura fórmulas com autenticação, acesso a dados e HTTP, dificultando testes de regressão e reutilização.
3. **Cálculo no browser ou RPC exposta ao cliente.** Rejeitada: o cliente não é autoridade para preço/custo, pode alterar metas e IDs, e não deve decidir tenant, entitlement nem snapshots financeiros.

## Escopo funcional

- Produtos vendáveis, variações e combos pertencem a uma organização e unidade; dono pode criar/editar/arquivar e consultar seus próprios registros.
- Custo do produto vem de uma única fonte selecionada explicitamente: `manual` ou `recipe`. Fonte manual guarda valor, moeda e data da edição. Fonte de ficha guarda referência da ficha/versão/local e o DTO retornado pelo serviço central, com fonte e data de cálculo. Nunca converter custo indisponível em zero.
- Acesso ao App 02 exige `pricing_core`. Fonte `recipe` também exige `inventory_core` da mesma organização. Sem App 01, custo manual continua disponível e o App 02 permanece funcional.
- Cada perfil de canal registra taxas percentuais e valores fixos, tributos informados pelo dono, descontos e embalagem com sua unidade de incidência declarada. As metas de margem de contribuição e CMV são configuráveis por produto/variação e canal.
- Simulação mostra custo-base, bases de incidência, taxas, preço atual, preço sugerido, CMV projetado e margem de contribuição projetada separadamente. Metas inválidas/incompatíveis e entradas fora do domínio geram erro/alerta explícito; nenhum resultado silencioso.
- Combo soma custos dos componentes nas quantidades selecionadas e custo exclusivo do combo. Embalagens e taxas devem ser contabilizadas uma vez segundo a regra aprovada para o componente e o canal.
- Simulações são append-only: guardam valores de entrada e resultado usados naquele instante. Alterar preço, custo, produto, combo ou canal não reescreve simulações antigas.

## Modelo matemático e precisão

- Dinheiro, quantidades, percentuais, divisões e intermediários usam strings decimais, inteiros escalados ou razões `bigint`; nenhum cálculo crítico usa `number` binário.
- Reutilizar `DecimalStringSchema` e os limites/formatos canônicos atuais dos contratos. O pacote de preço será puro e não dependerá de `domain-inventory` para valuation de estoque. Não instalar nova dependência sem justificativa, versão fixa e lockfile.
- No caso linear da V3, sem desconto e com bases de incidência equivalentes:
  - `P_margem=(C_insumo+C_variavel_fixo)/(1-taxas_proporcionais-impostos_proporcionais-margem_alvo)`.
  - `P_cmv=C_insumo/cmvalvo`, para `cmvalvo > 0`.
  - Com ambas as metas simultâneas válidas, preço sugerido é o maior preço mínimo.
- Denominador `<= 0`, CMV fora de `(0,1]`, custo inválido, taxa por faixa e bases incompatíveis não passam pela fórmula simplificada. Desconto, taxa fixa e cada base de incidência precisam ser resolvidos por decomposição determinística definida após aprovação de IMP-016/017.
- Para uma simulação resolvida, arredondar o preço sugerido para cima ao centavo conforme ADR 0001 e recalcular todas as métricas com o preço final exibido. Não arredondar intermediários para centavos nem truncar razões.
- Regressão aritmética proposta: `C_insumo=20`, `C_variavel_fixo=2`, taxas proporcionais `10%`, tributos `5%`, margem `25%`, CMV alvo `30%`: `P_margem=36,666…`, `P_cmv=66,666…`, sugestão simultânea `66,67`; métricas recalculadas usam `66,67`.

## Integração com App 01

- App 02 não acessa banco/tabelas do App 01 e não chama uma rota de browser com permissões mais amplas.
- O backend resolve o ator, organização, unidade e contexto autenticados e valida `pricing_core`; para fonte `recipe`, valida também `inventory_core`, titularidade da ficha/versão, status de medição e local solicitado.
- Reutilizar o serviço/cálculo autoritativo de receita existente e seu DTO versionado (`RecipeCostDTO`), que já carrega `locationId`, fonte, data e estado. Não duplicar média móvel nem cálculo de ficha.
- O endpoint público atual de custo de receita está sob a autorização de `inventory_core`; para uma chamada originada pelo App 02, o serviço central precisa ser reutilizado internamente com os dois entitlements verificados, sem enfraquecer o endpoint do App 01. API ou ficha indisponível mantém estado explícito. Trocar manualmente a fonte exige ação deliberada do dono.

## Combos e embalagens

- Cada componente preserva quantidade e custo-fonte usados no snapshot. Embalagem já incluída na ficha/custo do produto não pode ser somada novamente como embalagem individual do App 02.
- Embalagem individual consumida permanece no custo daquele componente. Uma substituição explícita só remove o componente de embalagem efetivamente substituído; outros custos de embalagem continuam. Embalagem exclusiva de combo é adicionada uma vez.
- Taxa percentual e taxa fixa identificam sua base e unidade de aplicação. O cenário de uma venda de combo aplica a taxa por venda uma única vez, sem somar novamente uma taxa embutida no custo do produto. A semântica de comissão por pedido com vários itens exige regra própria e não pode ser inferida neste ciclo.

## Isolamento, persistência e auditoria

- Produto, variação, combo, componente, canal e simulação são escopados por `organization_id` e `restaurant_id`; o tenant vem da sessão/contexto verificados no servidor, nunca só do payload/URL.
- Chaves estrangeiras compostas e RLS ENABLE+FORCE protegem combinações de organização/unidade. Rotas protegidas exigem `pricing_core`; acesso integrado à receita exige também `inventory_core` e valida o escopo da receita e localização.
- Mutações usam transações, validação Zod, idempotency key conforme o padrão API existente e trilha de auditoria. A tabela de simulações não aceita UPDATE/DELETE pelo runtime.
- Testes incluem organizações distintas, duas unidades da mesma organização, IDs forjados, tentativas de referenciar ficha de outro tenant, entitlement ausente/expirado e isolamento de snapshots.

## Decisões abertas que bloqueiam implementação

- **IMP-016 — bases de receita líquida, desconto, taxas e tributos.** A proposta atual diz que a receita usada como base é após descontos comerciais e antes das taxas, mas não escolhe a base de incidência real de cada taxa/tributo por canal. Confirmar com fundador/contabilidade: preço de tabela, ordem do desconto, base das taxas e tributos, denominador de margem/CMV e decomposição quando divergirem. Até a decisão, somente o caso linear sem desconto e de bases equivalentes está matematicamente definido.
- **IMP-017 — embalagem de combos.** Confirmar a regra para substituição parcial/total de embalagem individual, como identificar custo de embalagem já embutido no snapshot de ficha e a incidência de taxa fixa por venda versus por pedido. Até a decisão, não codificar regras ambíguas de substituição ou rateio.
- Vínculo de produto com receita (versão fixa ou versão corrente), seleção de local para custo integrado e semântica de atualidade do custo devem ser explícitos no contrato do ciclo. Proposta: manter `recipeId` como vínculo e solicitar versão/local atuais ao serviço autoritativo; todo snapshot salva `recipeVersionId`, `locationId` e `calculatedAt`.

Registrar decisões aprovadas e qualquer escolha técnica nova em `docs/05-REGISTRO-DE-DECISOES.md`/ADR antes de codificar. Não presumir aprovação de decisões comerciais por este documento.

## Fora de escopo e limites

- Estoque físico, compras, fornecedores, listas Premium, cadastro de funcionário/RBAC, PDV, financeiro e edição de custos de receita no App 02.
- Regime fiscal automático, importação de taxas externas, integração paga, cobrança real, WhatsApp, deploy e qualquer alteração no projeto legado/produção.
- Sem acesso direto do browser a SQL, service role no cliente ou chamadas pagas. Dados de testes são sintéticos.

## Critérios de aceite

- **T-15:** organização com apenas `pricing_core` cadastra custo manual, simula preço e guarda snapshot sem exigir App 01.
- **T-16:** custo atual de ficha entra apenas por serviço/API central e organização/unidade/local autorizados, com versão, fonte e data; faltante/não validado/API indisponível permanece explícito e não vira zero.
- **T-17:** casos de margem, CMV e metas simultâneas cumprem fórmulas válidas, rejeitam denominador/CMV inválidos, respeitam IMP-016, arredondam preço para cima ao centavo e recalculam métricas.
- **T-18:** combo soma componentes sem duplicar embalagem ou taxa, segundo IMP-017 aprovado.
- Integração testa idempotência, permissão, histórico imutável, cross-tenant e cross-unit. Unitários cobrem aritmética e fronteiras; E2E cobre o caminho principal manual e combo.

## Gate desta proposta

Desenho e plano TDD foram aprovados para implementação. A aprovação não resolve IMP-016/017. As decisões financeiras/comerciais bloqueadoras devem ser registradas antes do código dependente, e qualquer DDL/integração requer alvo descartável local comprovado ou autorização específica para o DEV DONOS Next deste ciclo.
