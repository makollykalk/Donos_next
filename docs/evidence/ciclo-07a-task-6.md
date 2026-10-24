# Evidência — Ciclo 07A, Tarefa 6

**Data:** 2026-10-23
**Branch:** `codex/ciclo-07-ai-text`
**Base do ciclo:** merge do Ciclo 06 `d8a9f51`
**Runtime:** Node portátil v24.22.0 (`>=24.22.0 <25`)

## Escopo executado

- Consolidação local do Ciclo 07A, auditoria estática independente e gates delimitados em memória/mock.
- Correção dos achados verificáveis: fornecedor congelado no momento da revisão; preço zero e preço unitário que arredondaria para zero não ficam prontos; total original é identificado como dado do texto e o total derivado da revisão usa `BigInt`, arredondamento half-even e 12 casas como o valor contabilizado.
- Nenhum acesso ao Supabase, Auth, `.local`, provedor de IA/WhatsApp, produção, legado ou deploy durante a Tarefa 6. A prova runtime T4R anterior foi preservada sem repetição.

## Verificações executadas

| Gate | Resultado |
|---|---|
| `pnpm test:unit` | 24 arquivos, 184/184 testes aprovados |
| Integrações sintéticas `ai-text-api.test.ts` + `ai-text-concurrency.test.ts` | 2 arquivos, 17/17 aprovados |
| E2E `ai-text-flow.spec.ts` com API/Auth interceptados e fixture sintética | 8/8 aprovados |
| `pnpm typecheck` | aprovado (`tsc -b` e `tsc -p tsconfig.tests.json --noEmit`) |
| `pnpm lint` | aprovado, sem warnings |
| Build direto Portal | aprovado |
| Build direto Estoque | aprovado; aviso de bundle acima de 500 kB |
| Build direto Precificação | aprovado |
| `git diff --check` | aprovado |

O primeiro E2E tentou usar o servidor Vite sem variáveis de ambiente sintéticas e mostrou “Configuração indisponível”; foi encerrado, reiniciado com URL/chave fictícias e executado novamente. O resultado válido é a execução posterior 8/8. Nenhuma chamada chegou a um serviço externo.

## Revisão e limites

- A revisão independente estática pós-correções passou para congelamento de fornecedor, correção de preço zero, cálculo/arredondamento de total e bloqueio de underflow. A inspeção inicial não encontrou bypass evidente nas policies RLS nem na validação de tenant; isso não substitui execução de RLS sob papel runtime. A Tarefa 6 não acessou banco. A prova T4R anterior, separada, foi 5/5 no C07-DEV como `donos_api` e está documentada em `ciclo-07a-task-4.md`.
- Não há recuperação automática persistente para uma interrupção abrupta depois do dispatch de uso e antes de terminar a extração. Esse estado não causa movimento duplicado, mas pode exigir reconciliação operacional. Resolver exige mecanismo de recuperação/worker e possivelmente alteração de persistência, fora do escopo desta tarefa; permanece risco conhecido antes de piloto.
- E2E é mockado. Os gates locais não validam PostgreSQL/RLS, Auth, provedor real, WhatsApp, implantação ou replay de migrations desde banco vazio.
- Não foi executada a suíte completa de integração/E2E por ela acessar configurações `.local` e serviços reais; também não foi executado `pnpm build` na raiz pelo caminho de configuração local.

## Resultado

Gates locais e revisão independente estática pós-correção aprovados. A separação/integração dos commits da T4R e T6 ainda deve ser concluída antes de abrir PR. Nenhum merge, deploy ou início de Foto/Voz/WhatsApp está autorizado por esta evidência.
