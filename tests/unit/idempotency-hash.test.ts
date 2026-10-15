import { expect,it,vi } from 'vitest';
import { canonicalHash,retryIdempotent } from '../../packages/db/src/idempotency.js';
it('hash independente da ordem das propriedades, distinto por operação/contexto',()=>{
  expect(canonicalHash({b:2,a:{z:1,c:2}})).toBe(canonicalHash({a:{c:2,z:1},b:2}));
  expect(canonicalHash({org:'A',name:'X'})).not.toBe(canonicalHash({org:'B',name:'X'}));
});
it('retry somente SQL transiente, máximo duas novas tentativas',async()=>{
  const transient=vi.fn().mockRejectedValueOnce({code:'40001'}).mockRejectedValueOnce({code:'40P01'}).mockResolvedValue('ok');
  expect(await retryIdempotent(transient)).toBe('ok'); expect(transient).toHaveBeenCalledTimes(3);
  const failure=vi.fn().mockRejectedValue({code:'40001'});
  await expect(retryIdempotent(failure)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});expect(failure).toHaveBeenCalledTimes(3);
  const permanent=vi.fn().mockRejectedValue({code:'42501'});
  await expect(retryIdempotent(permanent)).rejects.toMatchObject({code:'42501'});expect(permanent).toHaveBeenCalledTimes(1);
});
