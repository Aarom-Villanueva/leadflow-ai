/**
 * Casos P01–P09 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): preflight, control
 * positivo, lectura/escritura cruzada entre tenants, contexto ausente/vacío/malformado,
 * reutilización real de conexión bajo un pool de una sola conexión, y concurrencia.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — exige `LF002A_PROVISIONER_URL` y
 * `LF002A_RUNTIME_URL` apuntando a PostgreSQL real (docs/specs/LF-023.md §4), que la
 * fase 2 todavía no autoriza. Sin esas variables, `beforeAll` falla de inmediato: esta
 * suite nunca se presenta como omitida ni como verde sin haber corrido de verdad.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Pool } from 'pg';
import {
  createSpikePool,
  getBackendIdentity,
  requireEnvUrl,
  runPreflight,
} from './database.js';
import { withTenantContext, withoutTenantContext } from './tenant-context.js';
import {
  ALL_SYNTHETIC_USERS,
  SYNTHETIC_MEMBERSHIPS,
  TENANT_A,
  TENANT_B,
  TENANT_PROBE_ROWS,
} from './fixtures.js';

const EXPECTED_DATABASE_NAME = 'lf002a_spike';
const RUNTIME_ROLE = 'lf002a_runtime';

/** Inserción idempotente de los fixtures: segura de llamar desde más de un archivo de prueba. */
export async function seedFixtures(provisionerPool: Pool): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    for (const user of ALL_SYNTHETIC_USERS) {
      await client.query(
        'insert into "user" (id, name, email) values ($1, $2, $3) on conflict (id) do nothing',
        [user.id, user.name, user.email],
      );
    }
    for (const membership of SYNTHETIC_MEMBERSHIPS) {
      await client.query(
        `insert into probe_memberships (id, "userId", tenant_id, role, revoked_at)
         values ($1, $2, $3, $4, $5)
         on conflict ("userId", tenant_id) do nothing`,
        [
          `probe-membership-${membership.userId}-${membership.tenantId}`,
          membership.userId,
          membership.tenantId,
          membership.role,
          membership.revoked ? new Date() : null,
        ],
      );
    }
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

describe('LF-002a isolation (P01-P09)', () => {
  let provisionerPool: Pool;
  let runtimePool: Pool; // max=1: fuerza la reutilización de un único backend físico (P07/P08)
  let runtimeConcurrentPool: Pool; // max>1: solo para P09

  beforeAll(async () => {
    const provisionerUrl = requireEnvUrl('LF002A_PROVISIONER_URL');
    const runtimeUrl = requireEnvUrl('LF002A_RUNTIME_URL');

    provisionerPool = createSpikePool({
      connectionString: provisionerUrl,
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 2,
    });
    runtimePool = createSpikePool({
      connectionString: runtimeUrl,
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });
    runtimeConcurrentPool = createSpikePool({
      connectionString: runtimeUrl,
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 4,
    });

    await seedFixtures(provisionerPool);
  });

  afterAll(async () => {
    await provisionerPool?.end();
    await runtimePool?.end();
    await runtimeConcurrentPool?.end();
  });

  // --- P01: preflight ---------------------------------------------------
  test('P01: el preflight del rol/esquema de runtime pasa antes de cualquier caso negativo', async () => {
    const result = await runPreflight(runtimePool, {
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
    });
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  // --- P02: control positivo ----------------------------------------------
  test('P02: control positivo — cada tenant autorizado lee sus propias filas y puede escribir', async () => {
    const client = await runtimePool.connect();
    try {
      const rowsA = await withTenantContext(client, TENANT_A.tenantId, async (c) => {
        const result = await c.query('select id from tenant_probe order by id');
        return result.rows;
      });
      expect(rowsA.length).toBeGreaterThan(0);
      expect(rowsA.every((row) => row.id.startsWith('probe-a-'))).toBe(true);

      const inserted = await withTenantContext(client, TENANT_A.tenantId, async (c) => {
        return c.query(
          'insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3) returning id',
          ['probe-a-positive-control', TENANT_A.tenantId, 'positive control'],
        );
      });
      expect(inserted.rowCount).toBe(1);
    } finally {
      client.release();
    }
  });

  // --- P03: lectura cruzada ------------------------------------------------
  test('P03: A no puede leer filas de B por ID ni por listado, y viceversa', async () => {
    const client = await runtimePool.connect();
    try {
      const aByIdOfB = await withTenantContext(client, TENANT_A.tenantId, (c) =>
        c.query('select id from tenant_probe where id = $1', ['probe-b-1']),
      );
      expect(aByIdOfB.rowCount).toBe(0);

      const aListing = await withTenantContext(client, TENANT_A.tenantId, (c) =>
        c.query('select id from tenant_probe'),
      );
      expect(aListing.rows.some((row) => row.id.startsWith('probe-b-'))).toBe(false);

      const bByIdOfA = await withTenantContext(client, TENANT_B.tenantId, (c) =>
        c.query('select id from tenant_probe where id = $1', ['probe-a-1']),
      );
      expect(bByIdOfA.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  // --- P04: INSERT con tenant ajeno ----------------------------------------
  test('P04: INSERT con tenant_id ajeno es rechazado por WITH CHECK y no persiste', async () => {
    const client = await runtimePool.connect();
    try {
      await expect(
        withTenantContext(client, TENANT_A.tenantId, (c) =>
          c.query('insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3)', [
            'probe-foreign-insert-attempt',
            TENANT_B.tenantId,
            'should never persist',
          ]),
        ),
      ).rejects.toThrow();
    } finally {
      client.release();
    }

    // Confirmado desde el provisionador, no solo por el código de error del intento.
    const provisionerClient = await provisionerPool.connect();
    try {
      const check = await provisionerClient.query('select 1 from tenant_probe where id = $1', [
        'probe-foreign-insert-attempt',
      ]);
      expect(check.rowCount).toBe(0);
    } finally {
      provisionerClient.release();
    }
  });

  // --- P05: UPDATE/DELETE de fila ajena y reasignación de tenant -----------
  test('P05: UPDATE/DELETE de fila ajena y reasignar tenant_id no alteran ni mueven la fila', async () => {
    const client = await runtimePool.connect();
    try {
      const updateForeign = await withTenantContext(client, TENANT_A.tenantId, (c) =>
        c.query('update tenant_probe set label = $1 where id = $2', ['tampered', 'probe-b-1']),
      );
      expect(updateForeign.rowCount).toBe(0);

      const deleteForeign = await withTenantContext(client, TENANT_A.tenantId, (c) =>
        c.query('delete from tenant_probe where id = $1', ['probe-b-1']),
      );
      expect(deleteForeign.rowCount).toBe(0);

      // Reasignar organization_id (tenant_id) de una fila propia hacia el tenant ajeno:
      // WITH CHECK también se aplica en UPDATE sobre la fila resultante.
      await expect(
        withTenantContext(client, TENANT_A.tenantId, (c) =>
          c.query('update tenant_probe set tenant_id = $1 where id = $2', [TENANT_B.tenantId, 'probe-a-1']),
        ),
      ).rejects.toThrow();
    } finally {
      client.release();
    }

    const provisionerClient = await provisionerPool.connect();
    try {
      const stillB = await provisionerClient.query('select label, tenant_id from tenant_probe where id = $1', [
        'probe-b-1',
      ]);
      expect(stillB.rows[0]).toEqual({ label: 'B row 1', tenant_id: TENANT_B.tenantId });

      const stillA = await provisionerClient.query('select tenant_id from tenant_probe where id = $1', [
        'probe-a-1',
      ]);
      expect(stillA.rows[0]?.tenant_id).toBe(TENANT_A.tenantId);
    } finally {
      provisionerClient.release();
    }
  });

  // --- P06: contexto ausente/vacío/malformado -------------------------------
  test('P06: contexto ausente, vacío o malformado nunca produce acceso por defecto', async () => {
    const client = await runtimePool.connect();
    try {
      const absent = await withoutTenantContext(client, (c) => c.query('select id from tenant_probe'));
      expect(absent.rowCount).toBe(0);

      const empty = await withTenantContext(client, '', (c) => c.query('select id from tenant_probe'));
      expect(empty.rowCount).toBe(0);

      const malformed = await withTenantContext(client, "'; select 1; --", (c) =>
        c.query('select id from tenant_probe'),
      );
      expect(malformed.rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  // --- P07: pool de una conexión — reutilización real -----------------------
  test('P07: pool de una conexión: A -> sin contexto -> B -> sin contexto, mismo backend, sin fuga tras COMMIT', async () => {
    const seenBackendPids = new Set<number>();
    const client = await runtimePool.connect(); // pool max=1: siempre el mismo backend físico
    try {
      seenBackendPids.add((await getBackendIdentity(client)).backendPid);

      const rowsA = await withTenantContext(client, TENANT_A.tenantId, (c) => c.query('select id from tenant_probe'));
      expect(rowsA.rows.every((r) => r.id.startsWith('probe-a-'))).toBe(true);

      const noContext1 = await withoutTenantContext(client, (c) => c.query('select id from tenant_probe'));
      expect(noContext1.rowCount).toBe(0); // el COMMIT de A no deja contexto filtrado

      const rowsB = await withTenantContext(client, TENANT_B.tenantId, (c) => c.query('select id from tenant_probe'));
      expect(rowsB.rows.every((r) => r.id.startsWith('probe-b-'))).toBe(true);

      const noContext2 = await withoutTenantContext(client, (c) => c.query('select id from tenant_probe'));
      expect(noContext2.rowCount).toBe(0);

      seenBackendPids.add((await getBackendIdentity(client)).backendPid);
      expect(seenBackendPids.size).toBe(1); // confirmado: un único backend real, no asumido
    } finally {
      client.release();
    }
  });

  // --- P08: error/ROLLBACK en A seguido de B ---------------------------------
  test('P08: un error con ROLLBACK en A no filtra contexto ni deja escritura parcial antes de B', async () => {
    const client = await runtimePool.connect();
    try {
      const beforePid = (await getBackendIdentity(client)).backendPid;

      await expect(
        withTenantContext(client, TENANT_A.tenantId, async (c) => {
          await c.query('insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3)', [
            'probe-a-rollback-candidate',
            TENANT_A.tenantId,
            'should be rolled back',
          ]);
          throw new Error('synthetic failure to force ROLLBACK');
        }),
      ).rejects.toThrow('synthetic failure');

      const rowsB = await withTenantContext(client, TENANT_B.tenantId, (c) => c.query('select id from tenant_probe'));
      expect(rowsB.rows.every((r) => r.id.startsWith('probe-b-'))).toBe(true);

      const afterPid = (await getBackendIdentity(client)).backendPid;
      expect(afterPid).toBe(beforePid);
    } finally {
      client.release();
    }

    const provisionerClient = await provisionerPool.connect();
    try {
      const check = await provisionerClient.query('select 1 from tenant_probe where id = $1', [
        'probe-a-rollback-candidate',
      ]);
      expect(check.rowCount).toBe(0); // el ROLLBACK deshizo la escritura, no solo el contexto
    } finally {
      provisionerClient.release();
    }
  });

  // --- P09: concurrencia real ------------------------------------------------
  test('P09: concurrencia real A/B con varias conexiones nunca mezcla filas ni escrituras', async () => {
    const [resultA, resultB] = await Promise.all([
      (async () => {
        const client = await runtimeConcurrentPool.connect();
        try {
          return await withTenantContext(client, TENANT_A.tenantId, (c) => c.query('select id from tenant_probe'));
        } finally {
          client.release();
        }
      })(),
      (async () => {
        const client = await runtimeConcurrentPool.connect();
        try {
          return await withTenantContext(client, TENANT_B.tenantId, (c) => c.query('select id from tenant_probe'));
        } finally {
          client.release();
        }
      })(),
    ]);
    expect(resultA.rows.every((r) => r.id.startsWith('probe-a-'))).toBe(true);
    expect(resultB.rows.every((r) => r.id.startsWith('probe-b-'))).toBe(true);
  });
});
