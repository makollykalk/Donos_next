# DONOS Next — Ciclo 01

Fundação em implementação. Consulte [evidências](docs/evidence/ciclo-01.md) para distinguir o que foi executado do que permanece pendente.

## Requisitos

- Node 24.22.0 (definido em `.node-version`).
- pnpm 11.25.0 (definido em `packageManager`).
- Supabase DEV dedicado: uso na nuvem autorizado pelo fundador, aguardando criação/acesso. A reprodução local com CLI requer Docker/WSL.

## Comandos

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
```

`pnpm test:integration` e `pnpm test:e2e` falham explicitamente enquanto seus respectivos gates não estiverem implementados. Uma execução somente de unit/build não comprova isolamento RLS.

Para a API mínima, copie `.env.example` para `.env` ignorado e carregue-o no ambiente do processo. `pnpm dev:api` compila e inicia a API em loopback. Somente `/health` está implementado na Task 1. Configuração de nuvem será permitida apenas com project ref novo explícito, conforme ADR 0002; o código da Task 1 ainda exige loopback e role restrita.

O diretório `.tools/` pode conter runtime/downloads/logs locais, todos ignorados pelo Git. Credenciais devem ficar apenas em arquivos ignorados ou variáveis de ambiente; nunca em DTOs, logs, README ou bundles.

## Escopo

Portal e os dois shells serão implementados no Ciclo 01 após os gates de backend/RLS. Motores de estoque, ficha e preço pertencem aos ciclos posteriores. Não existe vinculação com o legado ou com produção.
