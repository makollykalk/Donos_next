# Arquitetura de referência e limites de construção

**Status:** candidata para implementação, condicionada à revisão técnica do Codex. A V3 é o contrato funcional; decisões abaixo são sugestões concretas para reduzir ambiguidade.

## Estratégia
Monorepositório com monólito modular, UI de portal + App 01 + App 02 implantáveis separadamente, API central e PostgreSQL/Supabase compartilhado. Não criar microsserviços ou replicar bancos por app. Backend único é o dono das regras, permissões, assinaturas e escrita transacional.

## Pilha técnica sugerida
- TypeScript em todas as camadas; pnpm workspaces (ou outra solução simples, com justificativa).
- Frontends React/Vite ou Next.js (uma só escolha coerente); mobile-first/PWA, sem app nativo inicial.
- API TypeScript com rotas versionadas e validação de entrada; escolher framework leve após inspecionar documentação atual.
- Supabase Auth + PostgreSQL, SQL migrations versionadas, Postgres `numeric` e RLS por dono da organização.
- Vercel para aplicativos e API, com ambientes DEV/STAGING/PROD realmente separados; provedor de jobs assíncronos somente quando necessário.
- Vitest para lógica pura, SQL/integration com Supabase local, Playwright para fluxos críticos.
- Antes de implementar provedores e versões, validar compatibilidade em documentação oficial.

## Estrutura-alvo (ajustar na fase de arquitetura antes de escrever código)
```
apps/portal/             # login, seleção de organização e planos
apps/estoque/            # App 01
apps/precificacao/       # App 02
apps/api/                # BFF/API autenticada de todos os domínios
packages/contracts/     # schemas de entrada/saída e erros versionados
packages/domain-inventory/
packages/domain-recipes/
packages/domain-purchases/
packages/domain-pricing/
packages/domain-billing/
packages/db/            # acesso transacional/migrations auxiliares
packages/ui/            # visual comum, opcional
supabase/migrations/    # schema versionado
scripts/
tests/unit/
tests/integration/
tests/e2e/
docs/superpowers/specs/
docs/superpowers/plans/
```

## Propriedade dos dados por domínio
| Domínio | Fonte de verdade | Quem escreve | Quem consulta |
|---|---|---|---|
| Identidade | auth + organizations + restaurants | Core | Todos após autorização |
| Insumos/estoque | ingredients, stock_movements, stock_balances | Serviço Estoque | App 01 e motor de Fichas |
| Compras | suppliers, receipts, price history | Serviço Compras | App 01 |
| Rendimentos/receitas | recipe_versions, inputs, yield_measurements | Serviço Fichas | App 01 e preço via contrato |
| Precificação | products, combos, channel_profiles, price_simulations | Serviço Preços | App 02 |
| Monetização | entitlements, usage_ledger, subscriptions | Serviço Comercial | API (não confiar no browser) |
| Propostas IA | ai_proposals, source_reference, confirmations | Serviço IA | App 01/WhatsApp autorizados |

## Tenant e autorização
- Uma pessoa autenticada é proprietária de 0..N organizações; cada organização pode ter 1..N restaurantes/unidades.
- `owner_user_id` é identidade de propriedade, NÃO um papel administrativo de funcionário. Qualquer operação recebe contexto resolvido a partir da sessão; jamais confiar somente em `organization_id` de payload/URL.
- `restaurant_id` deve pertencer à mesma organização de `ingredient_id`/`recipe_id`/`supplier_id` por constraints adequadas, FKs compostas quando aplicáveis e verificação transacional.
- Todas as tabelas expostas precisam de RLS; serviços privilegiados usam verificação explícita de tenant e chaves fora do client.
- O dono pode selecionar uma unidade, porém ler/escrever em outra somente após mudança explícita de contexto.

## Escrita transacional do estoque
Comando validado -> autorização -> trava da linha de saldo por (tenant, unidade, insumo, localização) -> verificação de idempotência -> cálculo decimal -> movimento imutável + saldo atualizado no mesmo commit -> evento de auditoria. Uma duplicata retorna o resultado original sem alterar saldo.
O back-end não aceita escrita direta nas tabelas de saldo/movimentos pelos clientes. Reversões são movimentos compensatórios, com revisão do custo quando necessário; alterações retroativas exigem estratégia formal de reconstrução ou bloquear na V1.

## Custo de aquisição
Base inicial: quantidade normalizada × custo unitário efetivo; alocar frete/descontos vinculados com regra matemática aprovada no plano do ciclo Estoque. Registrar valor original, unidade da nota e custo unitário normalizado. Não presumir que todo imposto é custo.

## IA e planos
Pipeline: ingresso autenticado/assinado -> identificar proprietário+unidade -> verificar entitlement e limite -> processar mídia -> extrair schema -> validar -> criar PROPOSTA pendente -> proprietário confirma explicitamente -> comando transacional -> débito idempotente de uso -> auditoria. Reentrega de webhook não duplica proposta/uso/movimentação.

## Política operacional
- Sem dados reais ou chaves reais nos testes; fixtures sintéticas de duas organizações.
- Sem migração de bancos/usuários legados neste MVP.
- Falta de credenciais: usar mocks e registrar instruções precisas; nunca inventar chaves ou declarar deploy bem sucedido.
- Gate humano obrigatório antes de infraestrutura paga, banco remoto, externalidade WhatsApp, cobrança real e produção.
