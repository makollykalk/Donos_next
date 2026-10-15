export type { ValuationState,MovementCalculation,MovementSnapshot,ConversionSnapshot } from '@donos/contracts';
export class InventoryCalculationError extends Error {
  constructor(public readonly code:'NUMERIC_RANGE'|'QUANTITY_PRECISION'|'UNIT_INCOMPATIBLE'|'INSUFFICIENT_STOCK'|'VALUATION_UNDERFLOW'|'REVERSAL_REQUIRES_REVALUATION'|'RESOURCE_CONFLICT'){super(code);}
}
