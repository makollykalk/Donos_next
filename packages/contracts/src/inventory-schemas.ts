import { z } from 'zod';
import { UUIDSchema,IntegerStringSchema } from './schemas.js';
const InventoryUUIDSchema=UUIDSchema.transform(value=>value.toLowerCase());
const decimal=(integers:number,scale:number)=>z.string().regex(new RegExp(`^(?:0|[1-9][0-9]{0,${integers-1}})(?:\\.[0-9]{0,${scale-1}}[1-9])?(?![\\s\\S])`,'u'));
export const QuantityStringSchema=decimal(18,6);
export const PriceStringSchema=decimal(18,12);
export const InventoryValueStringSchema=decimal(26,12);
const positiveQuantity=QuantityStringSchema.refine(v=>v!=='0');
const name=z.string().trim().min(1).max(120);
const reason=z.string().trim().min(1).max(240);
export const BaseUnitSchema=z.enum(['kg','L','un']);
export const InputUnitSchema=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('standard'),code:z.enum(['kg','g','L','mL','un'])}),
  z.strictObject({kind:z.literal('package'),conversionId:InventoryUUIDSchema}),
]);
export const CreateIngredientSchema=z.strictObject({name,baseUnit:BaseUnitSchema,allowFractionalCount:z.boolean().default(false)});
export const PatchIngredientSchema=z.strictObject({name:name.optional(),archived:z.boolean().optional()}).refine(v=>Object.keys(v).length>0);
export const CreateSupplierSchema=z.strictObject({name,contact:z.string().trim().max(240).optional()});
export const PatchSupplierSchema=z.strictObject({name:name.optional(),contact:z.string().trim().max(240).nullable().optional(),archived:z.boolean().optional()}).refine(v=>Object.keys(v).length>0);
export const CreateConversionSchema=z.strictObject({label:name,factorToBase:PriceStringSchema.refine(v=>v!=='0')});
export const ReceiptLineSchema=z.strictObject({ingredientId:InventoryUUIDSchema,quantity:positiveQuantity,unit:InputUnitSchema,unitPrice:PriceStringSchema,zeroCostReason:reason.optional()}).refine(v=>v.unitPrice!=='0'||!!v.zeroCostReason);
export const CreateReceiptSchema=z.strictObject({supplierId:InventoryUUIDSchema,documentDate:z.iso.date().optional(),documentReference:name.optional(),items:z.array(ReceiptLineSchema).min(1).max(50)}).refine(v=>new Set(v.items.map(i=>i.ingredientId)).size===v.items.length);
export const ReceiveReceiptSchema=z.strictObject({receivedConfirmed:z.literal(true)});
export const IssueSchema=z.strictObject({ingredientId:InventoryUUIDSchema,quantity:positiveQuantity,unit:InputUnitSchema,reason});
export const ReversalSchema=z.strictObject({reason});
export const CatalogQuerySchema=z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(50),cursor:InventoryUUIDSchema.optional(),includeArchived:z.enum(['true','false']).transform(v=>v==='true').optional()});
export const ReceiptQuerySchema=CatalogQuerySchema.extend({status:z.enum(['draft','received','reversed']).optional()});
export const SequenceQuerySchema=z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(50),beforeSequence:IntegerStringSchema.optional(),highWatermark:IntegerStringSchema.optional()});
export const PriceHistoryQuerySchema=SequenceQuerySchema.extend({supplierId:InventoryUUIDSchema.optional()});
