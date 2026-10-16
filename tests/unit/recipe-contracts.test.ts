import { describe, expect, it } from 'vitest';
import {
  CreateRecipeSchema, CreateRecipeVersionSchema, RecordYieldMeasurementSchema,
  ValidateRecipeMeasurementSchema, RecipeCostQuerySchema,
  RecipeCostComponentSchema,
} from '@donos/contracts';

const organizationId = '10000000-0000-4000-8000-000000000001';
const restaurantId = '10000000-0000-4000-8000-000000000002';
const ingredientId = '10000000-0000-4000-8000-000000000003';
const versionId = '10000000-0000-4000-8000-000000000005';
const componentId = '10000000-0000-4000-8000-000000000006';
const transformationId = '10000000-0000-4000-8000-000000000007';

const version = {
  name: 'Molho base',
  kind: 'preparation',
  outputUnit: 'kg',
  components: [{
    id: componentId, kind: 'ingredient', ingredientId, quantity: '2',
    unit: { kind: 'standard', code: 'kg' }, role: 'ingredient',
  }],
  transformations: [{ id: transformationId, kind: 'cooking', label: 'Cocção', position: 1 }],
};

describe('recipe contracts', () => {
  it('accepts recipe identity without allowing client-supplied tenant or validation fields', () => {
    expect(CreateRecipeSchema.parse({ name: 'Molho base', kind: 'preparation' }))
      .toMatchObject({ kind: 'preparation' });
    expect(CreateRecipeSchema.safeParse({ organizationId, restaurantId, name: 'Molho base', kind: 'preparation' }).success).toBe(false);
    expect(CreateRecipeVersionSchema.safeParse({ ...version, validated: true }).success).toBe(false);
    expect(CreateRecipeVersionSchema.parse(version).kind).toBe('preparation');
  });

  it('accepts measured gross, net and final yield with observed transformation results', () => {
    const input = {
      kind: 'measured', observedAt: '2026-10-15T10:00:00.000Z', method: 'Balança conferida',
      grossQuantity: '2.5', netQuantity: '2.3', finalQuantity: '1.8', outputUnit: 'kg',
      transformationResults: [{
        transformationId, inputQuantity: '2.3', outputQuantity: '1.8', unit: 'kg',
      }],
    };
    expect(RecordYieldMeasurementSchema.parse(input)).toMatchObject({
      kind: 'measured', grossQuantity: '2.5', netQuantity: '2.3', finalQuantity: '1.8',
    });
  });

  it('keeps estimates distinct and prevents a client from asserting validation', () => {
    const estimated = {
      kind: 'estimated', observedAt: '2026-10-15T10:00:00.000Z', method: 'Estimativa inicial',
      grossQuantity: '2.5', netQuantity: '2.3', finalQuantity: '1.8', outputUnit: 'kg',
      transformationResults: [{ transformationId, inputQuantity: '2.3', outputQuantity: '1.8', unit: 'kg' }],
    };
    expect(RecordYieldMeasurementSchema.parse(estimated).kind).toBe('estimated');
    expect(ValidateRecipeMeasurementSchema.safeParse({ validated: true }).success).toBe(false);
    expect(ValidateRecipeMeasurementSchema.safeParse({}).success).toBe(true);
  });

  it('rejects binary numbers, nonpositive yield, impossible stage units and forged ownership fields', () => {
    const base = {
      kind: 'measured', observedAt: '2026-10-15T10:00:00.000Z', method: 'Balança',
      grossQuantity: '2.5', netQuantity: '2.3', finalQuantity: '1.8', outputUnit: 'kg',
      transformationResults: [{ transformationId, inputQuantity: '2.3', outputQuantity: '1.8', unit: 'kg' }],
    };
    expect(RecordYieldMeasurementSchema.safeParse({ ...base, finalQuantity: 0.3 }).success).toBe(false);
    expect(RecordYieldMeasurementSchema.safeParse({ ...base, finalQuantity: '0' }).success).toBe(false);
    expect(RecordYieldMeasurementSchema.safeParse({ ...base, organizationId, restaurantId }).success).toBe(false);
    expect(RecordYieldMeasurementSchema.safeParse({
      ...base,
      transformationResults: [{ transformationId, inputQuantity: '2.3', outputQuantity: '1.8', unit: 'L' }],
    }).success).toBe(false);
  });

  it('compares decimal yield quantities at a fixed scale before accepting impossible gains', () => {
    const base = {
      kind: 'measured', observedAt: '2026-10-15T10:00:00.000Z', method: 'Balança',
      grossQuantity: '1', netQuantity: '1.1', finalQuantity: '0.5', outputUnit: 'kg',
      transformationResults: [{ transformationId, inputQuantity: '1', outputQuantity: '1.1', unit: 'kg' }],
    };
    expect(RecordYieldMeasurementSchema.safeParse(base).success).toBe(false);
    expect(RecordYieldMeasurementSchema.safeParse({
      ...base,
      transformationResults: [{ ...base.transformationResults[0], gainReason: 'Absorveu água medida' }],
    }).success).toBe(false);
  });

  it('requires explicit confirmation when the same stock ingredient is entered twice', () => {
    const repeated = {
      ...version,
      components: [version.components[0], {
        ...version.components[0], id: '10000000-0000-4000-8000-000000000008', quantity: '0.1',
      }],
    };
    expect(CreateRecipeVersionSchema.safeParse(repeated).success).toBe(false);
    expect(CreateRecipeVersionSchema.safeParse({
      ...repeated,
      components: repeated.components.map((component) => ({ ...component, duplicateUseReason: 'Uso em duas etapas' })),
    }).success).toBe(true);
  });

  it('accepts an exact child recipe version and rejects duplicate component identifiers', () => {
    const nested = {
      ...version,
      components: [{
        id: componentId, kind: 'recipe', recipeVersionId: versionId,
        quantity: '0.3', unit: 'kg', role: 'ingredient',
      }],
    };
    expect(CreateRecipeVersionSchema.parse(nested).components[0]).toMatchObject({
      kind: 'recipe', recipeVersionId: versionId,
    });
    expect(CreateRecipeVersionSchema.safeParse({
      ...nested,
      components: [{ ...nested.components[0], unit: 'g' }],
    }).success).toBe(true);
    expect(CreateRecipeVersionSchema.safeParse({
      ...nested, components: [nested.components[0], nested.components[0]],
    }).success).toBe(false);
  });

  it('requires a valid physical stock location for current recipe cost', () => {
    const locationId = '10000000-0000-4000-8000-000000000009';
    expect(RecipeCostQuerySchema.safeParse({}).success).toBe(false);
    expect(RecipeCostQuerySchema.safeParse({ locationId }).success).toBe(true);
    expect(RecipeCostQuerySchema.safeParse({ locationId, organizationId }).success).toBe(false);
  });

  it('requires exact rational cost and stable component paths in the recipe breakdown', () => {
    const component = {
      componentPath: [componentId, versionId], role: 'packaging',
      costPerFinalUnitExact: { numerator: '1000000000000', denominator: '3' },
    };
    expect(RecipeCostComponentSchema.parse(component)).toEqual(component);
    expect(RecipeCostComponentSchema.safeParse({
      ...component, costPerFinalUnitExact: { numerator: 1, denominator: '3' },
    }).success).toBe(false);
    expect(RecipeCostComponentSchema.safeParse({ ...component, componentPath: [] }).success).toBe(false);
  });
});
