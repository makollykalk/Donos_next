import { describe, expect, it } from 'vitest';
import type { ConversionSnapshot } from '@donos/contracts';
import { calculateReplenishment } from '../../packages/domain-purchases/src/shopping.js';

const ingredientId = '10000000-0000-4000-8000-000000000004';
const packageId = '10000000-0000-4000-8000-000000000006';
function conversion(factorToBase: string, options: Partial<ConversionSnapshot> = {}): ConversionSnapshot {
  const packageUnit = options.inputUnit?.kind === 'package';
  return {
    ingredientId,
    baseUnit: 'kg',
    allowFractionalCount: false,
    inputUnit: packageUnit ? options.inputUnit! : { kind: 'standard', code: 'kg' },
    factorToBase,
    conversionId: packageUnit ? packageId : null,
    version: packageUnit ? '1' : null,
    label: packageUnit ? 'saco' : null,
    ...options,
  };
}
function input(overrides: Partial<Parameters<typeof calculateReplenishment>[0]> = {}) {
  return {
    balanceQuantity: '8',
    minimumQuantity: '10',
    targetQuantity: '15',
    committedPendingQuantity: '2',
    conversion: conversion('2.5', { inputUnit: { kind: 'package', conversionId: packageId } }),
    ...overrides,
  };
}

describe('exact replenishment calculation', () => {
  it('subtracts only the pending amount supplied by confirmed commitments and marks critical at the minimum', () => {
    expect(calculateReplenishment(input())).toMatchObject({
      critical: true,
      neededBaseQuantity: '5',
      suggestedPurchaseQuantity: '2',
      suggestedBaseQuantity: '5',
    });
  });

  it('treats missing balance as zero and never suggests a negative amount', () => {
    expect(calculateReplenishment(input({ balanceQuantity: null, targetQuantity: '12', committedPendingQuantity: '20' }))).toMatchObject({
      critical: true,
      neededBaseQuantity: '0',
      suggestedPurchaseQuantity: '0',
      suggestedBaseQuantity: '0',
    });
  });

  it('rounds upward to an integer number of packages using exact factors', () => {
    expect(calculateReplenishment(input({
      balanceQuantity: '0', minimumQuantity: '0', targetQuantity: '7', committedPendingQuantity: '0',
      conversion: conversion('3', { inputUnit: { kind: 'package', conversionId: packageId } }),
    }))).toMatchObject({ neededBaseQuantity: '7', suggestedPurchaseQuantity: '3', suggestedBaseQuantity: '9' });
  });

  it('preserves fractional base quantities without floating-point conversion', () => {
    expect(calculateReplenishment(input({
      balanceQuantity: '0', minimumQuantity: '0', targetQuantity: '1.23', committedPendingQuantity: '0',
      conversion: conversion('1'),
    }))).toMatchObject({ neededBaseQuantity: '1.23', suggestedPurchaseQuantity: '1.23', suggestedBaseQuantity: '1.23' });
  });

  it('compares critical quantities numerically rather than lexicographically', () => {
    expect(calculateReplenishment(input({ balanceQuantity: '2', minimumQuantity: '10' })).critical).toBe(true);
    expect(calculateReplenishment(input({ balanceQuantity: '10', minimumQuantity: '2' })).critical).toBe(false);
  });

  it('rounds indivisible unit counts upward and reports critical stock at zero', () => {
    const countConversion: ConversionSnapshot = {
      ...conversion('1'), baseUnit: 'un', inputUnit: { kind: 'standard', code: 'un' },
    };
    expect(calculateReplenishment(input({
      balanceQuantity: '0', minimumQuantity: '0', targetQuantity: '2.5', committedPendingQuantity: '0', conversion: countConversion,
    }))).toMatchObject({ critical: true, suggestedPurchaseQuantity: '3', suggestedBaseQuantity: '3' });
  });

  it('rejects an invalid dimension conversion and a target below the minimum', () => {
    const wrongDimension: ConversionSnapshot = {
      ...conversion('0.001'), baseUnit: 'L', inputUnit: { kind: 'standard', code: 'g' },
    };
    expect(() => calculateReplenishment(input({ conversion: wrongDimension }))).toThrow();
    expect(() => calculateReplenishment(input({ minimumQuantity: '16' }))).toThrow();
  });
});
