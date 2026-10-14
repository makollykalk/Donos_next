# DONOS Next — Instruções permanentes para Codex

## Fonte de verdade
- Leia `docs/01-PRODUTO-V3.md` antes de planejar ou implementar. As decisões DEC-001 a DEC-013 são obrigatórias.
- Leia `docs/02-ARQUITETURA-E-LIMITES.md`, `docs/03-CRITERIOS-DE-ACEITE.md` e `docs/04-ROADMAP.md` para a tarefa atual.
- Em caso de conflito, regras aprovadas na V3 prevalecem; dúvidas de implementação devem ser registradas como ADRs antes de codificar.

## Limites inegociáveis
- ESTE é um projeto novo. NÃO modificar, fazer deploy ou migrar automaticamente o legado `makollykalk/Donos-Saas`, o Vercel `don_madruga`, domínios antigos ou bancos de produção.
- Código legado só pode ser consultado em modo leitura e reutilizado após revisão, testes e decisão documentada. Não copiar SQL destrutivo, credenciais nem dumps reais.
- Multi-tenant: `organization_id` como fronteira primária, `restaurant_id` para unidades; validar titularidade no servidor E RLS. Cobrir acesso cruzado em testes. NÃO desenvolver perfis de funcionários no MVP.
- App 01: estoque, fichas, compras básicas e histórico; lista inteligente Premium e entrada/baixa por IA como adicionais. App 02: SOMENTE preços de produtos e combos, independente com custo manual.
- Estoque: custo médio móvel ponderado pelo saldo remanescente, mov. atômicos, idempotentes, ledger imutável com estorno/compensação, decimal/numeric e saldo negativo bloqueado por padrão.
- IA: extrair proposta estruturada, validar deterministicamente, EXIGIR confirmação explícita do dono; jamais conceder à IA acesso direto a SQL ou chaves privilegiadas. Verificar entitlement + franquia antes da chamada paga.
- Dinheiro e quantidades: não usar `number` de ponto flutuante em cálculos críticos; definir unidade-base, precisão e arredondamento. Os valores de UI podem ser arredondados para exibição.
- Toda dependência nova deve ser justificada, ter versão fixada e lockfile; sem segredos em código/commit/browser; sem `service_role` no client.
- Não tocar produção, não instalar/pay-per-use integração, não criar/alterar cobrança real nem integrar WhatsApp sem autorização explícita.

## Fluxo obrigatório de trabalho
1. Antes de qualquer implementação, criar/atualizar uma especificação de subprojeto em `docs/superpowers/specs/` e um plano TDD em `docs/superpowers/plans/`, com interfaces, arquivos exatos, testes e checkpoints. Pedir revisão humana desse plano.
2. Fazer um ciclo por vez, com branch/PR e commits pequenos; não iniciar ciclos dependentes sem testes aprovados no anterior.
3. Coordenador mantém contratos, interfaces e migrations sob sua posse. Delegar tarefas paralelas SOMENTE se puderem trabalhar sem escrever os mesmos arquivos e sem usar o mesmo banco mutável.
4. Cada entrega deve conter: resumo do código, arquivos alterados, testes executados + resultados, evidências de segurança, limitações, riscos e próximos passos. Nunca declarar teste como aprovado sem tê-lo executado.
5. Usar uma revisão independente para segurança multi-tenant, precisão financeira e concorrência antes de merge.

## Teste canônico
10 kg a R$ 20/kg -> baixa de 2 kg (saldo 8 kg, custo médio R$ 20) -> entrada de 7 kg a R$ 25/kg -> saldo 15 kg, valor R$ 335, custo médio R$ 335/15 (R$ 22,333333...). Provar também idempotência e isolamento entre duas organizações.
