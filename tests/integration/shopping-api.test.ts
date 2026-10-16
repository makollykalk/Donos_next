import { randomUUID } from 'node:crypto';
import { expect,it } from 'vitest';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { inventoryOperations } from '../helpers/inventory-operations.js';
import { createInventoryService } from '../../apps/api/src/services/inventory.js';
import { createShoppingService } from '../../apps/api/src/services/shopping.js';
import { shoppingRepository } from '../../packages/db/src/index.js';

it('Base permite configurar limite e alerta crítico; geração Premium é negada antes de persistir lista',async()=>{
 const f=await createInventoryFixtures();try{
  const inventory=createInventoryService(f.db),ops=inventoryOperations(inventory,f),ingredient=await ops.ingredient(),shopping=createShoppingService(f.db);
  const args=[f.actor,f.selection,f.token] as const;
  const supplier=await ops.supplier();await ops.receive(ingredient.id,supplier.id,'2','20');
  const before=await f.run((_ctx,tx)=>tx.query<{movements:string;prices:string;balance:string}>(`select (select count(*)::text from core.stock_movements) movements,(select count(*)::text from core.purchase_price_history) prices,(select coalesce(sum(quantity),0)::text from core.stock_balances) balance`));
  const threshold=await shopping.setThreshold(...args,ingredient.id,{locationId:f.locationId,minimumQuantity:'3',targetQuantity:'8'},randomUUID());
  expect(threshold.minimumQuantity).toBe('3');
  const alerts=await shopping.listThresholds(...args,f.locationId);
  expect(alerts.items).toEqual(expect.arrayContaining([expect.objectContaining({ingredientId:ingredient.id,balanceQuantity:'2',critical:true})]));
  const snapshot=await f.run((ctx,tx)=>shoppingRepository.generationSnapshot(ctx,f.locationId,tx));
  expect(snapshot.rows).toEqual(expect.arrayContaining([expect.objectContaining({ingredientId:ingredient.id,committedPendingQuantity:'0',supplierId:supplier.id,baseQuantity:'2',lineValue:'40'})]));
  await expect(shopping.generateList(...args,f.locationId,randomUUID())).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  await expect(shopping.updateItem(...args,randomUUID(),randomUUID(),{removed:true},randomUUID())).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  await expect(shopping.confirmCommitment(...args,randomUUID(),randomUUID(),{purchaseQuantity:'1',confirmed:true},randomUUID())).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  await expect(shopping.exportList(...args,randomUUID())).rejects.toMatchObject({code:'ENTITLEMENT_REQUIRED'});
  const rows=await f.run((_ctx,tx)=>tx.query<{count:string}>('select count(*)::text as count from core.shopping_lists'));
  expect(rows.rows[0]?.count).toBe('0');
  const after=await f.run((_ctx,tx)=>tx.query<{movements:string;prices:string;balance:string}>(`select (select count(*)::text from core.stock_movements) movements,(select count(*)::text from core.purchase_price_history) prices,(select coalesce(sum(quantity),0)::text from core.stock_balances) balance`));
  expect(after.rows).toEqual(before.rows);
 }finally{await f.close();}
},120000);

