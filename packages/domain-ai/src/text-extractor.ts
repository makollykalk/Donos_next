import { AiTextCandidateSchema, type AiTextCandidate } from '@donos/contracts';

const numberPattern = '(\\d+(?:[.,]\\d+)?)';
const quantityPattern = new RegExp(`\\b${numberPattern}\\s*(kg|quilogramas?|g|gramas?|l|litros?|ml|mililitros?|unidades?|un)\\b`, 'iu');
function decimal(value: string): string | null {
  const normalized = value.replace(',', '.').replace(/^0+(?=\d)/u, '');
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const result = `${whole}${fraction ? `.${fraction.replace(/0+$/u, '')}` : ''}`;
  return result.endsWith('.') ? result.slice(0, -1) : result;
}

function unsupported(explanation: string): AiTextCandidate {
  return AiTextCandidateSchema.parse({
    action: null, ingredientDescription: null, quantity: null, unit: null, totalPrice: null,
    unitPrice: null, reason: null, ambiguous: true, explanations: [explanation],
  });
}

export function extractInventoryText(text: string): AiTextCandidate {
  if (text.length > 2000) throw new RangeError('Texto excede o limite de 2.000 caracteres');
  const receiptPattern = /\b(comprei|compramos|recebi|recebemos|entrada|chegou|chegaram)\b/iu;
  const issuePattern = /\b(baixa|baixei|baixamos|usei|usamos|consumi|consumimos|perdi|perdemos|descartei|descartamos)\b/iu;
  const receipt = receiptPattern.test(text);
  const issue = issuePattern.test(text);
  const quantityMatches = [...text.matchAll(new RegExp(quantityPattern.source, 'giu'))];
  const actions = Number(receipt) + Number(issue);
  if (actions !== 1 || quantityMatches.length > 1) return unsupported('Informe uma ação e um único insumo por vez.');
  const action = receipt ? 'receipt' : 'issue';
  const qmatch = quantityMatches[0];
  const unitToken = qmatch?.[2]?.toLocaleLowerCase('pt-BR');
  const unit = unitToken === 'kg' || /^quilogram/iu.test(unitToken ?? '') ? 'kg'
    : unitToken === 'g' || /^gram/iu.test(unitToken ?? '') ? 'g'
    : unitToken === 'l' || /^litro/iu.test(unitToken ?? '') ? 'L'
    : unitToken === 'ml' || /^mililitro/iu.test(unitToken ?? '') ? 'mL'
    : unitToken ? 'un' : null;
  const qty = qmatch?.[1] ? decimal(qmatch[1]) : null;
  const tail = qmatch ? text.slice((qmatch.index ?? 0) + qmatch[0].length) : '';
  const ingredientMatch = tail.match(/^\s*(?:de|do|da|dos|das)?\s*([^,;.!?\n]+?)(?=\s+(?:por|a|no valor de|custando|porque|para|com motivo)\b|[,;.!?\n]|$)/iu);
  const ingredientDescription = ingredientMatch?.[1]?.trim().replace(/\s+/gu, ' ').slice(0, 120) || null;
  const money = action === 'receipt' ? tail.match(new RegExp(`\\b(?:por|no valor de|custando)\\s*(?:R\\$\\s*)?${numberPattern}`, 'iu')) : null;
  const totalPrice = money?.[1] ? decimal(money[1]) : null;
  const reasonMatch = action === 'issue' ? text.match(/\b(?:motivo|porque|por causa de)\s+([^.!?\n,;]+)/iu) : null;
  const reason = reasonMatch?.[1]?.trim().slice(0, 240) || null;
  const missingData = !ingredientDescription || !qty || !unit || (action === 'receipt' && !totalPrice) || (action === 'issue' && !reason);
  return AiTextCandidateSchema.parse({
    action, ingredientDescription, quantity: qty, unit, totalPrice, unitPrice: null, reason,
    ambiguous: missingData,
    explanations: missingData ? ['Revise os campos ausentes antes de continuar.'] : [],
  });
}
