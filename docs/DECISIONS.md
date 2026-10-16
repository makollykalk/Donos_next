# Decisões do projeto DONOS Next

Atualizado em 2026-10-16. DEC-001 a DEC-013 permanecem conforme a V3. Este documento registra decisões operacionais aprovadas e pendências que afetam o trabalho atual; o histórico funcional continua em `docs/05-REGISTRO-DE-DECISOES.md` e ADRs.

## Decisões operacionais aprovadas

| ID | Decisão | Aprovação | Registro |
|---|---|---|---|
| IMP-015 | Uma contagem aberta por local; bloqueia movimentos dos itens contados até fechar ou cancelar. | Fundador, Ciclo 04 | `docs/superpowers/specs/2026-10-15-stock-locations-audit-design.md` |
| C04-LOC | Criar locais físicos reais agora e particionar saldos, ledger, recebimentos, estornos, histórico de compra e custo corrente por local. | Fundador, Ciclo 04 | Spec do Ciclo 04 |
| C04-VAL | Divergência positiva sem custo médio (saldo teórico zero) exige valor total informado e confirmação explícita do dono; não inferir custo. | Fundador, Ciclo 04 | Spec do Ciclo 04 |
| C04-DEV | Autorizar migrations e testes no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`; produção e legado permanecem proibidos. | Fundador, 2026-10-16 | Plano TDD do Ciclo 04 |
| C06-COMMITMENT | Somente compras explicitamente confirmadas pelo dono contam como compromisso pendente; recebimentos parciais vinculados reduzem compromisso e aumentam estoque atomicamente. | Fundador, 2026-10-16 | [ADR-0005](adr/0005-shopping-commitments.md), spec do Ciclo 06 |
| C06-DEV | Autorizar exclusivamente testes e migrations aditivas no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`; produção, legado e deploy continuam proibidos. | Fundador, 2026-10-16 | Aprovação explícita na sessão do Ciclo 06 |

## Pendências relevantes

- Reprodução das migrations desde banco descartável local/CI, sem Docker/Podman disponível neste ambiente. Não usar reset do DEV para simular essa prova.
- A autorização do Ciclo 06 limita migrations/testes remotos ao Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`; a autorização C04-DEV não se estende além desse projeto DEV.
- Antes de piloto ou deploy, resolver IMP-005, IMP-006, IMP-007, IMP-008, IMP-009 e IMP-018 no registro de decisões pendentes.
- IMP-014 foi tratada no Ciclo 03 conforme evidências; confirmar/arquivar status no próximo saneamento do registro.

## Limites

Nenhuma decisão acima autoriza alteração em legado, produção, domínios, Vercel antigo, cobrança real, WhatsApp ou integrações pagas.
