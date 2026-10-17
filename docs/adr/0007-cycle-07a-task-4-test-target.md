# ADR-0007 — Alvo de validação transacional da Tarefa 4 do Ciclo 07A

**Status:** Proposta pendente de revisão humana. Nenhum acesso ao banco decorre deste documento enquanto pendente.

## Contexto

A confirmação da Tarefa 4 foi implementada em `e20b634`. Os testes em memória cobrem a composição simulada, mas a revisão independente apontou que eles não comprovam locking de PostgreSQL, execução real do ledger nem rollback SQL. Não há runtime PostgreSQL descartável local nesta máquina.

O registro C07-DEV autoriza testes com fixtures sintéticas do Ciclo 07A no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`, mas o plano existente delimitava explicitamente a integração remota à Tarefa 2. O usuário autorizou preparar uma revisão do plano para definir um alvo isolado e com guardas explícitas.

## Decisão proposta

Reaproveitar exclusivamente o mesmo C07-DEV para a prova da Tarefa 4, sem nova migration, reset, alteração de schema, produção, legado, deploy ou serviço pago. Toda conexão usaria somente `tests/helpers/cycle07-local-db.ts`, depois de opt-in explícito e validação fail-closed de projectRef, URL, hostname, database, usuário, TLS e localização externa das credenciais. As migrations T2 seriam verificadas por leitura; ausência/drift aborta a execução.

Os testes usam apenas atores/unidades/organizações sintéticos A/B, operações reais e chaves exclusivas de execução. Movimentos são atômicos e ledger/auditoria append-only: não podem ser apagados nem editados como cleanup. Se o cenário concorrente exigir efeitos permanentes não delimitados ou cleanup não demonstrável, ele não deve executar até nova revisão humana.

## Consequências

- Evidência poderá cobrir comportamento real de PostgreSQL no ambiente DEV, sem alegar validação de produção ou de banco local vazio.
- A autorização continua restrita ao projectRef C07-DEV; nenhuma configuração alternativa será aceita.
- Teste, cleanup e eventual resíduo sintético devem constar em `docs/evidence/ciclo-07a-task-4.md`; segredos nunca entram em logs.
- Até aprovação humana desta ADR e da seção Tarefa 4R do plano, nenhuma conexão remota ou teste novo será executado.

## Referências

- `docs/DECISIONS.md` — decisão C07-DEV.
- `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md` — emenda proposta na seção Segurança, privacidade e precisão.
- `docs/superpowers/plans/2026-10-16-ai-text-in-app.md` — Tarefa 4R.
- `docs/evidence/ciclo-07a-task-4.md` — limites da revisão anterior.
