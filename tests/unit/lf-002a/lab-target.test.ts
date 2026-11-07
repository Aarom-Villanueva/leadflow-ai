/**
 * Pruebas puras y ejecutables ahora (sin `pg`, con dobles locales de conexión) de
 * tests/integration/lf-002a/lab-target.ts — hallazgo 2 de la revisión independiente del
 * PR #19, endurecido por el hallazgo 1 de la segunda ronda (candidato `212e201`).
 *
 * Reproducen primero el bypass exacto original ("ambos nombres son 'postgres'") y
 * confirman que ya no es posible; luego los dos huecos de la segunda ronda: (a) una
 * conexión administrativa y una candidata en SERVIDORES distintos nunca se tratan como el
 * mismo destino aunque compartan nombre de base; (b) una base preexistente ajena que por
 * coincidencia se llame `lf002a_spike` nunca puede adquirir la marca de procedencia por una
 * excepción de "solo nombre" — ya no existe tal excepción.
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
  markLabTargetAsCreated,
  verifyLabTarget,
  verifySameServer,
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

describe('lab-target: verifyLabTarget / assertLabTargetAuthorized', () => {
  test('reproduce el hallazgo exacto: un destino de sistema nunca se autoriza aunque "coincida" con lo esperado', async () => {
    for (const systemDb of FORBIDDEN_DATABASE_NAMES) {
      const double = makeReadOnlyDouble({ currentDatabase: systemDb });
      const verification = await verifyLabTarget(double);
      expect(verification.ok).toBe(false);
      expect(verification.reasons[0]).toMatch(/refusing_system_database/);
      expect(() => assertLabTargetAuthorized(verification)).toThrow(/Refusing to operate/);
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

  test('rechaza cuando la tabla marcadora no existe (base preexistente ajena con el mismo nombre por coincidencia) — sin excepción de "solo nombre"', async () => {
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
});

describe('lab-target: verifySameServer (hallazgo 1, segunda ronda)', () => {
  test('autoriza solo cuando ambos system_identifier coinciden', () => {
    expect(verifySameServer({ systemIdentifier: '123' }, { systemIdentifier: '123' })).toEqual({ ok: true, reasons: [] });
  });

  test('rechaza cuando la conexión administrativa y la candidata están en servidores distintos, aunque compartan nombre de base', () => {
    const verification = verifySameServer({ systemIdentifier: '111' }, { systemIdentifier: '222' });
    expect(verification.ok).toBe(false);
    expect(verification.reasons[0]).toMatch(/admin_and_target_different_server:111!=222/);
    expect(() => assertLabTargetAuthorized(verification)).toThrow(/Refusing to operate/);
  });
});

describe('lab-target: markLabTargetAsCreated (hallazgo 1, segunda ronda — evidencia de creación controlada)', () => {
  test('escribe exactamente la tabla marcadora y la fila esperada, nada más', async () => {
    const calls: string[] = [];
    const double: QueryableConnection = {
      async query(sql: string) {
        calls.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };
    await markLabTargetAsCreated(double);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/create table if not exists "lf002a_lab_marker"/i);
    expect(calls[1]).toMatch(/insert into "lf002a_lab_marker"/i);
  });

  test('simulación de punta a punta: sin CREATE DATABASE exitoso, el marcador nunca se escribe — ninguna base preexistente ajena puede adquirirlo por "solo nombre"', async () => {
    const markCalls: string[] = [];
    const markerDouble: QueryableConnection = {
      async query(sql: string) {
        markCalls.push(sql);
        return { rows: [], rowCount: 0 };
      },
    };

    async function simulateGuardedCreate(createDatabase: () => Promise<void>, adminSysId: string, targetSysId: string) {
      // Refleja la secuencia real de database.ts#createSpikeDatabaseIfMatching: CREATE
      // DATABASE primero (lanza si ya existía — Postgres no tiene CREATE DATABASE IF NOT
      // EXISTS); solo si tuvo éxito, se verifica el mismo servidor y se marca.
      await createDatabase();
      assertLabTargetAuthorized(verifySameServer({ systemIdentifier: adminSysId }, { systemIdentifier: targetSysId }));
      await markLabTargetAsCreated(markerDouble);
    }

    // Caso 1: la base "ya existía" (CREATE DATABASE simulado lanza, como el comportamiento
    // real de Postgres ante un nombre duplicado) — el marcador nunca se escribe.
    await expect(
      simulateGuardedCreate(
        async () => {
          throw new Error('duplicate_database: database "lf002a_spike" already exists');
        },
        'sysid-1',
        'sysid-1',
      ),
    ).rejects.toThrow(/already exists/);
    expect(markCalls).toHaveLength(0);

    // Caso 2: CREATE DATABASE tuvo éxito, pero la conexión que se abrió para marcarla
    // resulta estar en un servidor distinto al de la conexión administrativa (p. ej.
    // variables de entorno mal configuradas apuntando a dos clústeres) — se rechaza antes
    // de marcar.
    const createSpy = vi.fn(async () => {});
    await expect(simulateGuardedCreate(createSpy, 'sysid-admin', 'sysid-other')).rejects.toThrow(/Refusing to operate/);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(markCalls).toHaveLength(0);

    // Caso 3: éxito real, mismo servidor confirmado — solo aquí se escribe el marcador.
    await simulateGuardedCreate(createSpy, 'sysid-admin', 'sysid-admin');
    expect(markCalls).toHaveLength(2);
  });
});

describe('lab-target: secuencia completa de un drop seguro (hallazgo 2 original + hallazgo 1, segunda ronda)', () => {
  test('reproduce el bypass original (dos "postgres" iguales) y confirma que ya no es posible: cero sentencias modificadoras ante destino incorrecto', async () => {
    const mutatingCalls: string[] = [];
    async function simulateGuardedDrop(
      targetDouble: QueryableConnection,
      adminSysId: string,
      targetSysId: string,
      adminQuery: (sql: string) => Promise<void>,
    ) {
      // Refleja database.ts#dropSpikeDatabaseIfMatching: primero el mismo servidor, luego
      // la verificación completa de procedencia contra la base candidata — solo si ambas
      // pasan se emite cualquier sentencia modificadora vía la conexión administrativa.
      assertLabTargetAuthorized(verifySameServer({ systemIdentifier: adminSysId }, { systemIdentifier: targetSysId }));
      assertLabTargetAuthorized(await verifyLabTarget(targetDouble));
      await adminQuery('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1');
      await adminQuery(`drop database if exists "${SPIKE_DATABASE_NAME}"`);
    }

    // El bypass original: ambos nombres son "postgres", nada más se comprobaba. Aquí no
    // hay ningún segundo nombre que un llamador pueda hacer coincidir consigo mismo: el
    // doble de destino reporta "postgres" como su propia base real, lo que basta para
    // rechazarlo sin importar qué diga la conexión administrativa.
    const systemDbDouble = makeReadOnlyDouble({ currentDatabase: 'postgres' });
    await expect(
      simulateGuardedDrop(systemDbDouble, 'sysid-1', 'sysid-1', async (sql) => {
        mutatingCalls.push(sql);
      }),
    ).rejects.toThrow(/Refusing to operate/);
    expect(mutatingCalls).toHaveLength(0);

    // Servidores distintos, aunque el destino candidato por sí solo fuera válido: se
    // rechaza en el chequeo de servidor, antes incluso de verificar el marcador.
    const validLookingDouble = makeReadOnlyDouble({
      currentDatabase: SPIKE_DATABASE_NAME,
      markerRow: { created_for: SPIKE_MARKER_VALUE },
    });
    await expect(
      simulateGuardedDrop(validLookingDouble, 'sysid-admin', 'sysid-other', async (sql) => {
        mutatingCalls.push(sql);
      }),
    ).rejects.toThrow(/admin_and_target_different_server|Refusing to operate/);
    expect(mutatingCalls).toHaveLength(0);
    expect(validLookingDouble.calls).toHaveLength(0); // ni siquiera se llegó a consultar el destino

    // Autorizado de verdad: mismo servidor y procedencia verificada — solo entonces se
    // emiten las dos sentencias modificadoras.
    const adminQuery = vi.fn(async () => {});
    await simulateGuardedDrop(validLookingDouble, 'sysid-admin', 'sysid-admin', adminQuery);
    expect(adminQuery).toHaveBeenCalledTimes(2);
  });
});
