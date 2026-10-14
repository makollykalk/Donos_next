# ADR 0002 — Supabase DEV na nuvem por autorização do fundador

Estado: autorizado como direção pelo usuário nesta conversa; criação depende de projeto novo disponível no plano Free e acesso ao painel. Data: 14/10/2026.

O usuário respondeu “Use o supabase na nuvem” e escolheu `makollykalk's Org` como organização. Essa instrução substitui a restrição de loopback do ambiente Supabase nos documentos anteriores, exclusivamente para um projeto NOVO chamado DONOS Next DEV, preferencialmente São Paulo. Não autoriza nenhum acesso de escrita ao DonMadruga ou a outros projetos existentes, nem upgrade pago, cobrança, deploy, merge de branch de banco ou Ciclo 02.

## Mudança de ambiente

Os frontends e a API continuam locais. O banco e o Auth poderão estar no projeto DEV novo, com dados sintéticos. Identificar e registrar o project ref exato antes de conexão ou migration. A API deve exigir ambiente explícito de desenvolvimento cloud e allowlist desse ref/host, TLS com verificação de certificado e papel `donos_api` NOBYPASSRLS. A role de migration/test fixture fica fora da API. Nunca relaxar a validação para aceitar qualquer URL remota.

A configuração local continuará sendo o default. O suporte cloud será adicionado após identificar o destino; os testes de configuração precisam primeiro falhar para host/ref divergente, sem allowlist, SSL ausente ou role privilegiada. Migrations aplicadas somente ao projeto DEV confirmado e preservadas no Git. Não usar reset destrutivo remoto; fixtures isoladas, nomes sintéticos e limpeza por IDs do teste, apenas nesse ambiente designado.

## Custo e acesso verificados

O conector retornou plano `free` para a organização. Na listagem há um projeto ativo, DonMadruga, que permanece intocado. A página oficial [Pricing](https://supabase.com/pricing) consultada indica US$0/mês e até dois projetos ativos no Free. Isso não prova disponibilidade da cota nem a criação: conferir a tela de novo projeto antes de submeter, e não aceitar upgrade/add-on.

As chamadas `get_cost` e `confirm_cost` retornaram `UNAVAILABLE / tool was not returned by tools/list`. Não foi fabricado confirmation ID nem enviado create_project com confirmação fictícia. Fallback: painel oficial, que está aguardando login do usuário. Não houve criação ou alteração de projeto até esta revisão.

## Critério de validação

Manter todos os testes de isolamento, JWTs distintos, grants, RLS real e concorrência do plano. Resultados devem identificar que a integração ocorreu no DEV cloud, sem chamá-la de teste Supabase local. Docker/WSL passam a ser pré-requisito opcional para reprodução local e não impedimento para o DEV cloud autorizado. Se o acesso ou a criação permanecer bloqueado, concluir somente tarefas independentes e relatar o gate SQL pendente.
