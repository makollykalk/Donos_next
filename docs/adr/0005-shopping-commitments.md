# ADR-0005 — Compromissos explícitos para compras Premium

- **Status:** aprovada pelo fundador em 2026-10-16
- **Contexto:** a reposição Premium precisa descontar compras já decididas, mas o inventário existente representa somente recebimentos `draft`, `received` e `reversed`. Um recebimento em rascunho pode estar incompleto ou ser abandonado e não prova que o dono colocou um pedido.
- **Decisão:** apenas um compromisso criado após confirmação explícita do dono reduz a necessidade de reposição. Rascunhos e recebimentos não reduzem o pendente; recebimentos concluídos já estão refletidos no saldo. O compromisso congela unidade, conversão e quantidade-base comercial. O dono cancela o saldo restante para corrigir ou substituir uma compra.
- **Recebimento:** uma linha de recebimento pode referenciar um compromisso do mesmo tenant, unidade, local e insumo. A quantidade conferida reduz o restante e aumenta saldo/ledger dentro da mesma transação. Recebimento parcial é permitido, mas não pode exceder o saldo aberto. Repetição idempotente não pode duplicar o movimento nem a redução.
- **Entitlement:** novos compromissos exigem `shopping_premium`. Compromissos já confirmados continuam recebíveis por `inventory_core` se Premium for cancelado.
- **Consequências:** listas não reservam estoque nem alteram ledger; compromissos e recebimentos mantêm histórico auditável. Sugestões podem permanecer maiores que a necessidade se uma compra tiver sido cancelada, o que é intencional e exige uma nova confirmação do dono.
- **Limites:** não cria pedido completo, contas a pagar, pagamentos ou integração com fornecedores. Aplicação de migration/testes remotos requer aprovação específica do alvo.
