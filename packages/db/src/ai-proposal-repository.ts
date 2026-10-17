import type { AiTextCandidate, AiTextProposalStatus } from '@donos/contracts';
import type { RestaurantContext, Tx } from './types.js';
import { DomainError } from './types.js';

export type AiTextProposalRecord = Readonly<{
  id: string;
  organizationId: string;
  restaurantId: string;
  locationId: string;
  actorUserId: string;
  operationKey: string;
  requestHash: string;
  usageReservationId: string;
  status: AiTextProposalStatus;
  version: number;
  candidate: AiTextCandidate | null;
  review: Readonly<Record<string, unknown>>;
  resultId: string | null;
  resultKind: 'receipt' | 'movement' | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
  expiresAt: string;
}>;

export type InsertAiTextProposal = Readonly<{
  locationId: string;
  operationKey: string;
  requestHash: string;
  usageReservationId: string;
  status: Extract<AiTextProposalStatus, 'interpreting' | 'needs_review' | 'ready'>;
  candidate: AiTextCandidate | null;
  review?: Readonly<Record<string, unknown>>;
}>;

export type UpdateAiTextProposalReview = Readonly<{
  status: Extract<AiTextProposalStatus, 'needs_review' | 'ready'>;
  candidate: AiTextCandidate;
  review: Readonly<Record<string, unknown>>;
}>;

type ProposalRow = {
  id: string; organization_id: string; restaurant_id: string; location_id: string; actor_user_id: string;
  operation_key: string; request_hash: string; usage_reservation_id: string;
  status: AiTextProposalStatus; version: number; candidate_json: AiTextCandidate | null;
  review_json: Record<string, unknown>; result_id: string | null;
  receipt_result_id: string | null; movement_result_id: string | null;
  created_at: Date | string; updated_at: Date | string; terminal_at: Date | string | null; expires_at: Date | string;
};

const columns = `id,organization_id,restaurant_id,location_id,actor_user_id,operation_key,request_hash,
  usage_reservation_id,status,version,candidate_json,review_json,receipt_result_id,movement_result_id,result_id,
  created_at,updated_at,terminal_at,expires_at`;
const stamp = (value: Date | string | null): string | null => value === null ? null : new Date(value).toISOString();
function record(row: ProposalRow): AiTextProposalRecord {
  return Object.freeze({
    id: row.id, organizationId: row.organization_id, restaurantId: row.restaurant_id,
    locationId: row.location_id, actorUserId: row.actor_user_id, operationKey: row.operation_key,
    requestHash: row.request_hash, usageReservationId: row.usage_reservation_id,
    status: row.status, version: row.version, candidate: row.candidate_json, review: row.review_json,
    resultId: row.result_id,
    resultKind: row.receipt_result_id ? 'receipt' : row.movement_result_id ? 'movement' : null,
    createdAt: stamp(row.created_at)!, updatedAt: stamp(row.updated_at)!,
    terminalAt: stamp(row.terminal_at), expiresAt: stamp(row.expires_at)!,
  });
}

export const aiProposalRepository = {
  async insert(ctx: RestaurantContext, input: InsertAiTextProposal, tx: Tx): Promise<AiTextProposalRecord> {
    const result = await tx.query<ProposalRow>(
      `insert into core.ai_text_proposals
        (organization_id,restaurant_id,location_id,actor_user_id,operation_key,request_hash,usage_reservation_id,status,candidate_json,review_json)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) returning ${columns}`,
      [ctx.organizationId, ctx.restaurantId, input.locationId, ctx.actor.userId, input.operationKey,
        input.requestHash, input.usageReservationId, input.status,
        input.candidate === null ? null : JSON.stringify(input.candidate), JSON.stringify(input.review ?? {})],
    );
    return record(result.rows[0]!);
  },

  async get(ctx: RestaurantContext, id: string, tx: Tx, forUpdate = false): Promise<AiTextProposalRecord> {
    const result = await tx.query<ProposalRow>(
      `select ${columns} from core.ai_text_proposals
       where organization_id=$1 and restaurant_id=$2 and id=$3 and (expires_at>statement_timestamp() or status='reconciliation_required')${forUpdate ? ' for update' : ''}`,
      [ctx.organizationId, ctx.restaurantId, id],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('RESOURCE_NOT_FOUND', 404);
    return record(row);
  },

  async updateReview(ctx: RestaurantContext, id: string, expectedVersion: number, input: UpdateAiTextProposalReview, tx: Tx): Promise<AiTextProposalRecord> {
    const result = await tx.query<ProposalRow>(
      `update core.ai_text_proposals set status=$4,candidate_json=$5::jsonb,review_json=$6::jsonb
       where organization_id=$1 and restaurant_id=$2 and id=$3 and version=$7
         and status in ('interpreting','needs_review','ready') and expires_at>statement_timestamp()
       returning ${columns}`,
      [ctx.organizationId, ctx.restaurantId, id, input.status, JSON.stringify(input.candidate), JSON.stringify(input.review), expectedVersion],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('RESOURCE_CONFLICT', 409);
    return record(row);
  },

  async markReconciliationRequired(ctx: RestaurantContext, id: string, expectedVersion: number, tx: Tx): Promise<AiTextProposalRecord> {
    const result = await tx.query<ProposalRow>(
      `update core.ai_text_proposals set status='reconciliation_required'
       where organization_id=$1 and restaurant_id=$2 and id=$3 and version=$4 and status='interpreting'
       returning ${columns}`,
      [ctx.organizationId, ctx.restaurantId, id, expectedVersion],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError('RESOURCE_CONFLICT', 409);
    return record(row);
  },

  async markTerminal(ctx: RestaurantContext, id: string, expectedVersion: number,
    result: Readonly<{ status: 'confirmed'; resultKind: 'receipt' | 'movement'; resultId: string } | { status: 'discarded'; resultId: null }>, tx: Tx): Promise<AiTextProposalRecord> {
    const updated = await tx.query<ProposalRow>(
      `update core.ai_text_proposals set status=$4,receipt_result_id=$5,movement_result_id=$6
       where organization_id=$1 and restaurant_id=$2 and id=$3 and version=$7
         and (expires_at>statement_timestamp() or status='reconciliation_required')
         and (($4='discarded' and status in ('interpreting','needs_review','ready','reconciliation_required'))
           or ($4='confirmed' and status in ('ready','reconciliation_required')))
       returning ${columns}`,
      [ctx.organizationId, ctx.restaurantId, id, result.status,
        result.status === 'confirmed' && result.resultKind === 'receipt' ? result.resultId : null,
        result.status === 'confirmed' && result.resultKind === 'movement' ? result.resultId : null, expectedVersion],
    );
    const row = updated.rows[0];
    if (!row) throw new DomainError('RESOURCE_CONFLICT', 409);
    return record(row);
  },

  async list(ctx: RestaurantContext, query: Readonly<{
    limit?: number; before?: Readonly<{ createdAt: string; id: string }>; status?: AiTextProposalStatus;
  }>, tx: Tx): Promise<AiTextProposalRecord[]> {
    const limit = Math.max(1, Math.min(50, Math.trunc(query.limit ?? 25)));
    const result = await tx.query<ProposalRow>(
      `select ${columns} from core.ai_text_proposals
       where organization_id=$1 and restaurant_id=$2 and (expires_at>statement_timestamp() or status='reconciliation_required')
         and ($3::text is null or status=$3)
         and ($4::timestamptz is null or (created_at,id)<($4::timestamptz,$5::uuid))
       order by created_at desc,id desc limit $6`,
      [ctx.organizationId, ctx.restaurantId, query.status ?? null, query.before?.createdAt ?? null,
        query.before?.id ?? null, limit],
    );
    return result.rows.map(record);
  },
};
