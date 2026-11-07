/**
 * Wrapper de sesión/membresía/transacción/contexto del laboratorio LF-002a/LF-023.
 *
 * Fase 1 (actual): escrito y revisado, no ejecutable — depende de `pg` (pendiente de
 * autorización, docs/specs/LF-023.md §4.1).
 *
 * Principio central (docs/LF-002a-IMPLEMENTATION-PLAN.md §4): el tenant que envía un
 * cliente es una SELECCIÓN que debe autorizarse contra una membresía real, nunca una
 * prueba de pertenencia por sí sola. `authorizeTenantSelection` es el único punto que
 * decide esto, y siempre consulta `probe_memberships`, nunca confía en el valor recibido.
 */
import type { PoolClient } from 'pg';

export type SyntheticSessionStatus = 'valid' | 'expired' | 'revoked' | 'invalid';

export interface SyntheticSession {
  readonly userId: string;
  readonly status: SyntheticSessionStatus;
}

export interface MembershipRecord {
  readonly tenantId: string;
  readonly role: string;
}

export type TenantAuthorizationResult =
  | { readonly authorized: true; readonly membership: MembershipRecord }
  | { readonly authorized: false; readonly reason: string };

/**
 * Autoriza (o rechaza) la selección de tenant de un cliente contra las membresías reales
 * en la base — P11/P12 del plan. Una sesión que no esté `valid` nunca llega a consultar
 * membresías: se rechaza por el estado de la sesión primero, para que ese motivo quede
 * distinguible de "no es miembro".
 */
export async function authorizeTenantSelection(
  client: PoolClient,
  session: SyntheticSession,
  requestedTenantId: string,
): Promise<TenantAuthorizationResult> {
  if (session.status !== 'valid') {
    return { authorized: false, reason: `session_${session.status}` };
  }
  const result = await client.query<{ tenant_id: string; role: string; revoked_at: Date | null }>(
    'select tenant_id, role, revoked_at from probe_memberships where "userId" = $1 and tenant_id = $2',
    [session.userId, requestedTenantId],
  );
  const row = result.rows[0];
  if (!row) return { authorized: false, reason: 'no_membership' };
  if (row.revoked_at !== null) return { authorized: false, reason: 'membership_revoked' };
  return { authorized: true, membership: { tenantId: row.tenant_id, role: row.role } };
}

/**
 * Ejecuta `fn` dentro de una transacción explícita con el contexto de tenant fijado
 * transaction-local (`set_config(..., true)`, equivalente a `SET LOCAL`) en la MISMA
 * conexión que recibe `fn` — nunca `SET` de sesión, nunca persistido entre peticiones. El
 * contexto desaparece por construcción al hacer COMMIT o ROLLBACK, sin un paso explícito
 * de limpieza que pueda olvidarse (P07/P08).
 */
export async function withTenantContext<T>(
  client: PoolClient,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    await client.query('select set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

/**
 * Ejecuta `fn` dentro de una transacción explícita SIN fijar ningún contexto de tenant —
 * usado para confirmar que la ausencia de contexto nunca hereda acceso de una transacción
 * previa en la misma conexión reutilizada (P06/P07).
 */
export async function withoutTenantContext<T>(
  client: PoolClient,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
