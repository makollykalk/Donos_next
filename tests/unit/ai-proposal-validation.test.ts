import { describe, expect, it } from 'vitest';
import type { AiTextCandidate } from '@donos/contracts';
import { validateInventoryCandidate } from '@donos/domain-ai';

const candidate = (overrides: Partial<AiTextCandidate> = {}): AiTextCandidate => ({
  action: 'receipt', ingredientDescription: 'Muçarela', quantity: '5', unit: 'kg', totalPrice: '190', unitPrice: null,
  reason: null, ambiguous: false, explanations: [], ...overrides,
});
const catalog = [{ id: 'ingredient-1', name: 'Mucarela', baseUnit: 'kg' as const, active: true }];
const selected = { supplierId: 'supplier-1', locationId: 'location-1' };

describe('validateInventoryCandidate', () => {
  it('resolves one exact active catalog match and derives unit price precisely', () => {
    const result = validateInventoryCandidate(candidate(), catalog, selected);
    expect(result.ingredientId).toBe('ingredient-1');
    expect(result.unitPrice).toBe('38');
    expect(result.status).toBe('ready');
    expect(result.missingFields).toEqual([]);
  });

  it('requires review when there is no exact match or multiple exact active matches', () => {
    expect(validateInventoryCandidate(candidate(), [], selected).ingredientId).toBeNull();
    expect(validateInventoryCandidate(candidate(), [...catalog, { ...catalog[0]!, id: 'ingredient-2' }], selected).ingredientId).toBeNull();
  });

  it('blocks incompatible units', () => {
    expect(validateInventoryCandidate(candidate({ unit: 'L' }), catalog, selected).missingFields).toContain('unit');
  });

  it('requires supplier and location selection for a receipt', () => {
    expect(validateInventoryCandidate(candidate(), catalog, {}).missingFields).toEqual(expect.arrayContaining(['supplier', 'location']));
  });

  it('requires a reason for an issue', () => {
    const result = validateInventoryCandidate(candidate({ action: 'issue', totalPrice: null, unitPrice: null }), catalog, { locationId: 'location-1' });
    expect(result.missingFields).toContain('reason');
    expect(result.status).toBe('needs_review');
  });

  it('blocks zero quantity and ambiguous candidates', () => {
    expect(validateInventoryCandidate(candidate({ quantity: '0' }), catalog, selected).missingFields).toContain('quantity');
    expect(validateInventoryCandidate(candidate({ ambiguous: true }), catalog, selected).status).toBe('needs_review');
  });

  it('uses half-even rounding at twelve decimal places', () => {
    expect(validateInventoryCandidate(candidate({ quantity: '3', totalPrice: '1' }), catalog, selected).unitPrice).toBe('0.333333333333');
    expect(validateInventoryCandidate(candidate({ quantity: '2000000000000', totalPrice: '1' }), catalog, selected).unitPrice).toBe('0');
    expect(validateInventoryCandidate(candidate({ quantity: '2000000000000', totalPrice: '3' }), catalog, selected).unitPrice).toBe('0.000000000002');
  });

  it('does not infer supplier and requests price when both price forms are absent', () => {
    const result = validateInventoryCandidate(candidate({ totalPrice: null, unitPrice: null }), catalog, { locationId: 'location-1' });
    expect(result.missingFields).toEqual(expect.arrayContaining(['supplier', 'price']));
    expect(result.status).toBe('needs_review');
  });
});
