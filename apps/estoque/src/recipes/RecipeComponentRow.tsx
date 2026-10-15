import {useEffect,useState} from 'react';
import type {ConversionVersion,Ingredient,InputUnit,RecipeComponentInput,RecipeDetail,RecipeMeasureUnit,RecipeSummary} from '@donos/contracts';
import type {RecipesClient} from './recipes-client.js';

type Props={client:RecipesClient;component:RecipeComponentInput;index:number;duplicate:boolean;ingredients:Ingredient[];recipes:RecipeSummary[];onChange:(value:RecipeComponentInput)=>void;onRemove:()=>void;disabled:boolean};
const standardUnits=(base:Ingredient['baseUnit']):Array<'kg'|'g'|'L'|'mL'|'un'>=>base==='kg'?['kg','g']:base==='L'?['L','mL']:['un'];
export function RecipeComponentRow({client,component,index,duplicate,ingredients,recipes,onChange,onRemove,disabled}:Props){
 const [conversions,setConversions]=useState<ConversionVersion[]>([]),[childUnit,setChildUnit]=useState<RecipeMeasureUnit>(component.kind==='recipe'?component.unit:'kg'),[error,setError]=useState('');
 const ingredient=component.kind==='ingredient'?ingredients.find(item=>item.id===component.ingredientId):undefined;
 useEffect(()=>{let active=true;if(!ingredient){setConversions([]);return()=>{active=false;};}void client.listConversions(ingredient.id).then(rows=>{if(active)setConversions(rows);}).catch(()=>{if(active)setError('Não foi possível carregar fatores de conversão.');});return()=>{active=false;};},[client,ingredient?.id]);
 const selectComponent=async(kind:'ingredient'|'recipe',id:string)=>{
  setError('');
  if(kind==='ingredient'){
   const item=ingredients.find(value=>value.id===id);const unit=item?.baseUnit??'kg';
   onChange({id:component.id,kind:'ingredient',ingredientId:id,quantity:component.quantity||'',unit:{kind:'standard',code:unit},role:component.role});return;
  }
  const child=recipes.find(value=>value.id===id);if(!child?.currentVersionId){setError('Esse pré-preparo ainda não tem uma versão de composição.');return;}
  try{const detail=await client.read<RecipeDetail>(`/recipes/${child.id}`);const output=detail.currentVersion?.outputUnit??'kg';setChildUnit(output);onChange({id:component.id,kind:'recipe',recipeVersionId:child.currentVersionId,quantity:component.quantity||'',unit:output as RecipeMeasureUnit,role:component.role});}
  catch{setError('Não foi possível abrir o pré-preparo nesta unidade. Atualize a ficha e tente novamente.');}
 };
 const currentValue=component.kind==='ingredient'?`ingredient:${component.ingredientId}`:`recipe:${component.recipeVersionId}`;
 const selectedChild=component.kind==='recipe'?recipes.find(item=>item.currentVersionId===component.recipeVersionId):undefined;
 const hasRecipeVersion=component.kind==='recipe'&&Boolean(component.recipeVersionId);
 const update=(patch:Partial<Extract<RecipeComponentInput,{kind:'ingredient'}>>|Partial<Extract<RecipeComponentInput,{kind:'recipe'}>>)=>onChange({...component,...patch} as RecipeComponentInput);
 const selectedUnit:InputUnit=component.kind==='ingredient'?component.unit:{kind:'standard',code:component.unit};
 return <fieldset>
  <legend>Componente {index+1}</legend>
  <label>Tipo do componente<select disabled={disabled} value={component.kind} onChange={event=>{const next=event.target.value as 'ingredient'|'recipe';if(next==='ingredient')selectComponent(next,'');else{onChange({id:component.id,kind:'recipe',recipeVersionId:'',quantity:'',unit:childUnit,role:component.role});}}}><option value="ingredient">Insumo</option><option value="recipe">Pré-preparo</option></select></label>
  {component.kind==='ingredient'?<label>Insumo<select required disabled={disabled} value={component.ingredientId?currentValue:''} onChange={event=>void selectComponent('ingredient',event.target.value.replace(/^ingredient:/,''))}><option value="">Selecione um insumo</option>{ingredients.filter(item=>!item.archived).map(item=><option key={item.id} value={`ingredient:${item.id}`}>{item.name} ({item.baseUnit})</option>)}</select></label>:<label>Pré-preparo<select required disabled={disabled} value={selectedChild?`recipe:${selectedChild.id}`:hasRecipeVersion?`recipe-version:${component.recipeVersionId}`:''} onChange={event=>{if(event.target.value.startsWith('recipe:'))void selectComponent('recipe',event.target.value.slice(7));}}><option value="">Selecione um pré-preparo</option>{hasRecipeVersion&&!selectedChild&&<option value={`recipe-version:${component.recipeVersionId}`}>Versão original vinculada</option>}{recipes.filter(item=>item.kind==='preparation'&&item.currentVersionId).map(item=><option key={item.id} value={`recipe:${item.id}`}>{item.name} ({item.status==='validated'?'rendimento validado':item.status==='estimated'?'estimativa não validada':'rascunho'})</option>)}</select></label>}
  <label>Quantidade usada<input required inputMode="decimal" disabled={disabled} value={component.quantity} onChange={event=>update({quantity:event.target.value} as never)}/></label>
  {component.kind==='ingredient'?<label>Unidade usada<select disabled={disabled||!ingredient} value={selectedUnit.kind==='package'?`package:${selectedUnit.conversionId}`:`standard:${selectedUnit.code}`} onChange={event=>{const [type,value]=event.target.value.split(':');update({unit:type==='package'?{kind:'package',conversionId:value!}:{kind:'standard',code:value as 'kg'|'g'|'L'|'mL'|'un'}} as never);}}>{ingredient&&standardUnits(ingredient.baseUnit).map(unit=><option key={unit} value={`standard:${unit}`}>{unit}</option>)}{conversions.map(conversion=><option key={conversion.id} value={`package:${conversion.id}`}>{conversion.label} (1 = {conversion.factorToBase} {ingredient?.baseUnit}; versão {conversion.version})</option>)}</select></label>:<label>Unidade usada<select disabled={disabled} value={component.unit} onChange={event=>update({unit:event.target.value as RecipeMeasureUnit} as never)}><option value={childUnit}>{childUnit}</option>{childUnit==='kg'&&<option value="g">g</option>}{childUnit==='L'&&<option value="mL">mL</option>}</select></label>}
  <label>Papel<select disabled={disabled} value={component.role} onChange={event=>update({role:event.target.value as 'ingredient'|'packaging'} as never)}><option value="ingredient">Ingrediente/preparo</option><option value="packaging">Embalagem</option></select></label>
  {duplicate&&<div><p role="status">Este componente aparece mais de uma vez. Cada linha será cobrada novamente.</p><label>Explique por que este uso repetido é intencional<input required maxLength={240} value={component.duplicateUseReason??''} disabled={disabled} onChange={event=>update({duplicateUseReason:event.target.value} as never)}/></label></div>}
  {error&&<p role="alert">{error}</p>}
  <button type="button" disabled={disabled} onClick={onRemove}>Remover componente {index+1}</button>
 </fieldset>;
}
