import { describe, expect, it } from 'vitest';
import {
  ConfirmShoppingCommitmentSchema,
  CreateShoppingListSchema,
  SetStockThresholdSchema,
  ShoppingCommitmentSchema,
  UpdateShoppingListItemSchema,
} from '../../packages/contracts/src/shopping-schemas.js';
import { ReceiptLineSchema } from '../../packages/contracts/src/inventory-schemas.js';

const organizationId = '10000000-0000-4000-8000-000000000001';
const restaurantId = '10000000-0000-4000-8000-000000000002';
const locationId = '10000000-0000-4000-8000-000000000003';
const ingredientId = '10000000-0000-4000-8000-000000000004';
const listId = '10000000-0000-4000-8000-000000000005';
const itemId = '10000000-0000-4000-8000-000000000006';
const commitmentId = '10000000-0000-4000-8000-000000000007';
const supplierId = '10000000-0000-4000-8000-000000000008';

describe('shopping contracts', () => {
  it('accepts canonical threshold quantities and requires target at least minimum', () => {
    expect(SetStockThresholdSchema.safeParse({ locationId, minimumQuantity: '3', targetQuantity: '3' }).success).toBe(true);
    expect(SetStockThresholdSchema.safeParse({ locationId, minimumQuantity: '4', targetQuantity: '3' }).success).toBe(false);
    expect(SetStockThresholdSchema.safeParse({ locationId, minimumQuantity: '-1', targetQuantity: '3' }).success).toBe(false);
    expect(SetStockThresholdSchema.safeParse({ locationId, minimumQuantity: '1.0', targetQuantity: '3' }).success).toBe(false);
    expect(SetStockThresholdSchema.safeParse({ locationId, minimumQuantity: '1', targetQuantity: '3', organizationId }).success).toBe(false);
  });

  it('keeps list generation bound to a selected location and rejects client-owned tenant fields', () => {
    expect(CreateShoppingListSchema.safeParse({ locationId }).success).toBe(true);
    expect(CreateShoppingListSchema.safeParse({ locationId, restaurantId }).success).toBe(false);
  });

  it('requires a positive edited quantity and rejects empty or forged patches', () => {
    expect(UpdateShoppingListItemSchema.safeParse({ purchaseQuantity: '2', supplierId, removed: false }).success).toBe(true);
    expect(UpdateShoppingListItemSchema.safeParse({ purchaseQuantity: '0' }).success).toBe(false);
    expect(UpdateShoppingListItemSchema.safeParse({}).success).toBe(false);
    expect(UpdateShoppingListItemSchema.safeParse({ supplierId, organizationId }).success).toBe(false);
  });

  it('requires explicit owner confirmation and derives ingredient and unit from the saved list item', () => {
    expect(ConfirmShoppingCommitmentSchema.safeParse({ purchaseQuantity: '2', confirmed: true }).success).toBe(true);
    expect(ConfirmShoppingCommitmentSchema.safeParse({ purchaseQuantity: '2', confirmed: false }).success).toBe(false);
    expect(ConfirmShoppingCommitmentSchema.safeParse({ purchaseQuantity: '2', confirmed: true, ingredientId }).success).toBe(false);
    expect(ConfirmShoppingCommitmentSchema.safeParse({ purchaseQuantity: '0', confirmed: true }).success).toBe(false);
  });

  it('permits a receipt line to link a commitment without accepting a forged tenant', () => {
    const line = { ingredientId, quantity: '1', unit: { kind: 'standard', code: 'kg' }, unitPrice: '10' };
    expect(ReceiptLineSchema.safeParse({ ...line, commitmentId }).success).toBe(true);
    expect(ReceiptLineSchema.safeParse({ ...line, commitmentId, organizationId }).success).toBe(false);
  });

  it('keeps commitment received plus remaining equal to the frozen confirmed quantity', () => {
    const commitment = {
      id: commitmentId, organizationId, restaurantId, locationId, ingredientId, listId, listItemId: itemId,
      baseUnit: 'kg', unit: { kind: 'package', conversionId: itemId }, conversion: {
        ingredientId, baseUnit: 'kg', allowFractionalCount: false,
        inputUnit: { kind: 'package', conversionId: itemId }, factorToBase: '2.5',
        conversionId: itemId, version: '1', label: 'saco',
      },
      supplierId, confirmedQuantity: '4', committedBaseQuantity: '10',
      receivedBaseQuantity: '2.5', remainingBaseQuantity: '7.5', status: 'confirmed',
      confirmedAt: '2026-10-16T12:00:00.000Z', confirmedBy: organizationId,
    };
    const parsed=ShoppingCommitmentSchema.safeParse(commitment);
    if(!parsed.success) throw parsed.error;
    expect(parsed.success).toBe(true);
    expect(ShoppingCommitmentSchema.safeParse({ ...commitment, remainingBaseQuantity: '8' }).success).toBe(false);
  });
});
