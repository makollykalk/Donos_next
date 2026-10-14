# Roadmap executável por ciclos independentes

**Regra:** não paralelizar etapas que compartilham modelos/transações; coordenador congela contratos antes da implementação de fronteiras. Começar sempre com o Prompt 00, depois executar somente um Prompt de ciclo por vez.

| Ciclo | Entrega comprovável | Dependências | Plano gerado pelo Codex |
|---|---|---|---|
| 00 | Diagnóstico read-only do DONOS + ADR da stack + backlog priorizado | V3 | `docs/superpowers/plans/*-fundacao.md` |
| 01 | Monorepo, portal, autenticação do dono, tenants/unidades, RLS e entitlements simulados | 00 | Core |
| 02 | Insumos, entradas/saídas, ledger, compras recebidas, histórico e custo médio transacional | 01 | Inventory |
| 03 | Fichas técnicas, medições reais, rendimento e pré-preparo | 02 | Recipes |
| 04 | Inventário guiado, divergências e relatório imprimível | 02 | Audit |
| 05 | App 02 isolado + integrado, produtos/combos, metas de CMV e contribuição, canais | 01 + 03 | Pricing |
| 06 | App 01 Premium de reposição/compra, gate de entitlement e exportações | 02 | Shopping |
| 07 | IA por texto dentro do app; depois foto, voz e WhatsApp oficial em subetapas | 02 + 01 | AI |
| 08 | Piloto real, integrações de cobrança aprovadas, observabilidade e hardening | anteriores | Pilot |

## Ordem e coordenação
- 00-03 em sequência para estabilizar infraestrutura e fonte de custo.
- Após 03, subagentes podem trabalhar em **análises** independentes de auditoria e precificação; código pode correr em branches separadas só depois de contratos estabilizados.
- 07 deve começar com extração por texto dentro do app; mídia/WhatsApp entram como histórias adicionais com mocks antes de integrações pagas.
- Nenhum ciclo implementa PDV, financeiro, colaboradores, impostos fiscais automáticos nem CRM.

## Contrato de execução de cada ciclo
1. `git status` e revisão do último relatório.
2. Ler V3 e critério de aceite do ciclo.
3. Agentes exploradores independentes analisam riscos/alternativas em leitura.
4. Coordenador escreve spec + plano granular com arquivos, interfaces e testes; apresenta ao dono para aprovação.
5. Implementador trabalha em branch/worktree isolada com TDD. Agentes de backend e frontend só paralelizam depois de contratos estabelecidos e pastas distintas.
6. Revisor verifica mudanças e testes; coordenador executa suíte integrada, corrige defeitos, cria PR e entrega relatório.
7. Só avançar após critério de saída demonstrado; se houver bloqueio de acesso ou credenciais, informar sem contornar segurança.
