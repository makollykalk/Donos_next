# ADR-0006 — Proposta de estoque por texto dentro do App 01

- **Status:** aprovada pelo fundador em 2026-10-16 para preparar spec/plano; nenhuma implementação autorizada ainda.
- **Contexto:** a V3 prevê IA de texto/WhatsApp, mas o Prompt 07 manda iniciar pela entrada de texto dentro do App 01. O produto ainda não tem entitlement separado para esse ponto de entrada, e o fluxo de compra exige revisão e confirmação do proprietário.
- **Decisões:**
  1. O primeiro subciclo é exclusivamente texto digitado no App 01 e contém uma ação de estoque e um insumo por proposta.
  2. O protótipo local/teste reutiliza o entitlement/medidor `ai_text_whatsapp`. Isso não habilita nem implementa WhatsApp, provedor externo ou cobrança real.
  3. A proposta estruturada é validada no servidor. O proprietário corrige os campos necessários e confirma explicitamente antes de qualquer movimento.
  4. O extrator inicial é determinístico e só pode ser habilitado em desenvolvimento/testes. Produção não apresenta o mock como IA funcional; sem provedor separado, mantém disponível o formulário manual e informa indisponibilidade da interpretação.
  5. A confirmação compõe domínio de recebimento/baixa, proposta e auditoria na mesma transação; chamada de provedor, quando vier a ser autorizada em outro subciclo, fica fora de `retryIdempotent` e de transação aberta.
- **Consequências:** contratos e medição existentes são exercitados sem criar nova chave comercial. O mock pode ser testado sem segredo nem tráfego externo. A autorização C06-DEV não é herdada pelo Ciclo 07.
- **Pendente antes de migration/código:** aprovar prazo e campos mínimos de retenção do texto/proposta, recomendados no plano TDD. Qualquer provedor real, integração paga ou WhatsApp requer aprovação específica posterior.
- **Alternativas consideradas:** criar `ai_text_app` imediatamente (amplia contratos, migration e monetização sem decisão comercial); habilitar `ai_text_whatsapp` também para WhatsApp (fora do escopo e sem autorização); deixar texto sem entitlement (não exercita gate/franquia aprovado no Prompt 07).
- **Referências:** `docs/superpowers/specs/2026-10-16-ai-text-in-app-design.md`, `prompts/07-IA.md`, DEC-003 e DEC-010/011/013.
