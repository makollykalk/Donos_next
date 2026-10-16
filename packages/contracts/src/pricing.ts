import type { z } from 'zod';
import type {
  CreatePricingChannelSchema, CreatePricingComboSchema, CreatePricingProductSchema,
  CreatePricingSimulationSchema, CreatePricingVariantSchema, PricingCostComponentSchema,
  PricingCalculationInputSchema, PricingChannelProfileSchema, PricingComboSchema,
  PricingCostBucketsSchema, PricingCostSourceSnapshotSchema, PricingMetricsSchema,
  PricingComboCostInputSchema, PricingPackagingSchema, PricingProductSchema, PricingQuoteSchema, PricingRateSchema,
  PricingSimulationSchema, PricingVariantSchema, PricingVariantSummarySchema,
  PricingVariantCostSourceSchema, UpdatePricingChannelSchema, UpdatePricingComboSchema,
  UpdatePricingProductSchema, UpdatePricingVariantSchema,
} from './pricing-schemas.js';
import type { ExactMoneyRatio } from './exact-money.js';

export type PricingRateInput = z.infer<typeof PricingRateSchema>;
export type PricingCostComponent = z.infer<typeof PricingCostComponentSchema>;
export type PricingPackagingInput = z.infer<typeof PricingPackagingSchema>;
export type ManualCostSourceInput = { kind: 'manual'; ingredientCost: string; currency: 'BRL' };
export type RecipeCostSourceInput = { kind: 'recipe'; recipeId: string; locationId: string; quantityPerSale: string };
export type PricingVariantCostSource = z.infer<typeof PricingVariantCostSourceSchema>;
export type PricingCostSourceSnapshot = z.infer<typeof PricingCostSourceSnapshotSchema>;
export type PricingCalculationInput = z.infer<typeof PricingCalculationInputSchema>;
export type PricingComboCostInput = z.infer<typeof PricingComboCostInputSchema>;
export type PricingMetrics = z.infer<typeof PricingMetricsSchema>;
export type PricingCostBuckets = z.infer<typeof PricingCostBucketsSchema>;
export type PricingQuote = z.infer<typeof PricingQuoteSchema>;
export type PricingProduct = z.infer<typeof PricingProductSchema>;
export type PricingVariant = z.infer<typeof PricingVariantSchema>;
export type PricingVariantSummary = z.infer<typeof PricingVariantSummarySchema>;
export type PricingChannelProfile = z.infer<typeof PricingChannelProfileSchema>;
export type PricingCombo = z.infer<typeof PricingComboSchema>;
export type PricingSimulation = z.infer<typeof PricingSimulationSchema>;
export type CreatePricingProductInput = z.infer<typeof CreatePricingProductSchema>;
export type UpdatePricingProductInput = z.infer<typeof UpdatePricingProductSchema>;
export type CreatePricingVariantInput = z.infer<typeof CreatePricingVariantSchema>;
export type UpdatePricingVariantInput = z.infer<typeof UpdatePricingVariantSchema>;
export type CreatePricingChannelInput = z.infer<typeof CreatePricingChannelSchema>;
export type UpdatePricingChannelInput = z.infer<typeof UpdatePricingChannelSchema>;
export type CreatePricingComboInput = z.infer<typeof CreatePricingComboSchema>;
export type UpdatePricingComboInput = z.infer<typeof UpdatePricingComboSchema>;
export type CreatePricingSimulationInput = z.infer<typeof CreatePricingSimulationSchema>;
export type PricingRatio = ExactMoneyRatio;
