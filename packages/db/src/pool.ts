import { readFileSync } from 'node:fs';
import pg from 'pg';
export function createPool(config:{databaseUrl:string;databaseTls:boolean;databaseCaFile?:string}):pg.Pool {
  const url=new URL(config.databaseUrl);
  if(config.databaseTls && (url.search!=='?sslmode=verify-full'||!config.databaseCaFile)) throw new Error('Database TLS configuration required');
  url.search='';
  const pool=new pg.Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,
    ssl:config.databaseTls ? {rejectUnauthorized:true,ca:readFileSync(config.databaseCaFile!,'utf8')} : false,
    statement_timeout:10000,query_timeout:12000});
  pool.on('error',()=>{console.error('Database connection unavailable');});
  return pool;
}
