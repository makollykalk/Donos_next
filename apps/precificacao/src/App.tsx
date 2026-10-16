import {OwnerApp} from '@donos/auth-client';
import type {OwnerRuntime} from '@donos/auth-client';
import {PricingWorkspace} from './pricing/PricingWorkspace.js';
export function App({runtime}:{runtime:OwnerRuntime}){return <OwnerApp runtime={runtime} app="precificacao" renderProtectedContent={props=><PricingWorkspace {...props}/>}/>;}
