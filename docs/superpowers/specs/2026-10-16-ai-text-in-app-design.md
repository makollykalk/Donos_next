# Ciclo 07A — Proposta de estoque por texto dentro do App 01

**Data:** 2026-10-16
**Status:** spec e retenção aprovadas pelo fundador em 2026-10-16; Tarefa 1 concluída e revisada; Tarefa 2 autorizada no alvo C07-DEV em 2026-10-16.
**Aprovação de design em conversa:** fluxo responsivo com texto, interpretação, revisão e confirmação explícita.
**Base:** DONOS Next V3 (DEC-003, DEC-010, DEC-011, DEC-012 e DEC-013), critérios T-05/T-20/T-21/T-22, `prompts/07-IA.md` e PR #6 merged no commit `d8a9f51`.

## Intenção e resultado

Permitir que o proprietário descreva uma única operação de estoque em português no App 01 e receba uma proposta estruturada para revisar. O sistema só cria recebimento ou baixa depois que o dono corrige os dados necessários e confirma explicitamente. A primeira entrega usa um extrator determinístico local apenas em desenvolvimento/testes; não chama provedor externo, não usa credenciais de modelo e não envia dados para fora do app. Em produção, o recurso de interpretação fica indisponível até haver provedor autorizado e configurado em subplano próprio; o fluxo manual segue ativo.

O primeiro fluxo cobre uma ação e um insumo por proposta: recebimento ou baixa. Texto que contenha mais de uma ação/insumo, ou não permita distinguir os dados essenciais, permanece em revisão e não pode ser confirmado até o dono simplificar ou corrigir os campos.

Exemplo de aceite: “Comprei 5 kg de muçarela por R$ 190” produz proposta de recebimento para 5 kg, com preço normalizado de R$ 38/kg. Insumo e fornecedor devem ser resolvidos/selecionados pelo dono no contexto atual; a frase não informa fornecedor e o app não inventa um.

## Limites

- Apenas o App 01 e texto digitado dentro do app.
- Proprietário autenticado; sem perfil de funcionário.
- Um movimento e um insumo por proposta nesta etapa.
- A proposta pode ser corrigida antes da confirmação; a confirmação precisa mostrar ação, insumo, quantidade/unidade, preço ou motivo da baixa, fornecedor quando recebimento, unidade e local.
- Uso do mock determinístico somente em desenvolvimento/testes com dados sintéticos. Nenhuma chamada paga/remota neste subciclo; a produção não apresenta o mock como uma IA funcional.
- Foto, voz, WhatsApp, OCR, pagamentos, integração externa de modelo e deploy ficam fora. Cada um exige subplano e autorização próprios.
- Fluxos manuais existentes continuam disponíveis sem IA, entitlement ou franquia.

## Experiência do proprietário

Uma área “Registrar por texto” fica junto às operações de recebimento/baixa. A unidade e o local selecionados permanecem visíveis. A área apresenta quatro estados:

1. **Texto:** campo acessível com limite explícito de 2.000 caracteres, contexto atual, ação “Gerar proposta” e alternativa “Usar formulário manual”.
2. **Interpretando:** resposta imediata de estado, texto original preservado, `aria-busy` e sem afirmar que estoque mudou.
3. **Revisão:** texto original e campos estruturados editáveis. Exibir cálculo determinístico e unidades em linguagem direta (ex.: “R$ 190 no total ÷ 5 kg = R$ 38/kg”). Ambiguidades e campos faltantes são descritos junto ao campo e não dependem de cor ou confiança do modelo.
4. **Resultado:** após confirmação aceita, informar o movimento efetivado e oferecer acesso ao extrato. Erro ou timeout preserva a proposta e informa como consultar/retomar sem criar duplicata.

Usar rótulos específicos, como “Gerar proposta” e “Confirmar entrada de 5 kg”. Nunca apresentar o estado “interpretado” como “registrado”. Evitar modal obrigatório no caminho comum; se um painel/modal for necessário, oferecer foco inicial, navegação por teclado, fechamento acessível e retorno do foco. Feedback não pode bloquear edição nem navegação. Respeitar `prefers-reduced-motion`; sem slides ou springs necessários ao MVP, e qualquer transição é curta, opcional e não bloqueante.

Se organização, unidade ou local mudar enquanto a interpretação ou revisão estiver aberta, invalidar respostas atrasadas e desabilitar a confirmação da proposta antiga. Informar “Contexto alterado; gere uma nova proposta”; não mover nem confirmar a proposta no novo contexto.

## Regras funcionais

### Entrada e proposta

- Limpar espaços externos, rejeitar texto vazio e limitar entrada a 2.000 caracteres antes de qualquer processamento.
- Resolver ator e contexto a partir da sessão e seleção verificada; IDs enviados no texto/modelo não definem tenant, unidade, local ou autorização.
- Reservar entitlement/franquia no backend antes da extração. O mock implementa a mesma interface estreita de um futuro extrator, mas não realiza rede nem custo externo; em testes/dev usa fixtures de entitlement e franquia. O medidor representa uma unidade por tentativa despachada; resultado determinístico inválido continua sendo uma tentativa consumida no cenário simulado. Erro antes do dispatch libera a reserva; resultado incerto não é despachado novamente automaticamente.
- O extrator retorna somente campos candidatos validados por schema estrito: ação (`receipt` ou `issue`), descrição do insumo, quantidade decimal como string, unidade candidata, preço total/unidade ou motivo de baixa, campos ausentes e explicação de ambiguidade. Não produz tenant IDs, queries SQL, autorização ou comando executável.
- Validar deterministicamente e resolver o insumo somente entre os insumos ativos do contexto. Correspondência ambígua, unidade incompatível, quantidade/preço ausente, mais de uma ação/item ou interpretação inválida exige edição/desambiguação; proposta incompleta não pode ser confirmada.
- No recebimento, calcular preço unitário efetivo com aritmética decimal exata. Se o texto informa preço total, dividir pelo valor da quantidade normalizada segundo a precisão canônica; persistir strings decimais e usar as regras atuais de compra/estoque.
- A seleção de fornecedor é explícita. A V3 e o contrato atual de recebimento exigem fornecedor; não criar fornecedor fictício nem escolher fornecedor por inferência do texto.
- Na baixa, exigir quantidade, insumo e motivo explícito/corrigido. Não assumir silenciosamente “consumo” ou “perda”.
- Guardar estado durável estruturado da proposta para que o dono possa revisar, corrigir, confirmar ou descartar. O texto bruto permanece apenas no estado do formulário no cliente; não é persistido nem registrado em logs. Repetir a mesma requisição idempotente retorna a mesma proposta; chave igual com conteúdo/contexto diferente retorna conflito.

### Confirmação e movimento

- Confirmar é uma ação separada, autenticada e explícita. Exigir entitlement de `inventory_core`, entitlement/franquia de IA aplicável, titularidade e contexto atuais.
- Conferir status/versão da proposta sob lock. Uma proposta confirmada ou descartada não pode ser confirmada novamente; double-submit e chamadas concorrentes produzem o resultado original e no máximo um movimento.
- Criar o recebimento e efetivá-lo ou registrar a baixa, salvar status/resultado/auditoria da proposta no mesmo `withRestaurantTx`. Compor funções de domínio que aceitam o mesmo `Tx`; não chamar `InventoryService` transacionalmente separado.
- Recebimento requer item, unidade, quantidade, preço unitário, fornecedor e local válidos. Exigir `receivedConfirmed: true` apenas na confirmação final do dono. Baixa usa o comando existente e nunca aceita saldo negativo.
- Falha entre proposta, movimento, saldo, ledger, histórico de preço, uso e auditoria reverte toda a confirmação. O ledger de estoque permanece imutável e qualquer correção posterior usa o fluxo de estorno existente.
- A chave de idempotência da confirmação é independente da geração e vinculada à organização/unidade/proposta/versão/entrada normalizada. Não repetir um efeito externo dentro de `retryIdempotent`.

### Uso, cancelamento e falhas

- Reusar `reserveUsage`, `markUsageDispatched`, `settleUsage`, `releaseUsage` e `markUsageUnknown`; reservar e despachar em transações curtas, fazer extração fora da transação e persistir o resultado em seguida.
- Revalidar entitlement ao despachar e ao confirmar. Sem entitlement/cota, negar antes de executar extrator e sem criar movimento. Cancelamento após extração bloqueia nova geração e confirmação, mas preserva a proposta histórica para leitura pelo dono; não liquidar uso duas vezes.
- Timeout após dispatch registra estado pendente de reconciliação, preserva reserva e proposta recuperável e não chama o extrator novamente automaticamente. Mock determinístico permite reproduzir estados de falha sem serviço externo.
- Falha de extração antes de qualquer dispatch libera a reserva. Falha/timeout após dispatch não presume que nada aconteceu.
- Erros exibidos à UI distinguem entitlement/franquia, validação, ambiguidade, contexto alterado, indisponibilidade e conflito de idempotência; não expor stack trace, prompt interno ou dados de outro tenant.

## Arquitetura e fronteiras propostas

- **Contratos:** schema estrito e DTO para criar/ler/editar/descartar/confirmar proposta; strings decimais e estado explícito. A porta de extração recebe apenas texto sanitizado e limite de saída e retorna candidatos estruturados.
- **Domínio IA:** validador puro e extrator determinístico; sem conexão SQL, credenciais privilegiadas, acesso direto a tabelas ou chamadas externas.
- **API/serviço:** autenticação e contexto verificados conforme o inventário; entitlement e franquia via billing; operações de proposta/uso curtas e confirmação transacional.
- **Persistência:** tabela proposta tenant/unit scoped, RLS ENABLE+FORCE, FKs compostas e políticas de titularidade; auditoria registra ator, ação, confirmação e movimento resultante. Guardar versão/estado e hash de requisição para idempotência, sem hash simples do texto de origem. Nenhum raw text vai para logs.
- **Integração de estoque:** reutilizar `draftReceipt(ctx,input,tx)`/`receiveReceipt(ctx,id,key,tx)` e a operação de baixa de domínio dentro da transação da proposta. Validar fornecedor, insumo, unidade e local novamente no commit.
- **UI:** `apps/estoque/src/ai/**` e integração contida em `InventoryWorkspace.tsx`; cliente vincula geração e confirmação a uma geração do contexto e descarta respostas antigas.
- **Visual:** nenhum novo pacote obrigatório previsto. Usar HTML semântico, estilos locais, tipografia do sistema, foco visível, contraste e alvos apropriados para toque. Movimento segue a preferência de redução de movimento do sistema.

### Referências confirmadas no código

- Contexto/API: `apps/api/src/routes/inventory.ts`, `packages/db/src/transaction.ts` e `apps/api/src/auth/verify-actor.ts`.
- Compras e confirmação: `packages/domain-purchases/src/receipts.ts`, `packages/contracts/src/inventory-schemas.ts` e `apps/api/src/services/inventory.ts`.
- Uso: `packages/domain-billing/src/usage.ts` e `packages/domain-billing/src/entitlements.ts`.
- UI: `apps/estoque/src/inventory/InventoryWorkspace.tsx`, `ReceiptForm.tsx`, `ReceiptsView.tsx`, `IssueForm.tsx` e `inventory-client.ts`.
- Testes reutilizáveis como referência: `tests/integration/inventory-idempotency.test.ts`, `usage-concurrency.test.ts`, `usage-edge-cases.test.ts`, `usage-transitions.test.ts` e `auth-context.test.ts`.

## Segurança, privacidade e precisão

- `organization_id` é fronteira primária; `restaurant_id` e local devem pertencer ao tenant ativo. API valida titularidade e RLS protege propostas e filhos. Testar ID forjado e acesso cruzado entre duas organizações.
- O texto do usuário é dado não confiável, inclusive para prompt injection. O extrator não pode emitir comandos; parser/validador determinístico limita campos, formato e tamanho. O mock inclui instrução adversarial para provar que conteúdo não altera política.
- Sem `service_role` no cliente, segredos no repositório/browser, acesso SQL do modelo ou envio remoto de texto, foto, áudio, WhatsApp ou Storage. Produção não serve o mock como extração real.
- Para a Tarefa 2, o fundador autorizou migrations aditivas e testes com dados sintéticos exclusivamente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc` (C07-DEV). Nenhuma outra migration remota está autorizada.
- **Emenda de validação T4 proposta, pendente de revisão humana:** reaproveitar o mesmo C07-DEV somente para testes transacionais com fixtures sintéticas, sem migration/reset, usando exclusivamente `tests/helpers/cycle07-local-db.ts` após opt-in e guardas de projectRef, URL, hostname, usuário/database e TLS. Não usar `.local/dev.json` nem `tests/helpers/local-db.ts`. Toda escrita deve ser identificável como fixture de teste; rollback/compensação não pode apagar ledger ou auditoria append-only. Se o teste concorrente exigir efeito persistente que não possa ser isolado e compensado com segurança, abortar antes de executar e retornar o impacto concreto para nova revisão humana. Até aprovação desta emenda, nenhum teste T4 remoto está autorizado por este documento.
- Quantidades e dinheiro críticos usam decimal, razão exata ou unidade-base; nenhum `number` binário em cálculo monetário/quantitativo.
- Propostas e respostas originais não entram em logs. O fundador aprovou retenção estruturada por 30 dias após estado terminal; propostas abertas expiram 30 dias após criação. `reconciliation_required` é exceção operacional: permanece acessível e não é apagada automaticamente até confirmação ou descarte pelo dono; após a resolução começa a retenção terminal de 30 dias. Se nunca for resolvida, seus dados estruturados podem permanecer indefinidamente, exigindo acompanhamento operacional e revisão periódica do estado. O texto bruto e hash simples dele não são persistidos. Um hash de requisição é usado para idempotência. Limpeza diária afeta apenas propostas expiradas fora dessa exceção; ledger e auditoria mantêm suas próprias retenções.

## Critérios de aceite

- O exemplo de 5 kg por R$ 190 gera proposta de 5 kg e R$ 38/kg, requer insumo, fornecedor/local apropriados e não altera estoque até confirmação.
- Proposta incompleta/ambígua, entrada inválida, valor total confundido com unitário, item semelhante e texto com prompt injection não efetivam operação sem correção e confirmação do dono.
- Requisição duplicada de proposta chama mock uma vez; chave reutilizada com entrada/contexto divergente conflita. Duas confirmações concorrentes geram no máximo um movimento e uso consistente.
- Confirmar entrada ou baixa altera proposta, ledger, saldo e auditoria numa transação única; falha injetada causa rollback completo.
- Entitlement cancelado/ausente, franquia esgotada, ator inválido, unidade/local divergente, proposta de outra organização, versão velha ou estado final não gera movimento nem vazamento.
- O formulário preserva texto e edição do dono após falha recuperável no cliente; mudança de contexto invalida revisão antiga; timeout após dispatch não repete chamada automaticamente.
- UI anuncia interpretação/erro/resultado, mantém formulário manual acessível e respeita teclado, foco, leitor de tela e `prefers-reduced-motion`.
- Nenhum teste é declarado aprovado sem execução observada; nenhum acesso remoto, migration, custo pago ou deploy ocorre neste subciclo sem gate explícito.

## Decisões aprovadas nesta revisão

Decisões aprovadas pelo fundador nesta conversa:

1. Reutilizar o entitlement/medidor `ai_text_whatsapp` no protótipo de texto dentro do app; isso não autoriza nem implementa WhatsApp.
2. Limitar cada proposta inicial a uma ação e um insumo; frases com múltiplos itens pedem divisão/correção manual.
3. Proposta estruturada retida por 30 dias após confirmação/descarte; propostas abertas expiram após 30 dias; `reconciliation_required` é exceção operacional até resolução e pode persistir indefinidamente caso não haja ação do dono, exigindo acompanhamento operacional e revisão periódica.

As decisões 1 e 2 estão registradas em ADR-0006. A política de retenção foi aprovada antes da Tarefa 1. O ADR proposto `docs/adr/0007-cycle-07a-task-4-test-target.md` registra a emenda de validação, pendente de revisão humana; até sua aprovação valem os limites anteriores de C07-DEV. As demais limitações desta spec permanecem.
