# Ciclo 05 — App 02 Precificação de Produtos e Combos

Leia V3 e T-15 a T-18. Documente arquitetura/spec e plano granular; aguarde minha aprovação antes de implementação.

Implementar App 02 comercialmente independente: produtos vendáveis, variações, combos, canais com taxas percentuais e fixas editáveis, embalagens, descontos, tributos informados pelo usuário, metas editáveis de margem de contribuição e CMV alvo, preço sugerido, simulações e snapshots históricos. Sem módulo de compras ou estoque na UI do App 02.

Se cliente não contratou App 01: custo manual com fonte explícita. Se contratou: obter custo corrente de ficha por API central, no tenant/unidade autorizados; mostrar data/fonte do custo. Não duplicar motor de custo, banco ou dados da ficha.

No cenário linear da V3 usar: `P_margem=(C_insumo+C_variavel_fixo)/(1 - taxas_proporcionais - impostos_proporcionais - margem_alvo)` somente quando bases de incidência forem equivalentes; `P_cmv=C_insumo/cmvalvo`; se ambas metas simultâneas válidas, `P=max(P_margem,P_cmv)`. Validação de denominador, taxas por faixa, desconto, custo fixo por venda, arredondamento e metas inviáveis. Combo sem duplicação de embalagem/comissão. Cobrir exemplos numéricos de regressão, T-15..18 e multi-tenant.

Delegar UI e motor matemático em pastas independentes APÓS congelar contratos; pedir revisão de um agente crítico de finanças e testes. Finalizar com PR e evidências; não iniciar outro ciclo.
