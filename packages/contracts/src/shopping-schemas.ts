import { z } from 'zod';
import { UUIDSchema, IntegerStringSchema } from './schemas.js';
import {
  BaseUnitSchema, CatalogQuerySchema, ConversionSnapshotSchema, InputUnitSchema,
  InventoryValueStringSchema, QuantityStringSchema,
} from './inventory-schemas.js';

const uuid=UUIDSchema.transform(value=>value.toLowerCase());
const positiveQuantity=QuantityStringSchema.refine(value=>value!=='0');
const name=z.string().trim().min(1).max(120);
const note=z.string().trim().max(500);
const quantityUnits=(value:string):bigint=>{
  const [whole='',fraction='']=value.split('.');
  return BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0')||'0');
};
const assertQuantity=(minimum:string,target:string)=>quantityUnits(minimum)<=quantityUnits(target);

export const SetStockThresholdSchema=z.strictObject({
  locationId:uuid,minimumQuantity:QuantityStringSchema,targetQuantity:QuantityStringSchema,
}).refine(value=>assertQuantity(value.minimumQuantity,value.targetQuantity),{
  path:['targetQuantity'],message:'O estoque-alvo precisa ser maior ou igual ao mínimo',
});
export const StockThresholdSchema=z.strictObject({
  id:uuid,organizationId:uuid,restaurantId:uuid,locationId:uuid,ingredientId:uuid,baseUnit:BaseUnitSchema,
  minimumQuantity:QuantityStringSchema,targetQuantity:QuantityStringSchema,updatedAt:z.iso.datetime(),
}).refine(value=>assertQuantity(value.minimumQuantity,value.targetQuantity),{
  path:['targetQuantity'],message:'O estoque-alvo precisa ser maior ou igual ao mínimo',
});

export const ShoppingSupplierSuggestionSchema=z.strictObject({
  supplierId:uuid,name,normalizedPrice:z.strictObject({numerator:InventoryValueStringSchema,denominator:positiveQuantity}),
  postedAt:z.iso.datetime(),documentDate:z.iso.date().nullable(),
});
export const ShoppingNeedSchema=z.strictObject({
  ingredientId:uuid,ingredientName:name,locationId:uuid,baseUnit:BaseUnitSchema,
  balanceQuantity:QuantityStringSchema,minimumQuantity:QuantityStringSchema,targetQuantity:QuantityStringSchema,
  committedPendingQuantity:QuantityStringSchema,neededBaseQuantity:QuantityStringSchema,
  suggestedBaseQuantity:QuantityStringSchema,suggestedPurchaseQuantity:QuantityStringSchema,
  conversion:ConversionSnapshotSchema,critical:z.boolean(),supplierSuggestion:ShoppingSupplierSuggestionSchema.nullable(),
});
export const CreateShoppingListSchema=z.strictObject({locationId:uuid});
export const ShoppingListItemSchema=z.strictObject({
  id:uuid,listId:uuid,needSnapshot:ShoppingNeedSchema,purchaseQuantity:QuantityStringSchema,
  supplierId:uuid.nullable(),removed:z.boolean(),note:note.nullable(),
});
export const ShoppingListSchema=z.strictObject({
  id:uuid,organizationId:uuid,restaurantId:uuid,locationId:uuid,status:z.enum(['draft','archived']),
  createdAt:z.iso.datetime(),generatedAt:z.iso.datetime(),ledgerSequenceAtGeneration:IntegerStringSchema,
  items:z.array(ShoppingListItemSchema),
});
export const UpdateShoppingListItemSchema=z.strictObject({
  purchaseQuantity:positiveQuantity.optional(),supplierId:uuid.nullable().optional(),
  removed:z.boolean().optional(),note:note.nullable().optional(),
}).refine(value=>Object.keys(value).length>0);
export const ConfirmShoppingCommitmentSchema=z.strictObject({
  purchaseQuantity:positiveQuantity,confirmed:z.literal(true),supplierId:uuid.nullable().optional(),
});
export const CancelShoppingCommitmentSchema=z.strictObject({reason:z.string().trim().min(1).max(240)});

export const ShoppingCommitmentStatusSchema=z.enum(['confirmed','fulfilled','cancelled']);
export const ShoppingCommitmentSchema=z.strictObject({
  id:uuid,organizationId:uuid,restaurantId:uuid,locationId:uuid,ingredientId:uuid,listId:uuid,listItemId:uuid,
  supplierId:uuid.nullable(),baseUnit:BaseUnitSchema,unit:InputUnitSchema,conversion:ConversionSnapshotSchema,
  confirmedQuantity:positiveQuantity,committedBaseQuantity:positiveQuantity,
  receivedBaseQuantity:QuantityStringSchema,remainingBaseQuantity:QuantityStringSchema,
  status:ShoppingCommitmentStatusSchema,confirmedAt:z.iso.datetime(),confirmedBy:uuid,
}).superRefine((value,ctx)=>{
  if(quantityUnits(value.receivedBaseQuantity)+quantityUnits(value.remainingBaseQuantity)!==quantityUnits(value.committedBaseQuantity))
    ctx.addIssue({code:'custom',path:['remainingBaseQuantity'],message:'Recebido mais restante precisa reconciliar com o compromisso'});
  if(value.conversion.ingredientId!==value.ingredientId||value.conversion.baseUnit!==value.baseUnit||value.unit.kind!==value.conversion.inputUnit.kind)
    ctx.addIssue({code:'custom',path:['conversion'],message:'A conversão precisa corresponder ao insumo e à unidade congelados'});
  if(value.status==='confirmed'&&value.remainingBaseQuantity==='0')
    ctx.addIssue({code:'custom',path:['status'],message:'Compromisso sem restante precisa estar concluído'});
  if(value.status==='fulfilled'&&value.remainingBaseQuantity!=='0')
    ctx.addIssue({code:'custom',path:['status'],message:'Compromisso concluído não pode manter quantidade pendente'});
});
export const ShoppingListQuerySchema=CatalogQuerySchema.extend({locationId:uuid,status:z.enum(['draft','archived']).optional()});
