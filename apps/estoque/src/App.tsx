import {OwnerApp} from '@donos/auth-client';
import type {OwnerRuntime} from '@donos/auth-client';
import {InventoryWorkspace} from './inventory/InventoryWorkspace.js';
export function App({runtime}:{runtime:OwnerRuntime}){return <OwnerApp runtime={runtime} app="estoque" renderProtectedContent={props=><InventoryWorkspace {...props}/>}/>;}
