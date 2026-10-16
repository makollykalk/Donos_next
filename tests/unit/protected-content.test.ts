import { expect,it } from 'vitest';
import { ContextStore } from '../../packages/auth-client/src/context-store.js';
import { protectedSelection } from '../../packages/auth-client/src/OwnerApp.js';
it('protected content requires granted access and current explicit unit; clearing closes slot',async()=>{
 const selected={id:'unit',organizationId:'org',name:'Unidade'};
 const store=new ContextStore(async input=>({...input,token:'opaque',expiresAt:'2099-01-01T00:00:00Z'}));
 expect(protectedSelection(true,selected,store)).toBeNull();await store.select({organizationId:'org',restaurantId:'unit'});
 expect(protectedSelection(false,selected,store)).toBeNull();expect(protectedSelection(true,{...selected,id:'other'},store)).toBeNull();
 expect(protectedSelection(true,selected,store)?.restaurantId).toBe('unit');store.clear();expect(protectedSelection(true,selected,store)).toBeNull();
});
