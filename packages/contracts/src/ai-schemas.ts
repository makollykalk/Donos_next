import { z } from 'zod';
import { UUIDSchema } from './schemas.js';
import { PriceStringSchema, QuantityStringSchema, InputUnitSchema } from './inventory-schemas.js';

export const AiTextProposalStatusSchema = z.enum([
  'interpreting', 'needs_review', 'ready', 'confirmed', 'discarded', 'reconciliation_required',
]);
export const AiTextActionSchema = z.enum(['receipt', 'issue']);
export const AiTextMissingFieldSchema = z.enum([
  'action', 'ingredient', 'quantity', 'unit', 'price', 'reason', 'supplier', 'location',
]);

const decimalOrNull = (schema: z.ZodType<string>) => schema.nullable();

export const AiTextRequestSchema = z.strictObject({
  locationId: UUIDSchema,
  text: z.string().trim().min(1).max(2000),
});

export const AiTextCandidateSchema = z.strictObject({
  action: AiTextActionSchema.nullable(),
  ingredientDescription: z.string().trim().max(120).nullable(),
  quantity: decimalOrNull(QuantityStringSchema),
  unit: z.enum(['kg', 'g', 'L', 'mL', 'un']).nullable(),
  totalPrice: decimalOrNull(PriceStringSchema),
  unitPrice: decimalOrNull(PriceStringSchema),
  reason: z.string().trim().max(240).nullable(),
  ambiguous: z.boolean(),
  explanations: z.array(z.string().trim().min(1).max(240)).max(8),
});

export const AiTextProposalSchema = z.strictObject({
  id: UUIDSchema,
  organizationId: UUIDSchema,
  restaurantId: UUIDSchema,
  locationId: UUIDSchema,
  action: AiTextActionSchema.nullable(),
  candidate: AiTextCandidateSchema,
  missingFields: z.array(AiTextMissingFieldSchema),
  status: AiTextProposalStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  resultId: UUIDSchema.nullable(),
}).refine(proposal => proposal.action === proposal.candidate.action);

export const AiTextProposalReviewSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  action: AiTextActionSchema.optional(),
  ingredientId: UUIDSchema.optional(),
  supplierId: UUIDSchema.optional(),
  quantity: QuantityStringSchema.optional(),
  unit: InputUnitSchema.optional(),
  unitPrice: PriceStringSchema.optional(),
  reason: z.string().trim().min(1).max(240).optional(),
});

export const AiTextProposalConfirmSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  confirmed: z.literal(true),
  supplierId: UUIDSchema.optional(),
});

export type AiTextAction = z.infer<typeof AiTextActionSchema>;
export type AiTextMissingField = z.infer<typeof AiTextMissingFieldSchema>;
export type AiTextProposalStatus = z.infer<typeof AiTextProposalStatusSchema>;
export type AiTextCandidate = z.infer<typeof AiTextCandidateSchema>;
export type AiTextProposal = z.infer<typeof AiTextProposalSchema>;
export type AiTextProposalReview = z.infer<typeof AiTextProposalReviewSchema>;
