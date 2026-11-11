import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
const role=process.env.IDENTITY_RUNTIME_ROLE,text=process.env.IDENTITY_MIGRATION_URL;
if(!text||!role||!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Explicit local provisioner and runtime required');
let url;
try {url=new URL(text);} catch {throw Error('Invalid local migration target');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||['/','/postgres','/template0','/template1'].includes(url.pathname))throw Error('Dedicated local database required');
const read=name=>readFileSync(new URL('../../src/shared/database/migrations/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=read('0003_activity.sql'),checksum=hash(sql),pool=new pg.Pool({connectionString:text,max:1});
try {
 const client=await pool.connect();
 try {
  await client.query('select pg_advisory_lock(260026)');
  const owned=await client.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname in('user','organizations','memberships','leads','app_migrations') and relowner=(select oid from pg_roles where rolname=current_user)");
  if(owned.rows[0].n!==5)throw Error('Original provisioner and prior schema required');
  const roles=await client.query("select rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or pg_has_role(rolname,current_user,'MEMBER') or exists(select 1 from pg_roles p where pg_has_role($1,p.oid,'MEMBER') and (p.rolsuper or p.rolbypassrls or p.rolcreatedb or p.rolcreaterole)) as unsafe from pg_roles where rolname=$1",[role]);
  if(roles.rows.length!==1||roles.rows[0].unsafe)throw Error('Separate unprivileged runtime required');
  const prior=await client.query("select sha256 from app_migrations where version='0002_leads_pipeline'");
  if(prior.rows[0]?.sha256!==hash(read('0002_leads_pipeline.sql')))throw Error('Matching 0002 required');
  const previous=await client.query("select sha256 from app_migrations where version='0003_activity'");
  if(previous.rowCount){if(previous.rows[0].sha256!==checksum)throw Error('Migration checksum mismatch');console.log('Activity migration already applied with matching checksum');}
  else {
   const existing=await client.query("select to_regclass('public.interactions') i,to_regclass('public.followups') f");
   if(existing.rows[0].i||existing.rows[0].f)throw Error('Unknown activity schema; refusing overwrite');
   if(!/commit;\s*$/i.test(sql))throw Error('Transactional migration required');
   await client.query(sql.replace(/commit;\s*$/i,`grant select,insert,update on interactions,followups to "${role}";insert into app_migrations(version,sha256) values('0003_activity','${checksum}');commit;`));
   console.log('Activity schema, grants and ledger applied atomically');
  }
 } finally {try {await client.query('rollback');await client.query('select pg_advisory_unlock(260026)');}finally {client.release();}}
} finally {await pool.end();}
