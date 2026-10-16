import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ContextSelectionSchema, CreateRecipeSchema, CreateRecipeVersionSchema, RecipeCostQuerySchema, RecipeListQuerySchema, RecordYieldMeasurementSchema, UUIDSchema, ValidateRecipeMeasurementSchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
import { createRecipeService } from '../services/recipes.js';

export function registerRecipes(app: FastifyInstance, s: ApiServices) {
  const base = '/v1/organizations/:organizationId/restaurants/:restaurantId/recipes';
  async function args(request: FastifyRequest) {
    const actor = await s.actor(request);
    const params = request.params as Record<string, string>;
    const selection = validate(ContextSelectionSchema, { organizationId: params.organizationId, restaurantId: params.restaurantId });
    const token = request.headers['x-donos-context'];
    if (typeof token !== 'string') throw new DomainError('CONTEXT_MISMATCH', 409);
    return [actor, selection, token] as const;
  }
  const id = (request: FastifyRequest, key: string) => validate(UUIDSchema, (request.params as Record<string, string>)[key]);
  const key = (request: FastifyRequest) => validate(UUIDSchema, request.headers['idempotency-key']);
  const service = () => createRecipeService(s.database());
  app.get(base, async (request) => {
    const query = validate(RecipeListQuerySchema, request.query);
    return service().listRecipes(...await args(request), { ...(query.limit === undefined ? {} : { limit: query.limit }), ...(query.cursor === undefined ? {} : { cursor: query.cursor }), ...(query.includeArchived === undefined ? {} : { includeArchived: query.includeArchived }) });
  });
  app.post(base, async (request, reply) => reply.code(201).send(await service().createRecipe(...await args(request), validate(CreateRecipeSchema, request.body), key(request))));
  app.get(base + '/:recipeId', async (request) => service().getRecipe(...await args(request), id(request, 'recipeId')));
  app.post(base + '/:recipeId/versions', async (request, reply) => reply.code(201).send(await service().createRecipeVersion(...await args(request), id(request, 'recipeId'), validate(CreateRecipeVersionSchema, request.body), key(request))));
  app.post(base + '/:recipeId/measurements', async (request, reply) => reply.code(201).send(await service().recordYieldMeasurement(...await args(request), id(request, 'recipeId'), validate(RecordYieldMeasurementSchema, request.body), key(request))));
  app.post(base + '/:recipeId/measurements/:measurementId/validate', async (request, reply) => {
    validate(ValidateRecipeMeasurementSchema, request.body);
    return reply.code(201).send(await service().validateYieldMeasurement(...await args(request), id(request, 'recipeId'), id(request, 'measurementId'), key(request)));
  });
  app.get(base + '/:recipeId/cost', async (request) => {
    const query = validate(RecipeCostQuerySchema, request.query);
    return service().getRecipeCost(...await args(request), id(request, 'recipeId'), query.locationId);
  });
}
