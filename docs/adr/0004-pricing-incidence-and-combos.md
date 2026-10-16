# ADR 0004 — Incidência financeira e embalagens de combos

Data: 16/10/2026. **Estado: aprovada pelo fundador em 16/10/2026, após confirmação explícita das propostas IMP-016/017 e do vínculo à versão corrente validada da ficha.** Tributos permanecem entradas manuais; a aplicação não infere regime fiscal. Esta aprovação não autoriza integração remota, produção ou deploy. Complementa DEC-004 e DEC-009 a DEC-013, a spec de precificação e o plano TDD do Ciclo 05.

## Contexto

O motor precisa converter metas de margem/CMV em preço de lista e apresentar métricas coerentes depois de descontos, taxas, tributos e custos por venda. Um combo pode substituir somente parte das embalagens dos seus componentes. A V3 define a fórmula linear quando as bases coincidem, mas exige decomposição quando diferem e não define todas as bases/incidências. As escolhas abaixo foram confirmadas explicitamente pelo fundador em 16/10/2026.

## IMP-016 — decisão aprovada pelo fundador

1. **Preço e desconto:** `listPrice` é o preço bruto antes de desconto. Todo desconto percentual incide diretamente sobre `listPrice`; descontos fixos também são subtraídos uma vez por venda. Descontos não são compostos em sequência. Desconto total igual ou superior ao preço de lista torna o cenário inviável.
2. **Receita de referência:** `netRevenue = listPrice - totalDiscount`. Margem de contribuição e CMV usam `netRevenue` como denominador. Receita é medida depois do desconto comercial e antes da dedução de taxas/tributos.
3. **Taxas e tributos:** cada percentual declara `rateBase = list_price` ou `net_after_discount`. Valor fixo declara valor por venda. Tributos são entradas manuais; o sistema não infere regime fiscal.
4. **Margem:** `(netRevenue - ingredientCost - packagingCost - otherVariableCost - percentageFees - fixedFees - taxes) / netRevenue`. Logo, taxa/tributo reduz margem de contribuição.
5. **CMV:** `ingredientCost / netRevenue`; embalagem e outros custos variáveis não entram no numerador.
6. **Sugestão:** calcular exatamente o preço bruto mínimo que satisfaz cada meta ativa, considerando a base de cada desconto/taxa/tributo; usar a maior restrição entre margem e CMV. Arredondar somente o preço final para cima ao centavo e recalcular as métricas sobre esse preço arredondado. Bases divergentes são resolvidas por equação racional exata, sem busca aproximada nem `number` binário; caso sem solução única/positiva é explicitamente indisponível.
7. **Taxa fixa:** cada taxa fixa de canal incide uma vez por venda simulada de produto ou combo. Não há rateio por pedido com múltiplos itens neste ciclo.

**Exemplo para validar incidência:** preço de lista R$ 50, desconto de 10%, taxa percentual de 10%. A taxa é R$ 5,00 se a base escolhida for preço de lista e R$ 4,50 se a base for receita após desconto (R$ 45,00). O dono configura a base; a aplicação não escolhe por ele.

## IMP-017 — decisão aprovada pelo fundador

1. O custo de receita mantém a decomposição de componentes e caminhos fornecida pelo serviço autoritativo. A embalagem registrada como papel de componente conserva o papel `packaging` no snapshot; custo sem decomposição não pode ser usado para substituição parcial.
2. Custo manual separa ingrediente de embalagem; cada embalagem manual recebe caminho estável próprio.
3. Cada componente do combo pode listar caminhos exatos de embalagem individual substituídos. Só esses custos são omitidos no combo. Ingredientes, outras embalagens e demais custos não mudam.
4. Embalagens exclusivas do combo são somadas uma vez por venda. Quantidades dos componentes multiplicam seus custos antes da substituição; a embalagem exclusiva não é multiplicada por quantidade de componente.
5. Taxas percentuais e fixas do canal são aplicadas uma vez sobre a venda do combo, conforme IMP-016, sem reaplicar taxa de canal por produto componente.
6. Caminho inexistente/duplicado, embalagem não identificada ou custo sem breakdown resulta em erro explícito, nunca em omissão silenciosa.

## Vínculo e atualidade da ficha — decisão aprovada pelo fundador

Manter `recipeId` como vínculo do produto. Cada simulação consulta a versão corrente validada da ficha no `locationId` escolhido explicitamente; grava `recipeVersionId`, `locationId`, fonte, instante de cálculo e breakdown retornado. Edições posteriores da ficha afetam simulações novas, mas não alteram o vínculo nem snapshots existentes. Se a versão corrente estiver não validada ou o custo indisponível, a simulação fica indisponível e o dono pode deliberadamente trocar a fonte para manual.

## Breakdown exato de custo da receita — decisão técnica do coordenador

O serviço atual calcula custo por razões `bigint` e expõe `costPerFinalUnit` arredondado half-even a 12 casas decimais. O DTO novo manterá esse decimal para exibição e também carregará o total e cada componente como `ExactMoneyRatio`, razão canônica de coeficientes de BRL com escala 10^12. A soma racional dos componentes deverá ser exatamente igual ao total racional; a API não arredonda componentes individualmente.

Cada componente carrega caminho determinístico dos IDs dos componentes desde a ficha raiz até a folha. Uma folha repetida em caminhos distintos permanece como entradas distintas. O papel efetivo é `packaging` se qualquer aresta do caminho declarar embalagem; caso contrário, usa o papel declarado na folha. Razões são reduzidas por MDC; numerator é uma string inteira não negativa, denominator é uma string inteira positiva, ambos limitados explicitamente pelo contrato, e excesso retorna `NUMERIC_RANGE`. Quantidades de venda multiplicam a razão com `bigint`, sem converter para decimal nem arredondar. Esta decomposição não altera o ledger ou o algoritmo de média móvel.

O App 02 persiste no produto apenas o vínculo de ficha (`recipeId`, `locationId`, `quantityPerSale`). Cada simulação chama novamente o serviço autoritativo para obter a versão corrente validada; escala custo/componentes por `quantityPerSale` exatamente e salva versão, custo e componentes no snapshot daquela simulação.

## Consequências

- Contratos guardam base declarada, componentes e paths substituídos; simulações persistem snapshots imutáveis.
- O custo da receita continua vindo somente pelo serviço/API central autorizado; fonte manual continua disponível para `pricing_core` sem `inventory_core`.
- O breakdown é exato e auditável; payloads têm limite de tamanho/precisão e cenários que excedam o limite são recusados explicitamente.

## Limites desta aprovação

As fórmulas e incidências deste ADR estão liberadas para implementação segundo as regras descritas. Tributos são declarados pelo dono com suporte contábil; a aplicação não recomenda regime nem calcula obrigação fiscal oficial. Permanece obrigatório usar um alvo de banco isolado local comprovado para DDL/integração. Sem Docker/Podman disponível neste checkout, nenhum teste/migration pode usar o DEV hospedado até autorização específica do fundador para o Ciclo 05.
