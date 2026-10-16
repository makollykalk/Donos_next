import {useState} from 'react';
import type {RecipeDetail,RecipeYieldMeasurement} from '@donos/contracts';
import {normalizeDecimalInput} from '../inventory/decimal-input.js';
import type {RecipesClient} from './recipes-client.js';
import {useRecipeCommand} from './recipe-form-state.js';

type Props={client:RecipesClient;recipe:RecipeDetail;latest:RecipeYieldMeasurement|null;onSaved:()=>void};
const nowLocal=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const canonical=(value:string)=>normalizeDecimalInput(value,6);
const scaled=(value:string)=>{const normalized=canonical(value);const [whole='0',fraction='']=normalized.split('.');return BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0'));};
export function YieldMeasurementForm({client,recipe,latest,onSaved}:Props){
 const version=recipe.currentVersion;
 const [kind,setKind]=useState<'estimated'|'measured'>('measured'),[observedAt,setObservedAt]=useState(nowLocal()),[method,setMethod]=useState(''),[gross,setGross]=useState(''),[net,setNet]=useState(''),[final,setFinal]=useState(''),[portionCount,setPortionCount]=useState(''),[portionQuantity,setPortionQuantity]=useState('');
 const [steps,setSteps]=useState<Record<string,{input:string;output:string;gainReason:string}>>({});const command=useRecipeCommand(client);
 if(!version)return <p role="status">Salve a composição desta ficha antes de registrar o rendimento.</p>;
 const submit=async()=>{
  try{
   if(scaled(net)>scaled(gross)){command.fail('O rendimento líquido após limpeza não pode exceder o peso/volume bruto. Confira a medição.');return;}
   const transformationResults=version.transformations.map(step=>{const result=steps[step.id]??{input:'',output:'',gainReason:''};return {transformationId:step.id,inputQuantity:canonical(result.input),outputQuantity:canonical(result.output),unit:version.outputUnit,...(result.gainReason.trim()?{gainReason:result.gainReason.trim()}:{})};});
   await command.run(`/recipes/${recipe.id}/measurements`,{kind,observedAt:new Date(observedAt).toISOString(),method,grossQuantity:canonical(gross),netQuantity:canonical(net),finalQuantity:canonical(final),outputUnit:version.outputUnit,transformationResults,...(portionCount?{portionCount}:{}),...(portionQuantity?{portionQuantity:canonical(portionQuantity)}:{}),...(latest?.recipeVersionId===version.id?{supersedesMeasurementId:latest.id}:{})});
   onSaved();
  }catch(error){if(error instanceof Error&&error.message.startsWith('Use '))command.fail(error.message);else command.capture(error);}
 };
 return <section aria-label="Medição de rendimento">
  <h4>Rendimento da versão {version.versionNumber}</h4>
  <p>Uma estimativa ajuda no rascunho, mas nunca valida a ficha. Informe o que foi pesado e medido no lote.</p>
  <form onSubmit={event=>{event.preventDefault();void submit();}}>
   <label>Tipo da medição<select value={kind} disabled={command.busy} onChange={event=>{command.changed();setKind(event.target.value as 'estimated'|'measured');}}><option value="estimated">Estimativa (não valida)</option><option value="measured">Medição real observada</option></select></label>
   <label>Data e hora da observação<input type="datetime-local" required value={observedAt} disabled={command.busy} onChange={event=>{command.changed();setObservedAt(event.target.value);}}/></label>
   <label>Método e condições da medição<textarea required maxLength={300} value={method} disabled={command.busy} onChange={event=>{command.changed();setMethod(event.target.value);}}/></label>
   <label>Peso/volume bruto empregado ({version.outputUnit})<input required inputMode="decimal" value={gross} disabled={command.busy} onChange={event=>{command.changed();setGross(event.target.value);}}/></label>
   <label>Resultado líquido após limpeza ({version.outputUnit})<input required inputMode="decimal" value={net} disabled={command.busy} onChange={event=>{command.changed();setNet(event.target.value);}}/></label>
   <label>Resultado final após preparo ({version.outputUnit})<input required inputMode="decimal" value={final} disabled={command.busy} onChange={event=>{command.changed();setFinal(event.target.value);}}/></label>
   {version.transformations.length>0&&<fieldset><legend>Resultados observados em cada etapa</legend><p>Registre o antes e o depois da etapa. O rendimento líquido e o final acima continuam sendo as medidas do lote.</p>
    {version.transformations.map((step,index)=>{const value=steps[step.id]??{input:'',output:'',gainReason:''};return <fieldset key={step.id}><legend>{index+1}. {step.label} ({step.kind})</legend>
     <label>Quantidade antes da etapa<input required inputMode="decimal" value={value.input} disabled={command.busy} onChange={event=>{command.changed();setSteps(rows=>({...rows,[step.id]:{...value,input:event.target.value}}));}}/></label>
     <label>Quantidade depois da etapa<input required inputMode="decimal" value={value.output} disabled={command.busy} onChange={event=>{command.changed();setSteps(rows=>({...rows,[step.id]:{...value,output:event.target.value}}));}}/></label>
     <label>Motivo do aumento, se a etapa ganhou massa/volume<input maxLength={240} required={Boolean(value.input&&value.output&&(() => {try{return scaled(value.output)>scaled(value.input);}catch{return false;}})())} value={value.gainReason} disabled={command.busy} onChange={event=>{command.changed();setSteps(rows=>({...rows,[step.id]:{...value,gainReason:event.target.value}}));}}/></label>
    </fieldset>;})}
   </fieldset>}
   <fieldset><legend>Porções, quando aplicável</legend><label>Número de porções<input inputMode="numeric" pattern="[1-9][0-9]{0,8}" value={portionCount} disabled={command.busy} onChange={event=>{command.changed();setPortionCount(event.target.value);}}/></label><label>Quantidade final por porção ({version.outputUnit})<input inputMode="decimal" value={portionQuantity} disabled={command.busy} onChange={event=>{command.changed();setPortionQuantity(event.target.value);}}/></label></fieldset>
   {kind==='estimated'&&<p role="status">Esta estimativa ficará marcada como não validada e não fornecerá custo atual por rendimento.</p>}
   {kind==='measured'&&<p role="status">A gravação cria uma medição real. Para validar a ficha, use a confirmação separada após conferir os valores.</p>}
   {command.error&&<p role="alert">{command.error}</p>}
   <button disabled={command.busy}>{kind==='estimated'?'Salvar estimativa':'Salvar medição real'}</button>
  </form>
 </section>;
}
