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
  type OpenedConnection,
  type QueryableConnection,
  assertLabTargetAuthorized,
  createSpikeTarget,
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

describe('lab-target: markLabTargetAsCreated', () => {
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
});

/**
 * Doble de conexión programable por tabla de respuestas, para ejercitar la función REAL
 * `createSpikeTarget` (no una copia de su secuencia) — hallazgo 1, tercera ronda sobre el
 * candidato `bde090b`. Responde a exactamente las cuatro formas de consulta que
 * `createSpikeTarget` emite: `current_database()`, `pg_control_system()`, `create
 * database`, y las dos de `markLabTargetAsCreated` (create table/insert, contadas en
 * `markCalls`).
 */
function makeScriptedConnection(opts: {
  currentDatabase: string | null;
  systemIdentifier: string;
  createDatabaseThrows?: boolean;
  markCalls: string[];
}): QueryableConnection & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query<T>(sql: string) {
      calls.push(sql);
      if (/current_database/i.test(sql)) {
        return {
          rows: (opts.currentDatabase === null ? [] : [{ db: opts.currentDatabase }]) as T[],
          rowCount: opts.currentDatabase === null ? 0 : 1,
        };
      }
      if (/pg_control_system/i.test(sql)) {
        return { rows: [{ sysid: opts.systemIdentifier }] as T[], rowCount: 1 };
      }
      if (/^\s*create database\b/i.test(sql)) {
        if (opts.createDatabaseThrows) {
          throw new Error('duplicate_database: database "lf002a_spike" already exists');
        }
        return { rows: [] as T[], rowCount: 0 };
      }
      if (/lab_marker/i.test(sql)) {
        opts.markCalls.push(sql);
        return { rows: [] as T[], rowCount: 0 };
      }
      throw new Error(`Unexpected query in scripted connection: ${sql}`);
    },
  };
}

describe('lab-target: createSpikeTarget (hallazgo 1, tercera ronda — secuencia real, no una simulación aparte)', () => {
  test('reproduce el hallazgo exacto: CREATE DATABASE tiene éxito pero la conexión abierta para marcar resulta ser OTRA base del mismo servidor — el marcador nunca se escribe', async () => {
    const markCalls: string[] = [];
    const adminConn = makeScriptedConnection({ currentDatabase: 'postgres', systemIdentifier: 'sysid-1', markCalls: [] });
    // El hallazgo exacto: la conexión "nueva" en realidad recibió otra base cualquiera del
    // mismo servidor (no `lf002a_spike`) — mismo `system_identifier` que adminConn
    // (verifySameServer por sí solo pasaría), pero base equivocada. Antes de esta
    // corrección, nada comprobaba esto y el marcador se escribía igual ahí.
    const wrongDbConn = makeScriptedConnection({ currentDatabase: 'some_other_app_db', systemIdentifier: 'sysid-1', markCalls });
    const close = vi.fn(async () => {});

    await expect(
      createSpikeTarget(adminConn, async (): Promise<OpenedConnection> => ({ conn: wrongDbConn, close })),
    ).rejects.toThrow(/Refusing to operate.*unexpected_database:some_other_app_db/);
    expect(markCalls).toHaveLength(0); // cero escrituras del marcador
    expect(close).toHaveBeenCalledTimes(1); // la conexión abierta se cierra igual, incluso al rechazar
  });

  test('rechaza una base de sistema como destino de la conexión nueva, aunque el servidor coincida', async () => {
    const markCalls: string[] = [];
    const adminConn = makeScriptedConnection({ currentDatabase: 'postgres', systemIdentifier: 'sysid-1', markCalls: [] });
    const systemDbConn = makeScriptedConnection({ currentDatabase: 'template1', systemIdentifier: 'sysid-1', markCalls });

    await expect(
      createSpikeTarget(adminConn, async (): Promise<OpenedConnection> => ({ conn: systemDbConn, close: async () => {} })),
    ).rejects.toThrow(/refusing_system_database/);
    expect(markCalls).toHaveLength(0);
  });

  test('si la base ya existía, CREATE DATABASE lanza y la conexión nueva nunca se abre: cero escrituras del marcador', async () => {
    const markCalls: string[] = [];
    const adminConn = makeScriptedConnection({
      currentDatabase: 'postgres',
      systemIdentifier: 'sysid-1',
      createDatabaseThrows: true,
      markCalls: [],
    });
    const connectToNewDb = vi.fn();

    await expect(createSpikeTarget(adminConn, connectToNewDb)).rejects.toThrow(/already exists/);
    expect(connectToNewDb).not.toHaveBeenCalled(); // nunca se intenta abrir/marcar nada
    expect(markCalls).toHaveLength(0);
  });

  test('rechaza cuando la conexión nueva resulta estar en un servidor distinto al de la conexión administrativa, aunque el nombre de base sea correcto', async () => {
    const markCalls: string[] = [];
    const adminConn = makeScriptedConnection({ currentDatabase: 'postgres', systemIdentifier: 'sysid-admin', markCalls: [] });
    const otherServerConn = makeScriptedConnection({
      currentDatabase: SPIKE_DATABASE_NAME,
      systemIdentifier: 'sysid-other',
      markCalls,
    });

    await expect(
      createSpikeTarget(adminConn, async (): Promise<OpenedConnection> => ({ conn: otherServerConn, close: async () => {} })),
    ).rejects.toThrow(/admin_and_target_different_server/);
    expect(markCalls).toHaveLength(0);
  });

  test('rechaza si adminConn ya está conectada a la propia base del spike', async () => {
    const adminConn = makeScriptedConnection({ currentDatabase: SPIKE_DATABASE_NAME, systemIdentifier: 'sysid-1', markCalls: [] });
    const connectToNewDb = vi.fn();
    await expect(createSpikeTarget(adminConn, connectToNewDb)).rejects.toThrow(/never the spike database itself/);
    expect(connectToNewDb).not.toHaveBeenCalled();
  });

  test('camino positivo: nombre correcto y mismo servidor confirmados — solo entonces se escribe el marcador, y se cierra la conexión nueva', async () => {
    const markCalls: string[] = [];
    const adminConn = makeScriptedConnection({ currentDatabase: 'postgres', systemIdentifier: 'sysid-admin', markCalls: [] });
    const correctConn = makeScriptedConnection({
      currentDatabase: SPIKE_DATABASE_NAME,
      systemIdentifier: 'sysid-admin',
      markCalls,
    });
    const close = vi.fn(async () => {});

    await createSpikeTarget(adminConn, async (): Promise<OpenedConnection> => ({ conn: correctConn, close }));

    expect(markCalls).toHaveLength(2);
    expect(markCalls[0]).toMatch(/create table if not exists "lf002a_lab_marker"/i);
    expect(markCalls[1]).toMatch(/insert into "lf002a_lab_marker"/i);
    expect(close).toHaveBeenCalledTimes(1);
    const createDatabaseCall = adminConn.calls.find((sql) => /^\s*create database\b/i.test(sql));
    expect(createDatabaseCall).toBeDefined();
    // Fase 2 (hallazgo real, verificado al ejecutar createSpikeTarget contra PostgreSQL 16
    // real — ver lab-target.ts): sin un OWNER explícito, PostgreSQL 15+ deja al rol
    // administrativo como propietario y revoca CREATE sobre `public` para cualquier otro
    // rol, así que el provisionador no podía escribir ni siquiera el propio marcador.
    expect(createDatabaseCall).toMatch(/owner "lf002a_provisioner"/i);
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
