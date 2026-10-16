import type { MovementCalculation,MovementSnapshot,ValuationState } from '@donos/contracts';
import { checkedQuantity,checkedValue,formatScaled,quantityCoefficient,QUANTITY_SCALE,roundHalfEven,valueCoefficient,VALUE_SCALE } from './decimal.js';
import { InventoryCalculationError } from './types.js';

export const ZERO_STATE:Readonly<ValuationState>=Object.freeze({quantity:'0',value:'0',referenceQuantity:'0',referenceValue:'0',issuedQuantity:'0',sequence:'0'});
const maxSequence=9_223_372_036_854_775_807n;
function sequence(value:string):bigint {
  if(!/^(?:0|[1-9][0-9]*)(?![\s\S])/u.test(value)) throw new InventoryCalculationError('NUMERIC_RANGE');
  const result=BigInt(value);
  if(result>maxSequence) throw new InventoryCalculationError('NUMERIC_RANGE');
  return result;
}
function decode(state:ValuationState) {
  const q=quantityCoefficient(state.quantity),v=valueCoefficient(state.value),rq=quantityCoefficient(state.referenceQuantity),rv=valueCoefficient(state.referenceValue),x=quantityCoefficient(state.issuedQuantity),seq=sequence(state.sequence);
  const coherent=q===0n?v===0n&&rq===0n&&rv===0n&&x===0n:rq>0n&&q===rq-x&&v===rv-roundHalfEven(x*rv,rq);
  if(!coherent) throw new InventoryCalculationError('RESOURCE_CONFLICT');
  return {q,v,rq,rv,x,seq};
}
function nextSequence(current:bigint):string {
  if(current>=maxSequence) throw new InventoryCalculationError('NUMERIC_RANGE');
  return (current+1n).toString();
}
function result(before:ValuationState,after:ValuationState):MovementCalculation {
  return {before:{...before},after,quantityDelta:formatScaled(quantityCoefficient(after.quantity)-quantityCoefficient(before.quantity),QUANTITY_SCALE),valueDelta:formatScaled(valueCoefficient(after.value)-valueCoefficient(before.value),VALUE_SCALE),averageCostRatio:after.quantity==='0'?null:{numerator:after.referenceValue,denominator:after.referenceQuantity},policyVersion:'moving-average-cumulative-v1'};
}
export function calculateReceipt(state:ValuationState,baseQuantity:string,lineValue:string):MovementCalculation {
  const {q,v,seq}=decode(state),incoming=quantityCoefficient(baseQuantity),acquisition=valueCoefficient(lineValue);
  if(incoming===0n) throw new InventoryCalculationError('NUMERIC_RANGE');
  const quantity=checkedQuantity(q+incoming),value=checkedValue(v+acquisition);
  return result(state,{quantity,value,referenceQuantity:quantity,referenceValue:value,issuedQuantity:'0',sequence:nextSequence(seq)});
}
export function calculateIssue(state:ValuationState,baseQuantity:string):MovementCalculation {
  const {q,v,rq,rv,x,seq}=decode(state),outgoing=quantityCoefficient(baseQuantity);
  if(outgoing===0n) throw new InventoryCalculationError('NUMERIC_RANGE');
  if(outgoing>q) throw new InventoryCalculationError('INSUFFICIENT_STOCK');
  if(outgoing===q) return result(state,{...ZERO_STATE,sequence:nextSequence(seq)});
  const cost=roundHalfEven((x+outgoing)*rv,rq)-roundHalfEven(x*rv,rq);
  return result(state,{quantity:checkedQuantity(q-outgoing),value:checkedValue(v-cost),referenceQuantity:state.referenceQuantity,referenceValue:state.referenceValue,issuedQuantity:checkedQuantity(x+outgoing),sequence:nextSequence(seq)});
}
/** Reconciles a physical count using the current local average, requiring an explicit total only from zero stock. */
export function calculateCountAdjustment(state:ValuationState,countedQuantity:string,positiveVarianceTotalValue?:string):MovementCalculation {
  const current=decode(state),counted=quantityCoefficient(countedQuantity);
  if(counted===current.q) throw new InventoryCalculationError('RESOURCE_CONFLICT');
  if(counted<current.q) return calculateIssue(state,formatScaled(current.q-counted,QUANTITY_SCALE));
  const delta=counted-current.q;
  let incomingValue:bigint;
  if(current.q===0n){
    if(positiveVarianceTotalValue===undefined) throw new InventoryCalculationError('COUNT_VALUE_CONFIRMATION_REQUIRED');
    incomingValue=valueCoefficient(positiveVarianceTotalValue);
  } else incomingValue=roundHalfEven(delta*current.rv,current.rq);
  const afterQuantity=checkedQuantity(counted),afterValue=checkedValue(current.v+incomingValue);
  return result(state,{quantity:afterQuantity,value:afterValue,referenceQuantity:afterQuantity,referenceValue:afterValue,issuedQuantity:'0',sequence:nextSequence(current.seq)});
}
export function calculateEligibleReversal(state:ValuationState,original:MovementSnapshot):MovementCalculation {
  const current=decode(state);decode(original.before);decode(original.after);
  const fields=['quantity','value','referenceQuantity','referenceValue','issuedQuantity','sequence'] as const;
  if(original.kind==='REVERSAL'||original.sequence!==state.sequence||original.after.sequence!==original.sequence||sequence(original.before.sequence)+1n!==current.seq||fields.some(field=>state[field]!==original.after[field])) throw new InventoryCalculationError('REVERSAL_REQUIRES_REVALUATION');
  return result(state,{...original.before,sequence:nextSequence(current.seq)});
}
