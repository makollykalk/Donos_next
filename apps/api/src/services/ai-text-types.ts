import type { AiTextCandidate, AiTextProposalReview } from '@donos/contracts';
import type { ContextSelection } from '@donos/contracts';
import type { VerifiedActor } from '@donos/db';
import type { draftReceipt, receiveReceipt } from '@donos/domain-purchases';
import type { issueStock } from '@donos/domain-inventory';
import type { settleUsage } from '@donos/domain-billing';

export type TextExtractor = (input: { text: string; requestId: string }) => Promise<unknown>;
export type AiTextArgs = Readonly<{ actor: VerifiedActor; selection: ContextSelection; contextToken: string }>;
export type CreateTextProposalInput = Readonly<{ locationId: string; text: string }>;
export type UpdateTextProposalInput = AiTextProposalReview;
export type ConfirmTextProposalInput = Readonly<{ expectedVersion: number; confirmed: true; supplierId?: string | undefined }>;
export type AiTextConfirmationOperations = Readonly<{
  draftReceipt: typeof draftReceipt;
  receiveReceipt: typeof receiveReceipt;
  issueStock: typeof issueStock;
  settleUsage: typeof settleUsage;
}>;
export type AiTextService = Readonly<{
  createProposal(args: AiTextArgs, input: CreateTextProposalInput, key: string, requestId?: string): Promise<unknown>;
  getProposal(args: AiTextArgs, id: string): Promise<unknown>;
  updateProposal(args: AiTextArgs, id: string, input: UpdateTextProposalInput, key: string): Promise<unknown>;
  discardProposal(args: AiTextArgs, id: string, key: string): Promise<unknown>;
  confirmProposal(args: AiTextArgs, id: string, input: ConfirmTextProposalInput, key: string): Promise<unknown>;
}>;

export type ExtractedCandidate = AiTextCandidate;
