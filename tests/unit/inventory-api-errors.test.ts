import { expect,it } from 'vitest';
import { ApiFailure } from '../../packages/auth-client/src/api-client.js';
it('business conflicts do not claim context expired',()=>{
 expect(new ApiFailure(409,'INSUFFICIENT_STOCK').message).toMatch(/Saldo insuficiente/);
 expect(new ApiFailure(409,'REVERSAL_REQUIRES_REVALUATION').message).toMatch(/posteriores/);
 expect(new ApiFailure(409,'CONTEXT_EXPIRED').message).toMatch(/Contexto/);
});
