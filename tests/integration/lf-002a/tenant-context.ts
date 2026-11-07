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
 *
 * Revisión independiente del PR #19, hallazgo 4: el diseño anterior aceptaba un
 * `SyntheticSession { userId, status }` construido a mano por la propia prueba —
 * `status: 'expired'`/`'revoked'` eran etiquetas declaradas, nunca el resultado de una
 * verificación real de Better Auth. `SessionVerificationOutcome` sustituye eso: su única
 * forma de producirse (fuera de pruebas unitarias puras del propio tipo) es
 * `deriveSessionVerificationOutcome`, a partir de la respuesta REAL de
 * `auth.api.getSession(...)` — ver tests/integration/lf-002a/auth-boundary.test.ts.
 */
import type { PoolClient } from 'pg';

export type SessionVerificationOutcome =
  | { readonly kind: 'valid'; readonly userId: string }
  | { readonly kind: 'invalid' | 'expired' | 'revoked' };

export interface MembershipRecord {
  readonly tenantId: string;
  readonly role: string;
}

export type TenantAuthorizationResult =
  | { readonly authorized: true; readonly membership: MembershipRecord }
  | { readonly authorized: false; readonly reason: string };

/**
 * Convierte la respuesta real de `auth.api.getSession(...)` en un `SessionVerificationOutcome`.
 *
 * Advertencia explícita (no verificada todavía, a diferencia del esquema de tablas —
 * docs/specs/LF-023.md §3): Better Auth normalmente no distingue, en su respuesta pública,
 * "sesión expirada" de "sesión revocada" de "nunca existió" — las tres se reportan como
 * ausencia de sesión. `engineeredAs` es lo que la PRUEBA hizo deliberadamente antes de
 * preguntar (qué manipulación aplicó a esa sesión concreta), no una distinción que Better
 * Auth garantice reportar por sí mismo; la prueba lo sabe por construcción propia del
 * escenario, no por el contenido de la respuesta. Si `getSessionResult` sí trae una sesión
 * válida con usuario, eso siempre gana sobre `engineeredAs` (la verificación real nunca se
 * ignora).
 */
export function deriveSessionVerificationOutcome(
  getSessionResult: { readonly session?: { readonly userId?: string } | null; readonly user?: { readonly id?: string } | null } | null | undefined,
  engineeredAs: 'invalid' | 'expired' | 'revoked',
): SessionVerificationOutcome {
  const userId = getSessionResult?.session?.userId ?? getSessionResult?.user?.id;
  if (getSessionResult && userId) {
    return { kind: 'valid', userId };
  }
  return { kind: engineeredAs };
}

/**
 * Autoriza (o rechaza) la selección de tenant de un cliente contra las membresías reales
 * en la base — P11/P12 del plan. Un `outcome` que no sea `'valid'` nunca llega a consultar
 * membresías ni a fijar contexto: se rechaza por el estado de la sesión primero, para que
 * ese motivo quede distinguible de "no es miembro", y para que una sesión no-válida jamás
 * ejecute ninguna consulta contra `probe_memberships`/`tenant_probe` (verificable por
 * instrumentación — ver auth.ts — comprobando que no se registró ninguna traza entre el
 * momento en que se llama a esta función y su retorno).
 */
export async function authorizeTenantSelection(
  client: PoolClient,
  outcome: SessionVerificationOutcome,
  requestedTenantId: string,
): Promise<TenantAuthorizationResult> {
  if (outcome.kind !== 'valid') {
    return { authorized: false, reason: `session_${outcome.kind}` };
  }
  const result = await client.query<{ tenant_id: string; role: string; revoked_at: Date | null }>(
    'select tenant_id, role, revoked_at from probe_memberships where "userId" = $1 and tenant_id = $2',
    [outcome.userId, requestedTenantId],
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
