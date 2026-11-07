/**
 * Casos P15–P16 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): control negativo del
 * propio preflight, y ciclo real de borrado/recreación de la base descartable del spike.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — misma exigencia que
 * isolation.test.ts/auth-boundary.test.ts (variables de entorno reales, sin omitir en
 * silencio). Además de `LF002A_PROVISIONER_URL`/`LF002A_RUNTIME_URL`, exige
 * `LF002A_MAINTENANCE_URL` (una base de mantenimiento, p. ej. `postgres` — nunca la propia
 * base del spike, porque Postgres no permite crear/soltar la base a la que la propia
 * conexión está conectada).
 *
 * ADVERTENCIA DE EJECUCIÓN: a diferencia de isolation.test.ts/auth-boundary.test.ts, que
 * leen y escriben filas dentro de la base compartida `lf002a_spike`, P16 de este archivo la
 * BORRA y la RECREA de verdad. Por eso este archivo tiene su PROPIA configuración de
 * Vitest (vitest.lf-002a.lifecycle.config.ts, con `fileParallelism: false`), cuyo `include`
 * es mutuamente excluyente con vitest.lf-002a.config.ts — una garantía de configuración,
 * no solo un comentario (revisión independiente del PR #19, hallazgo 6). Se invoca
 * SIEMPRE por separado, después de que la otra suite haya terminado:
 *   npx vitest run --config vitest.lf-002a.config.ts
 *   npx vitest run --config vitest.lf-002a.lifecycle.config.ts
 *
 * Revisión independiente del PR #19, hallazgo 2: `dropSpikeDatabaseIfMatching`/
 * `createSpikeDatabaseIfMatching` ya no aceptan un nombre esperado como parámetro —
 * ninguna cadena que este archivo controle puede "coincidir consigo misma" como prueba de
 * autorización. La verificación real de procedencia (nombre + marcador) vive en
 * lab-target.ts, ya probada con dobles en tests/unit/lf-002a/lab-target.test.ts; aquí solo
 * se ejercita el flujo real de punta a punta (no ejecutable todavía).
 *
 * Revisión independiente, SEGUNDA ronda (candidato `212e201`), hallazgo 1: además del
 * nombre y el marcador, el borrado/creación ahora exige que la conexión administrativa y
 * la candidata estén en el MISMO servidor real (`system_identifier`) — compartir solo el
 * nombre nunca basta. Hallazgo 5: `vitest.lf-002a.lifecycle.config.ts` (`include`
 * mutuamente excluyente con `vitest.lf-002a.config.ts`) solo evita que UNA invocación de
 * Vitest mezcle archivos; no evita dos PROCESOS distintos a la vez. `acquireSuiteLock`
 * (suite-lock.ts, probado de verdad en tests/unit/lf-002a/suite-lock.test.ts) añade
 * exclusión real por archivo, adquirida aquí como lo PRIMERO que hace `beforeAll` y
 * liberada en `afterAll` — el mismo candado que isolation/auth-boundary, así que P16 nunca
 * puede borrar la base mientras cualquiera de esas dos la tiene tomada, y viceversa.
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
import { assertLabTargetAuthorized, verifyLabTarget } from './lab-target.js';
import { TENANT_PROBE_ROWS } from './fixtures.js';
import { assertSeedSanity, seedFixtures } from './seed.js';
import { DEFAULT_LOCK_FILE_PATH, acquireSuiteLock, type SuiteLockHandle } from './suite-lock.js';

describe('LF-002a lifecycle (P15-P16)', () => {
  let maintenancePool: Pool;
  let provisionerPool: Pool;
  let runtimePool: Pool;
  let lockHandle: SuiteLockHandle | undefined;

  beforeAll(async () => {
    // Lo primero de todo: exclusión real con isolation/auth-boundary (hallazgo 5, segunda
    // ronda) antes de abrir ningún pool — especialmente importante aquí, ya que P16 borra
    // la base compartida de verdad.
    lockHandle = await acquireSuiteLock({ lockFilePath: DEFAULT_LOCK_FILE_PATH });

    maintenancePool = createSpikePool({ connectionString: requireEnvUrl('LF002A_MAINTENANCE_URL'), maxConnections: 1 });
    provisionerPool = createSpikePool({ connectionString: requireEnvUrl('LF002A_PROVISIONER_URL'), maxConnections: 1 });
    runtimePool = createSpikePool({ connectionString: requireEnvUrl('LF002A_RUNTIME_URL'), maxConnections: 1 });

    // Precondición obligatoria, igual que en los otros dos archivos: confirma que se parte
    // de un estado sano ANTES de que P15 lo rompa deliberadamente (y lo restaure) y de que
    // P16 borre/recree la base de verdad.
    const preflight = await runPreflight(runtimePool);
    if (!preflight.ok) {
      throw new Error(`Precondition preflight failed before running P15/P16: ${preflight.reasons.join(', ')}`);
    }
  });

  afterAll(async () => {
    await maintenancePool?.end();
    await provisionerPool?.end();
    await runtimePool?.end();
    lockHandle?.release();
  });

  // --- P15: control negativo del propio preflight -----------------------------
  test('P15: un fixture deliberadamente inseguro es detectado por el preflight, nunca aplicado a otra base', async () => {
    // Nunca deshabilitar RLS sin antes confirmar, contra el propio servidor (nombre Y
    // marcador de procedencia — no una suposición), que es exactamente la base reservada
    // del spike.
    const guardClient = await provisionerPool.connect();
    try {
      assertLabTargetAuthorized(await verifyLabTarget(guardClient));
    } finally {
      guardClient.release();
    }

    const before = await runPreflight(runtimePool);
    expect(before).toEqual({ ok: true, reasons: [] });

    const disableClient = await provisionerPool.connect();
    try {
      await disableClient.query('alter table tenant_probe disable row level security');
      const whileDisabled = await runPreflight(runtimePool);
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
      const withoutPolicy = await runPreflight(runtimePool);
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

    const afterRestoring = await runPreflight(runtimePool);
    expect(afterRestoring).toEqual({ ok: true, reasons: [] });
  });

  // --- P15b: control negativo — política permisiva "OR true" (hallazgo 2, segunda ronda) --
  test('P15b: una política reescrita con "OR true" (siempre verdadera) es detectada por el preflight, nunca aceptada por contener la subcadena correcta', async () => {
    const rewriteClient = await provisionerPool.connect();
    try {
      await rewriteClient.query('drop policy if exists tenant_probe_isolation on tenant_probe');
      await rewriteClient.query(`
        create policy tenant_probe_isolation on tenant_probe
          using (tenant_id = current_setting('app.tenant_id', true) or true)
          with check (tenant_id = current_setting('app.tenant_id', true))
      `);
      const withOrTrue = await runPreflight(runtimePool);
      expect(withOrTrue.ok).toBe(false);
      expect(withOrTrue.reasons).toContain('permissive_policy_without_tenant_condition:tenant_probe_isolation');
    } finally {
      await rewriteClient.query('drop policy if exists tenant_probe_isolation on tenant_probe');
      await rewriteClient.query(`
        create policy tenant_probe_isolation on tenant_probe
          using (tenant_id = current_setting('app.tenant_id', true))
          with check (tenant_id = current_setting('app.tenant_id', true))
      `);
      rewriteClient.release();
    }

    const restored = await runPreflight(runtimePool);
    expect(restored).toEqual({ ok: true, reasons: [] });
  });

  // --- P16: ciclo real de borrado/recreación ------------------------------------
  test('P16: solo la base identificada se borra; un ciclo limpio de recreación restablece propiedad/permisos/esquema/fixtures', async () => {
    // El borrado exige verificación real de procedencia contra la base candidata (nombre Y
    // marcador) antes de tocar nada — ver lab-target.ts, probado con dobles en
    // tests/unit/lf-002a/lab-target.test.ts (hallazgo 2). Ya no hay ningún nombre que este
    // archivo pueda pasarle que "coincida consigo mismo": el único parámetro variable es la
    // propia cadena de conexión al destino candidato, que la función verifica de verdad.
    await dropSpikeDatabaseIfMatching(maintenancePool, requireEnvUrl('LF002A_PROVISIONER_URL'));

    const goneCheck = await maintenancePool.query<{ n: number }>(
      "select count(*)::int as n from pg_database where datname = 'lf002a_spike'",
    );
    expect(goneCheck.rows[0]?.n).toBe(0);

    await createSpikeDatabaseIfMatching(maintenancePool, requireEnvUrl('LF002A_PROVISIONER_URL'));

    // applySchemaSql reaplica TODO el DDL idempotente de schema.sql, incluidos los
    // GRANT/REVOKE del rol runtime (hallazgo 6: un CREATE DATABASE nuevo no hereda los
    // privilegios por objeto de la base anterior, aunque el propio rol persista a nivel de
    // clúster) y la fila marcadora de procedencia que lab-target.ts exige para cualquier
    // operación posterior.
    await applySchemaSql(provisionerPool);
    await seedFixtures(provisionerPool);
    await assertSeedSanity(provisionerPool);

    // Trazable: el mismo preflight que exige el resto de la suite debe volver a pasar tal
    // cual tras la recreación — no una versión relajada.
    const preflight = await runPreflight(runtimePool);
    expect(preflight).toEqual({ ok: true, reasons: [] });

    const probeCount = await provisionerPool.query<{ n: number }>('select count(*)::int as n from tenant_probe');
    expect(probeCount.rows[0]?.n).toBe(TENANT_PROBE_ROWS.length);
  });
});
