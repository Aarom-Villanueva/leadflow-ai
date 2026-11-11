import { Pool, type PoolClient } from "pg";
import { IdentityUnavailable, identityConfig } from "@/modules/identity/config";

let pool: Pool | undefined;
let checked: Promise<void> | undefined;

export async function assertRuntimeRole(connection: Pool | PoolClient) {
  const { rows } = await connection.query<{ unsafe: boolean }>(`
    select r.rolsuper or r.rolbypassrls or r.rolcreatedb or r.rolcreaterole
      or exists(select 1 from pg_class c where c.relname in ('organizations','memberships','pipelines','stages','leads','lead_stage_events')
        and c.relnamespace='public'::regnamespace and pg_has_role(current_user,c.relowner,'MEMBER'))
      or exists(select 1 from pg_roles inherited where pg_has_role(current_user,inherited.oid,'MEMBER')
        and (inherited.rolsuper or inherited.rolbypassrls or inherited.rolcreatedb or inherited.rolcreaterole)) as unsafe
    from pg_roles r where r.rolname=current_user
  `);
  if (rows.length !== 1 || rows[0].unsafe) throw new IdentityUnavailable();
}

export async function identityPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({ connectionString: identityConfig(process.env).databaseUrl, max: 5, connectionTimeoutMillis: 5000 });
    // Idle errors are handled without printing connection strings or query parameters.
    pool.on("error", () => {});
  }
  checked ??= assertRuntimeRole(pool).catch(error => { checked = undefined; throw error; });
  await checked;
  return pool;
}

/** One checked-out connection, transaction-local actor, guaranteed reset on commit/rollback. */
export async function withActor<T>(db: Pool, userId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id',$1,true)", [userId]);
    const value = await action(client);
    const closed = await client.query("commit");
    if (closed.command !== "COMMIT") throw new Error("Transaction was not committed");
    return value;
  } catch (error) {
    try { await client.query("rollback"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
