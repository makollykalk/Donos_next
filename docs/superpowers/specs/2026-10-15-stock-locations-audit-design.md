# Ciclo 04 — locais de estoque e auditoria física

**Status:** desenho aprovado pelo fundador em 2026-10-15 para registro nesta spec; a spec ainda aguarda revisão. Nenhuma implementação está autorizada por este documento.

**Base funcional:** DONOS Next V3, DEC-001, DEC-005, DEC-007, DEC-010, DEC-011, DEC-012 e DEC-013; critérios T-13, T-14 e T-24; Prompt `prompts/04-AUDITORIA.md`.

**Dependências:** núcleo do Ciclo 01, estoque/compras do Ciclo 02 e fichas/custo corrente do Ciclo 03.

## Resultado esperado

O App 01 deve permitir ao proprietário organizar estoque físico em locais reais dentro de uma unidade e executar uma contagem guiada que preserve um saldo de corte, revele divergências antes da confirmação e ajuste o ledger de forma rastreável. Um local não é apenas um rótulo de relatório: saldos e movimentos pertencem a exatamente um local. Custo de ficha também consulta a média do local selecionado, sem combinar médias de locais diferentes.

## Decisões aprovadas para este desenho

1. **Locais reais agora:** criar dimensão `stock_locations` por organização/unidade e particionar saldos e movimentos por local. Não representar “local” só na sessão de contagem.
2. **Migração inicial:** cada unidade existente recebe um local padrão. Saldos, movimentos, compras recebidas, históricos de preço e estornos existentes são vinculados a esse local, preservando IDs, sequências, valores e snapshots históricos. Não há reset nem migração para produção; a migration do produto deve ser aditiva e preservar o ledger.
3. **Novos registros:** cada unidade precisa de exatamente um local padrão. Novo insumo tem saldo zero em cada local ativo; novo local tem saldo zero para os insumos da unidade. Local com histórico ou sessão não é excluído fisicamente; arquivamento é lógico e não pode ocultar saldo.
4. **Operações transacionais:** recebimento é destinado a um local; baixa usa um local; estorno deriva o local do movimento/recebimento original. Transferência entre locais fica fora deste ciclo.
5. **Custo de receitas:** toda consulta corrente de custo exige o local escolhido. A média e as fontes do DTO referem-se somente aos saldos desse local. O App 02 não é desenvolvido; o contrato de custo do App 01 é atualizado para carregar `locationId`.
6. **Contagem e movimentos concorrentes:** uma sessão aberta por local. A abertura fixa seus itens e snapshots; movimentos ficam bloqueados para os itens incluídos até a sessão fechar ou ser cancelada. A proteção existe no banco, além da validação da API. A abertura e comandos de estoque usam a mesma disciplina de locks para que um movimento concorrente ocorra inteiro antes do corte ou seja rejeitado após ele.
7. **Valor de ajustes:** divergência negativa usa o custo médio vigente e não pode produzir saldo negativo. Divergência positiva usa a média vigente do local quando disponível. Se o saldo teórico for zero e não houver média, o dono deve informar e confirmar o valor total da divergência; nenhum custo é inferido. Valor zero, se permitido pelo contrato, exige motivo explícito.
8. **Confirmação:** diferenças revisadas geram movimentos imutáveis `COUNT_ADJUSTMENT` e auditoria dentro da transação de fechamento. Não atualizar saldo silenciosamente. Fechamento exige validar todos os itens incluídos; cancelamento não gera movimentos.

## Alternativas consideradas

| Caminho | Resultado | Decisão |
|---|---|---|
| Particionar saldo, ledger e custo de ficha por locais reais | Representa o estoque físico e torna custo e contagem inequívocos; requer mudança ampla nos contratos e testes do inventário | **Escolhido** |
| Tratar a unidade como local único | Menor mudança imediata; não permite separar despensa, freezer ou outros locais físicos | Rejeitado pelo fundador |
| Guardar `location_id` apenas na contagem | Exibe vários locais sem separar quantidade e valor; permite contar o mesmo saldo compartilhado mais de uma vez | Rejeitado por inconsistência do domínio |

## Locais e estoque por local

`stock_locations` pertence ao par `(organization_id, restaurant_id)`, tem identidade estável, nome, estado ativo/arquivado e indicador de local padrão. IDs fornecidos por rota ou payload são sempre verificados contra a sessão do proprietário e a unidade selecionada; FKs compostas e RLS reforçam a mesma fronteira.

`stock_balances` passa a ter chave por organização, unidade, local e insumo. `stock_movements` recebe `location_id`; sequência, snapshots de quantidade/valor e custo médio são independentes por local. O ledger continua append-only e toda movimentação mantém a referência composta ao local e ao insumo da mesma unidade. Recebimentos têm um local de destino; preços de compra continuam vinculados ao recebimento e carregam o local de origem para rastreabilidade, embora a comparação comercial de preços possa consultar todos os locais da mesma unidade.

O dono pode listar, criar e arquivar locais. Não pode arquivar o único local ativo nem um local que tenha saldo não zero ou contagem aberta. O primeiro local de cada unidade é padrão. Novos insumos e novos locais recebem saldo zero para cada combinação ativa de insumo/local, inclusive quando a combinação for criada depois da outra entidade.

Rotas de catálogo e fornecedores continuam no escopo já definido pelo Ciclo 02. Recebimentos, baixas, estornos, saldos e extratos incluem o local. Reversões usam automaticamente o local de origem. A seleção de local é explícita na UI; o token atual de contexto continua representando proprietário/organização/unidade, e a API verifica o local solicitado dentro desse contexto.

## Contrato de custo de ficha

`GET /v1/organizations/:organizationId/restaurants/:restaurantId/recipes/:recipeId/cost` passa a exigir `locationId`. O serviço valida o local sob o contexto da unidade e lê o grafo e os saldos desse local no mesmo snapshot de banco. `RecipeCostDTO` inclui `locationId`; cada `stockSources` só pode conter saldos desse local. O evento de validação da medição continua único e não pertence a um local. Suas linhas históricas de custo passam a incluir `location_id` e a guardar snapshots independentes por cada local ativo existente no instante da validação; novas localizações criadas depois não ganham snapshot retroativo. Linhas históricas atuais são atribuídas ao local padrão criado na migração.

O App 01 exibe o custo referente ao local selecionado e sua origem. Não há fallback para outro local, fornecedor, versão antiga ou custo manual. Se faltar média no local, o custo segue indisponível conforme o contrato do Ciclo 03.

## Sessão de contagem

Uma sessão é vinculada a organização, unidade e local, tem status `open | closed | cancelled`, autor, timestamps e indicador `blind`. A restrição de banco permite no máximo uma sessão aberta por local. A abertura registra o instante de corte e snapshots de quantidade, valor, média/razão e sequência do ledger para todos os insumos ativos da unidade naquele local, inclusive saldo zero. Nesta primeira versão, o conjunto é congelado na abertura; alterações posteriores do catálogo não adicionam itens retroativamente.

Cada item tem quantidade contada, observação, sequência de conferência e estado `not_counted | counted | review | validated`. Nova contagem/recontagem acrescenta observação de conferência em vez de apagar evidência anterior. O modo cego oculta o saldo teórico durante a entrada da contagem e no relatório de contagem; o relatório de divergências posterior revela teórico, físico, diferença, custo médio aplicável e impacto financeiro estimado.

O proprietário pode revisar ou recontar divergências antes de validar. A UI mobile-first lista progresso, itens pendentes, revisões e diferenças. O relatório imprimível identifica unidade/local, data de corte, item e unidade, observação, campo de quantidade e assinatura; em modo cego não mostra saldo esperado. A impressão usa o fluxo de impressão do navegador/“Salvar como PDF”; não requer serviço pago nem dependência de geração PDF.

O fechamento exige todos os itens incluídos validados, mostra um resumo final e exige confirmação explícita do proprietário. Itens sem divergência não geram movimento. Divergências geram `COUNT_ADJUSTMENT` com ligação à sessão/item, motivo e custo aplicado. Fechar sessão, movimentos de ajuste e eventos de auditoria são atômicos. Falha em qualquer ajuste faz rollback integral. Cancelar registra autor/motivo e encerra a trava sem alterar saldos.

## Concorrência e integridade

Iniciar uma sessão e gravar movimentos disputam os mesmos locks por `(organization_id, restaurant_id, location_id, ingredient_id)`, em ordem determinística para operações multitem. A abertura adquire os locks dos itens em escopo antes de criar o corte; o comando de movimento adquire o lock do saldo e verifica sessão aberta dentro da mesma transação. O guard do banco recusa movimento direto para item bloqueado, inclusive se a rota ou repositório for contornado. Idempotência de abertura, registros de contagem, fechamento e ajustes impede repetição por clique/retry.

Restrições compostas impedem cruzar organização, unidade, local e insumo. Tabelas de locais, sessões, itens e observações usam `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`, grants mínimos e políticas de proprietário/contexto. Relatórios e exportações consultam apenas a unidade/local validados no servidor; não recebem IDs de outra organização via joins sem escopo.

## Critérios de aceitação deste ciclo

- **T-13:** divergência apresenta prévia e impacto; confirmação fecha a sessão com ajuste compensatório imutável e histórico preservado.
- **T-14:** recebimento, baixa e estorno concorrentes com abertura/fechamento são serializados ou recusados; não sobrescrevem compra legítima nem deixam movimento sem ledger/saldo.
- **T-24:** relatório/impressão de A não contém nome, saldo, valor ou evento da organização B; ID forjado de local/unidade é negado pela API e pelo banco.
- O teste canônico do Ciclo 02 permanece exato em um mesmo local: 10 kg × R$20, baixa 2 kg, entrada 7 kg × R$25 resulta em 15 kg, R$335 e razão R$335/15; outro local não muda.
- Migração preserva, para cada unidade existente, quantidades, valores, médias, sequências, movimentos, recebimentos, históricos e reversões após atribuição ao local padrão.
- Movimentação concorrente no item de local em contagem aberta falha sem alterar saldo, ledger, preço ou idempotência; cancelamento reabilita operação; fechamento completo permite operações futuras.
- Custo de ficha de um local usa somente as médias desse local; falta de média retorna indisponível sem fallback.
- Divergência positiva com saldo teórico zero exige valor total confirmado pelo dono; valor não informado ou payload de tenant/local incorreto falha sem side effect.
- Relatório cego oculta todos os valores teóricos até a fase de conferência; relatório final registra as informações corretas e o autor.

## Fora de escopo e limites

- Transferência entre locais, produção e consumo por ficha, novos papéis de funcionário, preço/App 02, Premium, IA, WhatsApp, cobrança, Storage e integrações pagas.
- Deploy, migration em produção, legado `makollykalk/Donos-Saas`, Vercel `don_madruga`, domínios e bancos de produção.
- Categories management não será introduzido só para auditoria; a contagem inclui todos os insumos ativos no local no instante do corte.
- Não há exportação com dados de outro local sem seleção explícita, nem limpeza de ledger histórico.

## Riscos para revisar antes do plano

1. A dimensão de local muda movimentos, recebimentos, saldos, estornos e todas as fixtures de inventário; o plano deve sequenciar contratos/migration antes de serviço/UI e testar regressão financeira.
2. O contrato de custo do Ciclo 03 e seus snapshots precisam de uma migração compatível que preserve a evidência existente e passe a exigir local nas leituras futuras.
3. O ciclo anterior registra PR sujeito a revisão humana; antes de implementar, confirmar a base/estado do PR e usar branch própria sem misturar ou reescrever commits do Ciclo 03.
4. A suíte integral de integração do Ciclo 03 tinha timeout preexistente; não declarar regressão verde sem separar falhas funcionais de timeout e preservar comandos/resultados observados.

## Gate de processo

Esta spec registra o design aprovado e aguarda revisão humana do texto. Após aprovação, será escrito um plano TDD separado com interfaces, arquivos exatos, testes, commits e gates; esse plano também exige revisão antes da implementação. O coordenador mantém contracts, migrations, transações e integração. Agentes só podem atuar em tarefas paralelas com arquivos e banco mutável disjuntos. A implementação do Ciclo 04 não começa automaticamente.
