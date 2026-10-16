import { describe,expect,it } from 'vitest';
import type { ConversionSnapshot } from '@donos/contracts';
import { normalizeQuantity } from '../../packages/domain-inventory/src/units.js';
const snapshot=(values:Partial<ConversionSnapshot>={}):ConversionSnapshot=>({ingredientId:'10000000-0000-4000-8000-000000000001',baseUnit:'kg',allowFractionalCount:false,inputUnit:{kind:'standard',code:'g'},factorToBase:'0.001',conversionId:null,version:null,label:null,...values});
describe('immutable unit conversion snapshots',()=>{
  it('normalizes grams and millilitres exactly',()=>{
    expect(normalizeQuantity('250',{kind:'standard',code:'g'},snapshot())).toBe('0.25');
    expect(normalizeQuantity('250',{kind:'standard',code:'mL'},snapshot({baseUnit:'L',inputUnit:{kind:'standard',code:'mL'}}))).toBe('0.25');
  });
  it('rejects dimensions and forged standard factors',()=>{
    expect(()=>normalizeQuantity('1',{kind:'standard',code:'L'},snapshot())).toThrowError('UNIT_INCOMPATIBLE');
    expect(()=>normalizeQuantity('1',{kind:'standard',code:'g'},snapshot({baseUnit:'L'}))).toThrowError('UNIT_INCOMPATIBLE');
    expect(()=>normalizeQuantity('1',{kind:'standard',code:'g'},snapshot({factorToBase:'1'}))).toThrowError('UNIT_INCOMPATIBLE');
  });
  it('uses only the matched package version and enforces base precision/counts',()=>{
    const id='10000000-0000-4000-8000-000000000002';
    const pack=snapshot({inputUnit:{kind:'package',conversionId:id},conversionId:id,version:'1',label:'saco',factorToBase:'5'});
    expect(normalizeQuantity('2',{kind:'package',conversionId:id},pack)).toBe('10');
    expect(()=>normalizeQuantity('2',{kind:'package',conversionId:'other'},pack)).toThrowError('UNIT_INCOMPATIBLE');
    expect(()=>normalizeQuantity('0.000001',{kind:'standard',code:'g'},snapshot())).toThrowError('QUANTITY_PRECISION');
    const count=snapshot({baseUnit:'un',inputUnit:{kind:'standard',code:'un'},factorToBase:'1'});
    expect(()=>normalizeQuantity('0.5',{kind:'standard',code:'un'},count)).toThrowError('QUANTITY_PRECISION');
    expect(normalizeQuantity('0.5',{kind:'standard',code:'un'},{...count,allowFractionalCount:true})).toBe('0.5');
    expect(()=>normalizeQuantity('999999999999999999',{kind:'package',conversionId:id},pack)).toThrowError('NUMERIC_RANGE');
  });
  it('preserves historical package snapshots across a new version',()=>{
    const id='10000000-0000-4000-8000-000000000002';
    const old=snapshot({inputUnit:{kind:'package',conversionId:id},conversionId:id,version:'1',label:'caixa',factorToBase:'2.5'});
    const newer={...old,version:'2',factorToBase:'3'};
    expect(normalizeQuantity('2',{kind:'package',conversionId:id},old)).toBe('5');
    expect(normalizeQuantity('2',{kind:'package',conversionId:id},newer)).toBe('6');
    expect(()=>normalizeQuantity('1',{kind:'package',conversionId:id},{...old,version:null})).toThrowError('UNIT_INCOMPATIBLE');
    expect(()=>normalizeQuantity('1',{kind:'package',conversionId:id},{...old,factorToBase:'0'})).toThrowError('UNIT_INCOMPATIBLE');
  });
});
