import type { z } from 'zod';
import type { CostRatio, InputUnit, Ingredient, StockBalance } from './inventory.js';
import type {
  CreateRecipeSchema, CreateRecipeVersionSchema, RecipeComponentInputSchema,
  RecipeKindSchema, RecipeMeasureUnitSchema, RecipeOutputUnitSchema,
  RecipeTransformationInputSchema, RecordYieldMeasurementSchema,
  RecipeYieldTransformationResultSchema, ValidateRecipeMeasurementSchema, RecipeCostComponentSchema,
} from './recipe-schemas.js';
import type { ExactMoneyRatio } from './exact-money.js';

export type RecipeKind = z.infer<typeof RecipeKindSchema>;
export type RecipeOutputUnit = z.infer<typeof RecipeOutputUnitSchema>;
export type RecipeMeasureUnit = z.infer<typeof RecipeMeasureUnitSchema>;
export type RecipeComponentInput = z.infer<typeof RecipeComponentInputSchema>;
export type RecipeTransformationInput = z.infer<typeof RecipeTransformationInputSchema>;
export type CreateRecipeInput = z.infer<typeof CreateRecipeSchema>;
export type CreateRecipeVersionInput = z.infer<typeof CreateRecipeVersionSchema>;
export type RecordYieldMeasurementInput = z.infer<typeof RecordYieldMeasurementSchema>;
export type RecipeYieldTransformationResult = z.infer<typeof RecipeYieldTransformationResultSchema>;
export type ValidateRecipeMeasurementInput = z.infer<typeof ValidateRecipeMeasurementSchema>;
export type RecipeCostComponentInput = z.infer<typeof RecipeCostComponentSchema>;

export type RecipeStatus = 'draft' | 'estimated' | 'validated' | 'current_version_not_validated';
export type RecipeSummary = {
  id: string;
  name: string;
  kind: RecipeKind;
  status: RecipeStatus;
  currentVersionId: string | null;
  updatedAt: string;
};
export type RecipeVersion = CreateRecipeVersionInput & {
  id: string;
  recipeId: string;
  versionNumber: string;
  createdAt: string;
  createdBy: string;
};
export type RecipeYieldMeasurement = RecordYieldMeasurementInput & {
  id: string;
  recipeVersionId: string;
  measurementNumber: string;
  recordedBy: string;
  recordedAt: string;
  validation: { validatedAt: string; validatedBy: string } | null;
};
export type RecipeDetail = RecipeSummary & {
  currentVersion: RecipeVersion | null;
  versions: RecipeVersion[];
  measurements: RecipeYieldMeasurement[];
};
export type RecipeCostUnavailableReason =
  | 'NO_CURRENT_AVERAGE'
  | 'NO_VALIDATED_MEASUREMENT'
  | 'CURRENT_VERSION_NOT_VALIDATED';
export type RecipeCostComponent = {
  componentPath: string[];
  role: 'ingredient' | 'packaging';
  costPerFinalUnitExact: ExactMoneyRatio;
};
export type RecipeCostStockSource = {
  ingredientId: string;
  sequence: string;
  lastMovementId: string | null;
  averageCost: CostRatio;
};
export type RecipeCostDTO = {
  status: 'available' | 'unavailable';
  reason: RecipeCostUnavailableReason | null;
  recipeId: string;
  recipeVersionId: string;
  locationId: string;
  measurementId: string | null;
  calculatedAt: string;
  source: 'inventory_moving_average';
  currency: 'BRL';
  finalYield: { quantity: string; unit: RecipeOutputUnit } | null;
  batchCost: string | null;
  costPerFinalUnit: string | null;
  costPerFinalUnitExact: ExactMoneyRatio | null;
  costComponents: RecipeCostComponent[];
  stockSources: RecipeCostStockSource[];
};

export type RecipeResolvedComponent =
  | { kind: 'ingredient'; componentId: string; ingredient: Ingredient; quantity: string; unit: InputUnit; conversion: { factorToBase: string; conversionId: string | null; version: string | null } | null; role: 'ingredient' | 'packaging' }
  | { kind: 'recipe'; componentId: string; recipeVersionId: string; quantity: string; unit: RecipeMeasureUnit; role: 'ingredient' | 'packaging' };
export type RecipeBalanceSource = Pick<StockBalance, 'ingredientId' | 'sequence' | 'lastMovementId' | 'averageCostRatio'>;

export type RecipeErrorCode =
  | 'RECIPE_NOT_FOUND'
  | 'RECIPE_CYCLE'
  | 'RECIPE_EXPANSION_LIMIT'
  | 'RECIPE_MEASUREMENT_REQUIRED'
  | 'RECIPE_ESTIMATE_NOT_VALIDATABLE'
  | 'RECIPE_COMPONENT_UNIT_MISMATCH'
  | 'RECIPE_DUPLICATE_COMPONENT_CONFIRMATION_REQUIRED'
  | 'RECIPE_COST_UNAVAILABLE';
