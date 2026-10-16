import { describe, expect, it } from 'vitest';
import type {
  Ingredient, InputUnit, RecipeBalanceSource, RecipeResolvedComponent, RecipeVersion,
  RecipeYieldMeasurement,
} from '../../packages/contracts/src/index.js';
import { calculateRecipeCost } from '../../packages/domain-recipes/src/index.js';

const ingredient = (id: string, name: string, baseUnit: Ingredient['baseUnit'] = 'kg', allowFractionalCount = true): Ingredient => ({
  id, organizationId: 'org-a', restaurantId: 'unit-a', name, baseUnit, allowFractionalCount, archived: false,
});
const version = (id: string, name: string, outputUnit: RecipeVersion['outputUnit'] = 'kg'): RecipeVersion => ({
  id, recipeId: `recipe-${id}`, versionNumber: '1', name, kind: 'preparation', outputUnit,
  components: [], transformations: [], createdAt: '2026-10-15T00:00:00.000Z', createdBy: 'owner-a',
});
const measured = (recipeVersionId: string, gross: string, net: string, final: string, outputUnit: RecipeYieldMeasurement['outputUnit'] = 'kg'): RecipeYieldMeasurement => ({
  id: `measurement-${recipeVersionId}`, recipeVersionId, measurementNumber: '1', kind: 'measured',
  observedAt: '2026-10-15T00:00:00.000Z', method: 'Balança conferida', grossQuantity: gross,
  netQuantity: net, finalQuantity: final, outputUnit, transformationResults: [], recordedBy: 'owner-a',
  recordedAt: '2026-10-15T00:00:00.000Z', validation: { validatedAt: '2026-10-15T00:00:00.000Z', validatedBy: 'owner-a' },
});
const direct = (componentId: string, item: Ingredient, quantity: string, unit: Extract<InputUnit, { kind: 'standard' }>, role: 'ingredient' | 'packaging' = 'ingredient'): RecipeResolvedComponent => ({
  kind: 'ingredient', componentId, ingredient: item, quantity, unit,
  conversion: unit.code === 'kg' || unit.code === 'L' || unit.code === 'un' ? null : { factorToBase: unit.code === 'g' || unit.code === 'mL' ? '0.001' : '1', conversionId: null, version: null },
  role,
});
const ratio = (ingredientId: string, numerator: string, denominator: string, sequence = '1'): RecipeBalanceSource => ({
  ingredientId, sequence, lastMovementId: `movement-${ingredientId}`,
  averageCostRatio: { numerator, denominator },
});

type GraphVersion = { version: RecipeVersion; components: RecipeResolvedComponent[] };
type RecipeCostInput = Parameters<typeof calculateRecipeCost>[0];
const graph = (rootVersionId: string, versions: Record<string, GraphVersion>, measurements: Record<string, RecipeYieldMeasurement>, balances: Record<string, RecipeBalanceSource>): RecipeCostInput => ({ rootVersionId, versions, measurements, balances, calculatedAt: '2026-10-15T00:00:00.000Z' });

const ids = {
  beef: '10000000-0000-4000-8000-000000000001', onion: '10000000-0000-4000-8000-000000000002',
  pasta: '10000000-0000-4000-8000-000000000003', cheese: '10000000-0000-4000-8000-000000000004',
  bread: '10000000-0000-4000-8000-000000000005', package: '10000000-0000-4000-8000-000000000006',
  dough: '10000000-0000-4000-8000-000000000007',
  ragout: '20000000-0000-4000-8000-000000000001', lasagna: '20000000-0000-4000-8000-000000000002',
  pizza: '20000000-0000-4000-8000-000000000003', burger: '20000000-0000-4000-8000-000000000004',
};
const stock = {
  [ids.beef]: ratio(ids.beef, '12', '1'), [ids.onion]: ratio(ids.onion, '4', '1'), [ids.pasta]: ratio(ids.pasta, '10', '1'),
  [ids.cheese]: ratio(ids.cheese, '20', '1'), [ids.bread]: ratio(ids.bread, '12', '1'), [ids.package]: ratio(ids.package, '0.25', '1'), [ids.dough]: ratio(ids.dough, '8', '1'),
};
const items = {
  beef: ingredient(ids.beef, 'Carne'), onion: ingredient(ids.onion, 'Cebola'), pasta: ingredient(ids.pasta, 'Massa'),
  cheese: ingredient(ids.cheese, 'Queijo'), bread: ingredient(ids.bread, 'Pão'), package: ingredient(ids.package, 'Embalagem'), dough: ingredient(ids.dough, 'Massa de pizza'),
};
const kg = () => ({ kind: 'standard' as const, code: 'kg' as const });
const ingredientLine = (componentId: string, key: keyof typeof items, quantity: string, role: 'ingredient' | 'packaging' = 'ingredient') => direct(componentId, items[key], quantity, kg(), role);
const nested = (componentId: string, recipeVersionId: string, quantity: string, unit: 'kg' | 'g' | 'L' | 'mL' | 'un' = 'kg', role: 'ingredient' | 'packaging' = 'ingredient'): RecipeResolvedComponent => ({ kind: 'recipe', componentId, recipeVersionId, quantity, unit, role });

describe('exact yield-based recipe cost engine', () => {
  it('costs one measured preparation and three recipes that reuse it at different measured yields', () => {
    const ragout = version(ids.ragout, 'Ragù');
    const lasagna = version(ids.lasagna, 'Lasanha', 'kg');
    const pizza = version(ids.pizza, 'Pizza', 'kg');
    const burger = version(ids.burger, 'Hambúrguer', 'kg');
    const versions = {
      [ids.ragout]: { version: ragout, components: [ingredientLine('c-beef', 'beef', '2'), ingredientLine('c-onion', 'onion', '0.5')] },
      [ids.lasagna]: { version: lasagna, components: [nested('c-ragout', ids.ragout, '0.3'), ingredientLine('c-pasta', 'pasta', '0.2'), ingredientLine('c-cheese', 'cheese', '0.1')] },
      [ids.pizza]: { version: pizza, components: [nested('c-ragout', ids.ragout, '0.15'), ingredientLine('c-pasta', 'dough', '0.25'), ingredientLine('c-cheese', 'cheese', '0.12')] },
      [ids.burger]: { version: burger, components: [nested('c-ragout', ids.ragout, '0.2'), ingredientLine('c-bread', 'bread', '0.1'), ingredientLine('c-cheese', 'cheese', '0.05')] },
    };
    const measurements = {
      [ids.ragout]: measured(ids.ragout, '2.5', '2.3', '1.8'),
      [ids.lasagna]: measured(ids.lasagna, '0.6', '0.58', '0.52'),
      [ids.pizza]: measured(ids.pizza, '0.52', '0.5', '0.47'),
      [ids.burger]: measured(ids.burger, '0.35', '0.33', '0.3'),
    };
    const input = graph(ids.lasagna, versions, measurements, stock);
    const lasagnaCost = calculateRecipeCost(input);
    expect(lasagnaCost.batchCost).toBe('8.333333333333');
    expect(lasagnaCost.finalYield).toEqual({ quantity: '0.52', unit: 'kg' });
    expect(lasagnaCost.costPerFinalUnit).toBe('16.025641025641');
    expect(calculateRecipeCost({ ...input, rootVersionId: ids.pizza }).batchCost).toBe('6.566666666667');
    expect(calculateRecipeCost({ ...input, rootVersionId: ids.pizza }).costPerFinalUnit).toBe('13.971631205674');
    expect(calculateRecipeCost({ ...input, rootVersionId: ids.burger }).batchCost).toBe('5.088888888889');
    expect(calculateRecipeCost({ ...input, rootVersionId: ids.burger }).costPerFinalUnit).toBe('16.962962962963');
    expect(calculateRecipeCost({ ...input, rootVersionId: ids.ragout }).costPerFinalUnit).toBe('14.444444444444');
  });

  it('normalizes compatible kg/g and L/mL units and frozen package factors', () => {
    const flour = ingredient('10000000-0000-4000-8000-000000000020', 'Farinha');
    const liquid = ingredient('10000000-0000-4000-8000-000000000021', 'Leite', 'L');
    const frozenPackage = ingredient('10000000-0000-4000-8000-000000000022', 'Farinha pacote');
    const recipe = version('20000000-0000-4000-8000-000000000020', 'Massa');
    const packageLine: Extract<RecipeResolvedComponent, { kind: 'ingredient' }> = { kind: 'ingredient', componentId: 'package-line', ingredient: frozenPackage, quantity: '2', unit: { kind: 'package', conversionId: '30000000-0000-4000-8000-000000000020' }, conversion: { factorToBase: '0.5', conversionId: '30000000-0000-4000-8000-000000000020', version: '2' }, role: 'packaging' };
    const components: RecipeResolvedComponent[] = [
      direct('g-line', flour, '250', { kind: 'standard', code: 'g' }),
      direct('ml-line', liquid, '250', { kind: 'standard', code: 'mL' }),
      packageLine,
    ];
    const input = graph(recipe.id, { [recipe.id]: { version: recipe, components } }, { [recipe.id]: measured(recipe.id, '1', '0.9', '0.8') }, {
      [flour.id]: ratio(flour.id, '4', '1'), [liquid.id]: ratio(liquid.id, '6', '1'), [frozenPackage.id]: ratio(frozenPackage.id, '4', '1'),
    });
    expect(calculateRecipeCost(input).batchCost).toBe('6.5');
    const newerPackageFactor = {
      ...input,
      versions: { [recipe.id]: { ...input.versions[recipe.id]!, components: [
        components[0]!, components[1]!, { ...packageLine, conversion: { ...packageLine.conversion!, factorToBase: '0.75', version: '3' } },
      ] } },
    };
    expect(calculateRecipeCost(newerPackageFactor).batchCost).toBe('8.5');
    expect(calculateRecipeCost(input).batchCost).toBe('6.5');
  });

  it('accepts whole unit counts and rejects fractional counts or incompatible dimensions', () => {
    const countItem = ingredient('70000000-0000-4000-8000-000000000001', 'Ovo', 'un', false);
    const recipe = version('70000000-0000-4000-8000-000000000002', 'Ovos', 'un');
    const standardUnit = direct('egg', countItem, '2', { kind: 'standard', code: 'un' });
    const input = graph(recipe.id, { [recipe.id]: { version: recipe, components: [standardUnit] } }, { [recipe.id]: measured(recipe.id, '2', '2', '2', 'un') }, { [countItem.id]: ratio(countItem.id, '2', '1') });
    expect(calculateRecipeCost(input).batchCost).toBe('4');
    const fractional = { ...input, versions: { [recipe.id]: { ...input.versions[recipe.id]!, components: [direct('egg', countItem, '0.5', { kind: 'standard', code: 'un' })] } } };
    expect(() => calculateRecipeCost(fractional)).toThrowError('QUANTITY_PRECISION');
    const incompatible = { ...input, versions: { [recipe.id]: { ...input.versions[recipe.id]!, components: [direct('egg', countItem, '1', { kind: 'standard', code: 'kg' })] } } };
    expect(() => calculateRecipeCost(incompatible)).toThrowError('UNIT_INCOMPATIBLE');
  });

  it('normalizes nested preparation quantities in g and mL against the preparation output unit', () => {
    const flour = ingredient('71000000-0000-4000-8000-000000000001', 'Farinha');
    const liquid = ingredient('71000000-0000-4000-8000-000000000002', 'Leite', 'L');
    const flourPrep = version('71000000-0000-4000-8000-000000000003', 'Farinha preparada', 'kg');
    const liquidPrep = version('71000000-0000-4000-8000-000000000004', 'Base líquida', 'L');
    const finalRecipe = version('71000000-0000-4000-8000-000000000005', 'Produto final', 'kg');
    const versions = {
      [flourPrep.id]: { version: flourPrep, components: [direct('flour', flour, '1', { kind: 'standard', code: 'kg' })] },
      [liquidPrep.id]: { version: liquidPrep, components: [direct('milk', liquid, '1', { kind: 'standard', code: 'L' })] },
      [finalRecipe.id]: { version: finalRecipe, components: [nested('flour-use', flourPrep.id, '300', 'g'), nested('milk-use', liquidPrep.id, '250', 'mL')] },
    };
    const input = graph(finalRecipe.id, versions, {
      [flourPrep.id]: measured(flourPrep.id, '1', '1', '1', 'kg'),
      [liquidPrep.id]: measured(liquidPrep.id, '1', '1', '1', 'L'),
      [finalRecipe.id]: measured(finalRecipe.id, '0.55', '0.53', '0.5', 'kg'),
    }, { [flour.id]: ratio(flour.id, '4', '1'), [liquid.id]: ratio(liquid.id, '6', '1') });
    expect(calculateRecipeCost(input).batchCost).toBe('2.7');
    const incompatible = { ...input, versions: { ...versions, [finalRecipe.id]: { ...versions[finalRecipe.id]!, components: [nested('wrong', liquidPrep.id, '1', 'kg')] } } };
    expect(() => calculateRecipeCost(incompatible)).toThrowError('UNIT_INCOMPATIBLE');
  });

  it('uses current average cost ratios, exact half-even rounding, and rejects numeric overflow', () => {
    const recipe = version('20000000-0000-4000-8000-000000000030', 'Custo atual');
    const flour = ingredient('10000000-0000-4000-8000-000000000030', 'Farinha');
    const input = graph(recipe.id, { [recipe.id]: { version: recipe, components: [ingredientLine('flour', 'beef', '1')] } }, { [recipe.id]: measured(recipe.id, '1', '1', '1') }, { [flour.id]: ratio(flour.id, '2', '1') });
    const valid = { ...input, versions: { [recipe.id]: { ...input.versions[recipe.id]!, components: [direct('flour', flour, '1', { kind: 'standard', code: 'kg' })] } } };
    expect(calculateRecipeCost(valid).batchCost).toBe('2');
    const changedBalance = { ...valid, balances: { [flour.id]: ratio(flour.id, '3', '1', '2') } };
    expect(calculateRecipeCost(changedBalance).batchCost).toBe('3');
    const tieRecipe = version('20000000-0000-4000-8000-000000000031', 'Empate');
    const tiny = ingredient('10000000-0000-4000-8000-000000000031', 'Quantum');
    const tie = graph(tieRecipe.id, { [tieRecipe.id]: { version: tieRecipe, components: [direct('tiny', tiny, '0.5', { kind: 'standard', code: 'kg' })] } }, { [tieRecipe.id]: measured(tieRecipe.id, '1', '1', '1') }, { [tiny.id]: ratio(tiny.id, '0.000000000003', '1') });
    expect(calculateRecipeCost(tie).batchCost).toBe('0.000000000002');
    expect(() => calculateRecipeCost({ ...valid, balances: { [flour.id]: ratio(flour.id, '100000000000000000000000000', '1') } })).toThrowError('NUMERIC_RANGE');
  });

  it('rejects cycles, nesting depth over 16, and expansion over 500 components', () => {
    const makeNode = (index: number, components: RecipeResolvedComponent[]) => {
      const id = `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const nodeVersion = version(id, `Nó ${index}`);
      return [id, { version: nodeVersion, components }] as const;
    };
    const cycleA = '40000000-0000-4000-8000-000000000001';
    const cycleB = '40000000-0000-4000-8000-000000000002';
    const cyclical = {
      [cycleA]: { version: version(cycleA, 'A'), components: [nested('ab', cycleB, '1')] },
      [cycleB]: { version: version(cycleB, 'B'), components: [nested('ba', cycleA, '1')] },
    };
    expect(() => calculateRecipeCost(graph(cycleA, cyclical, { [cycleA]: measured(cycleA, '1', '1', '1'), [cycleB]: measured(cycleB, '1', '1', '1') }, {}))).toThrowError('RECIPE_CYCLE');

    const nodes = Array.from({ length: 17 }, (_, i) => makeNode(i + 1, i === 16 ? [] : [nested(`edge-${i}`, `40000000-0000-4000-8000-${String(i + 2).padStart(12, '0')}`, '1')]));
    const deep = Object.fromEntries(nodes);
    expect(() => calculateRecipeCost(graph(nodes[0]![0], deep, Object.fromEntries(nodes.map(([id]) => [id, measured(id, '1', '1', '1')])), {}))).toThrowError('RECIPE_EXPANSION_LIMIT');

    const leafId = '50000000-0000-4000-8000-000000000001';
    const rootId = '50000000-0000-4000-8000-000000000002';
    const grain = ingredient('50000000-0000-4000-8000-000000000003', 'Grão');
    const leaf = version(leafId, 'Folha');
    const root = version(rootId, 'Raiz');
    const leafNode = { version: leaf, components: [ingredientLine('grain', 'beef', '1')] };
    const many = Array.from({ length: 501 }, (_, index) => ({ ...nested(`sub-${index}`, leafId, '1'), duplicateUseReason: 'Cada subpreparo é uma porção independente' }));
    expect(() => calculateRecipeCost(graph(rootId, { [leafId]: { ...leafNode, components: [direct('grain', grain, '1', { kind: 'standard', code: 'kg' })] }, [rootId]: { version: root, components: many } }, { [leafId]: measured(leafId, '1', '1', '1'), [rootId]: measured(rootId, '501', '501', '501') }, { [grain.id]: ratio(grain.id, '1', '1') }))).toThrowError('RECIPE_EXPANSION_LIMIT');
  });

  it('requires confirmed duplicate use, an explicit component role, and a measured nonzero output', () => {
    const recipe = version('60000000-0000-4000-8000-000000000001', 'Ambígua');
    const flour = ingredient('60000000-0000-4000-8000-000000000002', 'Farinha');
    const line = direct('line-a', flour, '1', { kind: 'standard', code: 'kg' });
    const duplicated = { ...line, componentId: 'line-b' };
    const base = graph(recipe.id, { [recipe.id]: { version: recipe, components: [line, duplicated] } }, { [recipe.id]: measured(recipe.id, '2', '2', '2') }, { [flour.id]: ratio(flour.id, '2', '1') });
    expect(() => calculateRecipeCost(base)).toThrowError('RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED');
    const confirmed = { ...base, versions: { [recipe.id]: { ...base.versions[recipe.id]!, components: [{ ...line, duplicateUseReason: 'Primeira porção independente' }, { ...duplicated, duplicateUseReason: 'Segunda porção independente' }] } } };
    expect(calculateRecipeCost(confirmed).batchCost).toBe('4');
    expect(calculateRecipeCost({ ...base, measurements: { [recipe.id]: { ...measured(recipe.id, '2', '2', '2'), kind: 'estimated', validation: null } } })).toMatchObject({ status: 'unavailable', reason: 'NO_VALIDATED_MEASUREMENT' });
    expect(() => calculateRecipeCost({ ...base, measurements: { [recipe.id]: { ...measured(recipe.id, '2', '2', '2'), finalQuantity: '0' } } })).toThrow();
    const noStock = graph(recipe.id, { [recipe.id]: { version: recipe, components: [line] } }, { [recipe.id]: measured(recipe.id, '1', '1', '1') }, {});
    expect(calculateRecipeCost(noStock)).toMatchObject({ status: 'unavailable', reason: 'NO_CURRENT_AVERAGE' });
    const prep = version('60000000-0000-4000-8000-000000000003', 'Pré-preparo sem validação');
    const parent = { ...recipe, kind: 'product' as const };
    const missingPrepMeasurement = graph(parent.id, {
      [parent.id]: { version: parent, components: [nested('prep-line', prep.id, '1')] },
      [prep.id]: { version: prep, components: [line] },
    }, { [parent.id]: measured(parent.id, '1', '1', '1') }, { [flour.id]: ratio(flour.id, '2', '1') });
    expect(calculateRecipeCost(missingPrepMeasurement)).toMatchObject({ status: 'unavailable', reason: 'NO_VALIDATED_MEASUREMENT' });
  });
});
