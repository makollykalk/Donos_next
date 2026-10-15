import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Capability,Organization,Restaurant,SelectedContext} from '@donos/contracts';
import {createApiClient,ApiFailure} from './api-client.js';
import {ContextStore,StaleContextError} from './context-store.js';
import {logoutOwner} from './client.js';
import {LoginForm} from './LoginForm.js';
export function createOwnerRuntime(auth:SupabaseClient,apiUrl:string){
  const api=createApiClient(auth,apiUrl);
  const store=new ContextStore(input=>api<SelectedContext>('/v1/contexts',{method:'POST',body:input}));
  return {auth,api,store};
}
export type OwnerRuntime=ReturnType<typeof createOwnerRuntime>;
export function OwnerApp({runtime,app}:{runtime:OwnerRuntime;app:'portal'|'estoque'|'precificacao'}){
  const{auth,api,store}=runtime;
  const[authenticated,setAuthenticated]=useState(false);const[loading,setLoading]=useState(true);const[error,setError]=useState('');
  const[organizations,setOrganizations]=useState<Organization[]>([]);const[organization,setOrganization]=useState<Organization|null>(null);
  const[restaurants,setRestaurants]=useState<Restaurant[]>([]);const[selected,setSelected]=useState<Restaurant|null>(null);const[access,setAccess]=useState(false);
  const[capabilities,setCapabilities]=useState<Capability[]>([]);const[busy,setBusy]=useState(false);
  const[unitLoadFailed,setUnitLoadFailed]=useState(false);
  const clear=()=>{store.clear();setLoading(false);setSelected(null);setAccess(false);setOrganization(null);setRestaurants([]);setCapabilities([]);setOrganizations([]);setAuthenticated(false);for(const key of Object.keys(sessionStorage)){if(key.startsWith(`donos-${app}-auth`))sessionStorage.removeItem(key);}history.replaceState(null,'','/login');};
  async function load(){store.clear();const generation=store.snapshot().generation;setSelected(null);setAccess(false);setOrganization(null);setRestaurants([]);setLoading(true);setError('');try{await api('/v1/me');const result=await api<{items:Organization[]}>('/v1/organizations');store.assertCurrent(generation);setOrganizations(result.items);setAuthenticated(true);history.replaceState(null,'','/organizations');}catch(error){if(store.snapshot().generation===generation){setAuthenticated(false);setError(error instanceof ApiFailure&&error.status!==401?error.message:'');history.replaceState(null,'','/login');}}finally{if(store.snapshot().generation===generation)setLoading(false);}}
  useEffect(()=>{void load();const {data}=auth.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){store.clear();setLoading(false);setAuthenticated(false);setSelected(null);setAccess(false);}});const navigate=()=>{store.clear();setSelected(null);setAccess(false);setOrganization(null);setRestaurants([]);};window.addEventListener('popstate',navigate);return()=>{data.subscription.unsubscribe();store.clear();window.removeEventListener('popstate',navigate);};},[runtime]);
  async function chooseOrganization(item:Organization){
    store.clear();const generation=store.snapshot().generation;setOrganization(item);setRestaurants([]);setSelected(null);setAccess(false);setCapabilities([]);setError('');setUnitLoadFailed(false);setBusy(true);
    try{const [units,caps]=await Promise.all([api<{items:Restaurant[]}>(`/v1/organizations/${item.id}/restaurants`),api<{items:Capability[]}>(`/v1/organizations/${item.id}/capabilities`)]);store.assertCurrent(generation);setRestaurants(units.items);setCapabilities(caps.items);}catch(error){if(store.snapshot().generation===generation&&!(error instanceof StaleContextError)){setUnitLoadFailed(true);setError(error instanceof Error?error.message:'Falha ao carregar unidades.');}}finally{if(store.snapshot().generation===generation)setBusy(false);}
  }
  async function chooseRestaurant(item:Restaurant){
    setSelected(null);setAccess(false);setError('');setBusy(true);const generation=store.snapshot().generation+1;
    try{await store.select({organizationId:item.organizationId,restaurantId:item.id});if(app!=='portal'){await store.read(context=>api(`/v1/organizations/${context.organizationId}/restaurants/${context.restaurantId}/access/${app}`,{contextToken:context.token}));}setSelected(item);setAccess(true);history.replaceState(null,'',`/organizations/${item.organizationId}/restaurants/${item.id}`);}catch(error){if(store.snapshot().generation===generation&&!(error instanceof StaleContextError)){store.clear();setBusy(false);setError(error instanceof Error?error.message:'Falha ao selecionar unidade.');}}finally{if(store.snapshot().generation===generation)setBusy(false);}
  }
  if(loading)return <main><p role="status">Verificando sessão…</p></main>;
  if(!authenticated)return <main>{error&&<p role="alert">{error}</p>}<LoginForm auth={auth} onLogin={()=>{void load();}}/></main>;
  const generation=store.snapshot().generation;
  return <main><header><h1>{app==='portal'?'DONOS Next':app==='estoque'?'Estoque':'Precificação'}</h1><button onClick={async()=>{const confirmed=await logoutOwner(()=>api<void>('/v1/auth/logout',{method:'POST'}),()=>auth.auth.signOut({scope:'local'}),clear);if(!confirmed)setError('Estado local limpo. O encerramento remoto não foi confirmado.');}}>Sair</button></header>
    {error&&<p role="alert">{error}</p>}<h2>Empresas</h2><nav aria-label="Empresas">{organizations.map(item=><button key={item.id} aria-pressed={organization?.id===item.id} onClick={()=>{void chooseOrganization(item);}}>{item.name}</button>)}</nav>
    {app==='portal'&&<OrganizationCreator key={generation} onCreate={async(name,first,key)=>{await store.submit(generation,async()=>{await api('/v1/organizations',{method:'POST',idempotencyKey:key,body:{name,firstRestaurant:{name:first}}});});store.assertCurrent(generation);await load();}}/>}
    {!organization&&<p>Selecione explicitamente uma unidade.</p>}
    {organization&&<section><h2>Unidades de {organization.name}</h2>{busy&&<p role="status">Carregando…</p>}{restaurants.map(item=><button key={item.id} onClick={()=>{void chooseRestaurant(item);}}>Selecionar {item.name}</button>)}
      {unitLoadFailed&&<button disabled={busy} onClick={()=>{void chooseOrganization(organization);}}>Tentar carregar unidades novamente</button>}
      {app==='portal'&&<UnitCreator key={`${organization.id}:${generation}`} onCreate={async(name,key)=>{const captured=organization;await store.submit(generation,()=>api(`/v1/organizations/${captured.id}/restaurants`,{method:'POST',idempotencyKey:key,body:{name}}));store.assertCurrent(generation);await chooseOrganization(captured);}}/>}
      <p>{selected?`Unidade ativa: ${selected.name}`:'Selecione explicitamente uma unidade.'}</p>
      {access&&app!=='portal'&&<section aria-label="Módulo protegido"><h2>Acesso de demonstração — {app==='estoque'?'Estoque':'Precificação'}</h2><p>{selected?.name}</p><p>Fundação do aplicativo. Operações de negócio serão implementadas nos próximos ciclos.</p></section>}
      {app==='portal'&&<ul aria-label="Acessos de demonstração">{capabilities.map(item=><li key={item.feature}>{item.feature}: {item.allowed?'Acesso de demonstração':'Não concedido'}</li>)}</ul>}
    </section>}</main>;
}
function OrganizationCreator({onCreate}:{onCreate:(name:string,first:string,key:string)=>Promise<void>}){
  const[name,setName]=useState('');const[first,setFirst]=useState('');const[key,setKey]=useState(()=>crypto.randomUUID());const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await onCreate(name,first,key);setName('');setFirst('');setKey(crypto.randomUUID());}catch(error){setError(error instanceof Error?error.message:'Falha ao criar empresa.');}finally{setBusy(false);}}}><h2>Nova empresa</h2><label>Nome da empresa<input required maxLength={120} value={name} onChange={event=>{setName(event.target.value);setKey(crypto.randomUUID());}}/></label><label>Primeira unidade<input required maxLength={120} value={first} onChange={event=>{setFirst(event.target.value);setKey(crypto.randomUUID());}}/></label><button disabled={busy}>Criar empresa</button>{error&&<p role="alert">{error}</p>}</form>;
}
function UnitCreator({onCreate}:{onCreate:(name:string,key:string)=>Promise<void>}){
  const[name,setName]=useState('');const[key,setKey]=useState(()=>crypto.randomUUID());const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await onCreate(name,key);setName('');setKey(crypto.randomUUID());}catch(error){setError(error instanceof Error?error.message:'Falha ao adicionar unidade.');}finally{setBusy(false);}}}><label>Nome da nova unidade<input required maxLength={120} value={name} onChange={event=>{setName(event.target.value);setKey(crypto.randomUUID());}}/></label><button disabled={busy}>Adicionar unidade</button>{error&&<p role="alert">{error}</p>}</form>;
}
