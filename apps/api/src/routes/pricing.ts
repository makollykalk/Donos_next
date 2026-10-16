import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CatalogQuerySchema, CreatePricingChannelSchema, CreatePricingComboSchema,
  CreatePricingProductSchema, CreatePricingSimulationSchema, CreatePricingVariantSchema,
  UpdatePricingChannelSchema, UpdatePricingComboSchema, UpdatePricingProductSchema,
  UpdatePricingVariantSchema, UUIDSchema,
} from '@donos/contracts';
import { z } from 'zod';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
import { createPricingService } from '../services/pricing.js';
import type { ContextSelection } from '@donos/contracts';
import type { VerifiedActor } from '@donos/db';

const simulationListQuery = z.strictObject({
  productId: UUIDSchema,
  limit: CatalogQuerySchema.shape.limit,
  cursor: UUIDSchema.optional(),
});

export function registerPricing(app: FastifyInstance, services: ApiServices) {
  const base = '/v1/organizations/:organizationId/restaurants/:restaurantId/pricing';
  async function args(request: FastifyRequest): Promise<readonly [VerifiedActor, ContextSelection, string]> {
    const actor = await services.actor(request);
    const params = request.params as Record<string, string>;
    const selection = validate<ContextSelection>(z.strictObject({ organizationId: UUIDSchema, restaurantId: UUIDSchema }), {
      organizationId: params.organizationId, restaurantId: params.restaurantId,
    });
    const token = request.headers['x-donos-context'];
    if (typeof token !== 'string') throw new DomainError('CONTEXT_MISMATCH', 409);
    return [actor, selection, token] as const;
  }
  const id = (request: FastifyRequest, key: string) => validate(UUIDSchema, (request.params as Record<string, string>)[key]);
  const key = (request: FastifyRequest) => validate(UUIDSchema, request.headers['idempotency-key']);
  const service = () => createPricingService(services.database());

  app.get(base + '/products', async (request) => service().listProducts(...await args(request), validate(CatalogQuerySchema, request.query)));
  app.post(base + '/products', async (request, reply) => reply.code(201).send(await service().createProduct(...await args(request), validate(CreatePricingProductSchema, request.body), key(request))));
  app.patch(base + '/products/:productId', async (request) => service().updateProduct(...await args(request), id(request, 'productId'), validate(UpdatePricingProductSchema, request.body), key(request)));
  app.post(base + '/products/:productId/variants', async (request, reply) => reply.code(201).send(await service().createVariant(...await args(request), id(request, 'productId'), validate(CreatePricingVariantSchema, request.body), key(request))));
  app.get(base + '/variants/:variantId', async (request) => service().getVariant(...await args(request), id(request, 'variantId')));
  app.patch(base + '/variants/:variantId', async (request) => service().updateVariant(...await args(request), id(request, 'variantId'), validate(UpdatePricingVariantSchema, request.body), key(request)));
  app.get(base + '/channels', async (request) => service().listChannels(...await args(request), validate(CatalogQuerySchema, request.query)));
  app.post(base + '/channels', async (request, reply) => reply.code(201).send(await service().createChannelProfile(...await args(request), validate(CreatePricingChannelSchema, request.body), key(request))));
  app.patch(base + '/channels/:channelId', async (request) => service().updateChannelProfile(...await args(request), id(request, 'channelId'), validate(UpdatePricingChannelSchema, request.body), key(request)));
  app.get(base + '/combos', async (request) => service().listCombos(...await args(request), validate(CatalogQuerySchema, request.query)));
  app.post(base + '/combos', async (request, reply) => reply.code(201).send(await service().createCombo(...await args(request), validate(CreatePricingComboSchema, request.body), key(request))));
  app.patch(base + '/combos/:comboId', async (request) => service().updateCombo(...await args(request), id(request, 'comboId'), validate(UpdatePricingComboSchema, request.body), key(request)));
  app.get(base + '/simulations', async (request) => {
    const query = validate(simulationListQuery, request.query);
    return service().listSimulations(...await args(request), query.productId, query);
  });
  app.post(base + '/simulations', async (request, reply) => reply.code(201).send(await service().simulate(...await args(request), validate(CreatePricingSimulationSchema, request.body), key(request))));
  app.get(base + '/simulations/:simulationId', async (request) => service().getSimulation(...await args(request), id(request, 'simulationId')));
}
