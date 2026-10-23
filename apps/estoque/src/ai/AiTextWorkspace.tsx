import {useEffect,useMemo,useRef,useState} from 'react';
import {ApiFailure} from '@donos/auth-client';
import type {AiTextProposal,AiTextProposalReview,Ingredient,Supplier} from '@donos/contracts';
import {AiTextProposalReviewSchema} from '@donos/contracts';
import type {InventoryClient} from '../inventory/inventory-client.js';
import {displayDecimal,normalizeDecimalInput} from '../inventory/decimal-input.js';
import {createAiClient,type AiConfirmation,type AiConfirmationResult} from './ai-client.js';
import {AiProposalReview,type AiReviewDraft} from './AiProposalReview.js';

export type AiTextWorkspaceProps={client:InventoryClient;ingredients:Ingredient[];suppliers:Supplier[];organizationId:string;restaurantId:string;locationId:string;locationName:string;onConfirmed:()=>void;onManual:()=>void};
type FrozenConfirmation=Readonly<{id:string;key:string;body:AiConfirmation}>;
type FrozenReview=Readonly<{id:string;key:string;body:AiTextProposalReview;draft:AiReviewDraft}>;
type Phase='text'|'interpreting'|'review'|'saving'|'review_uncertain'|'review_checking'|'confirming'|'uncertain'|'checking'|'terminal';
function initialDraft(proposal:AiTextProposal,ingredients:Ingredient[]):AiReviewDraft{
  const matches=ingredients.filter(item=>!item.archived&&item.name.trim().toLocaleLowerCase('pt-BR')===proposal.candidate.ingredientDescription?.trim().toLocaleLowerCase('pt-BR'));
  return {action:proposal.action??'',ingredientId:matches.length===1&&!proposal.candidate.ambiguous?matches[0]!.id:'',supplierId:'',quantity:proposal.candidate.quantity??'',unit:proposal.candidate.unit??'',unitPrice:proposal.candidate.unitPrice??'',reason:proposal.candidate.reason??''};
}
function errorMessage(error:unknown):string{
  if(error instanceof ApiFailure){
    if(error.code==='ENTITLEMENT_REQUIRED')return 'O adicional de IA não está disponível. Use os formulários manuais.';
    if(error.code==='QUOTA_EXCEEDED'||error.code==='USAGE_LIMIT_EXCEEDED')return 'A franquia de IA está esgotada. Use os formulários manuais.';
    if(error.status<500)return error.message;
  }
  return 'Não foi possível obter uma resposta. Seus dados foram preservados; o resultado da operação pode precisar de verificação.';
}
export function AiTextWorkspace({client,ingredients,suppliers,organizationId,restaurantId,locationId,locationName,onConfirmed,onManual}:AiTextWorkspaceProps){
  const api=useMemo(()=>createAiClient(client),[client]);
  const [text,setText]=useState(''),[phase,setPhase]=useState<Phase>('text'),[proposal,setProposal]=useState<AiTextProposal|null>(null),[draft,setDraft]=useState<AiReviewDraft|null>(null),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<AiConfirmationResult|null>(null),[canRetry,setCanRetry]=useState(false);
  const mounted=useRef(true),inFlight=useRef(false),frozen=useRef<FrozenConfirmation|null>(null),notified=useRef(false),createRequest=useRef<{text:string;key:string}|null>(null);
  const frozenReview=useRef<FrozenReview|null>(null);
  const [canRecoverReview,setCanRecoverReview]=useState(false);
  const mountedLocation=useRef(locationId);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function current(){if(!mounted.current||mountedLocation.current!==locationId)return false;try{client.assert();return true;}catch{return false;}}
  const busy=['interpreting','saving','review_checking','confirming','checking'].includes(phase);
  const uncertain=phase==='uncertain'||phase==='checking';
  const reviewUncertain=phase==='review_uncertain'||phase==='review_checking';
  const terminal=phase==='terminal';
  let review:AiTextProposalReview|null=null;
  if(draft&&proposal){try{
    const quantity=normalizeDecimalInput(draft.quantity,6),unitPrice=draft.action==='receipt'?normalizeDecimalInput(draft.unitPrice,12):undefined;
    const ingredient=ingredients.find(item=>item.id===draft.ingredientId&&!item.archived);
    const units=ingredient?.baseUnit==='kg'?['kg','g']:ingredient?.baseUnit==='L'?['L','mL']:['un'];
    if(!ingredient||!draft.action||!draft.unit||!units.includes(draft.unit)||quantity==='0'||(draft.action==='receipt'&&(unitPrice==='0'||!suppliers.some(item=>item.id===draft.supplierId&&!item.archived))))throw Error('Invalid review');
    const input={expectedVersion:proposal.version,action:draft.action,ingredientId:draft.ingredientId,quantity,unit:{kind:'standard' as const,code:draft.unit},...(draft.action==='receipt'?{supplierId:draft.supplierId,unitPrice}:{reason:draft.reason.trim()})};
    const parsed=AiTextProposalReviewSchema.safeParse(input);if(parsed.success)review=parsed.data;
  }catch{/* Incomplete decimal or selection is displayed inline. */}}
  const confirmLabel=`Confirmar ${draft?.action==='issue'?'baixa':'entrada'} de ${displayDecimal(draft?.quantity??'')} ${draft?.unit??''} de ${ingredients.find(item=>item.id===draft?.ingredientId)?.name??'insumo'}`;
  async function run(action:()=>Promise<void>){if(inFlight.current||!current())return;inFlight.current=true;try{await action();}finally{inFlight.current=false;}}
  function assertProposalContext(next:AiTextProposal){if(next.organizationId!==organizationId||next.restaurantId!==restaurantId||next.locationId!==locationId)throw Error('Proposal context mismatch');}
  function acceptProposal(next:AiTextProposal){assertProposalContext(next);setProposal(next);}
  function finish(next:AiTextProposal,envelope?:AiConfirmationResult){
    acceptProposal(next);setPhase('terminal');setCanRetry(false);setError('');
    if(envelope)setResult(envelope);
    if(next.status==='confirmed'&&!notified.current){notified.current=true;onConfirmed();}
  }
  async function generate(){await run(async()=>{
    if(frozen.current||!text.trim()||text.trim().length>2000)return;
    if(!createRequest.current||createRequest.current.text!==text.trim())createRequest.current={text:text.trim(),key:crypto.randomUUID()};
    setPhase('interpreting');setError('');
    try{const next=await api.create(locationId,createRequest.current.text,createRequest.current.key);if(!current())return;acceptProposal(next);setDraft(initialDraft(next,ingredients));setDirty(false);setPhase(['confirmed','discarded','reconciliation_required'].includes(next.status)?'terminal':'review');}
    catch(cause){if(current()){setError(errorMessage(cause));setPhase('text');}}
  });}
  async function save(){await run(async()=>{
    if(!proposal||!review||!draft||frozen.current||frozenReview.current)return;
    const body=Object.freeze({...review,...(review.unit?{unit:Object.freeze({...review.unit})}:{})});
    const request=Object.freeze({id:proposal.id,key:crypto.randomUUID(),body,draft:Object.freeze({...draft})});
    frozenReview.current=request;await sendReview(request);
  });}
  async function sendReview(request:FrozenReview){
    setPhase('saving');setError('');setCanRecoverReview(false);
    try{
      const next=await api.review(request.id,request.body,request.key);if(!current())return;
      if(next.id!==request.id)throw Error('Proposal mismatch');
      acceptProposal(next);setDraft({...request.draft});setDirty(false);frozenReview.current=null;
      if(['confirmed','discarded','reconciliation_required'].includes(next.status))finish(next);
      else setPhase('review');
    }catch(cause){if(current()){
      setDirty(true);
      setPhase('review_uncertain');setError(`${errorMessage(cause)} Não foi possível verificar se a revisão foi salva. Consulte o status antes de recuperar a mesma revisão.`);
    }}
  }
  async function checkReview(){await run(async()=>{
    const request=frozenReview.current;if(!request)return;setPhase('review_checking');setCanRecoverReview(false);setError('');
    try{
      const next=await api.get(request.id);if(!current())return;
      assertProposalContext(next);if(next.id!==request.id)throw Error('Proposal mismatch');
      if(['confirmed','discarded','reconciliation_required'].includes(next.status)){frozenReview.current=null;finish(next);}
      else{setPhase('review_uncertain');setCanRecoverReview(true);setError('Status consultado. Recupere a mesma revisão para verificar seus dados e a versão salva antes de confirmar.');}
    }catch(cause){if(current()){setPhase('review_uncertain');setError(errorMessage(cause));}}
  });}
  async function sendConfirmation(request:FrozenConfirmation){
    setPhase('confirming');setError('');setCanRetry(false);
    try{const envelope=await api.confirm(request.id,request.body,request.key);if(!current())return;
      if(envelope.proposal.status!=='confirmed'||envelope.proposal.id!==request.id||envelope.result===undefined)throw Error('Uncertain confirmation envelope');
      finish(envelope.proposal,envelope);
    }catch(cause){if(current()){setPhase('uncertain');setError(`${errorMessage(cause)} O resultado da confirmação ainda não foi verificado. Consulte o status antes de repetir. Evite registrar a mesma movimentação manualmente enquanto verifica.`);}}
  }
  async function confirm(){await run(async()=>{
    if(!proposal||!review||dirty||proposal.status!=='ready'||frozen.current||frozenReview.current)return;
    const body:AiConfirmation=Object.freeze({expectedVersion:proposal.version,confirmed:true,...(draft?.action==='receipt'?{supplierId:draft.supplierId}:{})});
    const request=Object.freeze({id:proposal.id,key:crypto.randomUUID(),body});frozen.current=request;await sendConfirmation(request);
  });}
  async function check(){await run(async()=>{
    const request=frozen.current;if(!request)return;setPhase('checking');setCanRetry(false);setError('');
    try{const next=await api.get(request.id);if(!current())return;assertProposalContext(next);if(next.id!==request.id)throw Error('Proposal mismatch');
      if(next.status==='ready'&&next.version===request.body.expectedVersion){setPhase('uncertain');setCanRetry(true);setError('A proposta continua pronta. Você pode repetir a mesma confirmação com segurança.');}
      else if(['confirmed','discarded','reconciliation_required'].includes(next.status)){finish(next);}
      else{setPhase('uncertain');setError('A proposta mudou. A confirmação anterior permanece bloqueada; verifique o status novamente.');}
    }catch(cause){if(current()){setPhase('uncertain');setError(errorMessage(cause));}}
  });}
  async function discard(){await run(async()=>{
    if(!proposal||frozen.current||frozenReview.current)return;setPhase('saving');setError('');
    try{await api.discard(proposal.id,crypto.randomUUID());if(current())finish({...proposal,status:'discarded'});}
    catch(cause){if(current()){setError(errorMessage(cause));setPhase('review');}}
  });}
  if(mountedLocation.current!==locationId)return null;
  return <section className="ai-text-workspace" aria-label="Estoque por texto" aria-busy={busy}>
    <div className="ai-heading"><div><p className="ai-eyebrow">Entrada e baixa</p><h3>Estoque por texto</h3></div><span className="ai-location">Local: {locationName}</span></div>
    <p>Descreva uma movimentação, revise os dados e confirme quando estiver tudo certo.</p>
    <button type="button" className="ai-secondary" disabled={uncertain||phase==='confirming'} onClick={onManual}>Usar formulários manuais</button>
    {!terminal&&<label className="ai-source">Descreva a entrada ou baixa<textarea maxLength={2000} rows={3} disabled={busy||uncertain||!!proposal} value={text} onChange={event=>{setText(event.target.value);createRequest.current=null;}} placeholder="Ex.: recebi 5 kg de farinha por R$ 190"/><span>{text.length}/2000 caracteres · texto mantido somente nesta tela</span></label>}
    {!proposal&&<button type="button" disabled={busy||!text.trim()||text.trim().length>2000} onClick={()=>{void generate();}}>Gerar proposta</button>}
    {error&&<p role="alert" className="ai-alert">{error}</p>}
    <p role="status" className="ai-status">{phase==='interpreting'?'Interpretando o texto. O estoque ainda não foi alterado.':phase==='saving'?'Salvando sua revisão.':phase==='confirming'?'Enviando confirmação. Aguarde o resultado.':phase==='checking'?'Verificando o status da confirmação.':terminal&&proposal?.status==='confirmed'?`${proposal.action==='issue'?'Baixa':'Entrada'} confirmada. Registro: ${result?.proposal.resultId??proposal.resultId??'consulte o extrato'}.`:terminal&&proposal?.status==='discarded'?'Proposta descartada.':terminal?'Proposta pendente de reconciliação. Verifique o status antes de nova movimentação.':proposal?'Proposta para revisão. Nenhuma confirmação enviada.':''}</p>
    {proposal&&draft&&!terminal&&<>
      <AiProposalReview proposal={proposal} draft={draft} ingredients={ingredients} suppliers={suppliers} locked={busy||uncertain||reviewUncertain} valid={!!review} onChange={next=>{if(!frozen.current&&!frozenReview.current){setDraft(next);setDirty(true);setError('');}}} onSave={()=>{void save();}}/>
      {!uncertain&&!reviewUncertain&&<div className="ai-actions"><button type="button" disabled={busy||dirty||!review||proposal.status!=='ready'} onClick={()=>{void confirm();}}>{confirmLabel}</button><button type="button" className="ai-secondary" disabled={busy} onClick={()=>{void discard();}}>Descartar proposta</button></div>}
    </>}
    {uncertain&&<div className="ai-actions"><button type="button" disabled={busy} onClick={()=>{void check();}}>Verificar status da confirmação</button>{canRetry&&<button type="button" disabled={busy} onClick={()=>{const request=frozen.current;if(request)void run(()=>sendConfirmation(request));}}>Repetir a mesma confirmação</button>}</div>}
    {reviewUncertain&&<div className="ai-actions"><button type="button" disabled={busy} onClick={()=>{void checkReview();}}>Verificar status da revisão</button>{canRecoverReview&&<button type="button" disabled={busy} onClick={()=>{const request=frozenReview.current;if(request)void run(()=>sendReview(request));}}>Recuperar a mesma revisão</button>}</div>}
    {terminal&&proposal?.status!=='reconciliation_required'&&<button type="button" onClick={()=>{setText('');setProposal(null);setDraft(null);setResult(null);setPhase('text');setDirty(false);setError('');frozen.current=null;createRequest.current=null;notified.current=false;}}>Nova movimentação por texto</button>}
  </section>;
}
