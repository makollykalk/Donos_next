import type { VerifiedActor } from '@donos/db';
import type {
  ContextSelection, CreateRecipeInput, CreateRecipeVersionInput, RecipeCostDTO, RecipeDetail,
  RecipeSummary, RecipeVersion, RecordYieldMeasurementInput, RecipeYieldMeasurement,
} from '@donos/contracts';
type Args = [actor: VerifiedActor, selection: ContextSelection, contextToken: string];
export interface RecipeService {
  createRecipe(...args: [...Args, input: CreateRecipeInput, key: string]): Promise<RecipeSummary>;
  createRecipeVersion(...args: [...Args, recipeId: string, input: CreateRecipeVersionInput, key: string]): Promise<RecipeVersion>;
  recordYieldMeasurement(...args: [...Args, recipeId: string, input: RecordYieldMeasurementInput, key: string]): Promise<RecipeYieldMeasurement>;
  validateYieldMeasurement(...args: [...Args, recipeId: string, measurementId: string, key: string]): Promise<{ validationEventId: string; measurementId: string; recipeVersionId: string; validatedAt: string; validatedBy: string }>;
  listRecipes(...args: [...Args, query: { limit?: number; cursor?: string; includeArchived?: boolean }]): Promise<{ items: RecipeSummary[]; nextCursor: string | null }>;
  getRecipe(...args: [...Args, recipeId: string]): Promise<RecipeDetail>;
  getRecipeCost(...args: [...Args, recipeId: string]): Promise<RecipeCostDTO>;
}
