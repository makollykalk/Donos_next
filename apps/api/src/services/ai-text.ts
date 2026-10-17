import { AiTextCandidateSchema, AiTextProposalReviewSchema, AiTextRequestSchema, UUIDSchema } from '@donos/contracts';
import type { AiTextCandidate, ContextSelection } from '@donos/contracts';
import {
  DomainError, aiProposalRepository, canonicalHash, executeIdempotent,
} from '@donos/db';
import type { Database, RestaurantContext, Tx, VerifiedActor } from '@donos/db';
import { inventoryCatalog } from '@donos/db';
import { markUsageDispatched, markUsageUnknown, releaseUsage, reserveUsage, requireEntitlement, settleUsage } from '@donos/domain-billing';
import { validateInventoryCandidate } from '@donos/domain-ai';
import type { InventoryCatalogEntry } from '@donos/domain-ai';
import type { AiTextArgs, AiTextService, CreateTextProposalInput, TextExtractor, UpdateTextProposalInput } from './ai-text-types.js';

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

export function createAiTextService(db: Database, extractor?: TextExtractor): AiTextService {
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
        const saved = await aiProposalRepository.updateReview(ctx, proposalId!, 1, {
          status: validated.status, candidate: validated.candidate,
          review: { action: validated.action, ingredientId: validated.ingredientId, unitPrice: validated.unitPrice, missingFields: validated.missingFields },
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
        const priorReview = previous.review as { action?: AiTextCandidate['action']; ingredientId?: string; supplierId?: string; quantity?: string; unit?: AiTextCandidate['unit']; unitPrice?: string; reason?: string };
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
        const unitPrice = review.unitPrice ?? priorReview.unitPrice ?? previous.candidate?.unitPrice ?? null;
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
          status: validated.status, candidate: validated.candidate,
          review: { action: validated.action, ingredientId: validated.ingredientId, ...(supplierId ? { supplierId } : {}), quantity, unit, unitPrice: validated.unitPrice, reason, missingFields: validated.missingFields },
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

  return { createProposal, getProposal, updateProposal, discardProposal };
}
