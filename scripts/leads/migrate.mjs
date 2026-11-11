import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';

const connectionString=process.env.IDENTITY_MIGRATION_URL;
const role=process.env.IDENTITY_RUNTIME_ROLE;
if(!connectionString||!role||!/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw Error('Set local migration URL and runtime role');
const url=new URL(connectionString);
if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.search||['/','/postgres','/template0','/template1'].includes(url.pathname)) throw Error('Dedicated local database required');
const sql=readFileSync(new URL('../../src/shared/database/migrations/0002_leads_pipeline.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const checksum=createHash('sha256').update(sql).digest('hex');
const pool=new pg.Pool({connectionString,max:1});
try {
 const client=await pool.connect();
 try {
  await client.query("select pg_advisory_lock(260026)");
  const provenance=await client.query(`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('user','organizations','memberships') and c.relowner=(select oid from pg_roles where rolname=current_user)`);
  if(provenance.rows.length!==3) throw Error('Expected the original identity provisioner and schema');
  const attrs=await client.query(`select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,pg_has_role(rolname,current_user,'MEMBER') as inherits_owner from pg_roles where rolname=$1`,[role]);
  const r=attrs.rows[0];if(!r||r.rolsuper||r.rolbypassrls||r.rolcreatedb||r.rolcreaterole||r.inherits_owner) throw Error('Separate unprivileged runtime required');
  const marker=await client.query("select to_regclass('public.app_migrations') as marker");
  if(marker.rows[0].marker) {
   const ledgerOwner=await client.query("select 1 from pg_class where oid='public.app_migrations'::regclass and relowner=(select oid from pg_roles where rolname=current_user)");
   if(ledgerOwner.rowCount!==1) throw Error('Untrusted migration ledger owner');
   const previous=await client.query("select sha256 from app_migrations where version='0002_leads_pipeline'");
   if(previous.rows[0]?.sha256!==checksum) throw Error('Existing migration is missing or its checksum differs');
   console.log('Commercial migration already applied with matching checksum');
  } else {
   const objects=await client.query("select to_regclass('public.leads') as leads,to_regclass('public.pipelines') as pipelines");
   if(objects.rows[0].leads||objects.rows[0].pipelines) throw Error('Unrecognized commercial schema; refusing to overwrite');
   if(!/commit;\s*$/i.test(sql)) throw Error('Expected a transactional migration');
   const grants=`grant select on pipelines,stages,leads,lead_stage_events to "${role}";
    grant update on pipelines to "${role}"; grant insert,update on stages,leads to "${role}";
    grant execute on function lf_lock_membership(uuid),lf_organization_members(uuid) to "${role}";
    insert into app_migrations(version,sha256) values('0002_leads_pipeline','${checksum}');`;
   await client.query(sql.replace(/commit;\s*$/i,grants+'\ncommit;'));
   console.log('Commercial migration applied atomically; existing identity data preserved');
  }
 } finally {
  try {await client.query('rollback');await client.query("select pg_advisory_unlock(260026)");}
  finally {client.release();}
 }
} finally {await pool.end();}
