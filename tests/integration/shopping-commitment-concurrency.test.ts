import { randomUUID } from 'node:crypto';
import { expect,it,vi } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { createShoppingService } from '../../apps/api/src/services/shopping.js';

// This integration suite isolates entitlement mechanics so it can exercise the
// Premium transaction path using the existing synthetic Base-only owner.
// The separate shopping-api suite verifies the real entitlement denial path.
vi.mock('@donos/domain-billing',()=>({requireEntitlement:vi.fn(async()=>undefined)}));

it('compromisso confirmado reduz reposição e recebimento parcial/idempotente reduz o pendente atomicamente',async()=>{
 const f=await createInventoryFixtures();try{
  const inventory=createInventoryService(f.db),shopping=createShoppingService(f.db),ops=inventoryOperations(inventory,f),ingredient=await ops.ingredient(),supplier=await ops.supplier(),args=[f.actor,f.selection,f.token] as const;
  await ops.receive(ingredient.id,supplier.id,'2','20');
  await shopping.setThreshold(...args,ingredient.id,{locationId:f.locationId,minimumQuantity:'3',targetQuantity:'8'},randomUUID());
  const initial=await shopping.generateList(...args,f.locationId,randomUUID());
  expect(initial.items).toHaveLength(1);expect(initial.items[0]?.purchaseQuantity).toBe('6');
  expect((await shopping.getList(...args,initial.id)).items[0]?.needSnapshot.critical).toBe(true);
  const commitment=await shopping.confirmCommitment(...args,initial.id,initial.items[0]!.id,{purchaseQuantity:'6',confirmed:true,supplierId:supplier.id},randomUUID());
  expect(commitment.status).toBe('confirmed');expect(commitment.remainingBaseQuantity).toBe('6');
  const afterConfirm=await shopping.generateList(...args,f.locationId,randomUUID());expect(afterConfirm.items).toHaveLength(0);

  const partial=await inventory.createReceipt(...args,{supplierId:supplier.id,locationId:f.locationId,items:[{ingredientId:ingredient.id,quantity:'2',unit:{kind:'standard',code:'kg'},unitPrice:'25',commitmentId:commitment.id}]},randomUUID());
  const receiveKey=randomUUID(),first=await inventory.receiveReceipt(...args,partial.id,{receivedConfirmed:true},receiveKey);
  const duplicate=await inventory.receiveReceipt(...args,partial.id,{receivedConfirmed:true},receiveKey);
  expect(duplicate).toEqual(first);
  const partialState=await f.run(async(ctx,tx)=>({commitment:(await tx.query<{status:string;remaining:string;received:string}>('select status,remaining_base_quantity::text remaining,received_base_quantity::text received from core.shopping_commitments where organization_id=$1 and restaurant_id=$2 and id=$3',[ctx.organizationId,ctx.restaurantId,commitment.id])).rows[0],balance:(await tx.query<{quantity:string}>('select quantity::text from core.stock_balances where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4',[ctx.organizationId,ctx.restaurantId,f.locationId,ingredient.id])).rows[0]?.quantity}));
  expect(partialState.commitment).toMatchObject({status:'confirmed',remaining:'4',received:'2'});expect(partialState.balance).toBe('4');

   const competing=await Promise.all([1,2].map(()=>inventory.createReceipt(...args,{supplierId:supplier.id,locationId:f.locationId,items:[{ingredientId:ingredient.id,quantity:'3',unit:{kind:'standard',code:'kg'},unitPrice:'25',commitmentId:commitment.id}]},randomUUID())));
  const raced=await Promise.allSettled(competing.map((draft)=>inventory.receiveReceipt(...args,draft.id,{receivedConfirmed:true},randomUUID())));
  expect(raced.filter((result)=>result.status==='fulfilled')).toHaveLength(1);
  expect(raced.filter((result)=>result.status==='rejected')).toHaveLength(1);
  const afterRace=await f.run(async(ctx,tx)=>({commitment:(await tx.query<{status:string;remaining:string;received:string}>('select status,remaining_base_quantity::text remaining,received_base_quantity::text received from core.shopping_commitments where organization_id=$1 and restaurant_id=$2 and id=$3',[ctx.organizationId,ctx.restaurantId,commitment.id])).rows[0],balance:(await tx.query<{quantity:string}>('select quantity::text from core.stock_balances where organization_id=$1 and restaurant_id=$2 and location_id=$3 and ingredient_id=$4',[ctx.organizationId,ctx.restaurantId,f.locationId,ingredient.id])).rows[0]?.quantity}));
  expect(afterRace.commitment).toMatchObject({status:'confirmed',remaining:'1',received:'5'});expect(afterRace.balance).toBe('7');

  const finalDraft=await inventory.createReceipt(...args,{supplierId:supplier.id,locationId:f.locationId,items:[{ingredientId:ingredient.id,quantity:'1',unit:{kind:'standard',code:'kg'},unitPrice:'25',commitmentId:commitment.id}]},randomUUID());
  await inventory.receiveReceipt(...args,finalDraft.id,{receivedConfirmed:true},randomUUID());
  const finalState=await f.run((_ctx,tx)=>tx.query<{status:string;remaining:string;received:string}>('select status,remaining_base_quantity::text remaining,received_base_quantity::text received from core.shopping_commitments where id=$1',[commitment.id]));
  expect(finalState.rows[0]).toMatchObject({status:'fulfilled',remaining:'0',received:'6'});
 }finally{await f.close();}
},120000);

it('recebe compromisso com conversão congelada após nova versão do cadastro e exige o fornecedor confirmado',async()=>{
 const f=await createInventoryFixtures();try{
  const inventory=createInventoryService(f.db),shopping=createShoppingService(f.db),args=[f.actor,f.selection,f.token] as const;
  const ingredient=await inventory.createIngredient(...args,{name:`Farinha ${randomUUID()}`,baseUnit:'kg',allowFractionalCount:false},randomUUID());
  const supplier=await inventory.createSupplier(...args,{name:`Fornecedor ${randomUUID()}`},randomUUID());
  const otherSupplier=await inventory.createSupplier(...args,{name:`Fornecedor ${randomUUID()}`},randomUUID());
  const oldConversion=await inventory.createConversion(...args,ingredient.id,{label:'saco',factorToBase:'5'},randomUUID());
  await shopping.setThreshold(...args,ingredient.id,{locationId:f.locationId,minimumQuantity:'1',targetQuantity:'5'},randomUUID());
  const list=await shopping.generateList(...args,f.locationId,randomUUID());
  const item=list.items.find((candidate)=>candidate.needSnapshot.ingredientId===ingredient.id)!;
  const commitment=await shopping.confirmCommitment(...args,list.id,item.id,{purchaseQuantity:'1',confirmed:true,supplierId:supplier.id},randomUUID());
  await inventory.createConversion(...args,ingredient.id,{label:'saco',factorToBase:'6'},randomUUID());

  await expect(inventory.createReceipt(...args,{supplierId:otherSupplier.id,locationId:f.locationId,items:[{ingredientId:ingredient.id,quantity:'1',unit:{kind:'package',conversionId:oldConversion.id},unitPrice:'25',commitmentId:commitment.id}]},randomUUID())).rejects.toMatchObject({code:'RESOURCE_CONFLICT'});
  const draft=await inventory.createReceipt(...args,{supplierId:supplier.id,locationId:f.locationId,items:[{ingredientId:ingredient.id,quantity:'1',unit:{kind:'package',conversionId:oldConversion.id},unitPrice:'25',commitmentId:commitment.id}]},randomUUID());
  await inventory.receiveReceipt(...args,draft.id,{receivedConfirmed:true},randomUUID());
  const posted=await f.run(async(ctx,tx)=>(await tx.query<{base_quantity:string}>('select base_quantity::text from core.purchase_receipt_items where organization_id=$1 and restaurant_id=$2 and receipt_id=$3',[ctx.organizationId,ctx.restaurantId,draft.id])).rows[0]);
  expect(posted?.base_quantity).toBe('5');
 }finally{await f.close();}
},120000);


