# Evidências — Ciclo 07A, Tarefa 2: persistência, RLS e retenção

Atualizado em 2026-10-16. Branch `codex/ciclo-07-ai-text`, worktree isolado. Escopo concluído: persistência privada de propostas estruturadas no App 01. Nenhuma alteração em legado, produção, deploy ou integração paga.

## Implementação

- Repository parametrizado com `RestaurantContext` e `Tx` em `packages/db/src/ai-proposal-repository.ts`.
- `core.ai_text_proposals` usa FKs compostas por tenant, unidade, local, reserva e resultado; resultado também preserva o local. JSONB limitado, versão otimista, estados controlados por trigger, sem texto bruto nem hash simples do texto de origem.
- RLS `ENABLE` + `FORCE`; policy requer organização, unidade, ator e titularidade; role `donos_api` tem SELECT e INSERT/UPDATE por coluna, sem DELETE/TRUNCATE ou `EXECUTE` na limpeza.
- Limpeza diária por `pg_cron` 1.6.4; `purge_expired_ai_text_proposals()` é `SECURITY INVOKER`, executada pelo job `postgres`. Retenção terminal de 30 dias; linhas `reconciliation_required` são exceção operacional até resolução e podem persistir indefinidamente se não houver ação do dono.
- Migrations aditivas aplicadas somente ao Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`: `20261016190345_cycle07_ai_text_proposals` e `20261016190427_cycle07_ai_proposal_reservation_fk_index`.

## Verificações observadas

- TDD: os dois testes de integração ficaram RED antes da migration porque schema/tabela não existiam. Depois da migration principal, o teste de schema ficou RED para o índice filho da FK de reserva; a migration corretiva adicionou esse índice.
- DEV: histórico confirmado após aplicação; executor `postgres` com `BYPASSRLS`; `pg_cron` 1.6.4 instalado; RLS forçado; um job diário ativo sob `postgres`; função de limpeza não é `SECURITY DEFINER`.
- `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/ai-proposal-schema.test.ts tests/integration/ai-text-tenant-security.test.ts`: 2 testes aprovados. Cobrem grants/FKs/schema, isolamento A/B, isolamento A1/A2, escrita com ator forjado, atualização/versionamento e ciclo terminal.
- Teste sintético direto do purge no DEV: uma proposta terminal expirada foi removida; uma `reconciliation_required` expirada foi preservada. O bloco de verificação removeu também a fixture preservada e as duas reservas sintéticas; assertion failure teria revertido o bloco.
- Após fixtures, `core.ai_text_proposals` ficou com 0 linhas.
- `pnpm test:unit`: 24 arquivos, 178 testes aprovados.
- `pnpm exec vitest run tests/unit/cycle07-database-target.test.ts`: 5/5.
- `pnpm typecheck`, `pnpm exec tsc --noEmit --pretty false -p tsconfig.tests.json` e `git diff --check`: aprovados.
- Revisão independente estática de schema/RLS/testes: sem bloqueadores. Supabase performance advisor deixou de apontar FK sem índice nesta tabela após a migration corretiva. Advisor global ainda reporta FKs sem índice em outras tabelas e índices ainda não usados; fora do escopo.

## Limitações e próximos passos

- Node usado foi 24.19.0, abaixo do engine `>=24.22.0 <25`; comandos concluíram com aviso.
- Sem Docker/Podman/DB local descartável, o replay integral de migrations desde banco vazio não foi validado.
- Testes verificam constraints compostas de local por metadata, mas não tentam ligar comportamentalmente um resultado de outro local. O teste de purge foi uma verificação sintética one-off no alvo autorizado; execução futura do cron diário não foi aguardada.
- Tarefa 2 concluída. Próximo passo é a Tarefa 3: gate de entitlement/franquia, serviço de proposta e rotas; não foi iniciada nesta entrega.
