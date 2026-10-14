# Ciclo 03 — Fichas e rendimento real

Leia V3 e critérios T-11,T-12,T-16. Planeje em `docs/superpowers/specs/` e `docs/superpowers/plans/` antes de tocar o código, submetendo o plano à revisão.

Implementar ingredientes por quantidade/unidade, ficha técnica de produto e de pré-preparo, rendimento bruto/líquido medido pelo dono, transformações (por exemplo, cocção, limpeza, perdas), versionamento das medições e custo calculado com o custo médio vigente do saldo. Proibir ficha marcada como validada sem medições reais; distinguir rendimento estimado do medido e manter histórico.

Especificar custo do produto final por rendimento efetivo, conversões válidas (kg-g, L-mL, unidades e fatores do insumo), prevenção de ciclos entre receitas e dupla contagem de ingrediente ou embalagem. Integrar somente leitura de custo por contrato que o futuro App 02 consumirá; proteger tenant/unidade.

Delegar testes de fórmulas e revisão UX em paralelo; coordenador mantém migrations e contratos. Testes de pelo menos três receitas com pré-preparos e rendimentos distintos. Encerrar com evidências de build, testes e PR, sem avançar sozinho.
