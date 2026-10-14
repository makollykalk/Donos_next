# DONOS Next — Kit de execução Multiagentes no Codex

## Objetivo
Criar um SaaS limpo para proprietários de restaurantes: App 01 (Estoque + Fichas + Compras, Premium/IA) e App 02 (Precificação de produtos/combos), com organizações/unidades e isolamento multi-tenant. NOVO repositório e NOVO banco: o DONOS antigo permanece intocado.

## Início rápido no Windows (Codex Desktop, extensão ou CLI)
1. Instale/atualize o Codex pela documentação oficial. Tenha Git, Node LTS, gerenciador de pacotes e ferramentas necessárias para Supabase local (ex.: Docker) conforme o guia atual; verifique `git --version`, `node --version`, `npm --version`. Uma instalação CLI pode ser verificada com `codex --version`.
2. Crie um diretório NOVO, por exemplo `C:\Projetos\donos-next`. Não clone o legado como base nem vincule Vercel/Supabase de produção.
3. Extraia TODO este kit para a RAIZ do novo diretório (`AGENTS.md` deve ficar na raiz). Inicialize um repositório Git privado novo em branch própria. A V3 está em `docs/01-PRODUTO-V3.md`.
4. Faça backup do seu `%USERPROFILE%\.codex\config.toml`; copie apenas as chaves de `config/codex-config-exemplo.toml` para seções existentes. **Não crie duas vezes `[features]` ou `[agents]`.** Reinicie o Codex para a configuração ser relida. No Codex use o seletor de modelo (geralmente `/model`) para escolher entre modelos habilitados.
5. Abra o novo diretório no Codex, confira que ele informa o caminho correto, use **GPT-6 Astra / High** na primeira conversa de planejamento se disponível; se não, GPT-6.1 Sol / High.
6. Cole o CONTEÚDO do arquivo `prompts/00-INICIAR.md` (sem copiar segredos). Esse passo deve criar **APENAS documentação de arquitetura, auditoria e plano do Ciclo 01**; não construir SaaS inteiro.
7. Leia o relatório e o plano gerado; aprove/corrija. Depois use `prompts/01-CORE.md` no Codex. Execute os próximos prompts na ordem definida em `docs/04-ROADMAP.md`, um ciclo de cada vez.
8. Use `prompts/99-REVISOR.md` antes de cada merge importante. Confira o diff, o PR e os logs de testes.
9. Quando for necessário obter dados do legado, faça um checkout em diretório SEPARADO e permita SOMENTE leitura; nunca entregue credenciais nem conecte o novo projeto ao antigo. Se Codex não conseguir ver o repo privado, o relatório legado fica incompleto sem impedir a construção limpa.

## Modelo recomendado
- **Coordenador de arquitetura:** GPT-6 Astra (High); usar somente enquanto há decisões difíceis; alternativa GPT-6.1 Sol (High).
- **Implementador:** GPT-6.1 Sol (Medium), com teste independente.
- **Revisão crítica de segurança e cálculos:** GPT-6 Astra (High) se disponibilizado.
- **Subagentes:** até 3 concorrentes, apenas em tarefas independentes. A capacidade real de selecionar modelo/papel difere por versão e modelo permitido; verifique ferramenta de spawn/allowlist, não force modelo incompatível.

## Estrutura do kit
```
AGENTS.md                       Diretrizes de comportamento do Codex
config/codex-config-exemplo.toml Config multi-agent (trecho, não substituir config inteiro)
docs/01-PRODUTO-V3.md           Escopo aprovado e decisões do fundador
docs/02-ARQUITETURA-E-LIMITES.md Fronteiras, stack e dados
docs/03-CRITERIOS-DE-ACEITE.md Cenários de teste verificáveis
docs/04-ROADMAP.md             Ordem e dependências
prompts/00-INICIAR.md          Prompt mestre para primeira execução
prompts/01-CORE.md ... 08-PILOTO.md   Prompts por ciclo
prompts/99-REVISOR.md          Revisão independente
```

## Marcos de liberação
**Marco 1:** duas contas distintas sem vazamento e portal em dev; **Marco 2:** custo médio real comprovado em banco; **Marco 3:** ficha medida e custo dinâmico; **Marco 4:** App 02 autônomo e integrado; **Marco 5:** compras Premium com entitlement; **Marco 6:** IA com confirmação e quotas; **Marco 7:** staging e piloto.

## O que NÃO será prometido pelo kit
Este kit **não é o código do SaaS**, não configura credenciais nem gera deploy. Ele dá o contrato e os prompts para o Codex trabalhar sob supervisão e provar cada fase. O arquivo V3 é um desenho a ser transformado em planos por subprojeto; nenhum teste foi executado no novo produto.

## Referências oficiais para conferir recursos atuais
- [OpenAI — Code generation](https://developers.openai.com/api/docs/guides/code-generation)
- [OpenAI — Model selection](https://developers.openai.com/api/docs/guides/model-selection)
- [OpenAI Codex GitHub](https://github.com/openai/codex)
- [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel — Backend](https://vercel.com/docs/frameworks/backend)
