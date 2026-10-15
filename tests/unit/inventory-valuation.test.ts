import { describe,expect,it } from 'vitest';
import type { MovementSnapshot,ValuationState } from '@donos/contracts';
import { calculateEligibleReversal,calculateIssue,calculateReceipt } from '../../packages/domain-inventory/src/valuation.js';
import { parseScaled } from '../../packages/domain-inventory/src/decimal.js';
const empty:ValuationState={quantity:'0',value:'0',referenceQuantity:'0',referenceValue:'0',issuedQuantity:'0',sequence:'0'};
describe('moving average with a cumulative quantized allocation',()=>{
  it('satisfies the canonical remaining stock example',()=>{
    const a=calculateReceipt(empty,'10','200');
    const b=calculateIssue(a.after,'2');
    expect(b.after).toEqual({quantity:'8',value:'160',referenceQuantity:'10',referenceValue:'200',issuedQuantity:'2',sequence:'2'});
    expect(b.valueDelta).toBe('-40');
    const c=calculateReceipt(b.after,'7','175');
    expect(c.after.quantity).toBe('15');expect(c.after.value).toBe('335');
    expect(c.averageCostRatio).toEqual({numerator:'335',denominator:'15'});
    expect(c.policyVersion).toBe('moving-average-cumulative-v1');
    expect(empty.sequence).toBe('0');
  });
  it('satisfies the five fractional operations without floating point tolerance',()=>{
    let s=calculateReceipt(empty,'0.3','0.33').after;
    s=calculateIssue(s,'0.1').after;expect(s.value).toBe('0.22');
    s=calculateReceipt(s,'0.2','0.26').after;
    s=calculateIssue(s,'0.15').after;expect(s.value).toBe('0.3');
    const last=calculateReceipt(s,'0.05','0.085');
    expect(last.after.quantity).toBe('0.3');expect(last.after.value).toBe('0.385');
    expect(last.averageCostRatio).toEqual({numerator:'0.385',denominator:'0.3'});
  });
  it('fragmented issues telescope and full exhaustion clears all residual references',()=>{
    const initial=calculateReceipt(empty,'3','0.000000000002').after;
    const first=calculateIssue(initial,'1');
    const second=calculateIssue(first.after,'1');
    const third=calculateIssue(second.after,'1');
    expect(first.valueDelta).toBe('-0.000000000001');expect(second.valueDelta).toBe('0');expect(third.valueDelta).toBe('-0.000000000001');
    expect(third.after).toEqual({...empty,sequence:'4'});expect(third.averageCostRatio).toBeNull();
    expect(calculateReceipt(third.after,'1','9').after.referenceValue).toBe('9');
  });
  it('restores the full prior cumulative state while advancing sequence',()=>{
    const start=calculateReceipt(empty,'3','1').after;
    const issue=calculateIssue(start,'1');
    const original:MovementSnapshot={id:'movement',sequence:'2',kind:'ISSUE',ingredientId:'ingredient',before:start,after:issue.after,origin:'manual'};
    const reverse=calculateEligibleReversal(issue.after,original);
    expect(reverse.after).toEqual({...start,sequence:'3'});
    expect(reverse.quantityDelta).toBe('1');expect(reverse.valueDelta).toBe('0.333333333333');
    expect(()=>calculateEligibleReversal({...issue.after,sequence:'3'},original)).toThrowError('REVERSAL_REQUIRES_REVALUATION');
    expect(()=>calculateEligibleReversal(issue.after,{...original,kind:'REVERSAL'})).toThrowError('REVERSAL_REQUIRES_REVALUATION');
  });
  it('guards negative stock, inconsistent state and overflow',()=>{
    expect(()=>calculateIssue(empty,'1')).toThrowError('INSUFFICIENT_STOCK');
    expect(()=>calculateReceipt({...empty,value:'1'},'1','1')).toThrowError('RESOURCE_CONFLICT');
    expect(()=>calculateReceipt({...empty,sequence:'9223372036854775807'},'1','1')).toThrowError('NUMERIC_RANGE');
    expect(()=>calculateReceipt(calculateReceipt(empty,'999999999999999999','1').after,'1','1')).toThrowError('NUMERIC_RANGE');
    expect(()=>calculateIssue(calculateReceipt(empty,'1','1').after,'0')).toThrow();
  });
  it('exhaustively reconciles fragmented half-even costs for small integer balances',()=>{
    for(let total=2n;total<=12n;total++) for(let quantum=0n;quantum<=12n;quantum++) {
      const value=quantum===0n?'0':`0.${quantum.toString().padStart(12,'0')}`.replace(/0+$/u,'');
      let state=calculateReceipt(empty,total.toString(),value).after;
      let charged=0n;
      for(let issued=0n;issued<total;issued++) {
        const movement=calculateIssue(state,'1');
        charged+=parseScaled(movement.valueDelta==='0'?'0':movement.valueDelta.slice(1),12,26);
        state=movement.after;
        expect(parseScaled(state.value,12,26)+charged).toBe(quantum);
        if(state.quantity!=='0') expect(movement.averageCostRatio).toEqual({numerator:value,denominator:total.toString()});
      }
      expect(state.quantity).toBe('0');expect(state.value).toBe('0');expect(charged).toBe(quantum);
    }
  });
  it('reverses exhaustion and receipts using complete snapshots with monotonic sequence',()=>{
    const receipt=calculateReceipt(empty,'3','1');
    const issue=calculateIssue(receipt.after,'3');
    const original:MovementSnapshot={id:'issue',sequence:'2',kind:'ISSUE',ingredientId:'ingredient',before:receipt.after,after:issue.after,origin:null};
    expect(calculateEligibleReversal(issue.after,original).after).toEqual({...receipt.after,sequence:'3'});
    const first:MovementSnapshot={id:'receipt',sequence:'1',kind:'RECEIPT',ingredientId:'ingredient',before:empty,after:receipt.after,origin:'receipt-item'};
    expect(calculateEligibleReversal(receipt.after,first).after).toEqual({...empty,sequence:'2'});
    expect(()=>calculateEligibleReversal({...receipt.after,value:'2'},first)).toThrowError('RESOURCE_CONFLICT');
  });
});
