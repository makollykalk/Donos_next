# ADR-0007 — Alvo de validação transacional da Tarefa 4 do Ciclo 07A

**Status:** Aprovada pelo fundador em 2026-10-16 para validação estritamente delimitada no C07-DEV. Não autoriza migrations, reset, produção, legado, deploy ou integrações pagas.

## Contexto

A confirmação da Tarefa 4 foi implementada em `e20b634`. Os testes em memória cobrem a composição simulada, mas a revisão independente apontou que eles não comprovam locking de PostgreSQL, execução real do ledger nem rollback SQL. Não há runtime PostgreSQL descartável local nesta máquina.

O registro C07-DEV autoriza testes com fixtures sintéticas do Ciclo 07A no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`, mas o plano existente delimitava explicitamente a integração remota à Tarefa 2. O usuário autorizou preparar uma revisão do plano para definir um alvo isolado e com guardas explícitas.

## Decisão proposta

Reaproveitar exclusivamente o mesmo C07-DEV para a prova da Tarefa 4, sem nova migration, reset, alteração de schema, produção, legado, deploy ou serviço pago. Toda conexão usaria somente `tests/helpers/cycle07-local-db.ts`, depois de opt-in explícito e validação fail-closed de projectRef, URL, hostname, database, usuário, TLS e localização externa das credenciais. As migrations T2 seriam verificadas por leitura; ausência/drift aborta a execução.

Os testes usam apenas os atores/unidades/organizações sintéticos A/B já existentes, operações reais e um UUID exclusivo por execução. Uma execução bem-sucedida deixa resíduos sintéticos permanentes e identificáveis; isso é aceito por esta aprovação e não será tratado como cleanup. O inventário esperado inclui:

- setup: `core.ingredients`/`core.suppliers` com nome contendo o UUID, `core.usage_reservations`, eventos `reserve` em `core.usage_ledger` e `core.ai_text_proposals` com `operation_key` do run;
- confirmação concorrente vencedora: um `core.purchase_receipts` e seus itens, um `core.stock_movements`, uma linha em `core.purchase_price_history`, eventos de settle em `core.usage_ledger`, `core.audit_events` e registros de idempotência ligados por chaves/IDs do run;
- proposta da tentativa de rollback: proposta/reserva/setup igualmente marcados pelo run; a transação de confirmação que falha não pode deixar recibo, movimento, histórico, settle, auditoria nem terminalização;
- cenário de baixa sem saldo: apenas registros de setup/proposta/reserva identificados; nenhum movimento de estoque.

Detalhamento observável do setup necessário para esta prova: o run gera um manifesto de UUID/chaves antes do primeiro efeito e registra cada ID logo após cada operação confirmada. Os dois `selectContext` deixam um `request_contexts` e um `context.selected` por tenant A/B. Cada um dos quatro insumos cria um saldo inicial zero em todos os locais ativos da unidade A, além da auditoria e idempotência de `inventory.ingredient.create`; os três fornecedores criados deixam auditoria e idempotência. Cada uma das quatro interpretações reais usa extractor sintético local, reserva, marca dispatch, liquida uma unidade no setup e grava proposta; cada revisão deixa uma idempotência. Portanto, o total delimitado inclui quatro reservas liquidadas, oito eventos reserve/settle e aumento de quatro unidades em `usage_buckets.settled_units`; repetir `settleUsage` ao confirmar é idempotente. A tentativa sem saldo, o rollback e a tentativa por B não acrescentam efeitos de confirmação. O vencedor acrescenta uma idempotência de confirmação e um recibo/itens, movimento, preço histórico e auditoria. O teste verifica a contagem final via segunda conexão, inclusive todos os saldos por local. Nenhum tenant C ou dado preexistente é usado.

Propostas terminais permanecem sujeitas à retenção já aprovada de 30 dias. Não apagar nem estornar ledger, auditoria ou movimento de teste como limpeza. Toda escrita deve ocorrer somente depois do preflight read-only, e todos os IDs/resultados serão registrados na evidência com o UUID, nunca com segredos. Abortar antes de escrever se o run não puder ser delimitado por UUID/chaves e confirmado por uma segunda conexão.

## Consequências

- Evidência poderá cobrir comportamento real de PostgreSQL no ambiente DEV, sem alegar validação de produção ou de banco local vazio.
- A autorização continua restrita ao projectRef C07-DEV; nenhuma configuração alternativa será aceita.
- Teste, cleanup e eventual resíduo sintético devem constar em `docs/evidence/ciclo-07a-task-4.md`; segredos nunca entram em logs.
- Antes de qualquer escrita, executar preflight dentro de transação `READ ONLY`, validar `current_database`, `current_user`, `session_user`, papel/alvo e fixtures sintéticas. Confirmar em leitura do control plane Supabase que o conjunto Cycle 07 contém exatamente as migrations aprovadas `20261016190345_cycle07_ai_text_proposals` e `20261016190427_cycle07_ai_proposal_reservation_fk_index`; o papel runtime `donos_api` não tem permissão para ler `supabase_migrations`, por isso essa parte é uma consulta de controle somente leitura, imediatamente anterior à prova. Registrar resultado sem segredos; qualquer divergência aborta.
- A corrida deve usar sessões PostgreSQL distintas comprovadas por `pg_backend_pid()`, barreira explícita e replay separado com a mesma chave; validar um único movimento/terminalização por consultas independentes.
- A validação resolve o diretório de credenciais e cada um dos três arquivos (`dev.json`, `fixtures.json`, CA), incluindo symlinks/junctions, antes de qualquer leitura e compara destinos reais com a worktree.
- A aprovação humana desta ADR e da seção Tarefa 4R foi recebida em 2026-10-16. Nenhum acesso remoto foi iniciado nesta aprovação; a execução ainda depende de o opt-in e a configuração externa C07-DEV estarem disponíveis.

## Referências

- `docs/DECISIONS.md` — decisão C07-DEV.
- `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md` — emenda proposta na seção Segurança, privacidade e precisão.
- `docs/superpowers/plans/2026-10-16-ai-text-in-app.md` — Tarefa 4R.
- `docs/evidence/ciclo-07a-task-4.md` — limites da revisão anterior.
