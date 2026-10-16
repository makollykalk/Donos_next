import type {Ingredient,RecipeDetail,RecipeYieldMeasurement} from '@donos/contracts';
import type {RecipesClient} from './recipes-client.js';
import {useRecipeCommand} from './recipe-form-state.js';

const date=(value:string)=>new Date(value).toLocaleString('pt-BR');
export function RecipeHistory({client,recipe,ingredients,onChanged}:{client:RecipesClient;recipe:RecipeDetail;ingredients:Ingredient[];onChanged:()=>void}){
 const command=useRecipeCommand(client);
 const validate=async(measurement:RecipeYieldMeasurement)=>{
  const confirmed=window.confirm(`Validar a medição real #${measurement.measurementNumber}?\n\nBruto: ${measurement.grossQuantity} ${measurement.outputUnit}\nLíquido: ${measurement.netQuantity} ${measurement.outputUnit}\nFinal: ${measurement.finalQuantity} ${measurement.outputUnit}\n\nIsso valida o rendimento da ficha; não baixa insumos nem registra produção no estoque.`);
  if(!confirmed)return;
  try{await command.run(`/recipes/${recipe.id}/measurements/${measurement.id}/validate`,{});onChanged();}catch{/* Keep the form and show the error below. */}
 };
 return <section aria-label="Histórico de versões e medições"><h4>Histórico de versões e medições</h4>
  {recipe.versions.map(version=><article key={version.id} aria-label={`Versão ${version.versionNumber}`}>
   <h5>Versão {version.versionNumber}: {version.name} ({version.outputUnit})</h5><p>Criada em {date(version.createdAt)}.</p>
   <h6>Composição</h6><ul>{version.components.map(component=><li key={component.id}>{component.kind==='ingredient'?ingredients.find(item=>item.id===component.ingredientId)?.name??'Insumo arquivado ou indisponível':'Pré-preparo vinculado à versão'}: {component.quantity} {component.kind==='recipe'?component.unit:component.unit.kind==='standard'?component.unit.code:component.unit.conversionId?'embalagem configurada':''} — {component.role==='packaging'?'embalagem':'ingrediente'}{component.duplicateUseReason?` — repetição confirmada: ${component.duplicateUseReason}`:''}</li>)}</ul>
   {version.transformations.length>0&&<><h6>Etapas</h6><ol>{version.transformations.map(step=><li key={step.id}>{step.label} ({step.kind})</li>)}</ol></>}
   <h6>Medições</h6>{recipe.measurements.filter(item=>item.recipeVersionId===version.id).length===0?<p>Nenhuma medição registrada nesta versão.</p>:<ul>{recipe.measurements.filter(item=>item.recipeVersionId===version.id).map(measurement=><li key={measurement.id}>
    <strong>{measurement.kind==='measured'?'Medição real':'Estimativa'} #{measurement.measurementNumber}</strong> — observada em {date(measurement.observedAt)}; método: {measurement.method}.<br/>
    Bruto {measurement.grossQuantity}, líquido {measurement.netQuantity}, final {measurement.finalQuantity} {measurement.outputUnit}.{measurement.portionCount?` ${measurement.portionCount} porções.`:''} {measurement.validation?`Validada em ${date(measurement.validation.validatedAt)}.`:' Ainda não validada.'}
    {measurement.kind==='measured'&&!measurement.validation&&<button type="button" disabled={command.busy} onClick={()=>void validate(measurement)}>Conferir e validar medição #{measurement.measurementNumber}</button>}
   </li>)}</ul>}
  </article>)}
  {command.error&&<p role="alert">{command.error}</p>}
 </section>;
}
