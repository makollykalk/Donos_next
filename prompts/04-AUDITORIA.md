# Ciclo 04 — Contagem física e auditoria de estoque

Leia V3 e T-13/T-14/T-24. Antes da implementação, escreva spec e plano TDD com: sessão de contagem por unidade/local, saldo de corte, status (não contado, contado, revisar, validado), modo cego opcional, relatório para imprimir e resumo de divergências/impactos; só o proprietário atua.

Após aprovação, construir UI mobile-first, impressão/PDF e fluxo de conferência. Contagem NÃO pode simplesmente sobrescrever saldo se houve movimentação posterior: implementar bloqueio controlado ou reconciliação baseada no corte, escolhida/documentada no plano. Confirmar ajustes por movimentação compensatória e trilha de auditoria, nunca UPDATE silencioso de saldo. Isolamento por tenant e unidade também nos relatórios exportados.

Agentes podem trabalhar em interface de contagem vs template imprimível quando não alteram os mesmos arquivos; serviço transacional e migration ficam sob o coordenador. Executar testes de contagem concorrente e relatório tenant A vs B. Não iniciar novo ciclo automaticamente.
