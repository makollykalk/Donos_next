# Matriz de testes e critérios de aceite — DONOS Next

**Como usar:** cada plano de ciclo aponta para os cenários correspondentes, define arquivos e automatiza os testes antes de implementar. Este documento estabelece critérios, não substitui execução.

| ID | Cenário obrigatório | Resultado |
|---|---|---|
| T-01 | Dono A tenta GET/PATCH/deletar IDs do dono B | 403/404 + nenhuma informação ou mutação, via API e RLS |
| T-02 | Dono A possui unidades A1 e A2; faz compra na A1 | Somente saldo e custo da A1 mudam |
| T-03 | 10 kg × R$20; baixa 2 kg; entrada 7 kg × R$25 | 15 kg, R$335, R$335/15; baixa custa R$40 |
| T-04 | Cinco entradas/saídas fracionadas com custo não inteiro | Sem deriva material por `float`, reconciliação exata segundo política decimal |
| T-05 | Mesmo comando HTTP/webhook confirmado duas vezes | Uma única movimentação e uso cobrado no máximo uma vez |
| T-06 | Duas saídas concorrentes excedem estoque | No máximo quantidade disponível é consumida, saldo nunca negativo |
| T-07 | Unidade caixa/pacote x base kg/L/unidade | Conversão e valores auditáveis, zero de mistura de dimensões |
| T-08 | Saldo chega a zero e novo recebimento entra | Novo custo médio inicial igual ao custo unitário efetivo do novo recebimento |
| T-09 | Nota/pedido de compra cadastrado mas não recebido | Sem entrada física automática |
| T-10 | Compra recebida de insumo com fornecedor/preço anterior | Novo histórico preserva registro anterior e atualiza média corretamente |
| T-11 | Ficha não possui medições reais | Status não-validado, campos e alertas explícitos |
| T-12 | Pré-preparo usado em duas receitas | Custo sem contar insumo ou perda duas vezes |
| T-13 | Contagem física com divergência | Simulação, relatório e ajuste compensatório com histórico |
| T-14 | Contagem aberta + recebimento concorrente | Reconciliação ou bloqueio deliberado; nunca sobrescreve compra recebida |
| T-15 | App 02 sem `inventory_core` | Custo manual habilitado, precificação funciona sozinha |
| T-16 | App 02 com App 01 ativo | Custo da ficha sincronizado via API autorizada, com fonte e data |
| T-17 | Preço por contribuição: base de taxas igual ao preço bruto | Fórmula conforme V3, metas e inviabilidade explicitadas |
| T-18 | Combo com itens e embalagem única | Insumos somados por componente; taxas/embalagem não duplicadas |
| T-19 | Tentativa de exportar lista Premium sem plano | Bloqueio pelo backend inclusive acessando endpoint direto |
| T-20 | IA recebe "5 kg por R$190" e resultado ambíguo | Proposta validada para revisão; não escreve sem aprovação |
| T-21 | Confirmação de IA duplicada ou confirmação por pessoa errada | Uma única movimentação e autorização verificada |
| T-22 | Add-on IA cancelado ou franquia esgotada | Não dispara modelo cobrável; apresenta fallback manual |
| T-23 | Token/site do tenant A acessa arquivo de tenant B | Acesso negado no Storage/URL/API |
| T-24 | Exportação PDF/relatórios de uma organização | Nenhuma linha, nome, saldo ou preço de outra |

## Casos adversariais adicionais
- Quantidade zero/negativa, unidade incompatível (litro versus kg sem densidade cadastrada), ingredientes com nome parecido.
- Tarifas por faixas de canal, `taxas + tributos + margem >= 1`, CMV alvo zero/inválido, descontos cujo denominador muda.
- Mudança de unidade no meio da sessão, cancelamento do plano, cliente offline/duplo clique, mídia malformada, prompt injection no texto de imagem ou WhatsApp.
- Erro na gravação entre movimento e saldo deve causar rollback completo.

## Definição de pronto (DoD)
- Cobertura automatizada de cenários do ciclo, inclusive caminho negativo.
- Instruções de reprodução local de fato executadas, `typecheck`, `lint`, testes pertinentes e build verde.
- Revisão de isolamento multi-tenant e de dinheiro/quantidades documentada.
- Contratos sincronizados, migration versionada reversível quando viável, logs sem segredos.
- Sem deploy automático para produção, sem alteração de dados legados, sem testes falsamente marcados como executados.
- Ao final: evidências e comando reproduzível, PR/commit e riscos pendentes.
