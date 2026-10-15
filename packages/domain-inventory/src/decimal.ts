import { InventoryCalculationError } from './types.js';

export const QUANTITY_SCALE=6;
export const VALUE_SCALE=12;
export const QUANTITY_FACTOR=1_000_000n;
export const VALUE_FACTOR=1_000_000_000_000n;

/** Coefficients are integers; scale/digit limits are technical metadata only. */
export function parseScaled(value:string,scale:number,integerDigits:number,precisionCode:'NUMERIC_RANGE'|'QUANTITY_PRECISION'='NUMERIC_RANGE'):bigint {
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?(?![\s\S])/u.test(value)) throw new InventoryCalculationError('NUMERIC_RANGE');
  const [whole='',fraction='']=value.split('.');
  if(whole.length>integerDigits) throw new InventoryCalculationError('NUMERIC_RANGE');
  if(fraction.length>scale) throw new InventoryCalculationError(precisionCode);
  return BigInt(whole+fraction.padEnd(scale,'0'));
}

export function formatScaled(coefficient:bigint,scale:number):string {
  const negative=coefficient<0n;
  const digits=(negative?-coefficient:coefficient).toString().padStart(scale+1,'0');
  const fraction=scale===0?'':digits.slice(-scale).replace(/0+$/u,'');
  const whole=scale===0?digits:digits.slice(0,-scale);
  return `${negative?'-':''}${whole}${fraction?'.'+fraction:''}`;
}

/** Signed rational half-even; neither decimal division nor binary floats occur. */
export function roundHalfEven(numerator:bigint,denominator:bigint):bigint {
  if(denominator===0n) throw new InventoryCalculationError('NUMERIC_RANGE');
  const negative=(numerator<0n)!==(denominator<0n);
  const n=numerator<0n?-numerator:numerator;
  const d=denominator<0n?-denominator:denominator;
  const quotient=n/d;
  const twiceRemainder=(n%d)*2n;
  const rounded=quotient+(twiceRemainder>d||(twiceRemainder===d&&quotient%2n===1n)?1n:0n);
  return negative?-rounded:rounded;
}

export function quantityCoefficient(value:string):bigint {return parseScaled(value,QUANTITY_SCALE,18,'QUANTITY_PRECISION');}
export function valueCoefficient(value:string):bigint {return parseScaled(value,VALUE_SCALE,26);}
export function priceCoefficient(value:string):bigint {return parseScaled(value,VALUE_SCALE,18);}
export function checkedQuantity(value:bigint):string {
  if(value<0n||value>=10n**24n) throw new InventoryCalculationError('NUMERIC_RANGE');
  return formatScaled(value,QUANTITY_SCALE);
}
export function checkedValue(value:bigint):string {
  if(value<0n||value>=10n**38n) throw new InventoryCalculationError('NUMERIC_RANGE');
  return formatScaled(value,VALUE_SCALE);
}

export function calculateAcquisitionValue(quantityOriginal:string,unitPrice:string):string {
  const q=quantityCoefficient(quantityOriginal);
  const price=priceCoefficient(unitPrice);
  if(q===0n) throw new InventoryCalculationError('NUMERIC_RANGE');
  const coefficient=roundHalfEven(q*price,QUANTITY_FACTOR);
  if(price>0n&&coefficient===0n) throw new InventoryCalculationError('VALUATION_UNDERFLOW');
  return checkedValue(coefficient);
}
