/**
 * Casos P02–P09 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): control positivo,
 * lectura/escritura cruzada entre tenants, contexto ausente/vacío/malformado, reutilización
 * real de conexión bajo un pool de una sola conexión, y concurrencia. P01 (preflight) ya no
 * es un caso de prueba independiente aquí — ver más abajo.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — exige `LF002A_PROVISIONER_URL` y
 * `LF002A_RUNTIME_URL` apuntando a PostgreSQL real (docs/specs/LF-023.md §4), que la
 * fase 2 todavía no autoriza. Sin esas variables, `beforeAll` falla de inmediato: esta
 * suite nunca se presenta como omitida ni como verde sin haber corrido de verdad.
 *
 * Revisión independiente del PR #19:
 * - Hallazgo 3: el preflight (P01) ya no es un `test()` cuyo fallo permite que los demás
 *   sigan — es una precondición obligatoria en `beforeAll` que LANZA si no pasa, lo que
 *   hace que vitest marque fallidas TODAS las pruebas de este archivo, nunca solo una.
 * - Hallazgo 6: `seedFixtures` se extrajo a seed.ts (ya no se importa un `.test.ts` desde
 *   otro); se añade `assertSeedSanity` también como precondición obligatoria, para que
 *   ningún caso "cero filas ajenas" pueda pasar vacuamente por una tabla vacía; los
 *   rechazos de P04/P05 ahora exigen el mensaje específico de violación de RLS de
 *   Postgres, no cualquier error (una falta de permiso ordinario, no relacionada con RLS,
 *   ya no haría pasar la prueba por error).
 *
 * Revisión independiente, SEGUNDA ronda (candidato `212e201`), hallazgo 5: tener
 * `vitest.lf-002a.config.ts`/`vitest.lf-002a.lifecycle.config.ts` con `include` mutuamente
 * excluyentes solo impide que UNA invocación de Vitest mezcle los archivos; no impide dos
 * PROCESOS distintos corriendo a la vez. `acquireSuiteLock` (suite-lock.ts, probado de
 * verdad en tests/unit/lf-002a/suite-lock.test.ts) añade exclusión real basada en
 * `fs.open(..., 'wx')`, adquirida aquí como lo PRIMERO que hace `beforeAll` y liberada en
 * `afterAll` — el mismo candado que lifecycle.test.ts, así que P16 nunca puede borrar la
 * base mientras esta suite lo tiene tomado, y viceversa.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Pool } from 'pg';
import { createSpikePool, getBackendIdentity, requireEnvUrl, runPreflight } from './database.js';
import { withTenantContext, withoutTenantContext } from './tenant-context.js';
import { assertSeedSanity, seedFixtures } from './seed.js';
import { TENANT_A, TENANT_B } from './fixtures.js';
import { DEFAULT_LOCK_FILE_PATH, acquireSuiteLock, type SuiteLockHandle } from './suite-lock.js';

// Mensaje exacto y documentado del motor de Postgres para un rechazo de RLS (USING o
// WITH CHECK) — nunca un `.rejects.toThrow()` genérico, que pasaría igual ante un error
// de permiso ordinario (p. ej. una concesión GRANT faltante) no relacionado con RLS.
const RLS_REJECTION_PATTERN = /row-level security policy/i;

describe('LF-002a isolation (P02-P09; P01 es precondición obligatoria de beforeAll)', () => {
  let provisionerPool: Pool;
  let runtimePool: Pool; // max=1: fuerza la reutilización de un único backend físico (P07/P08)
  let runtimeConcurrentPool: Pool; // max>1: solo para P09
  let lockHandle: SuiteLockHandle | undefined;

  beforeAll(async () => {
    // Lo primero de todo: exclusión real con lifecycle.test.ts antes de abrir ningún pool.
    lockHandle = await acquireSuiteLock({ lockFilePath: DEFAULT_LOCK_FILE_PATH });

    const provisionerUrl = requireEnvUrl('LF002A_PROVISIONER_URL');
    const runtimeUrl = requireEnvUrl('LF002A_RUNTIME_URL');

    provisionerPool = createSpikePool({ connectionString: provisionerUrl, maxConnections: 2 });
    runtimePool = createSpikePool({ connectionString: runtimeUrl, maxConnections: 1 });
    runtimeConcurrentPool = createSpikePool({ connectionString: runtimeUrl, maxConnections: 4 });

    await seedFixtures(provisionerPool);
    await assertSeedSanity(provisionerPool);

    // P01, como precondición obligatoria: si falla, lanza aquí y detiene TODA la suite —
    // nunca un test() independiente cuyo fallo deja correr los casos negativos sobre un
    // destino o un rol que no se confirmaron seguros primero.
    const preflight = await runPreflight(runtimePool);
    if (!preflight.ok) {
      throw new Error(`P01 preflight failed, refusing to run any lab case: ${preflight.reasons.join(', ')}`);
    }
  });

  afterAll(async () => {
    await provisionerPool?.end();
    await runtimePool?.end();
    await runtimeConcurrentPool?.end();
    lockHandle?.release();
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
  test('P04: INSERT con tenant_id ajeno es rechazado por WITH CHECK (mensaje de RLS exacto) y no persiste', async () => {
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
      ).rejects.toThrow(RLS_REJECTION_PATTERN);
    } finally {
      client.release();
    }

    // Confirmado desde el provisionador, no solo por el código de error del intento.
    //
    // Fase 2 (hallazgo real, verificado al ejecutarlo): `tenant_probe` activa `FORCE ROW
    // LEVEL SECURITY` (defensa en profundidad — ver seed.ts), así que incluso el
    // provisionador, SIN contexto de tenant fijado, ve siempre cero filas, exista o no la
    // fila realmente. Una lectura sin contexto aquí pasaría igual de vacía tanto si el
    // INSERT fue rechazado de verdad como si no lo hubiera sido — no demuestra nada. Para
    // que la comprobación sea real, se consulta DENTRO del contexto del tenant que el
    // intento llevaba como `tenant_id` (`TENANT_B`): es el único contexto bajo el que la
    // fila habría sido visible si WITH CHECK no la hubiera rechazado.
    const provisionerClient = await provisionerPool.connect();
    try {
      const check = await withTenantContext(provisionerClient, TENANT_B.tenantId, (c) =>
        c.query('select 1 from tenant_probe where id = $1', ['probe-foreign-insert-attempt']),
      );
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
      ).rejects.toThrow(RLS_REJECTION_PATTERN);
    } finally {
      client.release();
    }

    // Fase 2 (hallazgo real, verificado al ejecutarlo): FORCE RLS también se aplica aquí —
    // una lectura del provisionador SIN contexto siempre ve cero filas, exista o no la
    // fila, así que no puede usarse para confirmar que sigue intacta. Se consulta DENTRO
    // del contexto real de CADA fila (`probe-b-1` es de `TENANT_B`; `probe-a-1` es de
    // `TENANT_A`), que es justamente el contexto bajo el que esa fila es visible si (y
    // solo si) de verdad sigue existiendo sin alterar.
    const provisionerClient = await provisionerPool.connect();
    try {
      const stillB = await withTenantContext(provisionerClient, TENANT_B.tenantId, (c) =>
        c.query('select label, tenant_id from tenant_probe where id = $1', ['probe-b-1']),
      );
      expect(stillB.rows[0]).toEqual({ label: 'B row 1', tenant_id: TENANT_B.tenantId });

      const stillA = await withTenantContext(provisionerClient, TENANT_A.tenantId, (c) =>
        c.query('select tenant_id from tenant_probe where id = $1', ['probe-a-1']),
      );
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

    // Fase 2 (mismo hallazgo real que P04/P05): se consulta dentro del contexto de
    // `TENANT_A` (el tenant_id con el que se intentó insertar la fila) — el único contexto
    // bajo el que habría sido visible si el ROLLBACK no hubiera deshecho la escritura de
    // verdad. Una lectura sin contexto del provisionador pasaría igual de vacía por FORCE
    // RLS sin importar si el ROLLBACK funcionó.
    const provisionerClient = await provisionerPool.connect();
    try {
      const check = await withTenantContext(provisionerClient, TENANT_A.tenantId, (c) =>
        c.query('select 1 from tenant_probe where id = $1', ['probe-a-rollback-candidate']),
      );
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
