# Ciclo 01 — Núcleo multi-tenant

Execute **somente o Ciclo 01** do DONOS Next, respeitando `AGENTS.md`, V3, ADR e o plano `docs/superpowers/plans/2026-10-14-core-multitenant.md` aprovado. Primeiro verifique o `git status` e recuse alterações no projeto antigo. Se o plano não estiver aprovado, apresente-o antes de programar.

Implementar monorepo mínimo, Supabase local, login/logout e sessão segura do proprietário; registro de organização e unidade, seleção explícita de unidade, RLS em tabelas expostas, contratos de API, `entitlements` sem cobrança real e scaffolds independentes de portal, estoque e precificação com rotas protegidas.

Paralelismo: coordenador domina SQL/RLS/contratos; um agente pode implementar a UI de portal após congelar contratos; outro agente apenas testa/inspeciona segurança sem editar migrations. Nunca aplicar migration em banco de produção.

Testes obrigatórios: T-01, T-02, T-23 (se Storage usado), dono com duas organizações, acesso sem login, ID forjado, RLS real com credenciais de tenants distintos, entitlements verificados na API. Rodar `typecheck`, lint, unit, integração SQL e build aplicáveis. Fornecer comandos e resultados reais, commits e PR. NÃO iniciar Ciclo 02 antes da minha revisão.
