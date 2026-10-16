import { describe, expect, it } from 'vitest';
import { quantityDifference } from '../../packages/db/src/inventory-count-repository.js';

describe('inventory count quantity difference', () => {
  it('preserves whole-number magnitude and fractional precision', () => {
    expect(quantityDifference('12', '10')).toBe('2');
    expect(quantityDifference('0.5', '1.25')).toBe('-0.75');
    expect(quantityDifference('10.000001', '10')).toBe('0.000001');
  });
});
