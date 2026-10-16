import type { ConversionSnapshot,InputUnit } from '@donos/contracts';
import { checkedQuantity,priceCoefficient,quantityCoefficient,QUANTITY_FACTOR,VALUE_FACTOR } from './decimal.js';
import { InventoryCalculationError } from './types.js';

export function normalizeQuantity(quantity:string,unit:InputUnit,conversion:ConversionSnapshot):string {
  const quantityInput=quantityCoefficient(quantity);
  if(quantityInput===0n) throw new InventoryCalculationError('NUMERIC_RANGE');
  const mismatch=()=>{throw new InventoryCalculationError('UNIT_INCOMPATIBLE');};
  if(unit.kind!==conversion.inputUnit.kind) mismatch();
  let factor:bigint;
  if(unit.kind==='standard') {
    if(conversion.inputUnit.kind!=='standard'||unit.code!==conversion.inputUnit.code||conversion.conversionId!==null||conversion.version!==null||conversion.label!==null) mismatch();
    const standard:Record<string,{base:string;factor:string}>={kg:{base:'kg',factor:'1'},g:{base:'kg',factor:'0.001'},L:{base:'L',factor:'1'},mL:{base:'L',factor:'0.001'},un:{base:'un',factor:'1'}};
    const expected=standard[unit.code];
    if(!expected||expected.base!==conversion.baseUnit||expected.factor!==conversion.factorToBase) mismatch();
    factor=priceCoefficient(conversion.factorToBase);
  } else {
    if(conversion.inputUnit.kind!=='package'||unit.conversionId!==conversion.inputUnit.conversionId||unit.conversionId!==conversion.conversionId||!conversion.version||!/^[1-9][0-9]*(?![\s\S])/u.test(conversion.version)||BigInt(conversion.version)>9_223_372_036_854_775_807n||!conversion.label?.trim()) mismatch();
    factor=priceCoefficient(conversion.factorToBase);
    if(factor===0n) mismatch();
  }
  const product=quantityInput*factor;
  if(product%VALUE_FACTOR!==0n) throw new InventoryCalculationError('QUANTITY_PRECISION');
  const base=product/VALUE_FACTOR;
  if(conversion.baseUnit==='un'&&!conversion.allowFractionalCount&&base%QUANTITY_FACTOR!==0n) throw new InventoryCalculationError('QUANTITY_PRECISION');
  return checkedQuantity(base);
}
