import {OwnerApp} from '@donos/auth-client';
import type {OwnerRuntime} from '@donos/auth-client';
export function App({runtime}:{runtime:OwnerRuntime}){return <OwnerApp runtime={runtime} app="portal"/>;}
