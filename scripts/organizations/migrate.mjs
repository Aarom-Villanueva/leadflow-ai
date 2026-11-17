import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
const role=process.env.IDENTITY_RUNTIME_ROLE,text=process.env.IDENTITY_MIGRATION_URL;
if(!text||!role||!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Explicit local provisioner and runtime required');
let url;try{url=new URL(text);}catch{throw Error('Invalid local migration target');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||['/','/postgres','/template0','/template1'].includes(url.pathname))throw Error('Dedicated local database required');
const read=name=>readFileSync(new URL('../../src/shared/database/migrations/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=read('0005_organization_admin.sql'),checksum=hash(sql),pool=new pg.Pool({connectionString:text,max:1});
try{
 const c=await pool.connect();
 try{
  await c.query('select pg_advisory_lock(260026)');
  const owned=await c.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname in('user','organizations','memberships','organization_audit','app_migrations','dashboard_snapshots') and relowner=(select oid from pg_roles where rolname=current_user)");
  if(owned.rows[0].n!==6)throw Error('Original provisioner and prior schema required');
  const roles=await c.query("select rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or pg_has_role(rolname,current_user,'MEMBER') or exists(select 1 from pg_roles p where pg_has_role($1,p.oid,'MEMBER') and(p.rolsuper or p.rolbypassrls or p.rolcreatedb or p.rolcreaterole)) as unsafe from pg_roles where rolname=$1",[role]);
  if(roles.rows.length!==1||roles.rows[0].unsafe)throw Error('Separate unprivileged runtime required');
  const prior=await c.query("select sha256 from app_migrations where version='0004_analytics'");
  if(prior.rows[0]?.sha256!==hash(read('0004_analytics.sql')))throw Error('Matching 0004 required');
  const old=await c.query("select sha256 from app_migrations where version='0005_organization_admin'");
  if(old.rowCount){if(old.rows[0].sha256!==checksum)throw Error('Migration checksum mismatch');console.log('Organization administration migration already applied with matching checksum');}
  else{
   const existing=await c.query("select to_regclass('public.organization_admin_requests') t,exists(select 1 from information_schema.columns where table_schema='public' and table_name='memberships' and column_name='version') c");
   if(existing.rows[0].t||existing.rows[0].c)throw Error('Unknown administration schema; refusing overwrite');
   if(!/commit;\s*$/i.test(sql))throw Error('Transactional migration required');
   await c.query(sql.replace(/commit;\s*$/i,`grant execute on function lf_admin_info(uuid),lf_admin_members(uuid,uuid,integer),lf_admin_audit(uuid,timestamptz,uuid,integer),lf_admin_mutate(uuid,uuid,text,jsonb) to "${role}";insert into app_migrations(version,sha256) values('0005_organization_admin','${checksum}');commit;`));
   console.log('Organization administration schema, grants and ledger applied atomically');
  }
 }finally{try{await c.query('rollback');await c.query('select pg_advisory_unlock(260026)');}finally{c.release();}}
}finally{await pool.end();}
