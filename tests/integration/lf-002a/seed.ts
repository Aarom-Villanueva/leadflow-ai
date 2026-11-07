/**
 * Inserción idempotente de los fixtures sintéticos del laboratorio LF-002a/LF-023.
 *
 * Extraído de isolation.test.ts a un módulo helper propio — revisión independiente del
 * PR #19, hallazgo 6: "Ningún archivo de pruebas debe importar otro archivo .test.ts".
 * Este archivo no es un `.test.ts`: no declara `describe`/`test`/hooks, así que ningún
 * framework de pruebas lo recoge por accidente, y tanto isolation.test.ts como
 * auth-boundary.test.ts y lifecycle.test.ts pueden importarlo sin importarse entre sí.
 *
 * Solo siembra `tenant_probe` (datos puramente RLS, sin Better Auth). Las pruebas de
 * sesión/membresía (P10-P14) dan de alta sus propios usuarios reales vía
 * `auth.api.signUpEmail` e insertan sus propias filas de `probe_memberships` para el `id`
 * real devuelto — ver fixtures.ts, hallazgo 4.
 *
 * Revisión independiente del PR #19, hallazgo 1 (segunda ronda): "verifica procedencia
 * antes de seed y cualquier escritura" — `seedFixtures` verificaba el destino solo de
 * forma indirecta (a través de lo que `isolation.test.ts` ya hubiera comprobado antes de
 * llamarla). Ahora verifica por sí misma, siempre, antes de insertar nada.
 *
 * Fase 2 (ejecución real contra PostgreSQL 16, no simulada): la primera ejecución real de
 * `seedFixtures` falló con "new row violates row-level security policy for table
 * tenant_probe" — verificado al ejecutarlo, no supuesto. `schema.sql` activa `FORCE ROW
 * LEVEL SECURITY` deliberadamente (defensa en profundidad: ni siquiera el propietario de
 * la tabla la ignora), así que el rol PROVISIONADOR también queda sujeto a la política —
 * sin contexto de tenant fijado, `tenant_id = current_setting('app.tenant_id', true)`
 * nunca es verdadero para nadie, ni siquiera para quien siembra los datos. La corrección:
 * cada fila se inserta DENTRO del contexto de SU PROPIO tenant (`withTenantContext`), lo
 * que además prueba, fila por fila, que `WITH CHECK` permite una escritura con el contexto
 * correcto — nunca se concede `BYPASSRLS` al provisionador como atajo.
 */
import type { Pool } from 'pg';
import { TENANT_PROBE_ROWS } from './fixtures.js';
import { assertLabTargetAuthorized, verifyLabTarget } from './lab-target.js';
import { withTenantContext } from './tenant-context.js';

export async function seedFixtures(provisionerPool: Pool): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    assertLabTargetAuthorized(await verifyLabTarget(client));
    for (const row of TENANT_PROBE_ROWS) {
      await withTenantContext(client, row.tenantId, (c) =>
        c.query(
          'insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3) on conflict (id) do nothing',
          [row.id, row.tenantId, row.label],
        ),
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Revisión independiente del PR #19, hallazgo 6: "los casos RLS positivos y negativos no
 * puedan pasar por tablas vacías". Sin este chequeo, un caso que exige "cero filas
 * ajenas" pasaría igual de vacuamente si `tenant_probe` estuviera completamente vacía (por
 * un fallo de seed silencioso) como si RLS estuviera filtrando de verdad filas realmente
 * presentes.
 *
 * Fase 2 (corregido tras ejecutarlo de verdad): el diseño original asumía que el rol
 * PROVISIONADOR podía leer "independientemente de cualquier política" por ser propietario
 * de la tabla — falso bajo `FORCE ROW LEVEL SECURITY` (ver `seedFixtures`): un SELECT del
 * provisionador SIN contexto también devuelve cero filas, siempre, sin importar cuántas
 * existan. La comprobación real posible es distinta pero sigue siendo útil: consultar el
 * conteo DENTRO del contexto de CADA tenant (`withTenantContext`) — si la tabla estuviera
 * vacía, NINGÚN contexto vería nada, y esto fallaría igual; si algún tenant ve menos filas
 * de las esperadas por SU PROPIO contexto, también falla. Lo único que esto ya no puede
 * descartar por sí solo es que RLS esté rechazando de más (eso es precisamente lo que P03
 * verifica por separado, con ambos tenants a la vez).
 */
export async function assertSeedSanity(provisionerPool: Pool): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    const expectedByTenant = new Map<string, number>();
    for (const row of TENANT_PROBE_ROWS) {
      expectedByTenant.set(row.tenantId, (expectedByTenant.get(row.tenantId) ?? 0) + 1);
    }
    for (const [tenantId, expectedCount] of expectedByTenant) {
      const result = await withTenantContext(client, tenantId, (c) =>
        c.query<{ n: string }>('select count(*)::text as n from tenant_probe where tenant_id = $1', [tenantId]),
      );
      const actualCount = Number(result.rows[0]?.n ?? 0);
      if (actualCount < expectedCount) {
        throw new Error(
          `Seed sanity check failed: tenant "${tenantId}" sees ${actualCount} tenant_probe rows through its ` +
            `own authorized context, expected at least ${expectedCount}. Refusing to run RLS-dependent ` +
            'assertions against data that may not actually exist (a vacuous pass would prove nothing).',
        );
      }
    }
  } finally {
    client.release();
  }
}
