import { AiTextCandidateSchema, AiTextProposalConfirmSchema, AiTextProposalReviewSchema, AiTextRequestSchema, UUIDSchema } from '@donos/contracts';
import type { AiTextCandidate, ContextSelection } from '@donos/contracts';
import {
  DomainError, aiProposalRepository, canonicalHash, executeIdempotent,
} from '@donos/db';
import type { Database, RestaurantContext, Tx, VerifiedActor } from '@donos/db';
import { inventoryCatalog } from '@donos/db';
import { appendInventoryAudit } from '@donos/db';
import { markUsageDispatched, markUsageUnknown, releaseUsage, reserveUsage, requireEntitlement, settleUsage } from '@donos/domain-billing';
import { validateInventoryCandidate } from '@donos/domain-ai';
import type { InventoryCatalogEntry } from '@donos/domain-ai';
import { draftReceipt, receiveReceipt } from '@donos/domain-purchases';
import { InventoryCalculationError, issueStock } from '@donos/domain-inventory';
import type { AiTextArgs, AiTextConfirmationOperations, AiTextService, ConfirmTextProposalInput, CreateTextProposalInput, TextExtractor, UpdateTextProposalInput } from './ai-text-types.js';

type ProposalRecord = Awaited<ReturnType<typeof aiProposalRepository.get>>;
type ApiArgs = AiTextArgs;
const unsupported: AiTextCandidate = AiTextCandidateSchema.parse({
  action: null, ingredientDescription: null, quantity: null, unit: null, totalPrice: null,
  unitPrice: null, reason: null, ambiguous: true, explanations: ['A interpretação precisa ser reconciliada.'],
});

function context(actor: VerifiedActor, selection: ContextSelection, contextToken: string): ApiArgs {
  if (!UUIDSchema.safeParse(selection.organizationId).success || !UUIDSchema.safeParse(selection.restaurantId).success || !/^[a-f0-9]{64}$/u.test(contextToken)) {
    throw new DomainError('VALIDATION_ERROR', 400);
  }
  return { actor, selection, contextToken };
}

function dto(record: ProposalRecord) {
  const candidate = record.candidate ?? unsupported;
  const review = record.review as { action?: AiTextCandidate['action']; missingFields?: string[] };
  return {
    id: record.id, organizationId: record.organizationId, restaurantId: record.restaurantId,
    locationId: record.locationId, action: review.action ?? candidate.action, candidate,
    missingFields: review.missingFields ?? [], status: record.status, version: record.version,
    createdAt: record.createdAt, updatedAt: record.updatedAt, expiresAt: record.expiresAt, resultId: record.resultId,
  };
}

async function inContext<T>(db: Database, args: ApiArgs, fn: (ctx: RestaurantContext, tx: Tx) => Promise<T>): Promise<T> {
  return db.withRestaurantTx(args.actor, args.selection, args.contextToken, async (ctx, tx) => {
    await requireEntitlement(ctx, 'inventory_core', tx);
    return fn(ctx, tx);
  });
}

async function loadCatalog(ctx: RestaurantContext, tx: Tx): Promise<InventoryCatalogEntry[]> {
  const entries: InventoryCatalogEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await inventoryCatalog.listIngredients(ctx, { limit: 100, ...(cursor ? { cursor } : {}) }, tx);
    entries.push(...page.items.map(item => ({ id: item.id, name: item.name, baseUnit: item.baseUnit, active: !item.archived })) as InventoryCatalogEntry[]);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return entries;
}

function scalarUnit(unit: UpdateTextProposalInput['unit']): AiTextCandidate['unit'] | undefined {
  if (!unit) return undefined;
  if (unit.kind === 'package') throw new DomainError('VALIDATION_ERROR', 400);
  return unit.code;
}

async function proposalByKey(ctx: RestaurantContext, key: string, tx: Tx): Promise<ProposalRecord> {
  const found = await tx.query<{ id: string }>(
    'select id from core.ai_text_proposals where organization_id=$1 and restaurant_id=$2 and operation_key=$3',
    [ctx.organizationId, ctx.restaurantId, key],
  );
  if (!found.rows[0]) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
  return aiProposalRepository.get(ctx, found.rows[0].id, tx);
}

export function createAiTextService(db: Database, extractor?: TextExtractor, overrides?: AiTextConfirmationOperations): AiTextService {
  const confirmationOps: AiTextConfirmationOperations = overrides ?? {
    draftReceipt, receiveReceipt, issueStock,
    settleUsage,
  };
  async function createProposal(rawArgs: AiTextArgs, input: CreateTextProposalInput, key: string, requestId = rawArgs.actor.requestId) {
    const args = context(rawArgs.actor, rawArgs.selection, rawArgs.contextToken);
    if (!extractor) throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
    if (!UUIDSchema.safeParse(key).success) throw new DomainError('VALIDATION_ERROR', 400);
    const parsed = AiTextRequestSchema.safeParse(input);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 400);
    const cleanInput = parsed.data;
    const requestHash = canonicalHash({ organizationId: args.selection.organizationId, restaurantId: args.selection.restaurantId, locationId: cleanInput.locationId, text: cleanInput.text });
    let reservationId: string | undefined;
    let proposalId: string | undefined;
    const reserved = await inContext(db, args, async (ctx, tx) => {
      const location = await tx.query('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived', [ctx.organizationId, ctx.restaurantId, cleanInput.locationId]);
      if (!location.rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      const usage = await reserveUsage(ctx, { feature: 'ai_text_whatsapp', operationKey: key, requestHash, maxUnits: '1' }, tx);
      reservationId = usage.reservation.id;
      if (!usage.created) return { existing: await proposalByKey(ctx, key, tx) };
      const proposal = await aiProposalRepository.insert(ctx, {
        locationId: cleanInput.locationId, operationKey: key, requestHash, usageReservationId: usage.reservation.id,
        status: 'interpreting', candidate: unsupported, review: { action: null, missingFields: [] },
      }, tx);
      proposalId = proposal.id;
      return { existing: null as ProposalRecord | null };
    });
    if (reserved.existing) return dto(reserved.existing);
    try {
      await inContext(db, args, async (ctx, tx) => { await markUsageDispatched(ctx, reservationId!, tx); });
    } catch (error) {
      await db.withRestaurantTx(args.actor, args.selection, args.contextToken, async (ctx, tx) => {
        await releaseUsage(ctx, reservationId!, 'NOT_DISPATCHED', tx);
        await aiProposalRepository.markTerminal(ctx, proposalId!, 1, { status: 'discarded', resultId: null }, tx);
      });
      throw error;
    }

    const markReconciliationRequired = async () => db.withRestaurantTx(args.actor, args.selection, args.contextToken, async (ctx, tx) => {
      await markUsageUnknown(ctx, reservationId!, tx);
      await aiProposalRepository.markReconciliationRequired(ctx, proposalId!, 1, tx);
    });
    let extracted: unknown;
    try {
      extracted = await extractor({ text: cleanInput.text, requestId });
    } catch {
      await markReconciliationRequired();
      throw new DomainError('DEPENDENCY_UNAVAILABLE', 503);
    }
    const candidateResult = AiTextCandidateSchema.safeParse(extracted);
    const candidate = candidateResult.success ? candidateResult.data : unsupported;
    try {
      return await inContext(db, args, async (ctx, tx) => {
        await requireEntitlement(ctx, 'ai_text_whatsapp', tx);
        const validated = validateInventoryCandidate(candidate, await loadCatalog(ctx, tx), { locationId: cleanInput.locationId });
        await settleUsage(ctx, reservationId!, '1', tx);
        const saved = await aiProposalRepository.finalizeInterpretation(ctx, proposalId!, 1, {
          status: validated.status, candidate: validated.candidate,
          review: { action: validated.action, ingredientId: validated.ingredientId, unitPrice: validated.unitPrice, unitPriceOverride: null, missingFields: validated.missingFields },
        }, tx);
        return dto(saved);
      });
    } catch (error) {
      await markReconciliationRequired();
      throw error;
    }
  }

  async function getProposal(rawArgs: AiTextArgs, id: string) {
    if (!UUIDSchema.safeParse(id).success) throw new DomainError('VALIDATION_ERROR', 400);
    const args = context(rawArgs.actor, rawArgs.selection, rawArgs.contextToken);
    return inContext(db, args, async (ctx, tx) => dto(await aiProposalRepository.get(ctx, id, tx)));
  }

  async function updateProposal(rawArgs: AiTextArgs, id: string, input: UpdateTextProposalInput, key: string) {
    const args = context(rawArgs.actor, rawArgs.selection, rawArgs.contextToken);
    if (!UUIDSchema.safeParse(id).success || !UUIDSchema.safeParse(key).success) throw new DomainError('VALIDATION_ERROR', 400);
    const parsed = AiTextProposalReviewSchema.safeParse(input);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 400);
    return inContext(db, args, async (ctx, tx) => {
      await requireEntitlement(ctx, 'ai_text_whatsapp', tx);
      const previous = await aiProposalRepository.get(ctx, id, tx);
      const contextHash = canonicalHash(args.contextToken);
      return executeIdempotent({ kind: 'organization', context: ctx }, 'ai.text.proposal.update', key,
        { organizationId: ctx.organizationId, restaurantId: ctx.restaurantId, contextHash, locationId: previous.locationId, proposalId: id, input: parsed.data }, tx, async () => {
        const review = parsed.data;
        const priorReview = previous.review as { action?: AiTextCandidate['action']; ingredientId?: string; supplierId?: string; quantity?: string; unit?: AiTextCandidate['unit']; unitPrice?: string; unitPriceOverride?: string | null; reason?: string };
        const location = await tx.query('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived', [ctx.organizationId, ctx.restaurantId, previous.locationId]);
        if (!location.rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        const catalog = await loadCatalog(ctx, tx);
        const selectedIngredientId = review.ingredientId ?? priorReview.ingredientId;
        const ingredient = selectedIngredientId
          ? catalog.find(item => item.id === selectedIngredientId && item.active)
          : undefined;
        if (selectedIngredientId && !ingredient) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        const supplierId = review.supplierId ?? priorReview.supplierId;
        if (supplierId) {
          const supplier = await tx.query('select id from core.suppliers where organization_id=$1 and id=$2 and not archived', [ctx.organizationId, supplierId]);
          if (!supplier.rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        }
        const unit = scalarUnit(review.unit) ?? priorReview.unit ?? previous.candidate?.unit ?? null;
        const action = review.action ?? priorReview.action ?? previous.candidate?.action ?? null;
        const quantity = review.quantity ?? priorReview.quantity ?? previous.candidate?.quantity ?? null;
        const unitPriceOverride = review.unitPrice ?? priorReview.unitPriceOverride ?? null;
        const unitPrice = unitPriceOverride ?? (previous.candidate?.totalPrice ? null : previous.candidate?.unitPrice ?? null);
        const reason = review.reason ?? priorReview.reason ?? previous.candidate?.reason ?? null;
        const resolvedAmbiguity = Boolean(action && ingredient && quantity && unit &&
          (action === 'receipt' ? (unitPrice || previous.candidate?.totalPrice) : reason));
        const candidate = AiTextCandidateSchema.parse({
          ...(previous.candidate ?? unsupported), action,
          ingredientDescription: ingredient?.name ?? previous.candidate?.ingredientDescription ?? null,
          quantity, unit, unitPrice, reason,
          ambiguous: previous.candidate?.ambiguous ? !resolvedAmbiguity : false,
        });
        const validationCatalog = ingredient ? [ingredient] : catalog;
        const validated = validateInventoryCandidate(candidate, validationCatalog, { locationId: previous.locationId, ...(supplierId ? { supplierId } : {}) });
        return dto(await aiProposalRepository.updateReview(ctx, id, review.expectedVersion, {
          status: validated.status, candidate: { ...validated.candidate, unitPrice: validated.unitPrice },
          review: { action: validated.action, ingredientId: validated.ingredientId, ...(supplierId ? { supplierId } : {}), quantity, unit, unitPrice: validated.unitPrice, unitPriceOverride, reason, missingFields: validated.missingFields },
        }, tx));
      });
    });
  }

  async function discardProposal(rawArgs: AiTextArgs, id: string, key: string) {
    const args = context(rawArgs.actor, rawArgs.selection, rawArgs.contextToken);
    if (!UUIDSchema.safeParse(id).success || !UUIDSchema.safeParse(key).success) throw new DomainError('VALIDATION_ERROR', 400);
    return inContext(db, args, async (ctx, tx) => {
      await requireEntitlement(ctx, 'ai_text_whatsapp', tx);
      const previous = await aiProposalRepository.get(ctx, id, tx);
      const contextHash = canonicalHash(args.contextToken);
      return executeIdempotent({ kind: 'organization', context: ctx }, 'ai.text.proposal.discard', key,
        { organizationId: ctx.organizationId, restaurantId: ctx.restaurantId, contextHash, locationId: previous.locationId, proposalId: id }, tx, async () => {
        await aiProposalRepository.markTerminal(ctx, id, previous.version, { status: 'discarded', resultId: null }, tx);
        return { id, status: 'discarded' as const };
      });
    });
  }

  async function confirmProposal(rawArgs: AiTextArgs, id: string, input: ConfirmTextProposalInput, key: string) {
    const args = context(rawArgs.actor, rawArgs.selection, rawArgs.contextToken);
    const parsed = AiTextProposalConfirmSchema.safeParse(input);
    if (!UUIDSchema.safeParse(id).success || !UUIDSchema.safeParse(key).success || !parsed.success) {
      throw new DomainError('VALIDATION_ERROR', 400);
    }
    const confirmation = parsed.data;
    return inContext(db, args, async (ctx, tx) => {
      await requireEntitlement(ctx, 'ai_text_whatsapp', tx);
      const initial = await aiProposalRepository.get(ctx, id, tx);
      if (initial.actorUserId !== ctx.actor.userId) throw new DomainError('RESOURCE_NOT_FOUND', 404);
      const supplierId = confirmation.supplierId ?? (initial.review as { supplierId?: string }).supplierId;
      const request = { organizationId: ctx.organizationId, restaurantId: ctx.restaurantId, locationId: initial.locationId, proposalId: id, expectedVersion: confirmation.expectedVersion, confirmed: confirmation.confirmed, supplierId: supplierId ?? null };
      return executeIdempotent({ kind: 'organization', context: ctx }, 'ai.text.proposal.confirm', key, request, tx, async () => {
        // Keep the organization usage lock before the proposal row lock, matching reservation/finalization order.
        await confirmationOps.settleUsage(ctx, initial.usageReservationId, '1', tx);
        const proposal = await aiProposalRepository.get(ctx, id, tx, true);
        if (proposal.actorUserId !== ctx.actor.userId || proposal.version !== confirmation.expectedVersion || proposal.status !== 'ready' || !proposal.candidate) throw new DomainError('RESOURCE_CONFLICT', 409);
        const review = proposal.review as { action?: AiTextCandidate['action']; ingredientId?: string; supplierId?: string; quantity?: string; unit?: AiTextCandidate['unit']; unitPrice?: string; reason?: string; missingFields?: string[] };
        const action = review.action ?? proposal.candidate.action;
        const location = await tx.query('select id from core.stock_locations where organization_id=$1 and restaurant_id=$2 and id=$3 and not archived', [ctx.organizationId, ctx.restaurantId, proposal.locationId]);
        if (!location.rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        const catalog = await loadCatalog(ctx, tx);
        const selectedIngredient = review.ingredientId ? catalog.find(entry => entry.id === review.ingredientId && entry.active) : undefined;
        if (!selectedIngredient) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        if (action === 'receipt') {
          if (!supplierId) throw new DomainError('VALIDATION_ERROR', 400);
          const supplier = await tx.query('select id from core.suppliers where organization_id=$1 and id=$2 and not archived', [ctx.organizationId, supplierId]);
          if (!supplier.rowCount) throw new DomainError('RESOURCE_NOT_FOUND', 404);
        }
        const unit = review.unit ?? proposal.candidate.unit;
        const quantity = review.quantity ?? proposal.candidate.quantity;
        const candidate = AiTextCandidateSchema.parse({ ...proposal.candidate, action, ingredientDescription: selectedIngredient.name, quantity, unit, unitPrice: review.unitPrice ?? proposal.candidate.unitPrice, reason: review.reason ?? proposal.candidate.reason, ambiguous: false });
        const validated = validateInventoryCandidate(candidate, catalog, { locationId: proposal.locationId, ...(supplierId ? { supplierId } : {}) });
        if (validated.status !== 'ready' || validated.ingredientId !== selectedIngredient.id || validated.missingFields.length !== 0 || !quantity || !unit) throw new DomainError('VALIDATION_ERROR', 400);
        const inputUnit = { kind: 'standard' as const, code: unit };
        let result: unknown;
        let resultId: string;
        let resultKind: 'receipt' | 'movement';
        try {
          if (action === 'receipt') {
            if (!validated.unitPrice) throw new DomainError('VALIDATION_ERROR', 400);
            const draft = await confirmationOps.draftReceipt(ctx, { supplierId: supplierId!, locationId: proposal.locationId, items: [{ ingredientId: selectedIngredient.id, quantity, unit: inputUnit, unitPrice: validated.unitPrice }] }, tx);
            result = await confirmationOps.receiveReceipt(ctx, draft.id, key, tx);
            resultId = draft.id;
            resultKind = 'receipt';
            await appendInventoryAudit(ctx, { action: 'inventory.receipt.received', entityId: resultId }, tx);
          } else if (action === 'issue') {
            if (!candidate.reason?.trim()) throw new DomainError('VALIDATION_ERROR', 400);
            result = await confirmationOps.issueStock(ctx, { ingredientId: selectedIngredient.id, locationId: proposal.locationId, quantity, unit: inputUnit, reason: candidate.reason }, key, tx);
            resultId = (result as { movementId: string }).movementId;
            resultKind = 'movement';
            await appendInventoryAudit(ctx, { action: 'inventory.issue.posted', entityId: resultId }, tx);
          } else {
            throw new DomainError('VALIDATION_ERROR', 400);
          }
        } catch (error) {
          if (error instanceof InventoryCalculationError) {
            throw new DomainError(error.code === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : error.code === 'RESOURCE_CONFLICT' ? 'RESOURCE_CONFLICT' : 'VALIDATION_ERROR', error.code === 'INSUFFICIENT_STOCK' || error.code === 'RESOURCE_CONFLICT' ? 409 : 400);
          }
          throw error;
        }
        const confirmed = await aiProposalRepository.markTerminal(ctx, id, proposal.version, { status: 'confirmed', resultKind, resultId }, tx);
        return { proposal: dto(confirmed), result };
      });
    });
  }

  return { createProposal, getProposal, updateProposal, discardProposal, confirmProposal };
}
