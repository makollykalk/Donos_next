# Ciclo 07A — evidência da Tarefa 4

**Estado:** implementação commitada; gate de revisão pendente de prova com PostgreSQL real.

## Implementação

O commit `e20b634` adiciona `confirmProposal` e `POST .../proposals/:proposalId/confirm`. A confirmação valida `confirmed: true`, entitlement, ator, tenant/unidade, versão/estado, local, insumo e fornecedor; então executa recebimento ou baixa, liquida uso, grava auditoria e terminaliza a proposta no mesmo `Tx`. Não foi criada migration.

## Testes executados nesta sessão

- `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/ai-text-api.test.ts tests/integration/ai-text-concurrency.test.ts` — 2 arquivos, 17 testes aprovados.
- `pnpm test:unit` — 24 arquivos, 178 testes aprovados. O comando informou runtime Node 24.19.0, abaixo do engine `>=24.22.0 <25`.
- `pnpm typecheck` — aprovado.
- `git diff --check` — aprovado.

O executável `node` resolvido diretamente nesta sessão reporta v24.15.0, enquanto o diagnóstico de engine emitido por pnpm reporta v24.19.0. Ambos estão abaixo da faixa suportada; reproduzir os gates no Node requerido.

## Revisão independente e limites

A revisão estática recomendou NEEDS FIXES no gate de prova, sem apontar defeito evidente no caminho de confirmação. O teste em `tests/integration/ai-text-concurrency.test.ts` usa fila JavaScript, snapshot/restore em memória e doubles para `settleUsage`, `draftReceipt`, `receiveReceipt` e `issueStock`. Assim, ele cobre a composição modelada do serviço, mas não prova locking, rollback SQL, RLS, ledger, custo médio ou execução real das operações de domínio no PostgreSQL.

Nenhum banco, helper `.local/dev.json` / `tests/helpers/local-db.ts`, Supabase DEV, rede, migration, produção, legado, provedor pago, WhatsApp ou deploy foi usado nesta tarefa. Não avançar à Tarefa 5 até validar os critérios transacionais em banco descartável ou revisar formalmente o plano com aprovação humana.
