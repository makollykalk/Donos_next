# Ciclo 06 — Listas de compras Premium do App 01

**Status:** aprovada pelo fundador em 2026-10-16; implementação e testes autorizados no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`, apenas para testes e migration aditiva.

**Base:** DONOS Next V3 (DEC-001, DEC-002, DEC-008, DEC-010 a DEC-013), T-02, T-07, T-09, T-19, T-23 e T-24, `prompts/06-PREMIUM-COMPRAS.md`.

**Dependência funcional:** Ciclo 02 (estoque, unidades, conversões, recebimentos e histórico de preços). A branch de implementação deverá partir de uma base que já contenha o Ciclo 04 merged; o Ciclo 05 não é dependência deste ciclo.

**Limites operacionais:** desenvolvimento local e testes/migration aditiva exclusivamente no Supabase DONOS Next DEV autorizado. Sem reset, produção, legado, deploy, cobrança real, integração paga ou WhatsApp.

## Intenção

Dar ao proprietário do App 01 alertas simples de estoque crítico para qualquer organização com `inventory_core` e, com `shopping_premium`, listas sugeridas de reposição que ele pode editar, imprimir ou exportar. Uma lista é uma proposta comercial: não reserva nem movimenta estoque. Só um recebimento físico conferido pode criar movimento de entrada.

O resultado deve responder, por unidade e local: quais insumos atingiram o mínimo, quanto falta para o alvo após saldo e compromissos de compra confirmados, quais embalagens atendem a quantidade necessária, e qual fornecedor tem a compra recebida mais recente como referência. O dono mantém a palavra final sobre quantidade e fornecedor.

## Abordagens consideradas

1. **Domínio de reposição no pacote de compras, API central e UI do App 01 (recomendada).** Reutiliza unidades, locais, saldos, histórico de preço, tenant/contexto e gates existentes. Mantém a sugestão pura e testável, e centraliza autorização, persistência, compromissos e exportação no backend.
2. **Cálculo e persistência na UI.** Rejeitada: saldo/tenant/entitlement poderiam ser alterados no cliente; exportação e ações diretas não teriam o gate confiável.
3. **Usar todo recebimento `draft` como pendência.** Rejeitada: rascunho atual não confirma pedido; pode ser incompleto ou abandonado. Subtraí-lo silenciosamente pode esconder necessidade real e não representa uma compra autorizada.

## Escopo funcional

### Base `inventory_core`

- Configurar estoque mínimo e estoque-alvo por insumo, unidade operacional e local. Valores são não negativos, expressos na unidade-base do insumo; alvo precisa ser maior ou igual ao mínimo.
- Exibir alerta de item crítico quando o saldo disponível no local for menor ou igual ao mínimo. O alerta não exige `shopping_premium` e não cria lista automaticamente.
- Listar limites e alertas somente no contexto de organização/unidade/local validado no servidor. Item arquivado não gera alerta nem nova sugestão; limites e histórico anteriores permanecem consultáveis conforme as regras de retenção do catálogo.

### `shopping_premium`

- Gerar lista como rascunho para uma unidade e um local escolhidos, usando uma leitura consistente de saldo, limites, conversões e compromissos pendentes.
- Fórmula em unidade-base: `necessidade = max(0, alvo - saldo_atual - compromissos_confirmados_pendentes)`. Saldo abaixo do mínimo sinaliza criticidade; quantidade sugerida mira o alvo.
- Ingrediente sem alvo configurado não recebe sugestão quantitativa. Ingrediente sem saldo retorna zero como saldo, sem inferir disponibilidade positiva.
- Arredondar para o menor múltiplo inteiro da embalagem cadastrada que cubra a necessidade. Preservar no item a quantidade-base necessária, a quantidade-base coberta pela sugestão arredondada e a quantidade/unidade comercial sugerida. Não há mínimo de compra independente do tamanho da embalagem neste ciclo. Se conversão/embalagem estiver ausente, incompatível, ambígua ou desatualizada, não inventar conversão: usar unidade-base ou marcar o item como pendente de configuração.
- Agrupar por fornecedor sugerido, mantendo itens sem fornecedor em um grupo “Sem fornecedor”. A sugestão usa o fornecedor da compra recebida mais recente do insumo no mesmo local; exibe preço unitário normalizado e data como referência, sem afirmar que é o menor preço. Empates são resolvidos por data/hora de recebimento e, depois, ID estável. O dono pode trocar fornecedor, mover itens entre grupos, editar quantidade e remover itens.
- Salvar snapshot da sugestão inicial e alterações atuais para reprodução/histórico. Criar, editar, confirmar compromisso, exportar ou imprimir exige `shopping_premium` ativo no backend. Consultar listas históricas continua permitido ao dono após cancelamento, mas não permite edição, nova geração ou exportação.
- Exportar CSV e disponibilizar visualização de impressão do navegador (inclui “Salvar como PDF”). Não enviar por e-mail, WhatsApp ou serviço externo neste ciclo.
- Lista, alteração de item e confirmação de compra são auditáveis e idempotentes; retentativas da mesma chave não duplicam lista, compromisso ou eventos de estoque.

### Compromissos de compra pendentes

- **Decisão aprovada pelo fundador nesta sessão:** somente compromisso explicitamente confirmado pelo dono conta como quantidade pendente. Rascunhos de recebimento não contam. Recebimentos já efetivados não contam porque já estão no saldo.
- Confirmar pedido cria compromisso com organização, unidade, local, insumo, quantidade-base, quantidade comercial/unidade escolhida, fornecedor selecionado, item de lista de origem, autor e data. Confirmação congela a quantidade comprometida; para alterá-la, o dono cancela o saldo pendente e cria/atualiza outro compromisso. A operação exige entitlement.
- Recebimento pode referenciar compromisso confirmado. A quantidade fisicamente conferida reduz o pendente e aumenta o saldo na mesma transação. Recebimentos parciais são suportados: a quantidade recebida precisa ser positiva e não pode exceder o restante; o compromisso fica confirmado enquanto houver saldo e concluído em zero. Unidades/conversões são as do snapshot original do compromisso.
- Linha de recebimento sem vínculo não reduz um compromisso por coincidência de ingrediente/quantidade. Um vínculo de outro tenant, unidade, local ou ingrediente é rejeitado.
- Um recebimento revertido não reabre silenciosamente o compromisso histórico. O estorno reduz saldo; uma nova sugestão poderá revelar a necessidade novamente. O dono pode confirmar nova compra. Isso preserva a trilha sem reescrever o compromisso concluído.
- Compromisso confirmado continua recebível por `inventory_core` mesmo após cancelamento de `shopping_premium`, para não bloquear a entrada de mercadoria já pedida. Cancelamento do plano bloqueia novas confirmações, listas, alterações e exportações; não apaga listas nem compromissos existentes.

### Fluxo e dados históricos

1. O dono configura mínimos/alvos por unidade e local.
2. A tela Base mostra criticidade, sem sugestão Premium.
3. Com Premium, o dono gera e edita um rascunho, confere embalagem e fornecedor, e pode exportá-lo.
4. Ao efetivamente colocar um pedido, confirma os itens/quantidades desejados. O sistema grava compromissos que passam a reduzir novas sugestões.
5. Quando a mercadoria chega, o dono cria/seleciona recebimento, vincula cada linha ao compromisso aplicável, informa quantidade conferida e confirma. Movimento de estoque e redução do pendente são atômicos.
6. Listas, snapshots, compromissos, recebimentos e estornos preservam autor, datas e vínculos. Cancelamento de assinatura não exclui registros.

## Arquitetura e interfaces propostas

- Reusar contexto verificado `VerifiedActor`, `ContextSelection`, `X-Donos-Context`, `withRestaurantTx`, RLS e `requireEntitlement`. `organization_id` e `restaurant_id` nunca são confiados somente ao payload.
- Contratos versionados em `packages/contracts`: `StockThreshold`, `ShoppingSuggestion`, `ShoppingList`, `ShoppingListItem`, `ShoppingCommitment`, inputs de criação/edição/confirmar/exportar e consultas paginadas.
- Domínio puro `calculateReplenishment`: entrada com quantidades decimais canônicas de saldo, mínimo, alvo, compromissos, unidade-base e conversão de embalagem; saída com quantidade-base necessária/sugerida, quantidade comercial, criticidade e razão explícita quando não puder sugerir.
- Quantidades/dinheiro permanecem strings decimais/unidades inteiras ou razões exatas conforme os schemas de estoque. Não usar `number` binário em cálculos. Fornecedor é ordenado por fatos observados de recebimentos históricos, não por inferência de menor preço.
- Persistência proposta em tabelas `core.stock_thresholds`, `core.shopping_lists`, `core.shopping_list_items` e `core.shopping_commitments`, todas tenant/unit scoped, FKs compostas e RLS ENABLE+FORCE. A migration será aditiva, revisada e não autoriza aplicação remota.
- Recebimento usa um vínculo opcional de cada item com compromisso. O repositório bloqueia o compromisso antes da gravação e atualização do saldo, em ordem determinística, impedindo confirmação/recebimento concorrente acima do saldo aberto.
- Rotas sob `/v1/organizations/:organizationId/restaurants/:restaurantId/shopping`: CRUD estritamente necessário de limites, geração/listagem/detalhe de listas, edição de item, confirmação/cancelamento de compromisso e exportação. Leituras de alertas e limites dependem de `inventory_core`; operações Premium validam `shopping_premium` no servidor.
- O fluxo existente de recebimento permanece sob o serviço de inventário. O contrato adiciona vínculo opcional de compromisso e atualiza o restante dentro da transação existente; não duplicar valuation, ledger ou API de saldo.
- UI do App 01 fica em `apps/estoque/src/shopping/**`, integrada ao `InventoryWorkspace.tsx`. Navegação/unidade/local já selecionados são usados; mudança de contexto limpa drafts locais não enviados.

## Concorrência, segurança e consistência

- Geração lê saldo, limite, embalagem e compromissos dentro de uma transação coerente. O snapshot registra a sequência do ledger, instante do cálculo e IDs/versões das conversões/preços usados.
- Confirmação trava itens/compromissos relevantes, verifica tenant/unidade/local/ingrediente, quantidade do item de lista e entitlement antes de gravar. Duas confirmações concorrentes não podem criar compromissos duplicados para o mesmo trecho do item.
- Recebimento vinculado trava compromisso e saldo na mesma transação; rollback preserva saldo, ledger, preço histórico, idempotência e compromisso se uma etapa falhar.
- Uma lista não grava em `stock_movements`, não muda `stock_balances` e não altera histórico de preço. Apenas o comando de recebimento existente, após confirmação explícita e conferência física, cria entrada.
- RLS cobre todas as tabelas, inclusive itens, snapshots e compromissos. Testes exercitam acesso por ID forjado, tenant distinto, unidade/local distintos, entitlement ausente/expirado, export direto e acesso histórico após cancelamento.
- Exportação consulta somente a lista autorizada e não inclui registros de outra organização/unidade. CSV neutraliza conteúdo iniciado por `=`, `+`, `-` ou `@` para reduzir execução de fórmula em planilhas.

## Critérios de aceite

- Alertas críticos acessíveis com `inventory_core` sem `shopping_premium`.
- Geração, edição, confirmação de compromissos e exportação negadas pela API sem `shopping_premium`, inclusive endpoint direto (T-19); nenhuma UI oculta é usada como controle.
- Lista editável preserva sugestão inicial e estado atual e não altera ledger/saldo.
- Fórmula mira estoque-alvo após saldo e somente compromissos confirmados ainda abertos; mínimo controla criticidade; recebimento `draft`, `received` ou `reversed` não é subtraído como compromisso.
- Unidade-base, embalagem, fração permitida, mínimo de compra, fator/conversão e arredondamento são reproduzíveis e não usam float.
- Confirmar compromisso reduz sugestão futura uma vez; recebimento vinculado parcial reduz saldo pendente e aumenta estoque atomicamente; duplicidade, excesso, falha e tenant cruzado não causam dupla contagem.
- Isolamento por organização, unidade e local em API/RLS; cobertura de T-02, T-07, T-09, T-19, T-23 e T-24.
- Cancelamento de Premium preserva histórico e recebimentos previamente confirmados, bloqueando ações Premium futuras.
- Fornecedor recente é uma indicação editável com preço normalizado/data; sem histórico, fica sem sugestão.
- Build, typecheck, lint e testes pertinentes passam; revisão independente documenta isolamento tenant, precisão/unidades e concorrência. Nenhum resultado é declarado aprovado sem execução observada.

## Fora de escopo

- Previsão de demanda, lead time, estoque de segurança, integração de catálogo/preços externos, comparação automática do menor preço ou negociação com fornecedor.
- Pedido de compra completo com contas a pagar, aprovação, recebimento fiscal, múltiplas moedas, pagamento ou integração com fornecedor.
- Reserva de estoque, movimentação gerada pela lista, compra automática, recebimento automático ou alteração de ledger por edição de lista.
- Estoque/compra do App 02, papéis de funcionário, cobrança real, integração paga, WhatsApp, Storage externo, deploy e qualquer mudança em produção/legado.

## Decisões registradas e gate

- Regra de compromisso pendente, recebimento parcial, histórico após cancelamento, CSV/impressão, fornecedor recente e contratos foram aprovados pelo fundador em 2026-10-16 e registrados nesta spec, no plano e em `docs/adr/0005-shopping-commitments.md`.
- O fundador autorizou migration aditiva e testes somente no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`. Produção, legado, deploy e cobrança seguem proibidos.
