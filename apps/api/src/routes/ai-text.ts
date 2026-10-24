import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ContextSelectionSchema, UUIDSchema, AiTextRequestSchema, AiTextProposalReviewSchema, AiTextProposalConfirmSchema } from '@donos/contracts';
import { DomainError } from '@donos/db';
import type { ApiServices } from '../http/security.js';
import { validate } from '../http/security.js';
import { createAiTextService } from '../services/ai-text.js';

export function registerAiText(app: FastifyInstance, services: ApiServices) {
  const base = '/v1/organizations/:organizationId/restaurants/:restaurantId/inventory/ai/text/proposals';
  const service = () => createAiTextService(services.database(), services.textExtractor);
  async function args(request: FastifyRequest) {
    const actor = await services.actor(request);
    const params = request.params as Record<string, string>;
    const selection = validate(ContextSelectionSchema, { organizationId: params.organizationId, restaurantId: params.restaurantId });
    const contextToken = request.headers['x-donos-context'];
    if (typeof contextToken !== 'string') throw new DomainError('CONTEXT_MISMATCH', 409);
    return { actor, selection, contextToken };
  }
  const key = (request: FastifyRequest) => validate(UUIDSchema, request.headers['idempotency-key']);
  const id = (request: FastifyRequest) => validate(UUIDSchema, (request.params as Record<string, string>).proposalId);

  app.post(base, async (request, reply) => reply.code(201).send(await service().createProposal(
    await args(request), validate(AiTextRequestSchema, request.body), key(request), request.id,
  )));
  app.get(base + '/:proposalId', async request => service().getProposal(await args(request), id(request)));
  app.patch(base + '/:proposalId', async request => service().updateProposal(
    await args(request), id(request), validate(AiTextProposalReviewSchema, request.body), key(request),
  ));
  app.post(base + '/:proposalId/discard', async request => service().discardProposal(await args(request), id(request), key(request)));
  app.post(base + '/:proposalId/confirm', async request => service().confirmProposal(
    await args(request), id(request), validate(AiTextProposalConfirmSchema, request.body), key(request),
  ));
}
