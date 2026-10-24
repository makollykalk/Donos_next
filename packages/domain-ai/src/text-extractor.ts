import { AiTextCandidateSchema, type AiTextCandidate } from '@donos/contracts';

const numberPattern = '(\\d+(?:[.,]\\d+)?)';
const quantityPattern = new RegExp(`\\b${numberPattern}\\s*(kg|quilogramas?|g|gramas?|l|litros?|ml|mililitros?|unidades?|un)\\b`, 'iu');
const localizedMoneyPattern = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';

function normalizedDecimal(value: string): string | null {
  const withoutLeadingZeroes = value.replace(/^0+(?=\d)/u, '');
  if (!/^\d+(?:\.\d+)?$/u.test(withoutLeadingZeroes)) return null;
  const [whole, fraction = ''] = withoutLeadingZeroes.split('.');
  const result = `${whole}${fraction ? `.${fraction.replace(/0+$/u, '')}` : ''}`;
  return result.endsWith('.') ? result.slice(0, -1) : result;
}

function quantityDecimal(value: string): string | null {
  return normalizedDecimal(value.replace(',', '.'));
}

function currencyDecimal(value: string): string | null {
  const normalized = value.includes(',')
    ? value.replace(/\./gu, '').replace(',', '.')
    : /^[1-9]\d{0,2}(?:\.\d{3})+$/u.test(value) ? value.replace(/\./gu, '') : value;
  return normalizedDecimal(normalized);
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
  const operationPattern = /\b(comprei|compramos|compra|compras|recebi|recebemos|entrada|chegou|chegaram|baixa|baixei|baixamos|baixe|usei|usamos|consumi|consumimos|perdi|perdemos|descartei|descartamos)\b/giu;
  const operationCount = [...text.matchAll(operationPattern)].length;
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
  const qty = qmatch?.[1] ? quantityDecimal(qmatch[1]) : null;
  const tail = qmatch ? text.slice((qmatch.index ?? 0) + qmatch[0].length) : '';
  const ingredientMatch = tail.match(/^\s*(?:de|do|da|dos|das)?\s*([^,;.!?\n]+?)(?=\s+(?:por|a|no valor de|custando|porque|para|com motivo)\b|[,;.!?\n]|$)/iu);
  const ingredientDescription = ingredientMatch?.[1]?.trim().replace(/\s+/gu, ' ').slice(0, 120) || null;
  const money = action === 'receipt' ? tail.match(new RegExp(`\\b(?:por|no valor de|custando)\\s*(?:R\\$\\s*)?${localizedMoneyPattern}`, 'iu')) : null;
  const explicitUnitPrice = money
    ? new RegExp(`^\\s*(?:/\\s*(?:kg|g|l|ml|un)\\b|por\\s+(?:kg|g|l|ml|un)\\b)`, 'iu').test(tail.slice((money.index ?? 0) + money[0].length))
    : false;
  const totalPrice = money?.[1] && !explicitUnitPrice ? currencyDecimal(money[1]) : null;
  const reasonMatch = action === 'issue' ? text.match(/\b(?:motivo|porque|por causa de)\s+([^.!?\n,;]+)/iu) : null;
  const reason = reasonMatch?.[1]?.trim().slice(0, 240) || null;
  const extraConjunction = qmatch ? /\be\b/iu.test(tail) : false;
  const multipleOperations = operationCount > 1;
  const missingData = !ingredientDescription || !qty || !unit || (action === 'receipt' && !totalPrice) || (action === 'issue' && !reason);
  const ambiguous = missingData || explicitUnitPrice || extraConjunction || multipleOperations;
  return AiTextCandidateSchema.parse({
    action, ingredientDescription, quantity: qty, unit, totalPrice, unitPrice: null, reason,
    ambiguous,
    explanations: ambiguous ? ['Revise os campos e confirme que o texto contém uma única operação.'] : [],
  });
}
