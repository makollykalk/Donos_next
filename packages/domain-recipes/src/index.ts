import type {
  Ingredient,
  RecipeBalanceSource,
  RecipeCostDTO,
  RecipeCostStockSource,
  RecipeMeasureUnit,
  RecipeResolvedComponent,
  RecipeVersion,
  RecipeYieldMeasurement,
} from '@donos/contracts';
import {
  checkedQuantity,
  checkedValue,
  normalizeQuantity,
  quantityCoefficient,
  roundHalfEven,
  valueCoefficient,
} from '@donos/domain-inventory';

export class RecipeCalculationError extends Error {
  constructor(public readonly code: 'RECIPE_NOT_FOUND' | 'RECIPE_CYCLE' | 'RECIPE_EXPANSION_LIMIT' | 'RECIPE_COMPONENT_UNIT_MISMATCH' | 'RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED' | 'RECIPE_MEASUREMENT_REQUIRED' | 'NO_CURRENT_AVERAGE' | 'NUMERIC_RANGE' | 'UNIT_INCOMPATIBLE' | 'QUANTITY_PRECISION') {
    super(code);
    this.name = 'RecipeCalculationError';
  }
}

export type ResolvedRecipeComponent = RecipeResolvedComponent & { duplicateUseReason?: string };
export type RecipeGraphNode = { version: RecipeVersion; components: ResolvedRecipeComponent[] };
export type RecipeCalculationInput = {
  rootVersionId: string;
  versions: Record<string, RecipeGraphNode>;
  measurements: Record<string, RecipeYieldMeasurement | undefined>;
  balances: Record<string, RecipeBalanceSource | undefined>;
  calculatedAt: string;
};

type Rational = { n: bigint; d: bigint };
type ExpandedCost = { cost: Rational; measurement: RecipeYieldMeasurement; version: RecipeVersion; sources: Map<string, RecipeCostStockSource> };

const QUANTITY_SCALE_FACTOR = 1_000_000n;
const MAX_DEPTH = 16;
const MAX_EXPANDED_COMPONENTS = 500;
const factors: Record<string, string> = { kg: '1', g: '0.001', L: '1', mL: '0.001', un: '1' };

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new RecipeCalculationError('NUMERIC_RANGE');
  if (d < 0n) return rational(-n, -d);
  const divisor = gcd(n, d);
  return { n: n / divisor, d: d / divisor };
}

function add(left: Rational, right: Rational): Rational {
  return rational(left.n * right.d + right.n * left.d, left.d * right.d);
}

function multiply(left: Rational, right: Rational): Rational {
  return rational(left.n * right.n, left.d * right.d);
}

function checkedFormat(value: bigint): string {
  try {
    return checkedValue(value);
  } catch {
    throw new RecipeCalculationError('NUMERIC_RANGE');
  }
}

function quantity(value: string): bigint {
  try {
    return quantityCoefficient(value);
  } catch {
    throw new RecipeCalculationError('NUMERIC_RANGE');
  }
}

function value(valueText: string): bigint {
  try {
    return valueCoefficient(valueText);
  } catch {
    throw new RecipeCalculationError('NUMERIC_RANGE');
  }
}

function normalizeComponentQuantity(component: Extract<ResolvedRecipeComponent, { kind: 'ingredient' }>): string {
  const item: Ingredient = component.ingredient;
  const isPackage = component.unit.kind === 'package';
  const conversion = component.conversion;
  if (isPackage && !conversion) throw new RecipeCalculationError('UNIT_INCOMPATIBLE');
  const factorToBase = isPackage ? conversion?.factorToBase : factors[component.unit.kind === 'standard' ? component.unit.code : ''];
  if (!factorToBase) throw new RecipeCalculationError('UNIT_INCOMPATIBLE');
  const snapshot = {
    ingredientId: item.id,
    baseUnit: item.baseUnit,
    allowFractionalCount: item.allowFractionalCount,
    inputUnit: component.unit,
    factorToBase,
    conversionId: isPackage ? conversion?.conversionId ?? null : null,
    version: isPackage ? conversion?.version ?? null : null,
    // The resolved contract carries the immutable factor/version. Label is not needed for arithmetic.
    label: isPackage ? 'frozen-conversion' : null,
  } as const;
  try {
    return normalizeQuantity(component.quantity, component.unit, snapshot);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    throw new RecipeCalculationError(code === 'QUANTITY_PRECISION' ? 'QUANTITY_PRECISION' : 'UNIT_INCOMPATIBLE');
  }
}

function normalizeNestedQuantity(quantityText: string, unit: RecipeMeasureUnit, baseUnit: RecipeVersion['outputUnit']): string {
  const factorToBase = factors[unit];
  if (!factorToBase) throw new RecipeCalculationError('UNIT_INCOMPATIBLE');
  const snapshot = {
    ingredientId: '00000000-0000-4000-8000-000000000001',
    baseUnit,
    allowFractionalCount: baseUnit !== 'un',
    inputUnit: { kind: 'standard' as const, code: unit },
    factorToBase,
    conversionId: null,
    version: null,
    label: null,
  };
  try {
    return normalizeQuantity(quantityText, snapshot.inputUnit, snapshot);
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    throw new RecipeCalculationError(code === 'QUANTITY_PRECISION' ? 'QUANTITY_PRECISION' : 'UNIT_INCOMPATIBLE');
  }
}

function assertMeasured(version: RecipeVersion, measurement: RecipeYieldMeasurement | undefined): RecipeYieldMeasurement {
  if (!measurement || measurement.kind !== 'measured' || !measurement.validation || measurement.recipeVersionId !== version.id) {
    throw new RecipeCalculationError('RECIPE_MEASUREMENT_REQUIRED');
  }
  if (measurement.outputUnit !== version.outputUnit || quantity(measurement.finalQuantity) === 0n) {
    throw new RecipeCalculationError('RECIPE_COMPONENT_UNIT_MISMATCH');
  }
  return measurement;
}

function componentKey(component: ResolvedRecipeComponent): string {
  return component.kind === 'ingredient' ? `ingredient:${component.ingredient.id}` : `recipe:${component.recipeVersionId}`;
}

function assertDuplicateConfirmation(components: ResolvedRecipeComponent[]): void {
  const grouped = new Map<string, ResolvedRecipeComponent[]>();
  for (const component of components) grouped.set(componentKey(component), [...(grouped.get(componentKey(component)) ?? []), component]);
  for (const repeated of grouped.values()) {
    if (repeated.length > 1 && repeated.some((component) => !component.duplicateUseReason?.trim())) {
      throw new RecipeCalculationError('RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED');
    }
  }
}

function unavailable(input: RecipeCalculationInput, version: RecipeVersion, reason: RecipeCostDTO['reason']): RecipeCostDTO {
  return {
    status: 'unavailable', reason, recipeId: version.recipeId, recipeVersionId: version.id,
    measurementId: input.measurements[version.id]?.id ?? null, calculatedAt: input.calculatedAt,
    source: 'inventory_moving_average', currency: 'BRL', finalYield: null, batchCost: null,
    costPerFinalUnit: null, stockSources: [],
  };
}

function expand(input: RecipeCalculationInput, versionId: string, path: Set<string>, depth: number, counter: { count: number }): ExpandedCost {
  const node = input.versions[versionId];
  if (!node) throw new RecipeCalculationError('RECIPE_NOT_FOUND');
  if (path.has(versionId)) throw new RecipeCalculationError('RECIPE_CYCLE');
  if (depth > MAX_DEPTH) throw new RecipeCalculationError('RECIPE_EXPANSION_LIMIT');
  path.add(versionId);
  assertDuplicateConfirmation(node.components);
  let total = rational(0n);
  const sources = new Map<string, RecipeCostStockSource>();
  for (const component of node.components) {
    counter.count += 1;
    if (counter.count > MAX_EXPANDED_COMPONENTS) throw new RecipeCalculationError('RECIPE_EXPANSION_LIMIT');
    if (component.kind === 'ingredient') {
      const baseQuantity = quantity(normalizeComponentQuantity(component));
      const balance = input.balances[component.ingredient.id];
      if (!balance?.averageCostRatio) throw new RecipeCalculationError('NO_CURRENT_AVERAGE');
      const denominator = quantity(balance.averageCostRatio.denominator);
      const numerator = value(balance.averageCostRatio.numerator);
      if (denominator === 0n) throw new RecipeCalculationError('NO_CURRENT_AVERAGE');
      total = add(total, rational(baseQuantity * numerator, denominator));
      sources.set(component.ingredient.id, {
        ingredientId: component.ingredient.id,
        sequence: balance.sequence,
        lastMovementId: balance.lastMovementId,
        averageCost: balance.averageCostRatio,
      });
      continue;
    }
    const child = input.versions[component.recipeVersionId];
    if (!child) throw new RecipeCalculationError('RECIPE_COMPONENT_UNIT_MISMATCH');
    const expanded = expand(input, component.recipeVersionId, path, depth + 1, counter);
    const childYield = quantity(expanded.measurement.finalQuantity);
    const componentQuantity = quantity(normalizeNestedQuantity(component.quantity, component.unit, child.version.outputUnit));
    total = add(total, multiply(expanded.cost, rational(componentQuantity, childYield)));
    for (const [id, source] of expanded.sources) sources.set(id, source);
  }
  path.delete(versionId);
  return { cost: total, measurement: assertMeasured(node.version, input.measurements[versionId]), version: node.version, sources };
}

/** Calculates current recipe cost from exact stock average ratios and real measured final yields. */
export function calculateRecipeCost(input: RecipeCalculationInput): RecipeCostDTO {
  const root = input.versions[input.rootVersionId];
  if (!root) throw new RecipeCalculationError('RECIPE_NOT_FOUND');
  const rootMeasurement = input.measurements[root.version.id];
  if (!rootMeasurement || rootMeasurement.kind !== 'measured' || !rootMeasurement.validation) {
    return unavailable(input, root.version, 'NO_VALIDATED_MEASUREMENT');
  }
  try {
    const expanded = expand(input, input.rootVersionId, new Set(), 1, { count: 0 });
    const roundedBatch = roundHalfEven(expanded.cost.n, expanded.cost.d);
    const finalYieldCoefficient = quantity(expanded.measurement.finalQuantity);
    const perUnit = roundHalfEven(expanded.cost.n * QUANTITY_SCALE_FACTOR, expanded.cost.d * finalYieldCoefficient);
    const batchCost = checkedFormat(roundedBatch);
    const costPerFinalUnit = checkedFormat(perUnit);
    try {
      checkedQuantity(finalYieldCoefficient);
    } catch {
      throw new RecipeCalculationError('NUMERIC_RANGE');
    }
    const stockSources = [...expanded.sources.values()].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
    return {
      status: 'available', reason: null, recipeId: expanded.version.recipeId, recipeVersionId: expanded.version.id,
      measurementId: expanded.measurement.id, calculatedAt: input.calculatedAt, source: 'inventory_moving_average',
      currency: 'BRL', finalYield: { quantity: expanded.measurement.finalQuantity, unit: expanded.version.outputUnit },
      batchCost, costPerFinalUnit, stockSources,
    };
  } catch (error) {
    if (error instanceof RecipeCalculationError && error.code === 'NO_CURRENT_AVERAGE') {
      return unavailable(input, root.version, 'NO_CURRENT_AVERAGE');
    }
    throw error;
  }
}
