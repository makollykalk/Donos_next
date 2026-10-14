import { z } from 'zod';

export const UUIDSchema = z.uuid();
const NameSchema = z.string().trim().min(1).max(120);

// The negative lookahead is an absolute end anchor (unlike $, it rejects a final newline).
export const DecimalStringSchema = z.string()
  .regex(/^-?(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{0,11}[1-9])?(?![\s\S])/u)
  .refine((value) => value !== '-0', 'Use 0 para zero');

export const IntegerStringSchema = z.string().max(19)
  .regex(/^(?:0|[1-9][0-9]*)(?![\s\S])/u)
  .pipe(z.string().refine((value) => BigInt(value) <= 9223372036854775807n, 'Contador fora da faixa'));

export const FeatureKeySchema = z.enum([
  'inventory_core', 'shopping_premium', 'ai_text_whatsapp', 'ai_photo', 'ai_voice', 'pricing_core',
]);

export const CreateOrganizationSchema = z.strictObject({
  name: NameSchema,
  firstRestaurant: z.strictObject({ name: NameSchema }),
});
export const CreateRestaurantSchema = z.strictObject({ name: NameSchema });
export const OrganizationSchema = z.strictObject({ id: UUIDSchema, name: NameSchema });
export const RestaurantSchema = z.strictObject({
  id: UUIDSchema, organizationId: UUIDSchema, name: NameSchema,
});
export const ContextSelectionSchema = z.strictObject({
  organizationId: UUIDSchema, restaurantId: UUIDSchema,
});
export const SelectedContextSchema = ContextSelectionSchema.extend({
  token: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u),
  expiresAt: z.iso.datetime(),
});
export const CapabilitySchema = z.strictObject({
  feature: FeatureKeySchema,
  allowed: z.boolean(),
  reason: z.enum(['ACTIVE', 'NOT_GRANTED', 'EXPIRED', 'BASE_REQUIRED']),
});
