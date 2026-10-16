import { expect,it } from 'vitest';
import { buildApp } from '../../apps/api/src/app.js';
it.each(['{',' '.repeat(33000)])('JSON inválido/corpo excessivo são erro cliente, não503',async payload=>{
  const app=buildApp({});
  try { const response=await app.inject({method:'POST',url:'/v1/organizations',headers:{'content-type':'application/json'},payload});
    expect(response.statusCode).toBe(400);expect(response.json().error.code).toBe('VALIDATION_ERROR');
  } finally {await app.close();}
});
