import { describe,expect,it } from 'vitest';
import { calculateAcquisitionValue,formatScaled,parseScaled,roundHalfEven } from '../../packages/domain-inventory/src/decimal.js';

describe('inventory exact decimal arithmetic',()=>{
  it('rounds signed rational ties to the even integer',()=>{
    for(const [n,d,result] of [[1n,2n,0n],[3n,2n,2n],[5n,2n,2n],[7n,2n,4n],[-1n,2n,0n],[-3n,2n,-2n],[-5n,2n,-2n],[7n,-2n,-4n],[14n,5n,3n]] as const) expect(roundHalfEven(n,d)).toBe(result);
    expect(()=>roundHalfEven(1n,0n)).toThrowError('NUMERIC_RANGE');
  });
  it('multiplies using integer coefficients with half-even only at value quantum',()=>{
    expect(calculateAcquisitionValue('10','20')).toBe('200');
    expect(calculateAcquisitionValue('0.3','1.1')).toBe('0.33');
    expect(calculateAcquisitionValue('0.5','0.000000000003')).toBe('0.000000000002');
    expect(calculateAcquisitionValue('0.5','0.000000000005')).toBe('0.000000000002');
    expect(calculateAcquisitionValue('999999999999999999','0.000000000001')).toBe('999999.999999999999');
    expect(calculateAcquisitionValue('1','0')).toBe('0');
  });
  it('rejects underflow, overflow, excess precision and noncanonical values',()=>{
    expect(()=>calculateAcquisitionValue('0.000001','0.000000000001')).toThrowError('VALUATION_UNDERFLOW');
    expect(()=>calculateAcquisitionValue('999999999999999999','999999999999999999')).toThrowError('NUMERIC_RANGE');
    for(const v of ['1.0','01','-0','1e2','NaN','Infinity','1\n','0.0000001']) expect(()=>calculateAcquisitionValue(v,'1')).toThrow();
    expect(()=>calculateAcquisitionValue('1','0.0000000000001')).toThrow();
    expect(()=>calculateAcquisitionValue('0','1')).toThrow();
  });
  it('round-trips maximum envelopes and emits signed deltas without negative zero',()=>{
    const upper='99999999999999999999999999.999999999999';
    expect(formatScaled(parseScaled(upper,12,26),12)).toBe(upper);
    expect(formatScaled(-1n,12)).toBe('-0.000000000001');
    expect(formatScaled(0n,12)).toBe('0');
    expect(()=>parseScaled('100000000000000000000000000',12,26)).toThrowError('NUMERIC_RANGE');
  });
});
