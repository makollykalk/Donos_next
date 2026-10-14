# Ciclo 06 — Listas de compras Premium do App 01

Ler V3, T-09/T-19 e domínio Estoque. Escrever spec e plano com origem do saldo, alvo/mínimo, estoques/recebimentos pendentes, múltiplos de embalagem, fornecedor sugerido e exportação. Solicitar revisão antes de implementar.

Implementar alertas de estoque crítico básicos disponíveis a todos que contratam `inventory_core`; **somente com `shopping_premium`** permitir geração/edição/exportação de lista sugerida. Lista é rascunho; não altera estoque. Recebimento gera entrada só após conferência. Corrigir cálculo e testes para recebimentos pendentes válidos, unidades e múltiplos.

Bloquear endpoint Premium sem entitlement (não basta ocultar botão), não apagar listas históricas após cancelamento, respeitar organização/unidade. Agentes de UX e engine/listas independentes após fixar contratos. Produzir evidências de teste e PR; encerrar ciclo.
