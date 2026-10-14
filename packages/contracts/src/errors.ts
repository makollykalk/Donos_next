import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'UNAUTHENTICATED', 'RESOURCE_NOT_FOUND', 'CONTEXT_MISMATCH', 'CONTEXT_EXPIRED',
  'ENTITLEMENT_REQUIRED', 'QUOTA_EXCEEDED', 'IDEMPOTENCY_CONFLICT',
  'VALIDATION_ERROR', 'DEPENDENCY_UNAVAILABLE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({ code: ApiErrorCodeSchema, message: z.string(), requestId: z.uuid() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
