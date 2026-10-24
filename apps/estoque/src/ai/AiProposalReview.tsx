import {useEffect,useRef} from 'react';
import type {AiTextAction,AiTextProposal,Ingredient,Supplier} from '@donos/contracts';
import {displayDecimal,multiplyDecimalStrings,normalizeDecimalInput} from '../inventory/decimal-input.js';

export type AiReviewDraft={action:AiTextAction|'';ingredientId:string;supplierId:string;quantity:string;unit:'kg'|'g'|'L'|'mL'|'un'|'';unitPrice:string;reason:string};
const missingLabels:Record<string,string>={action:'ação',ingredient:'insumo',quantity:'quantidade',unit:'unidade',price:'preço',reason:'motivo',supplier:'fornecedor',location:'local'};
export function AiProposalReview({proposal,draft,ingredients,suppliers,locked,onChange,onSave,valid}: {
  proposal:AiTextProposal;draft:AiReviewDraft;ingredients:Ingredient[];suppliers:Supplier[];locked:boolean;
  onChange:(draft:AiReviewDraft)=>void;onSave:()=>void;valid:boolean;
}){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[proposal.id]);
  const change=<K extends keyof AiReviewDraft>(key:K,value:AiReviewDraft[K])=>onChange({...draft,[key]:value});
  let finalTotal:string|null=null;
  let totalUnderflow=false;
  if(draft.action==='receipt')try{const quantity=normalizeDecimalInput(draft.quantity,6),unitPrice=normalizeDecimalInput(draft.unitPrice,12);finalTotal=multiplyDecimalStrings(quantity,unitPrice);totalUnderflow=quantity!=='0'&&unitPrice!=='0'&&finalTotal===null;}catch{/* Incomplete draft values have no derived total yet. */}
  return <div className="ai-review">
    <h4 ref={heading} tabIndex={-1}>Revise a proposta</h4>
    <p>Confira os dados. O estoque só será alterado ao confirmar.</p>
    {proposal.candidate.totalPrice!==null&&<p>Total do texto: R$ {displayDecimal(proposal.candidate.totalPrice)}</p>}
    {finalTotal!==null&&<p>Total para confirmar: R$ {displayDecimal(finalTotal)}</p>}
    {totalUnderflow&&<p role="alert">O total não pode ser representado com a precisão de estoque. Ajuste quantidade ou preço.</p>}
    {proposal.candidate.ambiguous&&<p>A interpretação é ambígua. Escolha uma ação e um insumo e salve a revisão.</p>}
    {proposal.missingFields.length>0&&<p>Confira: {proposal.missingFields.map(field=>missingLabels[field]??field).join(', ')}.</p>}
    {proposal.candidate.explanations.length>0&&<ul>{proposal.candidate.explanations.map((text,index)=><li key={index}>{text}</li>)}</ul>}
    <fieldset disabled={locked}>
      <legend>Dados da movimentação proposta</legend>
      <div className="ai-fields">
        <label>Ação da proposta<select value={draft.action} onChange={event=>change('action',event.target.value as AiReviewDraft['action'])}><option value="">Selecione</option><option value="receipt">Entrada</option><option value="issue">Baixa</option></select></label>
        <label>Insumo da proposta<select value={draft.ingredientId} onChange={event=>change('ingredientId',event.target.value)}><option value="">Selecione</option>{ingredients.filter(item=>!item.archived).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Quantidade da proposta<input inputMode="decimal" value={draft.quantity} onChange={event=>change('quantity',event.target.value)}/></label>
        <label>Unidade da proposta<select value={draft.unit} onChange={event=>change('unit',event.target.value as AiReviewDraft['unit'])}><option value="">Selecione</option>{['kg','g','L','mL','un'].map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label>
        {draft.action==='receipt'&&<>
          <label>Fornecedor da proposta<select value={draft.supplierId} onChange={event=>change('supplierId',event.target.value)}><option value="">Selecione explicitamente</option>{suppliers.filter(item=>!item.archived).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Preço unitário da proposta<input inputMode="decimal" value={draft.unitPrice} onChange={event=>change('unitPrice',event.target.value)}/></label>
        </>}
        {draft.action==='issue'&&<label>Motivo da baixa<input maxLength={240} value={draft.reason} onChange={event=>change('reason',event.target.value)}/></label>}
      </div>
      {!valid&&<p>Preencha os campos obrigatórios. Quantidade e preço devem ser positivos, e o total precisa caber na precisão de estoque.</p>}
      <button type="button" disabled={!valid} onClick={onSave}>Salvar revisão</button>
    </fieldset>
  </div>;
}
