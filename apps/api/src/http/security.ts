import type { FastifyRequest } from 'fastify';
import type { Database,VerifiedActor } from '@donos/db';
import { DomainError } from '@donos/db';
import type { TextExtractor } from '../services/ai-text-types.js';
export type AppDependencies=Readonly<{
  database?:Database;
  verifyActor?:(token:string,requestId:string)=>Promise<VerifiedActor>;
  corsOrigins?:readonly string[];
  textExtractor?:TextExtractor;
}>;
export function createServices(deps:AppDependencies) {
  function database():Database { if(!deps.database) throw new DomainError('DEPENDENCY_UNAVAILABLE',503); return deps.database; }
  async function actor(request:FastifyRequest,allowRevoked=false):Promise<VerifiedActor> {
    const header=request.headers.authorization;
    if(!header||!/^Bearer [^\s]+$/.test(header)) throw new DomainError('UNAUTHENTICATED',401);
    if(!deps.verifyActor) throw new DomainError('DEPENDENCY_UNAVAILABLE',503);
    const actor=await deps.verifyActor(header.slice(7),request.id);
    await database().withActorTx(actor,async()=>undefined,allowRevoked);
    return actor;
  }
  return {database,actor,textExtractor:deps.textExtractor};
}
export type ApiServices=ReturnType<typeof createServices>;
export function validate<T>(schema:{safeParse:(input:unknown)=>{success:boolean;data?:T}},input:unknown):T {
  const result=schema.safeParse(input);
  if(!result.success) throw new DomainError('VALIDATION_ERROR',400);
  return result.data!;
}
