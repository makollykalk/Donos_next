import type { z } from 'zod';
import type {
  CapabilitySchema, ContextSelectionSchema, CreateOrganizationSchema, CreateRestaurantSchema,
  DecimalStringSchema, FeatureKeySchema, IntegerStringSchema, OrganizationSchema,
  RestaurantSchema, SelectedContextSchema, UUIDSchema,
} from './schemas.js';

export type UUID = z.infer<typeof UUIDSchema>;
export type DecimalString = z.infer<typeof DecimalStringSchema>;
export type IntegerString = z.infer<typeof IntegerStringSchema>;
export type FeatureKey = z.infer<typeof FeatureKeySchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type Restaurant = z.infer<typeof RestaurantSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>;
export type ContextSelection = z.infer<typeof ContextSelectionSchema>;
export type SelectedContext = z.infer<typeof SelectedContextSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
