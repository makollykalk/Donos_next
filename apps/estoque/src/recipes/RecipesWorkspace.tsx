import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ProtectedContentProps} from '@donos/auth-client';
import type {Page,RecipeCostDTO,RecipeDetail,RecipeSummary,Ingredient} from '@donos/contracts';
import {createRecipesClient} from './recipes-client.js';
import {RecipeEditor} from './RecipeEditor.js';
import {RecipeHistory} from './RecipeHistory.js';
import {RecipeCostPanel} from './RecipeCostPanel.js';
import {YieldMeasurementForm} from './YieldMeasurementForm.js';

const statusLabel:Record<RecipeSummary['status'],string>={draft:'Rascunho',estimated:'Estimativa não validada',validated:'Rendimento validado',current_version_not_validated:'Nova versão ainda não validada'};
const failure=(error:unknown)=>error instanceof Error?error.message:'Não foi possível carregar as fichas.';
export function RecipesWorkspace(props:ProtectedContentProps){
 const client=useMemo(()=>createRecipesClient(props),[props.api,props.store,props.selection.token]);
 const [recipes,setRecipes]=useState<RecipeSummary[]>([]),[ingredients,setIngredients]=useState<Ingredient[]>([]),[detail,setDetail]=useState<RecipeDetail|null>(null),[cost,setCost]=useState<RecipeCostDTO|null>(null);
 const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[costLoading,setCostLoading]=useState(false),[error,setError]=useState(''),[costError,setCostError]=useState(''),[selectedId,setSelectedId]=useState(''),[editing,setEditing]=useState(false),[creating,setCreating]=useState(false);
 const selectionRequest=useRef(0);
 const refreshCatalog=useCallback(async(showLoading=false)=>{
  if(showLoading)setLoading(true);
  try{const list=async()=>{const result:RecipeSummary[]=[];let cursor:string|null=null;do{const page:Page<RecipeSummary>=await client.read<Page<RecipeSummary>>(`/recipes?limit=100${cursor?`&cursor=${cursor}`:''}`);result.push(...page.items);cursor=page.nextCursor;}while(cursor);return result;};const [items,stock]=await Promise.all([list(),client.listIngredients()]);client.assert();setRecipes(items);setIngredients(stock);setError('');}
  catch(reason){try{client.assert();setError(failure(reason));}catch{/* A stale response belongs to the previous unit. */}}
  finally{if(showLoading){try{client.assert();setLoading(false);}catch{/* Ignore an old request after context change. */}}}
 },[client]);
 useEffect(()=>{selectionRequest.current++;setRecipes([]);setIngredients([]);setDetail(null);setCost(null);setDetailLoading(false);setCostLoading(false);setSelectedId('');setEditing(false);setCreating(false);void refreshCatalog(true);},[refreshCatalog]);
 const openRecipe=useCallback(async(id:string)=>{
  const request=++selectionRequest.current;client.assert();setSelectedId(id);setDetail(null);setCost(null);setDetailLoading(true);setCostLoading(false);setError('');setCostError('');setEditing(false);setCreating(false);
  try{const result=await client.read<RecipeDetail>(`/recipes/${id}`);client.assert();if(request!==selectionRequest.current)return;setDetail(result);setDetailLoading(false);if(!result.currentVersion)setEditing(true);
   if(result.currentVersion){setCostLoading(true);try{const current=await client.read<RecipeCostDTO>(`/recipes/${id}/cost`);client.assert();if(request===selectionRequest.current)setCost(current);}catch(reason){try{client.assert();if(request===selectionRequest.current)setCostError(failure(reason));}catch{/* Ignore response after a context change. */}}finally{if(request===selectionRequest.current)setCostLoading(false);}}
  }catch(reason){try{client.assert();if(request===selectionRequest.current){setError(failure(reason));setDetailLoading(false);}}catch{/* Ignore response after a context change. */}}
 },[client]);
 const onSaved=async(id:string)=>{setCreating(false);setSelectedId(id);await refreshCatalog();await openRecipe(id);};
 const latest=detail?.currentVersion?detail.measurements.find(item=>item.recipeVersionId===detail.currentVersion?.id)??null:null;
 const reloadSelected=()=>{if(selectedId)void refreshCatalog().then(()=>openRecipe(selectedId));};
 return <section aria-label="Fichas técnicas" data-restaurant-id={props.selection.restaurantId}>
  <h2>Fichas técnicas</h2><p>Empresa e unidade selecionadas no cabeçalho: esta ficha e seu custo pertencem somente à unidade ativa.</p>
  {loading?<p role="status">Carregando fichas e insumos…</p>:<>
   {error&&<p role="alert">{error}</p>}
   <button type="button" onClick={()=>{setCreating(true);setEditing(false);setDetail(null);setSelectedId('');}}>Nova ficha</button>
   {recipes.length===0?<p>Nenhuma ficha cadastrada nesta unidade.</p>:<ul aria-label="Fichas da unidade">{recipes.map(recipe=><li key={recipe.id}><button type="button" aria-pressed={selectedId===recipe.id} onClick={()=>void openRecipe(recipe.id)}>{recipe.name} — {recipe.kind==='product'?'Produto':'Pré-preparo'} — {statusLabel[recipe.status]}</button></li>)}</ul>}
   {creating&&<RecipeEditor client={client} recipe={null} recipes={recipes} ingredients={ingredients} onSaved={id=>void onSaved(id)} onCancel={()=>setCreating(false)}/>}
   {detailLoading&&<p role="status">Carregando ficha e custo da unidade ativa…</p>}
   {detail&&<article aria-label={`Ficha ${detail.name}`}>
    <h3>{detail.name} — {detail.kind==='product'?'Produto':'Pré-preparo'}</h3>
    <p>Status: <strong>{statusLabel[detail.status]}</strong></p>
    {detail.currentVersion&&<><p>Versão atual {detail.currentVersion.versionNumber}, saída em {detail.currentVersion.outputUnit}.</p>
     {!editing&&<button type="button" onClick={()=>setEditing(true)}>Criar nova versão</button>}
     {editing&&<RecipeEditor key={`${detail.id}:${detail.currentVersion.id}`} client={client} recipe={detail} recipes={recipes} ingredients={ingredients} onSaved={id=>void onSaved(id)} onCancel={()=>setEditing(false)}/>}
     <RecipeCostPanel cost={cost} loading={costLoading} error={costError}/>
     <YieldMeasurementForm client={client} recipe={detail} latest={latest} onSaved={reloadSelected}/>
     {latest?.kind==='measured'&&!latest.validation&&<p role="status">Existe medição real aguardando validação. Revise os valores no histórico abaixo.</p>}
    </>}
    {!detail.currentVersion&&<><p role="status">Rascunho sem composição. Crie a primeira versão para registrar medições.</p>{editing&&<RecipeEditor key={detail.id} client={client} recipe={detail} recipes={recipes} ingredients={ingredients} onSaved={id=>void onSaved(id)} onCancel={()=>setEditing(false)}/>}</>}
    <RecipeHistory client={client} recipe={detail} ingredients={ingredients} onChanged={()=>{void refreshCatalog().then(()=>openRecipe(detail.id));}}/>
   </article>}
   {recipes.length>0&&<button type="button" disabled={loading} onClick={()=>{void refreshCatalog();if(selectedId)void openRecipe(selectedId);}}>Atualizar fichas e custo</button>}
  </>}
 </section>;
}
