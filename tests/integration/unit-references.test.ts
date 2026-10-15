import { randomUUID } from 'node:crypto';
import { afterAll,expect,it } from 'vitest';
import { createDatabase } from '../../packages/db/src/transaction.js';
import type { VerifiedActor } from '../../packages/db/src/types.js';
import { runtimePool } from '../helpers/local-db.js';
import { fixtures as f } from '../helpers/fixtures.js';
const pool=runtimePool(),db=createDatabase(pool);afterAll(()=>pool.end());
it('fundação T-02: FK tripla temporária rejeita referência de A1 para item A2',async()=>{
  const actor={userId:f.a,sessionId:randomUUID(),requestId:randomUUID()} as VerifiedActor;
  await db.withOrganizationTx(actor,f.orgA,async(_ctx,tx)=>{
    await tx.query('create temporary table test_unit_items(org uuid,unit uuid,id uuid,primary key(org,unit,id)) on commit drop');
    await tx.query('create temporary table test_unit_refs(org uuid,unit uuid,item uuid,foreign key(org,unit,item) references test_unit_items(org,unit,id)) on commit drop');
    await tx.query('insert into test_unit_items values($1,$2,$3)',[f.orgA,f.a2,f.a2]);
    await expect(tx.query('insert into test_unit_refs values($1,$2,$3)',[f.orgA,f.a1,f.a2])).rejects.toMatchObject({code:'23503'});
  });
});
