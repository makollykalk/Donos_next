import {useState} from 'react';
import type {Ingredient,BaseUnit} from '@donos/contracts';
import type {InventoryClient} from './inventory-client.js';
import {useCommand} from './form-state.js';
export function IngredientsView({client,items,onChanged}:{client:InventoryClient;items:Ingredient[];onChanged:()=>void}){
 const[name,setName]=useState(''),[base,setBase]=useState<BaseUnit>('kg'),[fraction,setFraction]=useState(false);
 const command=useCommand(client,onChanged);
 return <section aria-label="Catálogo de insumos"><h3>Insumos</h3><form onChange={command.changed} onSubmit={event=>{event.preventDefault();void command.run(key=>client.write('/ingredients',{name,baseUnit:base,allowFractionalCount:base==='un'&&fraction},key)).then(ok=>{if(ok)setName('');});}}>
 <label>Nome do insumo<input disabled={command.busy} required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Unidade-base<select disabled={command.busy} value={base} onChange={e=>setBase(e.target.value as BaseUnit)}><option>kg</option><option>L</option><option>un</option></select></label>
 {base==='un'&&<label><input disabled={command.busy} type="checkbox" checked={fraction} onChange={e=>setFraction(e.target.checked)}/>Permitir frações de unidade</label>}
 <button disabled={command.busy}>Cadastrar insumo</button></form>{command.error&&<p role="alert">{command.error}</p>}
 <ul>{items.map(item=><li key={item.id}>{item.name} ({item.baseUnit}) {item.archived?'— arquivado':''} <button disabled={command.busy} onClick={()=>{void command.run(key=>client.write(`/ingredients/${item.id}`,{archived:!item.archived},key,'PATCH'),item.id+':'+item.archived);}}>{item.archived?'Desarquivar':'Arquivar'} {item.name}</button></li>)}</ul></section>;
}
