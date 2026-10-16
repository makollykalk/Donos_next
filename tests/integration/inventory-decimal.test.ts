import { afterAll,expect,it } from 'vitest';
import { runtimePool } from '../helpers/local-db.js';
const pool=runtimePool();afterAll(()=>pool.end());
it('SQL cost preserves all twelve decimals at large magnitudes',async()=>{
 const r=(await pool.query("select core.inventory_cost(1,123456789012345678.901234567891,1)::text as value")).rows[0];
 expect(r?.value).toBe('123456789012345678.901234567891');
});
it('SQL rejects numeric scale/range/nonfinite instead of coercing',async()=>{
 for(const [domain,values] of [['inventory_quantity',['0.0000001','NaN','Infinity','-1','1000000000000000000']],['inventory_value',['0.0000000000001','NaN','Infinity','100000000000000000000000000']]] as const){
  for(const value of values)await expect(pool.query(`select $1::numeric::core.${domain}`,[value])).rejects.toMatchObject({code:'23514'});
 }
});
