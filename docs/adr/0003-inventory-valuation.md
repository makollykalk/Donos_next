# ADR 0003 — Valoração e integridade do estoque Base

Data: 15/10/2026. **Aprovada pelo fundador em 15/10/2026, com gate do Ciclo 01 cumprido pela revisão humana. Ciclo 02 implementado e validado para revisão do PR; evidências em docs/evidence/ciclo-02-inventory.md.** Complementa ADR 0001, respeita DEC-001 a DEC-013 e não muda a fronteira entre os dois apps. Aprovação desta ADR/spec/plano autoriza somente o Ciclo 02, depois do gate do Ciclo 01.

## Decisão aprovada

Ledger append-only e projeção de saldo na mesma transação PostgreSQL. Motor puro com coeficientes `bigint`; banco com `numeric` exato e limites/escala explícitos. Nenhuma dependência decimal nova. A API recebe e devolve strings; não registra parsers pg de numeric/int8 para Number.

| Alternativa | Benefício | Custo / decisão |
|---|---|---|
| Ledger + projeção transacional, coeficientes bigint | Reconciliação, trava por insumo, arredondamento verificável, sem dependência nova | Recomendada; exige testes de integração e constraints diferidas |
| Recalcular todo saldo pelo ledger em cada leitura | Menos estado duplicado | Leituras e autorização de saídas ficam progressivamente mais caras; não escolhida |
| Event sourcing completo e frações arbitrárias em todos os valores | Valoração racional sem quantização | Crescimento de frações, reconstrução e operação mais complexos; não necessário neste ciclo |

`decimal.js` 10.6.0 era candidato na ADR 0001, não instalado. Não é necessário para operações de coeficientes, produtos e divisão inteira com resto. Seu uso tampouco tornaria uma dízima finita exata.

## Precisão e média

Quantidade: até 18 inteiros/6 casas; preço de compra informado: até 18 inteiros/12 casas; valor registrado por insumo: até 26 inteiros/12 casas. Domínios PostgreSQL sobre `numeric` sem typmod, com CHECK de faixa e `v=trunc(v,escala)`, equivalem às faixas de numeric(24,6)/numeric(38,12), mas recusam excesso de precisão antes de coerção silenciosa. Deltas têm faixa simétrica assinada. NaN/Infinity são explicitamente recusados por comparação com limites finitos.

PostgreSQL arredonda valores ao reduzir a escala declarada e `round(numeric)` resolve empates afastando de zero. Por isso nenhum desses comportamentos define o half-even deste domínio. Ver [numeric PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-numeric.html).

Depois de uma entrada, preservar referência `Qref,Vref` e quantidade já baixada `x`. Definir `B(x)=halfEven12(x×Vref/Qref)`. Uma saída q registra custo `B(x+q)-B(x)`. Saldo registrado: `Q=Qref-x`, `V=Vref-B(x)`. A próxima entrada estabelece `Qref=Q+q`, `Vref=V+valorRecebido`, `x=0`.

A média econômica da época é a razão **Vref/Qref**, constante nas saídas. `V/Q` do saldo quantizado pode diferir dela. O erro do valor remanescente frente à referência racional é no máximo R$0,0000000000005 por estado; o custo de uma saída pode diferir em até R$0,000000000001. Não afirmar identidade literal dessas razões após qualquer saída fracionária. Em Q=0, V=0 e média ausente. Valores de UI arredondados nunca realimentam o motor.

## Escopo, recebimento e correção

- Insumos, conversões, recebimentos, saldos e movimentos pertencem à unidade. Fornecedores são compartilhados somente dentro da organização. Referências usam FKs compostas correspondentes.
- Base kg/L/un é estável desde a criação. `allowFractionalCount` é escolha explícita para un, imutável; default false. Massa↔volume/densidade ficam fora. Embalagens têm fatores positivos versionados e snapshots.
- Rascunho de recebimento não movimenta estoque; confirmação explícita gera entrada. Não implementar pedidos, cotação ou recebimento parcial de pedido.
- Preço por unidade de compra é efetivo e informado pelo dono. Encargos/descontos de cabeçalho sem rateio não são aceitos. Custo zero exige motivo explícito; custo ausente não vira zero.
- Estorno somente da última movimentação do insumo, restaurando Q/V/Qref/Vref/x anteriores em novo evento compensatório. A sequência aumenta e last_movement_id aponta à compensação; nunca retrocedem. Recebimento com vários insumos: estornar todos ou nenhum. Origem com sucessores retorna conflito; revaloração retroativa permanece fora do ciclo.
- Data documental não altera ordem de efetivação. Sequência por saldo é a ordem; timestamps não são chaves de valoração.

## Integridade e implementação

Runtime sem UPDATE/DELETE de ledger/histórico. Triggers de imutabilidade e constraint triggers diferidas conferem cadeia e projeção na mesma transação. Funções SECURITY INVOKER com search_path fixo e grants privados. Nenhum SECURITY DEFINER ou bypass RLS. [Triggers de constraint](https://www.postgresql.org/docs/17/sql-createtrigger.html) executam no fim da transação; testes SQL reais recusam commit de projeção isolada, movimento sem projeção e recebimento incompleto, e comprovam rollback integral nas falhas injetadas. Resultados e comandos estão no relatório de evidências.

Idempotência reutiliza o escopo organizacional do core. Operação versionada e hash incluem organizationId, restaurantId e DTO normalizado. Reusar a chave em outra unidade conflita409; não recupera resposta de outro contexto. Não é preciso ampliar a enum de scopes do core neste ciclo.

Consequências: correção tardia exige operação futura de revaloração; catálogo não troca dimensão/base; frete automático não existe. Essas restrições devem aparecer antes da confirmação na UI. Precisão, estorno e limites de recebimento são escolhas concretas submetidas à aprovação conjunta dos documentos Inventory.

Spec: [inventory-valuation-design](../superpowers/specs/2026-10-15-inventory-valuation-design.md). Plano: [inventory-valuation](../superpowers/plans/2026-10-15-inventory-valuation.md).
