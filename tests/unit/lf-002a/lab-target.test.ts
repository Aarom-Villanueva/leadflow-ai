/**
 * Pruebas puras y ejecutables ahora (sin `pg`, con dobles locales de conexión) de
 * tests/integration/lf-002a/lab-target.ts — hallazgo 2 de la revisión independiente del
 * PR #19. Reproducen primero el fallo exacto que encontró el doble local de la revisión
 * ("ambos nombres son 'postgres'") y confirman que ya no es posible con este diseño,
 * porque el nombre esperado ya no es un parámetro provisto por quien llama.
 *
 * Estas pruebas demuestran la lógica de decisión contra PostgreSQL simulado (dobles); no
 * sustituyen la evidencia pendiente de ejecutarlo contra PostgreSQL real en la fase 2.
 */
import { describe, expect, test, vi } from 'vitest';
import {
  FORBIDDEN_DATABASE_NAMES,
  SPIKE_DATABASE_NAME,
  SPIKE_MARKER_VALUE,
  type QueryableConnection,
  assertLabTargetAuthorized,
  checkDatabaseNameOnly,
  verifyLabTarget,
} from '../../integration/lf-002a/lab-target.js';

/** Doble que simula una conexión real y PROHÍBE cualquier sentencia que no sea un SELECT
 * de solo lectura — si la lógica de verificación emitiera alguna vez un DROP/DDL/INSERT
 * antes (o en lugar) de verificar, esta prueba lo detectaría al instante. */
function makeReadOnlyDouble(responses: {
  currentDatabase: string | null;
  markerQueryThrows?: boolean;
  markerRow?: { created_for: string } | null;
}): QueryableConnection & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query<T>(sql: string) {
      calls.push(sql);
      if (!/^\s*select\b/i.test(sql)) {
        throw new Error(`Refusing to simulate a non-SELECT statement in a read-only double: ${sql}`);
      }
      if (/current_database/i.test(sql)) {
        return { rows: (responses.currentDatabase === null ? [] : [{ db: responses.currentDatabase }]) as T[], rowCount: responses.currentDatabase === null ? 0 : 1 };
      }
      if (/lab_marker/i.test(sql)) {
        if (responses.markerQueryThrows) throw new Error('relation "lf002a_lab_marker" does not exist');
        const rows = responses.markerRow ? [responses.markerRow] : [];
        return { rows: rows as T[], rowCount: rows.length };
      }
      throw new Error(`Unexpected query in double: ${sql}`);
    },
  };
}

describe('lab-target: checkDatabaseNameOnly (bootstrap case: CREATE DATABASE / primera aplicación de schema.sql)', () => {
  test('acepta únicamente el nombre exacto de la constante reservada', () => {
    expect(checkDatabaseNameOnly(SPIKE_DATABASE_NAME)).toEqual({ ok: true, reasons: [] });
  });

  test('rechaza null, bases de sistema, y cualquier otro nombre', () => {
    expect(checkDatabaseNameOnly(null).ok).toBe(false);
    for (const systemDb of FORBIDDEN_DATABASE_NAMES) {
      expect(checkDatabaseNameOnly(systemDb).ok).toBe(false);
    }
    expect(checkDatabaseNameOnly('some_other_db').ok).toBe(false);
  });
});

describe('lab-target: verifyLabTarget / assertLabTargetAuthorized', () => {
  test('reproduce el hallazgo exacto: un destino de sistema nunca se autoriza aunque "coincida" con lo esperado', async () => {
    // El bypass original: dropSpikeDatabaseIfMatching(pool, "postgres", "postgres") se
    // aceptaba porque ambos argumentos, iguales entre sí, eran la única prueba exigida.
    // Aquí no hay un segundo argumento que pueda hacerse coincidir con "postgres": el
    // nombre esperado es la constante SPIKE_DATABASE_NAME, nunca "postgres".
    for (const systemDb of FORBIDDEN_DATABASE_NAMES) {
      const double = makeReadOnlyDouble({ currentDatabase: systemDb });
      const verification = await verifyLabTarget(double);
      expect(verification.ok).toBe(false);
      expect(verification.reasons[0]).toMatch(/refusing_system_database/);
      expect(() => assertLabTargetAuthorized(verification)).toThrow(/Refusing to operate/);
      // La verificación de una base de sistema se detiene en el primer chequeo: nunca
      // llega a consultar el marcador (menor superficie, nunca una sentencia modificadora).
      expect(double.calls).toHaveLength(1);
    }
  });

  test('rechaza una base con el nombre correcto pero sin la fila marcadora de procedencia', async () => {
    const double = makeReadOnlyDouble({ currentDatabase: SPIKE_DATABASE_NAME, markerRow: null });
    const verification = await verifyLabTarget(double);
    expect(verification.ok).toBe(false);
    expect(verification.reasons).toContain('marker_row_missing');
  });

  test('rechaza una base con el nombre correcto y marcador con valor distinto', async () => {
    const double = makeReadOnlyDouble({
      currentDatabase: SPIKE_DATABASE_NAME,
      markerRow: { created_for: 'some-other-lab' },
    });
    const verification = await verifyLabTarget(double);
    expect(verification.ok).toBe(false);
    expect(verification.reasons).toContain('marker_value_mismatch');
  });

  test('rechaza cuando la tabla marcadora no existe (base preexistente ajena con el mismo nombre por coincidencia)', async () => {
    const double = makeReadOnlyDouble({ currentDatabase: SPIKE_DATABASE_NAME, markerQueryThrows: true });
    const verification = await verifyLabTarget(double);
    expect(verification.ok).toBe(false);
    expect(verification.reasons).toContain('marker_table_missing_or_unreadable');
  });

  test('rechaza un nombre de base distinto del esperado, aunque no sea una base de sistema', async () => {
    const double = makeReadOnlyDouble({ currentDatabase: 'some_other_database' });
    const verification = await verifyLabTarget(double);
    expect(verification.ok).toBe(false);
    expect(verification.reasons[0]).toMatch(/unexpected_database:some_other_database/);
  });

  test('autoriza únicamente cuando el nombre Y el marcador de procedencia coinciden', async () => {
    const double = makeReadOnlyDouble({
      currentDatabase: SPIKE_DATABASE_NAME,
      markerRow: { created_for: SPIKE_MARKER_VALUE },
    });
    const verification = await verifyLabTarget(double);
    expect(verification).toEqual({ ok: true, reasons: [] });
    expect(() => assertLabTargetAuthorized(verification)).not.toThrow();
    expect(double.calls).toHaveLength(2);
  });

  test('assertLabTargetAuthorized nunca lanza para una verificación ok, y siempre lanza para una no-ok', () => {
    expect(() => assertLabTargetAuthorized({ ok: true, reasons: [] })).not.toThrow();
    expect(() => assertLabTargetAuthorized({ ok: false, reasons: ['x'] })).toThrow(/Refusing to operate.*x/);
  });

  test('simula la secuencia completa de un drop seguro: verificación antes, cero sentencias modificadoras si falla', async () => {
    // Doble de orquestación: simula lo que database.ts#dropSpikeDatabaseIfMatching debe
    // hacer — verificar primero contra el destino candidato, y solo emitir DROP/TERMINATE
    // si la verificación autorizó. Prueba el ORDEN, no la función real (que exige pg).
    const mutatingCalls: string[] = [];
    async function simulateGuardedDrop(targetDouble: QueryableConnection, adminQuery: (sql: string) => Promise<void>) {
      const verification = await verifyLabTarget(targetDouble);
      assertLabTargetAuthorized(verification); // lanza aquí si no autorizado — nunca se llega a lo de abajo
      await adminQuery('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1');
      await adminQuery(`drop database if exists "${SPIKE_DATABASE_NAME}"`);
    }

    const unauthorizedDouble = makeReadOnlyDouble({ currentDatabase: 'postgres' });
    await expect(
      simulateGuardedDrop(unauthorizedDouble, async (sql) => {
        mutatingCalls.push(sql);
      }),
    ).rejects.toThrow(/Refusing to operate/);
    expect(mutatingCalls).toHaveLength(0); // ninguna sentencia modificadora se emitió

    const authorizedDouble = makeReadOnlyDouble({
      currentDatabase: SPIKE_DATABASE_NAME,
      markerRow: { created_for: SPIKE_MARKER_VALUE },
    });
    const adminQuery = vi.fn(async () => {});
    await simulateGuardedDrop(authorizedDouble, adminQuery);
    expect(adminQuery).toHaveBeenCalledTimes(2);
  });
});
