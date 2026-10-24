# Ciclo 07A — evidência da Tarefa 5

**Data:** 2026-10-23
**Branch/base observada:** `codex/ciclo-07-ai-text`, base `fa02ed9`
**Escopo:** interface de propostas por texto no App 01, montagem no workspace de estoque e testes E2E sintéticos. A autorização humana para iniciar a tarefa foi dada pelo usuário em 2026-10-23, depois da T4R.

## Implementação

- A área de estoque por texto mantém o texto somente em memória, apresenta uma proposta para revisão, exige salvar a revisão e confirmação explícita para movimentar estoque.
- Entradas exigem fornecedor ativo; unidades padrão são validadas contra a unidade-base do insumo. Quantidades e preços continuam strings decimais; os valores/total vêm da proposta do servidor.
- Timeout de confirmação congela corpo, versão e chave idempotente; a UI consulta o estado antes de permitir replay. Timeout de PATCH congela revisão e chave, consulta GET e só permite replay da mesma requisição; a confirmação permanece bloqueada até uma resposta PATCH aceita.
- Respostas são validadas contra organização, unidade e local selecionados. Troca de local remonta o componente, limpa a proposta em curso e ignora respostas atrasadas.
- Fallback manual acessível foca os formulários existentes; fica desabilitado enquanto o resultado de confirmação está incerto. O CSS oferece foco visível, layout responsivo e redução de movimento.
- Harness E2E usa sessão e fixtures sintéticas, mocka Auth/API por interceptação e bloqueia destinos externos. Não importa `owner-fixture.ts`, não lê `.local` e não inicia serviço API.

## Verificações executadas

Runtime usado para esta reprodução: Node `v24.22.0` portátil (`>=24.22.0 <25`, conforme engine do projeto).

- TDD RED: região “Estoque por texto” ausente antes de implementar a UI; adicionalmente foram observados REDs para PATCH com resposta perdida, proposta com organização/unidade estrangeira e fallback durante confirmação incerta.
- `pnpm exec playwright test tests/e2e/ai-text-flow.spec.ts`: **8/8 passaram** em 12,7s nesta reprodução. O harness cobriu PATCH salvo com resposta perdida e replay idempotente, IDs de organização/unidade incompatíveis, entrada com fornecedor e confirmação explícita, quota/fallback manual, confirmação incerta com GET e mesmo payload/chave, troca de local durante geração e teclado/redução de movimento.
- `pnpm typecheck`: passou (`tsc -b` e `tsc -p tsconfig.tests.json --noEmit`).
- `pnpm --filter @donos/estoque build`: passou; Vite transformou 207 módulos e gerou o bundle do App 01.
- `git diff --check`: passou.
- Revisão independente somente leitura: **PASS**, sem novos achados após a correção do PATCH incerto.

## Limites

- Os E2Es são sintéticos e não provam RLS/PostgreSQL, integração com Supabase Auth real, entitlement real ou comportamento do provedor de IA.
- Não foi executada a suíte completa, lint nem integração nesta tarefa. Casos de baixa (issue), troca org/unidade durante requisição, recuperação terminal após reload e revogação de entitlement durante confirmação seguem sem cobertura E2E específica.
- Build emite o aviso do Vite de que o chunk JS principal excede 500 kB minificado; o build concluiu com exit 0.
- Nenhum banco, Auth, API real, provedor, serviço pago, WhatsApp, legado, produção ou deploy foi acessado/modificado.
- A Tarefa 6 permanece pendente e não foi iniciada.
