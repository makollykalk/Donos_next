# Evidências do Ciclo 05 — App 02 Precificação

**Data:** 2026-10-16
**Branch:** `codex/ciclo-05-pricing`
**Estado:** implementação e gates concluídos; commits/PR pendentes. Sem merge ou deploy.

## Decisões e escopo

- IMP-016, IMP-017 e o uso da versão corrente validada da ficha no local selecionado foram aprovados pelo fundador e registrados na ADR 0004.
- O preço de lista do combo fica no cadastro do combo. Cada simulação congela preço, fonte e custo exatos, quantidade usada, embalagens, outros custos variáveis, canal e decomposição por componente.
- Foi aplicado apenas schema aditivo no Supabase DONOS Next DEV `kfthwjrvgslnsjigqnyc`, autorizado explicitamente para testes/migrations do Ciclo 05. Não houve `db reset`, escrita em produção ou acesso ao legado.
- Migrations: `20261016144858_cycle05_pricing` e `20261016150625_cycle05_pricing_variant_snapshot.sql`; o histórico remoto registra `cycle05_pricing_variant_snapshot`.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `pnpm test:unit` | 24 arquivos, 169 testes aprovados |
| Integração pricing: API, histórico, tenant/security, schema e locks | 5 arquivos, 6 testes aprovados no DEV com fixtures/dados sintéticos |
| Integração central da ficha (`recipe-commands.test.ts`) | 1 arquivo, 1 teste aprovado no DEV |
| `tests/e2e/pricing-flow.spec.ts` | 1/1 aprovado; API mockada, fluxo visual do combo e snapshot histórico |
| `pnpm typecheck` | aprovado (`tsc -b` + `tsconfig.tests.json`) |
| `pnpm lint` | aprovado, zero warnings do ESLint |
| `pnpm build` | aprovado; aviso de bundle App 02 acima de 500 kB minificados |
| `git diff --check` | aprovado |

## Revisão independente

Revisão somente leitura do diff completo não encontrou blockers em isolamento multi-tenant, exatidão financeira, compatibilidade dos snapshots históricos, locks de simulação ou acesso aos detalhes de catálogo recipe com `pricing_core` quando `inventory_core` não está disponível.

As correções revistas incluem: congelar `quantityPerSale`; multiplicar apenas componentes da ficha, mantendo embalagem App 02 uma vez por venda; usar locks `FOR SHARE` nos registros-pai de variação, combo e canal, com escritores do repositório atualizando primeiro esses registros; conservar snapshots legados sem o novo campo; e mostrar na UI quando caminhos da ficha não podem ser resolvidos.

## Limitações e risco residual

- A coerência concorrente depende de escritores usarem os métodos atuais do repositório, que atualizam/bloqueiam primeiro a linha-pai. Escrita direta em `pricing_combo_components` ou `pricing_channel_rates` fora desses métodos não adquire esse lock automaticamente; avaliar trigger/encapsulamento se outro runtime passar a escrever diretamente nas tabelas-filhas.
- O E2E usa API mockada e não substitui a integração real; a integração API foi executada separadamente no DEV autorizado.
- Não foi executado replay de todas as migrations desde um banco local descartável, pois Docker/Podman não está disponível.
- O host fornece Node 24.19.0 (engine declarado `>=24.22.0 <25`) e o build usa runtime 24.15.0. Os comandos passaram com avisos de engine.
- Advisors de banco previamente consultados não reportaram alerta de segurança nas tabelas de pricing; permanece o aviso preexistente `auth_leaked_password_protection`, além de avisos informativos de índices/FKs no schema geral.

## Limites de autorização

Sem produção, legado `Donos-Saas`, Vercel antigo, domínios antigos, deploy, cobrança real, integração paga ou WhatsApp. O Ciclo 06 não foi iniciado.
