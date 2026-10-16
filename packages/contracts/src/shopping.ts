import type { z } from 'zod';
import type * as S from './shopping-schemas.js';

export type SetStockThresholdInput=z.infer<typeof S.SetStockThresholdSchema>;
export type StockThreshold=z.infer<typeof S.StockThresholdSchema>;
export type ShoppingSupplierSuggestion=z.infer<typeof S.ShoppingSupplierSuggestionSchema>;
export type ShoppingNeed=z.infer<typeof S.ShoppingNeedSchema>;
export type CreateShoppingListInput=z.infer<typeof S.CreateShoppingListSchema>;
export type ShoppingListItem=z.infer<typeof S.ShoppingListItemSchema>;
export type ShoppingList=z.infer<typeof S.ShoppingListSchema>;
export type UpdateShoppingListItemInput=z.infer<typeof S.UpdateShoppingListItemSchema>;
export type ConfirmShoppingCommitmentInput=z.infer<typeof S.ConfirmShoppingCommitmentSchema>;
export type CancelShoppingCommitmentInput=z.infer<typeof S.CancelShoppingCommitmentSchema>;
export type ShoppingCommitmentStatus=z.infer<typeof S.ShoppingCommitmentStatusSchema>;
export type ShoppingCommitment=z.infer<typeof S.ShoppingCommitmentSchema>;
export type ShoppingListQuery=z.infer<typeof S.ShoppingListQuerySchema>;
