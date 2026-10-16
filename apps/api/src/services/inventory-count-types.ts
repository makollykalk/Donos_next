import type { ContextSelection, InventoryCountSession, OpenInventoryCountInput, RecordInventoryCountInput, ReviewInventoryCountItemInput } from '@donos/contracts';
import type { VerifiedActor } from '@donos/db';

type Args = [actor: VerifiedActor, selection: ContextSelection, contextToken: string];
export interface InventoryCountService {
  list(...args: [...Args, locationId: string]): Promise<{ items: Array<{ id: string; locationId: string; status: 'open' | 'closed' | 'cancelled'; blind: boolean; cutAt: string; openedAt: string; closedAt: string | null }> }>;
  open(...args: [...Args, input: OpenInventoryCountInput, key: string]): Promise<InventoryCountSession>;
  get(...args: [...Args, countId: string]): Promise<InventoryCountSession>;
  report(...args: [...Args, countId: string, phase: 'blind' | 'review']): Promise<InventoryCountSession>;
  record(...args: [...Args, countId: string, itemId: string, input: RecordInventoryCountInput, key: string]): Promise<InventoryCountSession>;
  review(...args: [...Args, countId: string, itemId: string, input: ReviewInventoryCountItemInput, key: string]): Promise<InventoryCountSession>;
  validate(...args: [...Args, countId: string, itemId: string, key: string]): Promise<InventoryCountSession>;
  close(...args: [...Args, countId: string, confirmed: true, key: string]): Promise<InventoryCountSession>;
  cancel(...args: [...Args, countId: string, reason: string, key: string]): Promise<InventoryCountSession>;
}
