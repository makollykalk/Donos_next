# ADR 0002 — Supabase DEV na nuvem por autorização do fundador

Estado: autorizado pelo usuário; projeto novo criado pelo usuário no painel e identidade conferida pelo conector. Data: 14/10/2026.

O usuário respondeu “Use o supabase na nuvem” e escolheu `makollykalk's Org` como organização. Essa instrução substitui a restrição de loopback do ambiente Supabase nos documentos anteriores, exclusivamente para um projeto NOVO chamado DONOS Next DEV, preferencialmente São Paulo. Não autoriza nenhum acesso de escrita ao DonMadruga ou a outros projetos existentes, nem upgrade pago, cobrança, deploy, merge de branch de banco ou Ciclo 02.

## Mudança de ambiente

Os frontends e a API continuam locais. O banco e o Auth poderão estar no projeto DEV novo, com dados sintéticos. Identificar e registrar o project ref exato antes de conexão ou migration. A API deve exigir ambiente explícito de desenvolvimento cloud e allowlist desse ref/host, TLS com verificação de certificado e papel `donos_api` NOBYPASSRLS. A role de migration/test fixture fica fora da API. Nunca relaxar a validação para aceitar qualquer URL remota.

A configuração local continuará sendo o default. O suporte cloud será adicionado após identificar o destino; os testes de configuração precisam primeiro falhar para host/ref divergente, sem allowlist, SSL ausente ou role privilegiada. Migrations aplicadas somente ao projeto DEV confirmado e preservadas no Git. Não usar reset destrutivo remoto; fixtures isoladas, nomes sintéticos e limpeza por IDs do teste, apenas nesse ambiente designado.

## Custo e acesso verificados

O conector retornou plano `free` para a organização. Na listagem há um projeto ativo, DonMadruga, que permanece intocado. A página oficial [Pricing](https://supabase.com/pricing) consultada indica US$0/mês e até dois projetos ativos no Free. Isso não prova disponibilidade da cota nem a criação: conferir a tela de novo projeto antes de submeter, e não aceitar upgrade/add-on.

As chamadas `get_cost` e `confirm_cost` retornaram `UNAVAILABLE / tool was not returned by tools/list`. Não foi fabricado confirmation ID nem enviado create_project com confirmação fictícia. Fallback: painel oficial; usuário autenticou, definiu a credencial e confirmou a criação. Identidade verificada por get_project: `kfthwjrvgslnsjigqnyc`, nome DONOS Next DEV, organização escolhida, região efetiva `us-east-1`, status ACTIVE_HEALTHY. A região efetiva escolhida no painel é mantida; São Paulo era preferência, não requisito funcional. Banco PostgreSQL 17.11; consulta inicial encontrou zero tabelas nos schemas public/core. Nenhum dos projetos anteriores foi usado para SQL.

## Critério de validação

Session pooler verificado: `aws-0-us-east-1.pooler.supabase.com:5432`, usuário `donos_api.kfthwjrvgslnsjigqnyc`. A allowlist admite somente essa combinação ou conexão direta do mesmo ref. Certificado CA oficial em arquivo separado, SSL com verificação obrigatória. Credenciais de fixtures e runtime somente em arquivos ignorados. URLs com `sslmode=verify-full` são validadas antes de remover o query string para passar explicitamente CA/rejectUnauthorized ao driver pg (evita sobreposição de configuração SSL no parser).

Manter todos os testes de isolamento, JWTs distintos, grants, RLS real e concorrência do plano. Resultados devem identificar que a integração ocorreu no DEV cloud, sem chamá-la de teste Supabase local. Docker/WSL passam a ser pré-requisito opcional para reprodução local e não impedimento para o DEV cloud autorizado. Se o acesso ou a criação permanecer bloqueado, concluir somente tarefas independentes e relatar o gate SQL pendente.
