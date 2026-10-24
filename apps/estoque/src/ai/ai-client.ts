import type {AiTextProposal,AiTextProposalReview} from '@donos/contracts';
import type {InventoryClient} from '../inventory/inventory-client.js';

export type AiConfirmation = Readonly<{expectedVersion:number;confirmed:true}>;
export type AiConfirmationResult = {proposal:AiTextProposal;result:unknown};
const path='/ai/text/proposals';
export function createAiClient(client:InventoryClient){
  return {
    create:(locationId:string,text:string,key:string)=>client.write<AiTextProposal>(path,{locationId,text},key),
    get:(id:string)=>client.read<AiTextProposal>(`${path}/${encodeURIComponent(id)}`),
    review:(id:string,body:AiTextProposalReview,key:string)=>client.write<AiTextProposal>(`${path}/${encodeURIComponent(id)}`,body,key,'PATCH'),
    discard:(id:string,key:string)=>client.write<{id:string;status:'discarded'}>(`${path}/${encodeURIComponent(id)}/discard`,{},key),
    confirm:(id:string,body:AiConfirmation,key:string)=>client.write<AiConfirmationResult>(`${path}/${encodeURIComponent(id)}/confirm`,body,key),
  };
}
