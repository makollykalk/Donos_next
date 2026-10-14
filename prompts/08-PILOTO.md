# Ciclo 08 — Piloto, qualidade e preparação comercial

Faça primeiro auditoria de prontidão: V3, matriz T-01..24, docs de deploy e estado real do código. Planejar subetapas do piloto, separando testes locais, staging isolado e produção nova. NÃO tocar no DONOS legado.

Preparar ambiente de staging separado, backups/restauração testados, logs de erros, limites de gasto, revisão de configuração Supabase, teste de isolamentos entre dois tenants sintéticos e uma conta com duas unidades, cenários financeiros, acessibilidade/responsividade, e checklist de on-boarding. Integração de cobrança e WhatsApp oficial dependem de escolha de provedor, custos aceitos e aprovação humana explícita.

Entregar relatório go/no-go com falhas P0/P1, riscos e plano de rollback; nunca afirmar pronto comercialmente sem testes em dois restaurantes reais ou declarar dados de produção testados quando forem apenas fixtures.
