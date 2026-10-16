import type {SupabaseClient} from '@supabase/supabase-js';
export class ApiFailure extends Error {
  constructor(readonly status:number,readonly code:string){
    const messages:Record<string,string>={INSUFFICIENT_STOCK:'Saldo insuficiente para esta saída.',REVERSAL_REQUIRES_REVALUATION:'Há movimentos posteriores; este estorno exige revisão de valoração.',REVERSAL_ALREADY_APPLIED:'Este movimento já foi estornado.',IDEMPOTENCY_CONFLICT:'A chave já foi usada com outros dados.',RESOURCE_CONFLICT:'O registro mudou ou não aceita esta operação.',UNIT_INCOMPATIBLE:'Unidade incompatível com o insumo.',QUANTITY_PRECISION:'Quantidade incompatível com a precisão ou fração permitida.',NUMERIC_RANGE:'Valor fora da faixa permitida.',VALUATION_UNDERFLOW:'Custo positivo abaixo da precisão permitida.',VALIDATION_ERROR:'Confira os campos informados.'};
    super(messages[code]??(status===503?'Serviço indisponível. Tente novamente.':status===403?'Acesso não concedido para esta empresa.':status===401?'Entre novamente.':['CONTEXT_EXPIRED','CONTEXT_MISMATCH'].includes(code)?'Contexto expirado ou alterado. Selecione novamente.':'Não foi possível concluir a operação.'));
  }
}
export function createApiClient(auth:SupabaseClient,baseUrl:string){
  const base=new URL(baseUrl);
  if(!['127.0.0.1','localhost'].includes(base.hostname) || base.protocol!=='http:')throw Error('API local inválida.');
  return async function apiRequest<T>(path:string,options:{method?:string;body?:unknown;contextToken?:string;idempotencyKey?:string}={}):Promise<T>{
    if(!path.startsWith('/v1/') || path.includes('://'))throw Error('Rota inválida.');
    const {data,error}=await auth.auth.getSession();
    if(error || !data.session)throw new ApiFailure(401,'UNAUTHENTICATED');
    const headers:Record<string,string>={Authorization:`Bearer ${data.session.access_token}`};
    if(options.body!==undefined)headers['Content-Type']='application/json';
    if(options.contextToken)headers['X-Donos-Context']=options.contextToken;
    if(options.idempotencyKey)headers['Idempotency-Key']=options.idempotencyKey;
    let response:Response;
    try{response=await fetch(`${base.origin}${path}`,{method:options.method??'GET',headers,cache:'no-store',signal:AbortSignal.timeout(20000),...(options.body===undefined?{}:{body:JSON.stringify(options.body)})});}catch{throw new ApiFailure(503,'DEPENDENCY_UNAVAILABLE');}
    if(!response.ok){const error=await response.json().catch(()=>null) as {error?:{code?:string}}|null;throw new ApiFailure(response.status,error?.error?.code??'DEPENDENCY_UNAVAILABLE');}
    return (response.status===204?undefined:await response.json()) as T;
  };
}
export type ApiClient=ReturnType<typeof createApiClient>;
