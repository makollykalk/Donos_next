import { PriceStringSchema, type AiTextAction, type AiTextCandidate, type AiTextMissingField } from '@donos/contracts';

export type InventoryCatalogEntry = { id: string; name: string; baseUnit: 'kg' | 'L' | 'un'; active: boolean };
export type ValidatedInventoryProposal = {
  action: AiTextAction | null;
  candidate: AiTextCandidate;
  ingredientId: string | null;
  unitPrice: string | null;
  missingFields: AiTextMissingField[];
  status: 'needs_review' | 'ready';
};

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/gu, '');
}

function unitCompatible(unit: AiTextCandidate['unit'], base: InventoryCatalogEntry['baseUnit']): boolean {
  if (unit === 'kg' || unit === 'g') return base === 'kg';
  if (unit === 'L' || unit === 'mL') return base === 'L';
  return unit === 'un' && base === 'un';
}

function decimalParts(value: string): { integer: bigint; scale: number } {
  const [whole, fraction = ''] = value.split('.');
  return { integer: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function unitPriceFromTotal(total: string, quantity: string): string {
  const price = decimalParts(total);
  const qty = decimalParts(quantity);
  const denominator = qty.integer * 10n ** BigInt(price.scale);
  const numerator = price.integer * 10n ** BigInt(qty.scale + 12);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;
  if (doubled > denominator || (doubled === denominator && quotient % 2n !== 0n)) quotient += 1n;
  const digits = quotient.toString().padStart(13, '0');
  const whole = digits.slice(0, -12);
  const fraction = digits.slice(-12).replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function validateInventoryCandidate(
  candidate: AiTextCandidate,
  catalog: readonly InventoryCatalogEntry[],
  selection: { supplierId?: string; locationId?: string },
): ValidatedInventoryProposal {
  const missing = new Set<AiTextMissingField>();
  if (!candidate.action) missing.add('action');
  if (!candidate.ingredientDescription) missing.add('ingredient');
  if (!candidate.quantity || candidate.quantity === '0') missing.add('quantity');
  if (!candidate.unit) missing.add('unit');
  if (!selection.locationId) missing.add('location');
  if (candidate.action === 'receipt' && !selection.supplierId) missing.add('supplier');
  if (candidate.action === 'issue' && !candidate.reason) missing.add('reason');
  if (candidate.action === 'receipt' && !candidate.unitPrice && !candidate.totalPrice) missing.add('price');
  const matches = candidate.ingredientDescription
    ? catalog.filter(entry => entry.active && normalizeName(entry.name) === normalizeName(candidate.ingredientDescription!))
    : [];
  const ingredient = matches.length === 1 ? matches[0]! : undefined;
  if (!ingredient) missing.add('ingredient');
  if (ingredient && candidate.unit && !unitCompatible(candidate.unit, ingredient.baseUnit)) missing.add('unit');
  if (candidate.ambiguous) {
    if (candidate.action === null) missing.add('action');
    if (candidate.ingredientDescription) missing.add('ingredient');
  }
  let unitPrice = candidate.unitPrice ?? (candidate.action === 'receipt' && candidate.totalPrice && candidate.quantity && candidate.quantity !== '0'
    ? unitPriceFromTotal(candidate.totalPrice, candidate.quantity) : null);
  if (unitPrice !== null && !PriceStringSchema.safeParse(unitPrice).success) {
    unitPrice = null;
    missing.add('price');
  }
  const missingFields = [...missing];
  return {
    action: candidate.action, candidate, ingredientId: ingredient?.id ?? null, unitPrice, missingFields,
    status: missingFields.length === 0 ? 'ready' : 'needs_review',
  };
}
