import { describe, expect, it } from 'vitest';
import {
  OpenInventoryCountSchema, RecordInventoryCountSchema, ReviewInventoryCountItemSchema,
  ValidateInventoryCountItemSchema, CloseInventoryCountSchema, CancelInventoryCountSchema,
  InventoryCountItemStateSchema,
} from '@donos/contracts';

const locationId = '10000000-0000-4000-8000-000000000009';

describe('physical inventory count contracts', () => {
  it('requires explicit location and accepts optional blind mode', () => {
    expect(OpenInventoryCountSchema.safeParse({}).success).toBe(false);
    expect(OpenInventoryCountSchema.safeParse({ locationId }).success).toBe(true);
    expect(OpenInventoryCountSchema.safeParse({ locationId, blind: true }).success).toBe(true);
    expect(OpenInventoryCountSchema.safeParse({ locationId, organizationId: locationId }).success).toBe(false);
  });

  it('uses canonical decimal strings and requires a positive physical quantity', () => {
    expect(RecordInventoryCountSchema.safeParse({ quantity: 2 }).success).toBe(false);
    expect(RecordInventoryCountSchema.safeParse({ quantity: '0.0000001' }).success).toBe(false);
    expect(RecordInventoryCountSchema.safeParse({ quantity: '0' }).success).toBe(true);
    expect(RecordInventoryCountSchema.safeParse({ quantity: '2.5', observation: 'Conferido' }).success).toBe(true);
    expect(RecordInventoryCountSchema.safeParse({ quantity: '-1' }).success).toBe(false);
  });

  it('keeps item transitions and owner confirmations explicit', () => {
    expect(InventoryCountItemStateSchema.options).toEqual(['not_counted', 'counted', 'review', 'validated']);
    expect(ReviewInventoryCountItemSchema.safeParse({ reason: 'Recontar divergência' }).success).toBe(true);
    expect(ReviewInventoryCountItemSchema.safeParse({}).success).toBe(false);
    expect(ValidateInventoryCountItemSchema.safeParse({}).success).toBe(true);
    expect(CloseInventoryCountSchema.safeParse({ confirmed: true }).success).toBe(true);
    expect(CloseInventoryCountSchema.safeParse({ confirmed: false }).success).toBe(false);
    expect(CancelInventoryCountSchema.safeParse({ reason: 'Contagem interrompida' }).success).toBe(true);
    expect(CancelInventoryCountSchema.safeParse({}).success).toBe(false);
  });
});
