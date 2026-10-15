import type { QueryResult, QueryResultRow } from 'pg';
import type { ApiErrorCode } from '@donos/contracts';
declare const verified:unique symbol;
export type VerifiedActor=Readonly<{userId:string;sessionId:string;requestId:string;[verified]:true}>;
export type OrganizationContext=Readonly<{actor:VerifiedActor;organizationId:string}>;
export type RestaurantContext=OrganizationContext&Readonly<{restaurantId:string}>;
export type ParameterizedQuery=<T extends QueryResultRow=QueryResultRow>(text:string,values?:readonly unknown[])=>Promise<QueryResult<T>>;
export type Tx=Readonly<{query:ParameterizedQuery}>;
export class DomainError extends Error {
  constructor(public readonly code:ApiErrorCode,public readonly status:number){super(code);}
}
