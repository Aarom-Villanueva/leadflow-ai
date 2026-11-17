import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
const role=process.env.IDENTITY_RUNTIME_ROLE,text=process.env.IDENTITY_MIGRATION_URL;
if(!text||!role||!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Explicit local provisioner and runtime required');
let url;try{url=new URL(text);}catch{throw Error('Invalid local migration target');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.search||['/','/postgres','/template0','/template1'].includes(url.pathname))throw Error('Dedicated local database required');
// Bounded wait for every lock (advisory lock and DDL): an old application transaction must not stall the database indefinitely.
const rawTimeout=process.env.ORGANIZATIONS_MIGRATION_LOCK_TIMEOUT_MS;
if(rawTimeout!==undefined&&!(/^\d{3,5}$/.test(rawTimeout)&&Number(rawTimeout)>=100&&Number(rawTimeout)<=30000))throw Error('ORGANIZATIONS_MIGRATION_LOCK_TIMEOUT_MS must be between 100 and 30000');
const lockTimeout=rawTimeout===undefined?5000:Number(rawTimeout);
const read=name=>readFileSync(new URL('../../src/shared/database/migrations/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const hash=value=>createHash('sha256').update(value).digest('hex');
const sql=read('0005_organization_admin.sql'),checksum=hash(sql),pool=new pg.Pool({connectionString:text,max:1});
// The runtime must change these tables only through the trusted functions. Effective privileges include inherited roles, PUBLIC and column grants.
const guarded=['organizations','memberships','organization_audit'],writes=['INSERT','UPDATE','DELETE','TRUNCATE'];
async function assertNoDirectWrites(c){
 const found=[];
 for(const table of guarded)for(const privilege of writes){
  const effective=await c.query("select has_table_privilege($1,$2::regclass,$3) as t,($3 in('INSERT','UPDATE') and has_any_column_privilege($1,$2::regclass,$3)) as c",[role,'public.'+table,privilege]);
  if(!effective.rows[0].t&&!effective.rows[0].c)continue;
  const via=await c.query(`select distinct case when a.grantee=0 then 'PUBLIC' when a.grantee=r.oid then 'the runtime role itself' else 'inherited from role '||g.rolname end as source
   from pg_class k cross join pg_roles r cross join lateral aclexplode(coalesce(k.relacl,acldefault('r',k.relowner))) a left join pg_roles g on g.oid=a.grantee
   where k.oid=$2::regclass and r.rolname=$1 and a.privilege_type=$3 and(a.grantee=0 or a.grantee=r.oid or pg_has_role(r.oid,a.grantee,'USAGE')) and a.grantee<>k.relowner`,[role,'public.'+table,privilege]);
  const sources=via.rows.map(row=>row.source);
  found.push(table+' '+privilege+' ('+(sources.length?sources.join(', '):'column-level grant')+')');
 }
 if(found.length)throw Error('Runtime role "'+role+'" has direct write privileges that the organization administration design forbids: '+found.join('; ')+'. Nothing was changed or revoked. Review what depends on them, revoke them explicitly as the database owner, and run this migration again.');
}
try{
 const c=await pool.connect();
 try{
  await c.query('set lock_timeout='+lockTimeout);
  await c.query('select pg_advisory_lock(260026)');
  const owned=await c.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relname in('user','organizations','memberships','organization_audit','app_migrations','dashboard_snapshots') and relowner=(select oid from pg_roles where rolname=current_user)");
  if(owned.rows[0].n!==6)throw Error('Original provisioner and prior schema required');
  const roles=await c.query("select rolsuper or rolbypassrls or rolcreatedb or rolcreaterole or pg_has_role(rolname,current_user,'MEMBER') or exists(select 1 from pg_roles p where pg_has_role($1,p.oid,'MEMBER') and(p.rolsuper or p.rolbypassrls or p.rolcreatedb or p.rolcreaterole)) as unsafe from pg_roles where rolname=$1",[role]);
  if(roles.rows.length!==1||roles.rows[0].unsafe)throw Error('Separate unprivileged runtime required');
  await assertNoDirectWrites(c);
  const prior=await c.query("select sha256 from app_migrations where version='0004_analytics'");
  if(prior.rows[0]?.sha256!==hash(read('0004_analytics.sql')))throw Error('Matching 0004 required');
  const old=await c.query("select sha256 from app_migrations where version='0005_organization_admin'");
  if(old.rowCount){if(old.rows[0].sha256!==checksum)throw Error('Migration checksum mismatch');console.log('Organization administration migration already applied with matching checksum');}
  else{
   const existing=await c.query("select to_regclass('public.organization_admin_requests') t,exists(select 1 from information_schema.columns where table_schema='public' and table_name='memberships' and column_name='version') c");
   if(existing.rows[0].t||existing.rows[0].c)throw Error('Unknown administration schema; refusing overwrite');
   if(!/commit;\s*$/i.test(sql))throw Error('Transactional migration required');
   // Inside the same transaction: default privileges must not expose the private ledger to the runtime; otherwise everything rolls back.
   const ledgerGuard=`do $$ begin if has_table_privilege('${role}','public.organization_admin_requests','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege('${role}','public.organization_admin_requests','SELECT,INSERT,UPDATE') then raise exception 'Runtime role has privileges on the private administration ledger (check default privileges); nothing was applied' using errcode='42501'; end if; end $$;`;
   await c.query(sql.replace(/commit;\s*$/i,()=>`${ledgerGuard}grant execute on function lf_admin_info(uuid),lf_admin_members(uuid,uuid,integer),lf_admin_audit(uuid,timestamptz,uuid,integer),lf_admin_mutate(uuid,uuid,text,jsonb) to "${role}";insert into app_migrations(version,sha256) values('0005_organization_admin','${checksum}');commit;`));
   console.log('Organization administration schema, grants and ledger applied atomically');
  }
 }catch(error){
  if(error&&error.code==='55P03')throw Error('Lock wait exceeded '+lockTimeout+' ms and nothing was changed. Drain the previous application (stop it and wait for its transactions to finish), then run this migration again.');
  throw error;
 }finally{try{await c.query('rollback');await c.query('select pg_advisory_unlock(260026)');}finally{c.release();}}
}finally{await pool.end();}
