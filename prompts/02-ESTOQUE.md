# Ciclo 02 — Estoque, compras e custo médio móvel

Leia `AGENTS.md`, V3 e testes T-03 a T-10, além de `docs/04-ROADMAP.md`. Antes de código, escreva `docs/superpowers/specs/*inventory*.md` e `docs/superpowers/plans/*inventory*.md` com interfaces, schema, transações, precisão decimal, idempotência, estorno, conversão de unidade e regras de recebimento. Peça aprovação do plano.

Após aprovação, implemente **somente**: catálogo de insumos, fornecedores básicos, compras recebidas, histórico de preço por fornecedor, entrada/saída, saldo, valor do estoque e custo médio móvel com ledger imutável; operações transacionais com trava e idempotência; endpoints + UI mínima para operar o fluxo. Não fazer lista Premium nem IA ainda.

Contrato numérico canônico: 10 kg x R$20 -> baixa2 kg por R$40 -> saldo8 kg, R$160 e média R$20 -> nova compra7 kg x R$25 -> saldo15kg, R$335, média R$335/15. Testar em banco, não só em função JS. Considerar zero de estoque, concorrência, rollback em falha, unidades incompatíveis e A vs B. Não usar `float` binário. Cada movimento auditável, sem exclusão física.

Subagentes com tarefas separadas: motor de cálculo puro; revisão de casos de teste; UI de insumos SOMENTE após contrato consolidado; coordenador é dono das migrations e integração final. Finalizar com relatórios e testes reais. Não iniciar próximo ciclo autonomamente.
