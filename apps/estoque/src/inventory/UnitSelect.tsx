import {useEffect,useState} from 'react';
import type {ConversionVersion,Ingredient,InputUnit} from '@donos/contracts';
import type {InventoryClient} from './inventory-client.js';
export function UnitSelect({client,ingredient,label,value,onChange,revision,disabled}:{client:InventoryClient;ingredient:Ingredient|undefined;label:string;value:InputUnit;onChange:(unit:InputUnit)=>void;revision:number;disabled:boolean}){
 const[conversions,setConversions]=useState<ConversionVersion[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setConversions([]);setError('');if(ingredient)void client.read<{items:ConversionVersion[]}>(`/ingredients/${ingredient.id}/conversions`).then(result=>{if(active)setConversions(result.items);}).catch(()=>{if(active)setError('Falha ao carregar embalagens. Selecione novamente o insumo.');});return()=>{active=false;};},[client,ingredient?.id,revision]);
 const codes=ingredient?.baseUnit==='kg'?['kg','g']:ingredient?.baseUnit==='L'?['L','mL']:['un'];
 return <><label>{label}<select disabled={disabled} value={value.kind==='standard'?value.code:value.conversionId} onChange={e=>{const v=e.target.value;onChange(codes.includes(v)?{kind:'standard',code:v as 'kg'|'g'|'L'|'mL'|'un'}:{kind:'package',conversionId:v});}}>{codes.map(code=><option key={code}>{code}</option>)}{conversions.map(c=><option key={c.id} value={c.id}>{c.label} v{c.version} (×{c.factorToBase})</option>)}</select></label>{error&&<p role="alert">{error}</p>}</>;
}
