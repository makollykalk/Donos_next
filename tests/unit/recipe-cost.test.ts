import { describe, expect, it } from 'vitest';
import type { Ingredient, RecipeBalanceSource, RecipeResolvedComponent, RecipeVersion, RecipeYieldMeasurement } from '@donos/contracts';
import { calculateRecipeCost, RecipeCalculationError } from '../../packages/domain-recipes/src/index.js';

const recipeVersion = (id: string, outputUnit: RecipeVersion['outputUnit'] = 'kg'): RecipeVersion => ({
  id, recipeId: `recipe-${id}`, versionNumber: '1', name: `Ficha ${id}`, kind: 'preparation', outputUnit,
  components: [], transformations: [], createdAt: '2026-10-15T00:00:00.000Z', createdBy: 'owner',
});
const measurement = (recipeVersionId: string, finalQuantity: string): RecipeYieldMeasurement => ({
  id: `measurement-${recipeVersionId}`, recipeVersionId, measurementNumber: '1', kind: 'measured',
  observedAt: '2026-10-15T00:00:00.000Z', method: 'Pesagem', grossQuantity: finalQuantity,
  netQuantity: finalQuantity, finalQuantity, outputUnit: 'kg', transformationResults: [],
  recordedBy: 'owner', recordedAt: '2026-10-15T00:00:00.000Z',
  validation: { validatedAt: '2026-10-15T00:00:00.000Z', validatedBy: 'owner' },
});
const item = (id: string, name: string): Ingredient => ({
  id, organizationId: 'org', restaurantId: 'unit', name, baseUnit: 'kg', allowFractionalCount: true, archived: false,
});
const line = (componentId: string, ingredient: Ingredient, role: 'ingredient' | 'packaging', quantity = '1'): RecipeResolvedComponent => ({
  kind: 'ingredient', componentId, ingredient, quantity, unit: { kind: 'standard', code: 'kg' }, conversion: null, role,
});
const nested = (componentId: string, recipeVersionId: string, role: 'ingredient' | 'packaging', quantity = '1'): RecipeResolvedComponent => ({
  kind: 'recipe', componentId, recipeVersionId, quantity, unit: 'kg', role,
});
const balance = (ingredientId: string, valuePerKg: string): RecipeBalanceSource => ({
  ingredientId, sequence: '1', lastMovementId: `movement-${ingredientId}`,
  averageCostRatio: { numerator: valuePerKg, denominator: '1' },
});
const calculate = (
  rootVersionId: string,
  versions: Record<string, { version: RecipeVersion; components: RecipeResolvedComponent[] }>,
  measurements: Record<string, RecipeYieldMeasurement>,
  balances: Record<string, RecipeBalanceSource>,
) => calculateRecipeCost({
  locationId: 'location', rootVersionId, versions, measurements, balances,
  calculatedAt: '2026-10-15T00:00:00.000Z',
});
const ratioValue = ({ numerator, denominator }: { numerator: string; denominator: string }) => ({ n: BigInt(numerator), d: BigInt(denominator) });
const assertRatiosEqual = (left: { numerator: string; denominator: string }, right: { numerator: string; denominator: string }) => {
  expect(BigInt(left.numerator) * BigInt(right.denominator)).toBe(BigInt(right.numerator) * BigInt(left.denominator));
};
const primeNumbers = (count: number): bigint[] => {
  const values: bigint[] = [];
  for (let candidate = 2n; values.length < count; candidate += 1n) {
    if (values.every((prime) => candidate % prime !== 0n)) values.push(candidate);
  }
  return values;
};

describe('recipe exact cost breakdown', () => {
  it('reconciles exact component ratios even when each displayed share would round independently', () => {
    const root = recipeVersion('root');
    const flour = item('flour', 'Farinha');
    const carton = item('carton', 'Embalagem');
    const result = calculate(root.id, { [root.id]: { version: root, components: [
      line('flour-line', flour, 'ingredient'), line('carton-line', carton, 'packaging'),
    ] } }, { [root.id]: measurement(root.id, '3') }, {
      flour: balance(flour.id, '1'), carton: balance(carton.id, '2'),
    });

    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected available cost');
    if (!result.costPerFinalUnitExact) throw new Error('expected exact unit cost');
    expect(result.costPerFinalUnit).toBe('1');
    expect(result.costPerFinalUnitExact).toEqual({ numerator: '1000000000000', denominator: '1' });
    expect(result.costComponents).toEqual([
      { componentPath: ['flour-line'], role: 'ingredient', costPerFinalUnitExact: { numerator: '1000000000000', denominator: '3' } },
      { componentPath: ['carton-line'], role: 'packaging', costPerFinalUnitExact: { numerator: '2000000000000', denominator: '3' } },
    ]);
    const sum = result.costComponents.map((part) => ratioValue(part.costPerFinalUnitExact))
      .reduce((total, part) => ({ n: total.n * part.d + part.n * total.d, d: total.d * part.d }), { n: 0n, d: 1n });
    assertRatiosEqual({ numerator: sum.n.toString(), denominator: sum.d.toString() }, result.costPerFinalUnitExact);
  });

  it('preserves root-to-leaf paths and packaging role from any nested edge', () => {
    const root = recipeVersion('root-nested');
    const child = recipeVersion('child-nested');
    const childWithPackage = recipeVersion('child-package-nested');
    const flour = item('flour-nested', 'Farinha');
    const carton = item('carton-nested', 'Caixa');
    const nestedResult = calculate(root.id, {
      [root.id]: { version: root, components: [
        nested('outer-packaging', child.id, 'packaging'),
        nested('outer-ingredient', childWithPackage.id, 'ingredient'),
      ] },
      [child.id]: { version: child, components: [line('inner-ingredient', flour, 'ingredient')] },
      [childWithPackage.id]: { version: childWithPackage, components: [line('inner-packaging', carton, 'packaging')] },
    }, {
      [root.id]: measurement(root.id, '1'), [child.id]: measurement(child.id, '2'), [childWithPackage.id]: measurement(childWithPackage.id, '2'),
    }, {
      [flour.id]: balance(flour.id, '2'),
      [carton.id]: balance(carton.id, '4'),
    });

    expect(nestedResult.status).toBe('available');
    if (nestedResult.status !== 'available') throw new Error('expected available cost');
    expect(nestedResult.costComponents).toEqual([
      {
        componentPath: ['outer-packaging', 'inner-ingredient'],
        role: 'packaging', costPerFinalUnitExact: { numerator: '1000000000000', denominator: '1' },
      },
      {
        componentPath: ['outer-ingredient', 'inner-packaging'],
        role: 'packaging', costPerFinalUnitExact: { numerator: '2000000000000', denominator: '1' },
      },
    ]);
    expect(nestedResult.costPerFinalUnitExact).toEqual({ numerator: '3000000000000', denominator: '1' });
  });

  it('keeps repeated leaf uses as distinct component paths', () => {
    const root = recipeVersion('root-repeat');
    const flour = item('flour-repeat', 'Farinha');
    const first = { ...line('first-use', flour, 'ingredient'), duplicateUseReason: 'Primeira etapa' };
    const second = { ...line('second-use', flour, 'ingredient'), quantity: '2', duplicateUseReason: 'Segunda etapa' };
    const result = calculate(root.id, { [root.id]: { version: root, components: [first, second] } }, {
      [root.id]: measurement(root.id, '1'),
    }, { [flour.id]: balance(flour.id, '1') });

    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected available cost');
    expect(result.costComponents.map((part) => part.componentPath)).toEqual([['first-use'], ['second-use']]);
    expect(result.costPerFinalUnitExact).toEqual({ numerator: '3000000000000', denominator: '1' });
  });

  it('returns no exact breakdown when the current recipe cost is unavailable', () => {
    const root = recipeVersion('root-unavailable');
    const flour = item('flour-unavailable', 'Farinha');
    const result = calculate(root.id, { [root.id]: { version: root, components: [line('flour-line', flour, 'ingredient')] } }, {
      [root.id]: measurement(root.id, '1'),
    }, {});

    expect(result).toMatchObject({
      status: 'unavailable', reason: 'NO_CURRENT_AVERAGE', costPerFinalUnitExact: null, costComponents: [],
    });
  });

  it('rejects a rational breakdown that exceeds the wire coefficient limit', () => {
    const root = recipeVersion('root-overflow');
    const primes = primeNumbers(130);
    const components = primes.map((_prime, index) => {
      const ingredientId = `ingredient-${index}`;
      return line(`line-${index}`, item(ingredientId, `Ingrediente ${index}`), 'ingredient');
    });
    const balances = Object.fromEntries(primes.map((prime, index) => [
      `ingredient-${index}`,
      { ingredientId: `ingredient-${index}`, sequence: '1', lastMovementId: `movement-${index}`, averageCostRatio: { numerator: '1', denominator: prime.toString() } },
    ]));
    expect(() => calculate(root.id, { [root.id]: { version: root, components } }, {
      [root.id]: measurement(root.id, '1'),
    }, balances)).toThrowError(new RecipeCalculationError('NUMERIC_RANGE'));
  });
});
