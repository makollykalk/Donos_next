import type {CostRatio} from '@donos/contracts';
export function normalizeDecimalInput(input:string,scale:6|12):string{
 const value=input.trim();
 if(!/^\d+(?:[.,]\d+)?$/u.test(value))throw Error('Use decimal sem separador de milhar ou expoente.');
 const [whole='',fraction='']=value.replace(',','.').split('.');
 const integers=whole.replace(/^0+(?=\d)/u,'');const decimals=fraction.replace(/0+$/u,'');
 if(integers.length>18||decimals.length>scale)throw Error(`Use até ${scale} casas decimais e 18 inteiros.`);
 return integers+(decimals?`.${decimals}`:'');
}
function coefficient(value:string){const [whole='0',fraction='']=value.split('.');return {value:BigInt(whole+fraction),scale:10n**BigInt(fraction.length)};}
export function multiplyDecimalStrings(left:string,right:string):string|null{
 const a=coefficient(left),b=coefficient(right);const product=a.value*b.value;const inputScale=a.scale*b.scale;const outputScale=10n**12n;
 const numerator=inputScale<outputScale?product*(outputScale/inputScale):product;
 const denominator=inputScale>outputScale?inputScale/outputScale:1n;
 let rounded=numerator/denominator;const remainder=numerator%denominator;
 if(remainder*2n>denominator||(remainder*2n===denominator&&rounded%2n===1n))rounded++;
 if(product>0n&&rounded===0n)return null;
 const digits=rounded.toString().padStart(13,'0');const whole=digits.slice(0,-12);const fraction=digits.slice(-12).replace(/0+$/u,'');
 return fraction?`${whole}.${fraction}`:whole;
}
export function formatRatio(ratio:CostRatio|null):string{
 if(!ratio)return '—';const n=coefficient(ratio.numerator),d=coefficient(ratio.denominator);
 if(d.value===0n)return '—';
 const numerator=n.value*d.scale*100n,denominator=d.value*n.scale;
 let cents=numerator/denominator;const rest=numerator%denominator;
 if(rest*2n>denominator||(rest*2n===denominator&&cents%2n===1n))cents++;
 return `${cents/100n},${(cents%100n).toString().padStart(2,'0')}`;
}
export function displayDecimal(value:string){return value.replace('.',',');}
