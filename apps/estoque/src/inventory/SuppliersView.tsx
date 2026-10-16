import {useState} from 'react';
import type {Supplier} from '@donos/contracts';
import type {InventoryClient} from './inventory-client.js';
import {useCommand} from './form-state.js';
export function SuppliersView({client,items,onChanged}:{client:InventoryClient;items:Supplier[];onChanged:()=>void}){
 const[name,setName]=useState(''),[contact,setContact]=useState('');const command=useCommand(client,onChanged);
 return <section aria-label="Fornecedores"><h3>Fornecedores da empresa</h3><form onChange={command.changed} onSubmit={e=>{e.preventDefault();void command.run(key=>client.write('/suppliers',{name,...(contact?{contact}:{})},key)).then(ok=>{if(ok){setName('');setContact('');}});}}><label>Nome do fornecedor<input disabled={command.busy} required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>Contato do fornecedor<input disabled={command.busy} maxLength={240} value={contact} onChange={e=>setContact(e.target.value)}/></label><button disabled={command.busy}>Cadastrar fornecedor</button></form>{command.error&&<p role="alert">{command.error}</p>}<ul>{items.map(item=><li key={item.id}>{item.name} {item.contact} {item.archived?'— arquivado':''}<button disabled={command.busy} onClick={()=>{void command.run(key=>client.write(`/suppliers/${item.id}`,{archived:!item.archived},key,'PATCH'),item.id+':'+item.archived);}}>{item.archived?'Desarquivar fornecedor':'Arquivar fornecedor'} {item.name}</button></li>)}</ul></section>;
}
