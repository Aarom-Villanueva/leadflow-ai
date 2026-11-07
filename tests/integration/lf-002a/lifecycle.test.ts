/**
 * Casos P15–P16 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): control negativo del
 * propio preflight, y ciclo real de borrado/recreación de la base descartable del spike.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — misma exigencia que
 * isolation.test.ts/auth-boundary.test.ts (variables de entorno reales, sin omitir en
 * silencio). Además de `LF002A_PROVISIONER_URL`/`LF002A_RUNTIME_URL`, P16 exige
 * `LF002A_MAINTENANCE_URL` (una base de mantenimiento, p. ej. `postgres` — nunca la propia
 * base del spike, porque Postgres no permite crear/soltar la base a la que la propia
 * conexión está conectada).
 *
 * ADVERTENCIA DE EJECUCIÓN (fase 2): a diferencia de isolation.test.ts/auth-boundary.test.ts,
 * que leen y escriben filas dentro de la base compartida `lf002a_spike`, P16 de este archivo
 * la BORRA y la RECREA de verdad. Por eso este archivo debe ejecutarse solo, nunca a la vez
 * que los otros dos (p. ej. `npx vitest run --config vitest.lf-002a.config.ts
 * tests/integration/lf-002a/lifecycle.test.ts`, por separado, después de que los otros ya
 * terminaron) — nunca como parte de la misma invocación paralela de toda la carpeta.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Pool } from 'pg';
import {
  applySchemaSql,
  createSpikeDatabaseIfMatching,
  createSpikePool,
  dropSpikeDatabaseIfMatching,
  requireEnvUrl,
  runPreflight,
} from './database.js';
import { TENANT_PROBE_ROWS } from './fixtures.js';
import { seedFixtures } from './isolation.test.js';

const EXPECTED_DATABASE_NAME = 'lf002a_spike';
const RUNTIME_ROLE = 'lf002a_runtime';

describe('LF-002a lifecycle (P15-P16)', () => {
  let maintenancePool: Pool;

  beforeAll(() => {
    const maintenanceUrl = requireEnvUrl('LF002A_MAINTENANCE_URL');
    maintenancePool = createSpikePool({
      connectionString: maintenanceUrl,
      // La base de mantenimiento no es la del spike; este nombre solo se usa para el
      // guard de assertLocalOnly, no para ninguna comprobación de `current_database()`.
      expectedDatabaseName: 'postgres',
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });
  });

  afterAll(async () => {
    await maintenancePool?.end();
  });

  // --- P15: control negativo del propio preflight -----------------------------
  test('P15: un fixture deliberadamente inseguro es detectado por el preflight, nunca aplicado a otra base', async () => {
    const provisionerPool = createSpikePool({
      connectionString: requireEnvUrl('LF002A_PROVISIONER_URL'),
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });
    const runtimePool = createSpikePool({
      connectionString: requireEnvUrl('LF002A_RUNTIME_URL'),
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });

    try {
      // Nunca deshabilitar RLS sin antes confirmar, desde la propia base, que es
      // exactamente la base reservada del spike — nunca una base ajena.
      const guardClient = await provisionerPool.connect();
      const currentDb = await guardClient.query<{ db: string }>('select current_database() as db');
      guardClient.release();
      expect(currentDb.rows[0]?.db).toBe(EXPECTED_DATABASE_NAME);

      const before = await runPreflight(runtimePool, {
        expectedDatabaseName: EXPECTED_DATABASE_NAME,
        runtimeRole: RUNTIME_ROLE,
      });
      expect(before).toEqual({ ok: true, reasons: [] });

      const disableClient = await provisionerPool.connect();
      try {
        await disableClient.query('alter table tenant_probe disable row level security');
        const whileDisabled = await runPreflight(runtimePool, {
          expectedDatabaseName: EXPECTED_DATABASE_NAME,
          runtimeRole: RUNTIME_ROLE,
        });
        expect(whileDisabled.ok).toBe(false);
        expect(whileDisabled.reasons).toContain('rls_not_enabled');
      } finally {
        // Restaurar siempre, incluso si la aserción de arriba falla — nunca dejar la
        // tabla protegida sin RLS tras este control negativo.
        await disableClient.query('alter table tenant_probe enable row level security');
        await disableClient.query('alter table tenant_probe force row level security');
        disableClient.release();
      }

      const dropPolicyClient = await provisionerPool.connect();
      try {
        await dropPolicyClient.query('drop policy if exists tenant_probe_isolation on tenant_probe');
        const withoutPolicy = await runPreflight(runtimePool, {
          expectedDatabaseName: EXPECTED_DATABASE_NAME,
          runtimeRole: RUNTIME_ROLE,
        });
        expect(withoutPolicy.ok).toBe(false);
        expect(withoutPolicy.reasons).toContain('no_rls_policy');
      } finally {
        await dropPolicyClient.query(`
          create policy tenant_probe_isolation on tenant_probe
            using (tenant_id = current_setting('app.tenant_id', true))
            with check (tenant_id = current_setting('app.tenant_id', true))
        `);
        dropPolicyClient.release();
      }

      const after = await runPreflight(runtimePool, {
        expectedDatabaseName: EXPECTED_DATABASE_NAME,
        runtimeRole: RUNTIME_ROLE,
      });
      expect(after).toEqual({ ok: true, reasons: [] });
    } finally {
      await provisionerPool.end();
      await runtimePool.end();
    }
  });

  // --- P16: ciclo real de borrado/recreación ------------------------------------
  test('P16: solo la base identificada se borra; un ciclo limpio de recreación produce resultados trazables', async () => {
    // Guard primero: un nombre que no coincide, o con forma insegura, nunca llega a tocar
    // la base real — se rechaza antes de abrir ninguna conexión administrativa.
    await expect(
      dropSpikeDatabaseIfMatching(maintenancePool, EXPECTED_DATABASE_NAME, 'some_other_database'),
    ).rejects.toThrow(/does not match/);
    await expect(
      dropSpikeDatabaseIfMatching(maintenancePool, EXPECTED_DATABASE_NAME, 'lf002a_spike; drop database postgres'),
    ).rejects.toThrow();
    await expect(
      createSpikeDatabaseIfMatching(maintenancePool, EXPECTED_DATABASE_NAME, 'some_other_database'),
    ).rejects.toThrow(/does not match/);

    // Ciclo real: borrar la única base reservada, recrearla, reaplicar schema.sql (fuente
    // única de verdad del DDL, nunca una copia manual), reseedear, y confirmar que el
    // resultado es idéntico y trazable — no solo "no lanzó una excepción".
    await dropSpikeDatabaseIfMatching(maintenancePool, EXPECTED_DATABASE_NAME, EXPECTED_DATABASE_NAME);

    const goneCheck = await maintenancePool.query<{ n: number }>(
      'select count(*)::int as n from pg_database where datname = $1',
      [EXPECTED_DATABASE_NAME],
    );
    expect(goneCheck.rows[0]?.n).toBe(0);

    await createSpikeDatabaseIfMatching(maintenancePool, EXPECTED_DATABASE_NAME, EXPECTED_DATABASE_NAME);

    const provisionerPool = createSpikePool({
      connectionString: requireEnvUrl('LF002A_PROVISIONER_URL'),
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });
    const runtimePool = createSpikePool({
      connectionString: requireEnvUrl('LF002A_RUNTIME_URL'),
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 1,
    });
    try {
      await applySchemaSql(provisionerPool);
      await seedFixtures(provisionerPool);

      const preflight = await runPreflight(runtimePool, {
        expectedDatabaseName: EXPECTED_DATABASE_NAME,
        runtimeRole: RUNTIME_ROLE,
      });
      expect(preflight).toEqual({ ok: true, reasons: [] });

      const probeCount = await provisionerPool.query<{ n: number }>('select count(*)::int as n from tenant_probe');
      expect(probeCount.rows[0]?.n).toBe(TENANT_PROBE_ROWS.length);
    } finally {
      await provisionerPool.end();
      await runtimePool.end();
    }
  });
});
