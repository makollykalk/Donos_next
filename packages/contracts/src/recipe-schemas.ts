import { z } from 'zod';
import { BaseUnitSchema, InputUnitSchema, InventoryValueStringSchema, QuantityStringSchema } from './inventory-schemas.js';
import { UUIDSchema } from './schemas.js';

const RecipeUUIDSchema = UUIDSchema.transform((value) => value.toLowerCase());
const nonEmptyName = z.string().trim().min(1).max(120);
const positiveQuantity = QuantityStringSchema.refine((value) => value !== '0', 'A quantidade deve ser positiva');
const reason = z.string().trim().min(1).max(240);

export const RecipeKindSchema = z.enum(['product', 'preparation']);
export const RecipeOutputUnitSchema = BaseUnitSchema;
export const RecipeMeasureUnitSchema = z.enum(['kg', 'g', 'L', 'mL', 'un']);
export const RecipeTransformationKindSchema = z.enum(['cleaning', 'cooking', 'loss', 'other']);
export const RecipeComponentRoleSchema = z.enum(['ingredient', 'packaging']);

export const CreateRecipeSchema = z.strictObject({ name: nonEmptyName, kind: RecipeKindSchema });

const IngredientRecipeComponentSchema = z.strictObject({
  id: RecipeUUIDSchema,
  kind: z.literal('ingredient'),
  ingredientId: RecipeUUIDSchema,
  quantity: positiveQuantity,
  unit: InputUnitSchema,
  role: RecipeComponentRoleSchema,
  duplicateUseReason: reason.optional(),
});
const NestedRecipeComponentSchema = z.strictObject({
  id: RecipeUUIDSchema,
  kind: z.literal('recipe'),
  recipeVersionId: RecipeUUIDSchema,
  quantity: positiveQuantity,
  unit: RecipeMeasureUnitSchema,
  role: RecipeComponentRoleSchema,
  duplicateUseReason: reason.optional(),
});
export const RecipeComponentInputSchema = z.discriminatedUnion('kind', [
  IngredientRecipeComponentSchema,
  NestedRecipeComponentSchema,
]);

export const RecipeTransformationInputSchema = z.strictObject({
  id: RecipeUUIDSchema,
  kind: RecipeTransformationKindSchema,
  label: nonEmptyName,
  position: z.number().int().min(1).max(30),
});

export const CreateRecipeVersionSchema = z.strictObject({
  name: nonEmptyName,
  kind: RecipeKindSchema,
  outputUnit: RecipeOutputUnitSchema,
  components: z.array(RecipeComponentInputSchema).min(1).max(250),
  transformations: z.array(RecipeTransformationInputSchema).max(30),
}).superRefine((value, ctx) => {
  const componentIds = new Set<string>();
  const uses = new Map<string, typeof value.components>();
  for (const component of value.components) {
    if (componentIds.has(component.id)) {
      ctx.addIssue({ code: 'custom', path: ['components'], message: 'IDs de componente precisam ser únicos' });
    }
    componentIds.add(component.id);
    const key = component.kind === 'ingredient'
      ? `ingredient:${component.ingredientId}`
      : `recipe:${component.recipeVersionId}`;
    uses.set(key, [...(uses.get(key) ?? []), component]);
  }
  for (const repeated of uses.values()) {
    if (repeated.length > 1) {
      repeated.forEach((component, index) => {
        if (!component.duplicateUseReason) {
          ctx.addIssue({
            code: 'custom', path: ['components', index, 'duplicateUseReason'],
            message: 'Confirme o uso repetido e explique por que será cobrado novamente',
          });
        }
      });
    }
  }
  const transformationIds = new Set<string>();
  const positions = new Set<number>();
  value.transformations.forEach((step, index) => {
    if (transformationIds.has(step.id)) {
      ctx.addIssue({ code: 'custom', path: ['transformations', index, 'id'], message: 'ID de etapa duplicado' });
    }
    if (positions.has(step.position)) {
      ctx.addIssue({ code: 'custom', path: ['transformations', index, 'position'], message: 'Posição de etapa duplicada' });
    }
    transformationIds.add(step.id);
    positions.add(step.position);
  });
});

export const RecipeYieldTransformationResultSchema = z.strictObject({
  transformationId: RecipeUUIDSchema,
  inputQuantity: positiveQuantity,
  outputQuantity: positiveQuantity,
  unit: RecipeOutputUnitSchema,
  gainReason: reason.optional(),
});

export const RecordYieldMeasurementSchema = z.strictObject({
  kind: z.enum(['estimated', 'measured']),
  observedAt: z.iso.datetime(),
  method: z.string().trim().min(1).max(300),
  grossQuantity: positiveQuantity,
  netQuantity: positiveQuantity,
  finalQuantity: positiveQuantity,
  outputUnit: RecipeOutputUnitSchema,
  transformationResults: z.array(RecipeYieldTransformationResultSchema).max(30),
  portionCount: z.string().regex(/^[1-9][0-9]{0,8}(?![\s\S])/u).optional(),
  portionQuantity: positiveQuantity.optional(),
  supersedesMeasurementId: RecipeUUIDSchema.optional(),
}).superRefine((value, ctx) => {
  const toScaled = (quantity: string) => BigInt(quantity.replace('.', '').padEnd(7, '0'));
  if (toScaled(value.netQuantity) > toScaled(value.grossQuantity)) {
    ctx.addIssue({ code: 'custom', path: ['netQuantity'], message: 'Rendimento líquido não pode exceder o bruto' });
  }
  value.transformationResults.forEach((step, index) => {
    if (step.unit !== value.outputUnit) {
      ctx.addIssue({ code: 'custom', path: ['transformationResults', index, 'unit'], message: 'A unidade da etapa deve corresponder à unidade de saída' });
    }
    if (toScaled(step.outputQuantity) > toScaled(step.inputQuantity) && !step.gainReason) {
      ctx.addIssue({ code: 'custom', path: ['transformationResults', index, 'gainReason'], message: 'Informe por que a etapa medida aumentou o rendimento' });
    }
  });
});

export const ValidateRecipeMeasurementSchema = z.strictObject({});
export const RecipeCostQuerySchema = z.strictObject({ locationId: RecipeUUIDSchema });
export const RecipeListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: RecipeUUIDSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export const RecipeCostRatioSchema = z.strictObject({
  numerator: InventoryValueStringSchema,
  denominator: positiveQuantity,
});
