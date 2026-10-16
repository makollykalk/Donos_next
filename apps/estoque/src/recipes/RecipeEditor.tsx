import {useState} from 'react';
import type {Ingredient,RecipeComponentInput,RecipeDetail,RecipeKind,RecipeOutputUnit,RecipeSummary,RecipeTransformationInput} from '@donos/contracts';
import {normalizeDecimalInput} from '../inventory/decimal-input.js';
import type {RecipesClient} from './recipes-client.js';
import {RecipeComponentRow} from './RecipeComponentRow.js';
import {useRecipeCommand} from './recipe-form-state.js';

type Props={client:RecipesClient;recipe:RecipeDetail|null;recipes:RecipeSummary[];ingredients:Ingredient[];onSaved:(recipeId:string)=>void;onCancel:()=>void};
export function RecipeEditor({client,recipe,recipes,ingredients,onSaved,onCancel}:Props){
 const [name,setName]=useState(recipe?.currentVersion?.name??recipe?.name??'');
 const [kind,setKind]=useState<RecipeKind>(recipe?.kind??'product');
 const [outputUnit,setOutputUnit]=useState<RecipeOutputUnit>(recipe?.currentVersion?.outputUnit??'kg');
 const [components,setComponents]=useState<RecipeComponentInput[]>(()=>recipe?.currentVersion?.components.map(component=>({...component,id:crypto.randomUUID()}))??[]);
 const [transformations,setTransformations]=useState<RecipeTransformationInput[]>(()=>recipe?.currentVersion?.transformations.map(step=>({...step,id:crypto.randomUUID()}))??[]);
 const command=useRecipeCommand(client);
 const patch=(id:string,value:RecipeComponentInput)=>{command.changed();setComponents(rows=>rows.map(row=>row.id===id?value:row));};
 const save=async()=>{
  if(!name.trim()){command.fail('Informe o nome da ficha.');return;}
  try{
   if(!recipe){const created=await command.run<RecipeSummary>('/recipes',{name:name.trim(),kind});onSaved(created.id);return;}
   if(components.length===0){command.fail('Adicione ao menos um insumo ou pré-preparo.');return;}
   const normalized=components.map(component=>({...component,quantity:normalizeDecimalInput(component.quantity,6)})) as RecipeComponentInput[];
   const result=await command.run(`/recipes/${recipe.id}/versions`,{name:name.trim(),kind,outputUnit,components:normalized,transformations});
   onSaved(recipe.id);return result;
  }catch(error){command.capture(error);}
 };
 return <section aria-label={recipe?'Editar versão da ficha':'Nova ficha técnica'}>
  <h3>{recipe?`Nova versão de ${recipe.name}`:'Nova ficha técnica'}</h3>
  <form onSubmit={event=>{event.preventDefault();void save();}}>
   <label>Nome da ficha<input required maxLength={120} value={name} disabled={command.busy} onChange={event=>{command.changed();setName(event.target.value);}}/></label>
   <label>Tipo de ficha<select value={kind} disabled={Boolean(recipe)||command.busy} onChange={event=>setKind(event.target.value as RecipeKind)}><option value="product">Produto</option><option value="preparation">Pré-preparo</option></select></label>
   {recipe&&<>
    <label>Unidade de saída<select value={outputUnit} disabled={command.busy} onChange={event=>setOutputUnit(event.target.value as RecipeOutputUnit)}><option value="kg">kg</option><option value="L">L</option><option value="un">un</option></select></label>
    <fieldset><legend>Composição da versão</legend><p>Uma linha representa um insumo ou um pré-preparo. A embalagem só entra quando adicionada como componente.</p>
     {components.map((component,index)=>{const key=component.kind==='ingredient'?`ingredient:${component.ingredientId}`:`recipe:${component.recipeVersionId}`;const duplicate=Boolean(component.kind==='ingredient'?component.ingredientId:component.recipeVersionId)&&components.filter(item=>(item.kind==='ingredient'?`ingredient:${item.ingredientId}`:`recipe:${item.recipeVersionId}`)===key).length>1;return <RecipeComponentRow key={component.id} client={client} component={component} index={index} duplicate={duplicate} ingredients={ingredients} recipes={recipes.filter(item=>item.id!==recipe.id)} onChange={value=>patch(component.id,value)} onRemove={()=>{command.changed();setComponents(rows=>rows.filter(item=>item.id!==component.id));}} disabled={command.busy}/>;}) }
     <button type="button" disabled={command.busy||components.length>=250} onClick={()=>{command.changed();setComponents(rows=>[...rows,{id:crypto.randomUUID(),kind:'ingredient',ingredientId:'',quantity:'',unit:{kind:'standard',code:'kg'},role:'ingredient'} as RecipeComponentInput]);}}>Adicionar componente</button>
    </fieldset>
    <fieldset><legend>Transformações medidas</legend><p>As etapas explicam a passagem do bruto ao líquido e ao resultado final. O custo por unidade usa o rendimento final medido.</p>
     {transformations.map((step,index)=><fieldset key={step.id}><legend>Etapa {index+1}</legend>
      <label>Tipo da etapa<select value={step.kind} disabled={command.busy} onChange={event=>{command.changed();setTransformations(rows=>rows.map(item=>item.id===step.id?{...item,kind:event.target.value as RecipeTransformationInput['kind']}:item));}}><option value="cleaning">Limpeza</option><option value="cooking">Cocção/processamento</option><option value="loss">Perda</option><option value="other">Outra</option></select></label>
      <label>Nome da etapa<input required maxLength={120} value={step.label} disabled={command.busy} onChange={event=>{command.changed();setTransformations(rows=>rows.map(item=>item.id===step.id?{...item,label:event.target.value}:item));}}/></label>
      <button type="button" disabled={command.busy} onClick={()=>setTransformations(rows=>rows.filter(item=>item.id!==step.id))}>Remover etapa {index+1}</button>
     </fieldset>)}
     <button type="button" disabled={command.busy||transformations.length>=30} onClick={()=>{command.changed();setTransformations(rows=>[...rows,{id:crypto.randomUUID(),kind:'cleaning',label:'',position:Math.max(0,...rows.map(item=>item.position))+1}]);}}>Adicionar etapa</button>
    </fieldset>
    </>}
   {command.error&&<p role="alert">{command.error}</p>}
   <button disabled={command.busy}>{recipe?'Salvar nova versão':'Criar rascunho'}</button>
   <button type="button" disabled={command.busy} onClick={onCancel}>Cancelar</button>
  </form>
 </section>;
}
