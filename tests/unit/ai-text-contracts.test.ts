import { describe, expect, it } from 'vitest';
import {
  AiTextCandidateSchema,
  AiTextProposalSchema,
  AiTextRequestSchema,
  AiTextProposalStatusSchema,
} from '@donos/contracts';

const uuid = '11111111-1111-4111-8111-111111111111';

describe('AI text contracts', () => {
  it('accepts a bounded request and rejects blank or oversized raw text', () => {
    expect(AiTextRequestSchema.safeParse({ locationId: uuid, text: ' Comprei 5 kg ' }).success).toBe(true);
    expect(AiTextRequestSchema.safeParse({ locationId: uuid, text: '  ' }).success).toBe(false);
    expect(AiTextRequestSchema.safeParse({ locationId: uuid, text: 'a'.repeat(2001) }).success).toBe(false);
    expect(AiTextRequestSchema.safeParse({ locationId: uuid, text: 'Comprei 5 kg', organizationId: uuid }).success).toBe(false);
  });

  it('accepts only strict candidate fields with decimal values as strings', () => {
    const candidate = {
      action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
      totalPrice: '190', unitPrice: null, reason: null, ambiguous: false,
      explanations: [],
    };
    expect(AiTextCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(AiTextCandidateSchema.safeParse({ ...candidate, quantity: 5 }).success).toBe(false);
    expect(AiTextCandidateSchema.safeParse({ ...candidate, sql: 'delete from core.stock' }).success).toBe(false);
    expect(AiTextCandidateSchema.safeParse({ ...candidate, action: null, ingredientDescription: null }).success).toBe(true);
  });

  it('requires complete tenant context and explicit proposal lifecycle fields', () => {
    const proposal = {
      id: uuid, organizationId: uuid, restaurantId: uuid, locationId: uuid,
      action: 'receipt', candidate: {
        action: 'receipt', ingredientDescription: 'muçarela', quantity: '5', unit: 'kg',
        totalPrice: '190', unitPrice: null, reason: null, ambiguous: false, explanations: [],
      }, missingFields: ['ingredient', 'supplier'], status: 'needs_review', version: 1,
      createdAt: '2026-10-16T12:00:00.000Z', updatedAt: '2026-10-16T12:00:00.000Z',
      expiresAt: '2026-11-15T12:00:00.000Z', resultId: null,
    };
    expect(AiTextProposalSchema.safeParse(proposal).success).toBe(true);
    expect(AiTextProposalSchema.safeParse({ ...proposal, organizationId: undefined }).success).toBe(false);
    expect(AiTextProposalSchema.safeParse({ ...proposal, version: 0 }).success).toBe(false);
    expect(AiTextProposalStatusSchema.safeParse('interpreting').success).toBe(true);
    expect(AiTextProposalStatusSchema.safeParse('completed').success).toBe(false);
  });
});
