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
 */
import type { Pool } from 'pg';
import { TENANT_PROBE_ROWS } from './fixtures.js';
import { assertLabTargetAuthorized, verifyLabTarget } from './lab-target.js';

export async function seedFixtures(provisionerPool: Pool): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    assertLabTargetAuthorized(await verifyLabTarget(client));
    for (const row of TENANT_PROBE_ROWS) {
      await client.query(
        'insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3) on conflict (id) do nothing',
        [row.id, row.tenantId, row.label],
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
 * presentes. Consulta por el rol PROVISIONADOR (que no está sujeto a RLS por ser
 * propietario) para confirmar, independientemente de cualquier política, que ambos
 * tenants tienen de verdad las filas que fixtures.ts declara — antes de que cualquier
 * aserción RLS-dependiente pueda apoyarse en esos datos.
 */
export async function assertSeedSanity(provisionerPool: Pool): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    const expectedByTenant = new Map<string, number>();
    for (const row of TENANT_PROBE_ROWS) {
      expectedByTenant.set(row.tenantId, (expectedByTenant.get(row.tenantId) ?? 0) + 1);
    }
    const result = await client.query<{ tenant_id: string; n: string }>(
      'select tenant_id, count(*)::text as n from tenant_probe group by tenant_id',
    );
    const actualByTenant = new Map<string, number>(
      result.rows.map((row): [string, number] => [row.tenant_id, Number(row.n)]),
    );
    for (const [tenantId, expectedCount] of expectedByTenant) {
      const actualCount = actualByTenant.get(tenantId) ?? 0;
      if (actualCount < expectedCount) {
        throw new Error(
          `Seed sanity check failed: tenant "${tenantId}" has ${actualCount} tenant_probe rows via the ` +
            `provisioner (RLS-exempt), expected at least ${expectedCount}. Refusing to run RLS-dependent ` +
            'assertions against data that may not actually exist (a vacuous pass would prove nothing).',
        );
      }
    }
  } finally {
    client.release();
  }
}
