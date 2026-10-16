import type { ConversionSnapshot, QuantityString } from '@donos/contracts';
import {
  checkedQuantity,
  priceCoefficient,
  quantityCoefficient,
  QUANTITY_FACTOR,
  VALUE_FACTOR,
} from '@donos/domain-inventory';
import { normalizeQuantity } from '@donos/domain-inventory';

export type ReplenishmentInput = {
  balanceQuantity: QuantityString | null;
  minimumQuantity: QuantityString;
  targetQuantity: QuantityString;
  committedPendingQuantity: QuantityString;
  conversion: ConversionSnapshot;
};

export type ReplenishmentResult = {
  critical: boolean;
  neededBaseQuantity: QuantityString;
  suggestedPurchaseQuantity: QuantityString;
  suggestedBaseQuantity: QuantityString;
};

/** Ceiling division for non-negative amounts. */
function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

/**
 * Computes a replenishment proposal in base units. Confirmed commitments are
 * supplied by the caller; drafts and received stock must not be included.
 * Commercial purchase quantities are rounded upward at quantity precision,
 * and to whole packages for package conversions.
 */
export function calculateReplenishment(input: ReplenishmentInput): ReplenishmentResult {
  const minimum = quantityCoefficient(input.minimumQuantity);
  const target = quantityCoefficient(input.targetQuantity);
  const balance = input.balanceQuantity === null ? 0n : quantityCoefficient(input.balanceQuantity);
  const committed = quantityCoefficient(input.committedPendingQuantity);
  if (target < minimum) throw new Error('Target quantity must be greater than or equal to minimum quantity');

  const { conversion } = input;
  // Run the same deterministic unit and snapshot consistency checks used by
  // inventory operations before using factorToBase for arithmetic.
  normalizeQuantity('1', conversion.inputUnit, conversion);
  const factor = priceCoefficient(conversion.factorToBase);
  const needed = target - balance - committed;
  const neededBase = needed > 0n ? needed : 0n;

  let purchaseQuantity = 0n;
  let suggestedBase = 0n;
  if (neededBase > 0n) {
    // neededBase and factor are both represented at their respective scales.
    // The quotient below is a quantity coefficient at QUANTITY_SCALE.
    purchaseQuantity = ceilDiv(neededBase * VALUE_FACTOR, factor);
    if (conversion.inputUnit.kind === 'package') {
      purchaseQuantity = ceilDiv(purchaseQuantity, QUANTITY_FACTOR) * QUANTITY_FACTOR;
    } else if (conversion.baseUnit === 'un' && !conversion.allowFractionalCount && conversion.inputUnit.code === 'un') {
      purchaseQuantity = ceilDiv(purchaseQuantity, QUANTITY_FACTOR) * QUANTITY_FACTOR;
    }
    const purchase = checkedQuantity(purchaseQuantity);
    suggestedBase = quantityCoefficient(normalizeQuantity(purchase, conversion.inputUnit, conversion));

    // Count stock cannot be fractional unless the ingredient explicitly allows it.
    if (conversion.baseUnit === 'un' && !conversion.allowFractionalCount && suggestedBase % QUANTITY_FACTOR !== 0n) {
      suggestedBase = ceilDiv(suggestedBase, QUANTITY_FACTOR) * QUANTITY_FACTOR;
      // For standard unit counts, keep the commercial amount aligned with base units.
      if (conversion.inputUnit.kind === 'standard' && conversion.inputUnit.code === 'un') purchaseQuantity = suggestedBase;
    }
  }

  return {
    critical: balance <= minimum,
    neededBaseQuantity: checkedQuantity(neededBase),
    suggestedPurchaseQuantity: checkedQuantity(purchaseQuantity),
    suggestedBaseQuantity: checkedQuantity(suggestedBase),
  };
}
