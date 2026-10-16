import {useEffect,useMemo,useState} from 'react';
import type {ProtectedContentProps} from '@donos/auth-client';
import type {Ingredient,Supplier,ReceiptHeader,StockBalance,Page} from '@donos/contracts';
import {createInventoryClient} from './inventory-client.js';
import {formatRatio,displayDecimal} from './decimal-input.js';
import {IngredientsView} from './IngredientsView.js';
import {SuppliersView} from './SuppliersView.js';
import {ConversionForm} from './ConversionForm.js';
import {ReceiptForm} from './ReceiptForm.js';
import {ReceiptsView} from './ReceiptsView.js';
import {IssueForm} from './IssueForm.js';
import {StockLedgerView} from './StockLedgerView.js';
import {PriceHistoryView} from './PriceHistoryView.js';
import {RecipesWorkspace} from '../recipes/RecipesWorkspace.js';
export function InventoryWorkspace(props:ProtectedContentProps){
 const client=useMemo(()=>createInventoryClient(props),[props.api,props.store,props.selection.token]);
 const[ingredients,setIngredients]=useState<Ingredient[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[receipts,setReceipts]=useState<ReceiptHeader[]>([]),[balances,setBalances]=useState<StockBalance[]>([]),[total,setTotal]=useState('0'),[revision,setRevision]=useState(0),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[detail,setDetail]=useState('');
 const refresh=()=>setRevision(value=>value+1);
 useEffect(()=>{let active=true;setError('');async function all<T>(path:string){const result:T[]=[];let cursor:string|null=null;do{const page:Page<T>=await client.read<Page<T>>(`${path}${path.includes('?')?'&':'?'}limit=100${cursor?`&cursor=${cursor}`:''}`);result.push(...page.items);cursor=page.nextCursor;}while(cursor);return result;}
 async function loadBalances(){const items:StockBalance[]=[];let cursor:string|null=null,totalValue='0';do{const page:Page<StockBalance>&{totalValue:string}=await client.read<Page<StockBalance>&{totalValue:string}>("/balances?includeArchived=true&limit=100"+(cursor?"&cursor="+cursor:""));if(cursor===null)totalValue=page.totalValue;items.push(...page.items);cursor=page.nextCursor;}while(cursor);return{items,totalValue};}
 void Promise.all([all<Ingredient>('/ingredients?includeArchived=true'),all<Supplier>('/suppliers?includeArchived=true'),all<ReceiptHeader>('/receipts'),loadBalances()]).then(([i,s,r,b])=>{if(active){setIngredients(i);setSuppliers(s);setReceipts(r);setBalances(b.items);setTotal(b.totalValue);setLoaded(true);}}).catch(e=>{if(active){setLoaded(false);setError(e instanceof Error?e.message:'Falha ao carregar estoque.');}});return()=>{active=false;};},[client,revision]);
 const selected=ingredients.find(i=>i.id===detail);
 return <><section aria-label="Operações de estoque" data-restaurant-id={props.selection.restaurantId}><h2>Estoque da unidade ativa</h2><p>Operações da unidade selecionada acima.</p><p>Todos os formulários abaixo operam exclusivamente nesta unidade.</p><button onClick={refresh}>Atualizar estoque</button>{error&&<p role="alert">{error}</p>}{!loaded?<p role="status">Carregando estoque. Use Atualizar estoque para tentar novamente.</p>:<>
 <IngredientsView client={client} items={ingredients} onChanged={refresh}/><SuppliersView client={client} items={suppliers} onChanged={refresh}/><ConversionForm client={client} ingredients={ingredients} onChanged={refresh}/><ReceiptForm revision={revision} client={client} ingredients={ingredients} suppliers={suppliers} onChanged={refresh}/><ReceiptsView client={client} items={receipts} onChanged={refresh}/><IssueForm revision={revision} client={client} ingredients={ingredients} onChanged={refresh}/>
 <section aria-label="Saldos de estoque"><h3>Saldos e valor</h3><p>Valor total da unidade, incluindo insumos arquivados: R$ {displayDecimal(total)}</p><table><caption>Saldos da unidade ativa</caption><thead><tr><th>Insumo</th><th>Saldo</th><th>Valor R$</th><th>Custo médio R$</th><th>Razão exata</th><th>Detalhes</th></tr></thead><tbody>{ingredients.map(item=>{const balance=balances.find(b=>b.ingredientId===item.id);return <tr key={item.id}><th>{item.name}</th><td>{displayDecimal(balance?.quantity??'0')} {item.baseUnit}</td><td>{displayDecimal(balance?.value??'0')}</td><td>{formatRatio(balance?.averageCostRatio??null)}</td><td>{balance?.averageCostRatio?`${balance.averageCostRatio.numerator}/${balance.averageCostRatio.denominator}`:'—'}</td><td><button onClick={()=>setDetail(item.id)}>Ver extrato e preços de {item.name}</button></td></tr>;})}</tbody></table></section>
 {selected&&<div key={selected.id}><StockLedgerView client={client} ingredient={selected} revision={revision} onChanged={refresh}/><PriceHistoryView client={client} ingredient={selected} suppliers={suppliers} revision={revision}/></div>}</>}</section><RecipesWorkspace {...props}/></>;
}
