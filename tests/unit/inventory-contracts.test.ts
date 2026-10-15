import { describe, expect, it } from 'vitest';
import { QuantityStringSchema, InventoryValueStringSchema, CreateIngredientSchema, CreateReceiptSchema, ReceiveReceiptSchema, IssueSchema } from '@donos/contracts';
const id='10000000-0000-4000-8000-000000000001';
const line={ingredientId:id,quantity:'10',unit:{kind:'standard',code:'kg'},unitPrice:'20'};
describe('strict inventory inputs and numeric envelopes',()=>{
  it('rejects noncanonical, excessive precision and binary numeric inputs',()=>{
    for(const value of ['0.0000001','1.0','01','-0','1e2','NaN','Infinity','+1','1\n',1]) expect(QuantityStringSchema.safeParse(value).success).toBe(false);
    expect(QuantityStringSchema.parse('0.000001')).toBe('0.000001');
    expect(InventoryValueStringSchema.parse('99999999999999999999999999.999999999999')).toBeTruthy();
  });
  it('denies derived fields and forged ownership',()=>{
    expect(CreateIngredientSchema.safeParse({name:'Arroz',baseUnit:'kg',ownerId:id}).success).toBe(false);
    expect(IssueSchema.safeParse({ingredientId:id,quantity:'0',unit:line.unit,reason:'uso'}).success).toBe(false);
    expect(IssueSchema.safeParse({ingredientId:id,quantity:'1',unit:line.unit,reason:'uso',value:'20'}).success).toBe(false);
    expect(ReceiveReceiptSchema.safeParse({receivedConfirmed:false}).success).toBe(false);
  });
  it('requires receipt lines, uniqueness and explicit zero price reason',()=>{
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:[]}).success).toBe(false);
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:Array.from({length:51},()=>line)}).success).toBe(false);
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:[line,line]}).success).toBe(false);
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:[{...line,unitPrice:'0'}]}).success).toBe(false);
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:[{...line,unitPrice:'0',zeroCostReason:'amostra'}]}).success).toBe(true);
    expect(CreateReceiptSchema.safeParse({supplierId:id,items:[line],documentDate:'2026-02-30'}).success).toBe(false);
    expect(CreateReceiptSchema.parse({supplierId:id,items:[line]}).items).toHaveLength(1);
  });
});
