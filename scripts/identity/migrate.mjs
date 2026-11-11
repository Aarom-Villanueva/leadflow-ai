import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.IDENTITY_MIGRATION_URL;
const role = process.env.IDENTITY_RUNTIME_ROLE;
if (!connectionString || !role || !/^[a-z_][a-z0-9_]{0,62}$/.test(role)) throw new Error('Set IDENTITY_MIGRATION_URL and a valid IDENTITY_RUNTIME_ROLE');
const url = new URL(connectionString);
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || url.search || !['postgres:','postgresql:'].includes(url.protocol)) {
  throw new Error('This development migration runner only accepts an explicit local PostgreSQL destination without query overrides');
}
if (['/postgres','/template0','/template1','/'].includes(url.pathname)) throw new Error('Choose a dedicated application database');
const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const client = await pool.connect();
  try {
    const existing = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
    if (existing.rows[0].n !== 0) throw new Error('Initial migration requires an empty dedicated public schema; nothing is overwritten');
    const runtime = await client.query(`select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,
      pg_has_role(rolname,current_user,'MEMBER') as inherits_owner from pg_roles where rolname=$1`, [role]);
    const attributes = runtime.rows[0];
    if (!attributes || attributes.rolsuper || attributes.rolbypassrls || attributes.rolcreatedb || attributes.rolcreaterole || attributes.inherits_owner) {
      throw new Error('Runtime must be a separate, unprivileged role');
    }
    const sql = readFileSync(fileURLToPath(new URL('../../src/shared/database/migrations/0001_identity.sql', import.meta.url)), 'utf8');
    if (!/commit;\s*$/i.test(sql)) throw new Error('Expected a single initial migration transaction');
    const grants = `grant usage on schema public to "${role}";
      grant select,insert,update,delete on "user","session","account","verification",auth_attempts to "${role}";
      grant select on organizations,memberships to "${role}";
      grant execute on function lf_create_organization(text,text,text,uuid) to "${role}";`;
    // DDL and every runtime grant either commit together or roll back together.
    await client.query(sql.replace(/commit;\s*$/i, grants + '\ncommit;'));
    console.log('Initial identity schema applied. No credentials were logged.');
  } finally { client.release(); }
} finally { await pool.end(); }
