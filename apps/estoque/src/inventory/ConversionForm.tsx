import {useState} from 'react';
import type {Ingredient} from '@donos/contracts';
import type {InventoryClient} from './inventory-client.js';
import {normalizeDecimalInput} from './decimal-input.js';
import {useCommand} from './form-state.js';
export function ConversionForm({client,ingredients,onChanged}:{client:InventoryClient;ingredients:Ingredient[];onChanged:()=>void}){
 const[id,setId]=useState(''),[label,setLabel]=useState(''),[factor,setFactor]=useState('');const command=useCommand(client,onChanged);
 return <section><h3>Embalagens e conversões</h3><p>Fator na unidade-base. Nova versão preserva recebimentos anteriores.</p><form onChange={command.changed} onSubmit={e=>{e.preventDefault();void command.run(key=>client.write(`/ingredients/${id}/conversions`,{label,factorToBase:normalizeDecimalInput(factor,12)},key));}}><label>Insumo da embalagem<select disabled={command.busy} required value={id} onChange={e=>setId(e.target.value)}><option value="">Selecione</option>{ingredients.filter(i=>!i.archived).map(i=><option key={i.id} value={i.id}>{i.name} ({i.baseUnit})</option>)}</select></label><label>Nome da embalagem<input disabled={command.busy} required maxLength={120} value={label} onChange={e=>setLabel(e.target.value)}/></label><label>Fator para a unidade-base<input disabled={command.busy} required inputMode="decimal" value={factor} onChange={e=>setFactor(e.target.value)}/></label><button disabled={command.busy}>Salvar versão da embalagem</button></form>{command.error&&<p role="alert">{command.error}</p>}</section>;
}
