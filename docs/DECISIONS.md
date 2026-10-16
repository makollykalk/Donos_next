# Decisões do projeto DONOS Next

Atualizado em 2026-10-16. DEC-001 a DEC-013 permanecem conforme a V3. Este documento registra decisões operacionais aprovadas e pendências que afetam o trabalho atual; o histórico funcional continua em `docs/05-REGISTRO-DE-DECISOES.md` e ADRs.

## Decisões operacionais aprovadas

| ID | Decisão | Aprovação | Registro |
|---|---|---|---|
| IMP-015 | Uma contagem aberta por local; bloqueia movimentos dos itens contados até fechar ou cancelar. | Fundador, Ciclo 04 | `docs/superpowers/specs/2026-10-15-stock-locations-audit-design.md` |
| C04-LOC | Criar locais físicos reais agora e particionar saldos, ledger, recebimentos, estornos, histórico de compra e custo corrente por local. | Fundador, Ciclo 04 | Spec do Ciclo 04 |
| C04-VAL | Divergência positiva sem custo médio (saldo teórico zero) exige valor total informado e confirmação explícita do dono; não inferir custo. | Fundador, Ciclo 04 | Spec do Ciclo 04 |
| C04-DEV | Autorizar migrations e testes no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`; produção e legado permanecem proibidos. | Fundador, 2026-10-16 | Plano TDD do Ciclo 04 |
| C05-DEV | Autorizar testes de integração e migrations aditivas do Ciclo 05 somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`; proibidos reset, produção e legado. | Fundador, 2026-10-16 | Confirmação explícita nesta sessão; plano TDD do Ciclo 05 |
| IMP-016 | Receita de referência após descontos; taxas/tributos percentuais com base explícita; encargos fixos por venda; decomposição racional exata; impostos configurados pelo dono e sem inferência de regime. | Fundador, 2026-10-16 | [ADR 0004](adr/0004-pricing-incidence-and-combos.md); não autoriza interpretação fiscal automática. |
| IMP-017 | Combos substituem somente caminhos selecionados de embalagem; custos restantes permanecem; embalagem exclusiva soma uma vez; taxa de canal aplica-se uma vez por venda de combo. | Fundador, 2026-10-16 | [ADR 0004](adr/0004-pricing-incidence-and-combos.md) |
| C05-RECIPE | Produto aponta para a ficha atual; cada simulação exige local e usa a versão corrente validada, guardando versão/local/data/componentes no snapshot imutável. | Fundador, 2026-10-16 | [ADR 0004](adr/0004-pricing-incidence-and-combos.md) |

## Pendências relevantes

- Reprodução das migrations desde banco descartável local/CI, sem Docker/Podman disponível neste ambiente. Não usar reset do DEV para simular essa prova.
- Ciclo 05: ADR 0004 e regras IMP-016/017 foram aprovadas pelo fundador. Integração/migrations autorizadas apenas para o DEV `kfthwjrvgslnsjigqnyc`; revisar migrations pendentes e aplicar somente migrations aditivas do Ciclo 05 com referência explícita. Não usar reset.
- Antes de piloto ou deploy, resolver IMP-005, IMP-006, IMP-007, IMP-008, IMP-009 e IMP-018 no registro de decisões pendentes.
- IMP-014 foi tratada no Ciclo 03 conforme evidências; confirmar/arquivar status no próximo saneamento do registro.

## Limites

Nenhuma decisão acima autoriza alteração em legado, produção, domínios, Vercel antigo, cobrança real, WhatsApp ou integrações pagas.
