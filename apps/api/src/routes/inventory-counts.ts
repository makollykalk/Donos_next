import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CancelInventoryCountSchema, CloseInventoryCountSchema, ContextSelectionSchema, InventoryCountReportQuerySchema, OpenInventoryCountSchema, RecordInventoryCountSchema, ReviewInventoryCountItemSchema, StockLocationQuerySchema, UUIDSchema, ValidateInventoryCountItemSchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
import { createInventoryCountService } from '../services/inventory-counts.js';

export function registerInventoryCounts(app: FastifyInstance, services: ApiServices) {
  const base = '/v1/organizations/:organizationId/restaurants/:restaurantId/inventory/counts';
  async function args(request: FastifyRequest) {
    const actor = await services.actor(request);
    const params = request.params as Record<string, string>;
    const selection = validate(ContextSelectionSchema, { organizationId: params.organizationId, restaurantId: params.restaurantId });
    const token = request.headers['x-donos-context'];
    if (typeof token !== 'string') throw new DomainError('CONTEXT_MISMATCH', 409);
    return [actor, selection, token] as const;
  }
  const id = (request: FastifyRequest, key: string) => validate(UUIDSchema, (request.params as Record<string, string>)[key]);
  const key = (request: FastifyRequest) => validate(UUIDSchema, request.headers['idempotency-key']);
  const service = () => createInventoryCountService(services.database());

  app.get(base, async (request) => {
    const { locationId } = validate(StockLocationQuerySchema, request.query);
    return service().list(...await args(request), locationId);
  });
  app.post(base, async (request, reply) => reply.code(201).send(await service().open(...await args(request), validate(OpenInventoryCountSchema, request.body), key(request))));
  app.get(base + '/:countId', async (request) => service().get(...await args(request), id(request, 'countId')));
  app.get(base + '/:countId/report', async (request) => {
    const query = validate(InventoryCountReportQuerySchema, request.query);
    return service().report(...await args(request), id(request, 'countId'), query.phase);
  });
  app.post(base + '/:countId/items/:itemId/record', async (request) => service().record(...await args(request), id(request, 'countId'), id(request, 'itemId'), validate(RecordInventoryCountSchema, request.body), key(request)));
  app.post(base + '/:countId/items/:itemId/review', async (request) => service().review(...await args(request), id(request, 'countId'), id(request, 'itemId'), validate(ReviewInventoryCountItemSchema, request.body), key(request)));
  app.post(base + '/:countId/items/:itemId/validate', async (request) => {
    validate(ValidateInventoryCountItemSchema, request.body);
    return service().validate(...await args(request), id(request, 'countId'), id(request, 'itemId'), key(request));
  });
  app.post(base + '/:countId/close', async (request) => {
    const body = validate(CloseInventoryCountSchema, request.body);
    return service().close(...await args(request), id(request, 'countId'), body.confirmed, key(request));
  });
  app.post(base + '/:countId/cancel', async (request) => {
    const body = validate(CancelInventoryCountSchema, request.body);
    return service().cancel(...await args(request), id(request, 'countId'), body.reason, key(request));
  });
}
