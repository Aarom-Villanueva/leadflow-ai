/**
 * Pruebas offline y ejecutables ahora (sin `pg`, con una conexión doble inyectada) de
 * tests/integration/lf-002a/transaction-instrumentation.ts — hallazgo 2 de la tercera
 * ronda de revisión independiente sobre el candidato `bde090b`. Cubren exactamente los
 * tres bugs reportados (propagación de `realTransactionId` a consultas posteriores al
 * BEGIN, limpieza del estado al cerrar, y verdad del cierre por `result.command` real en
 * vez del texto enviado), más los casos explícitamente pedidos: BEGIN → consulta → COMMIT,
 * ROLLBACK, consulta fuera de transacción, y fallos.
 *
 * Demuestran la lógica de instrumentación contra un doble que simula las respuestas de
 * PostgreSQL; NUNCA sustituyen la comprobación pendiente contra PostgreSQL real (fase 2,
 * no ejecutable todavía) de que `pg_current_xact_id()`/los tags de comando se comportan
 * como aquí se asume.
 */
import { describe, expect, test } from 'vitest';
import {
  instrumentConnection,
  type AuthInstrumentation,
  type InstrumentableConnection,
  type InstrumentableQueryResult,
} from '../../integration/lf-002a/transaction-instrumentation.js';

/** Doble programable: responde a BEGIN/COMMIT/ROLLBACK y a la consulta interna de
 * `pg_current_xact_id()` con tags de comando reales configurables — en particular, permite
 * simular que el servidor reporta 'ROLLBACK' para un COMMIT enviado como texto (transacción
 * abortada por un error anterior), el caso exacto que el hallazgo pide cubrir. */
class FakeConnection implements InstrumentableConnection {
  processID = 4242;
  xid = 'xid-1';
  xidQueryThrows = false;
  /** Si se fija, el tag de comando que devuelve un COMMIT/ROLLBACK de texto, en vez del
   * que correspondería a su propio texto — simula una transacción abortada server-side. */
  closeCommandOverride: string | null = null;
  /** Si se fija, la PRÓXIMA llamada a `query` lanza este error en vez de responder. */
  nextQueryThrows: Error | null = null;

  async query(...args: unknown[]): Promise<InstrumentableQueryResult> {
    if (this.nextQueryThrows) {
      const error = this.nextQueryThrows;
      this.nextQueryThrows = null;
      throw error;
    }
    const first = args[0];
    const sql = typeof first === 'string' ? first : (first as { text?: string })?.text ?? '';
    const normalized = sql.trim().toLowerCase();

    if (/pg_current_xact_id/i.test(sql)) {
      if (this.xidQueryThrows) throw new Error('function pg_current_xact_id() does not exist');
      return { rows: [{ xid: this.xid }], rowCount: 1 };
    }
    if (normalized === 'begin') return { rows: [], rowCount: 0, command: 'BEGIN' };
    if (normalized === 'commit') return { rows: [], rowCount: 0, command: this.closeCommandOverride ?? 'COMMIT' };
    if (normalized === 'rollback') return { rows: [], rowCount: 0, command: this.closeCommandOverride ?? 'ROLLBACK' };
    return { rows: [], rowCount: 0, command: 'SELECT' };
  }
}

function instrument(conn: FakeConnection): AuthInstrumentation {
  const instrumentation: AuthInstrumentation = { traces: [] };
  instrumentConnection(conn, instrumentation);
  return instrumentation;
}

describe('transaction-instrumentation: BEGIN → consulta → COMMIT', () => {
  test('el xid real se propaga del BEGIN a la consulta posterior, y el cierre marca ambas (y al propio COMMIT) como committed', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('begin');
    await conn.query('select id from tenant_probe');
    await conn.query('commit');

    expect(instrumentation.traces).toHaveLength(3); // la consulta interna de xid no se registra como traza propia
    const [beginTrace, queryTrace, commitTrace] = instrumentation.traces;

    expect(beginTrace.marker).toBe('begin');
    expect(beginTrace.realTransactionId).toBe('xid-1');

    // El bug exacto de la tercera ronda: antes, solo la traza de BEGIN tenía el xid real;
    // esta consulta (emitida DESPUÉS del BEGIN, en la misma transacción) debe heredarlo.
    expect(queryTrace.realTransactionId).toBe('xid-1');
    expect(queryTrace.classification).toBe('tenant');

    expect(commitTrace.marker).toBe('commit');
    expect(commitTrace.realTransactionId).toBe('xid-1');

    for (const trace of instrumentation.traces) {
      expect(trace.outcome).toBe('committed');
      expect(trace.error).toBeNull();
    }
  });
});

describe('transaction-instrumentation: ROLLBACK', () => {
  test('el xid se propaga igual, y el cierre marca rolledback cuando el comando real es ROLLBACK', async () => {
    const conn = new FakeConnection();
    conn.xid = 'xid-rollback';
    const instrumentation = instrument(conn);

    await conn.query('begin');
    await conn.query('insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3)');
    await conn.query('rollback');

    expect(instrumentation.traces).toHaveLength(3);
    for (const trace of instrumentation.traces) {
      expect(trace.realTransactionId).toBe('xid-rollback');
      expect(trace.outcome).toBe('rolledback');
    }
  });
});

describe('transaction-instrumentation: consulta fuera de transacción', () => {
  test('sin BEGIN previo, realTransactionId es null, marker es null, y la traza nunca se cierra', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('select current_database() as db');

    expect(instrumentation.traces).toHaveLength(1);
    const [trace] = instrumentation.traces;
    expect(trace.marker).toBeNull();
    expect(trace.realTransactionId).toBeNull();
    expect(trace.outcome).toBe('open');
  });

  test('no etiqueta una consulta posterior al cierre como perteneciente a la transacción ya cerrada', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('begin');
    await conn.query('select 1');
    await conn.query('commit');
    await conn.query('select 2'); // fuera de cualquier transacción, después del cierre

    const afterCommit = instrumentation.traces.at(-1)!;
    expect(afterCommit.realTransactionId).toBeNull(); // nunca el xid de la transacción ya cerrada
  });
});

describe('transaction-instrumentation: fallos', () => {
  test('una consulta ordinaria que lanza registra el error, lo re-lanza, y no cierra la transacción por sí sola', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('begin');
    conn.nextQueryThrows = new Error('duplicate key value violates unique constraint');
    await expect(conn.query('insert into tenant_probe (id) values ($1)')).rejects.toThrow('duplicate key');

    const [, queryTrace] = instrumentation.traces;
    expect(queryTrace.error).toBe('duplicate key value violates unique constraint');
    expect(queryTrace.outcome).toBe('open'); // una consulta ordinaria fallida no cierra la transacción por sí misma
  });

  test('el hallazgo exacto: un COMMIT enviado como texto que el servidor reporta como ROLLBACK (transacción abortada) se registra como rolledback, nunca committed', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('begin');
    await conn.query('select 1'); // una consulta anterior pudo haber abortado la transacción server-side
    conn.closeCommandOverride = 'ROLLBACK'; // el servidor confirma el aborto al "cerrar"
    await conn.query('commit'); // el texto enviado es COMMIT — nunca debe decidir el resultado

    for (const trace of instrumentation.traces) {
      expect(trace.outcome).toBe('rolledback');
    }
    const commitTrace = instrumentation.traces.at(-1)!;
    expect(commitTrace.marker).toBe('commit'); // el marcador de TEXTO sigue siendo 'commit'...
    expect(commitTrace.outcome).toBe('rolledback'); // ...pero el cierre real nunca se decide por ese texto
  });

  test('si el propio COMMIT lanza, se registra el error y se cierra como rolledback de todos modos', async () => {
    const conn = new FakeConnection();
    const instrumentation = instrument(conn);

    await conn.query('begin');
    conn.nextQueryThrows = new Error('could not serialize access due to concurrent update');
    await expect(conn.query('commit')).rejects.toThrow('could not serialize access');

    for (const trace of instrumentation.traces) {
      expect(trace.outcome).toBe('rolledback');
    }
    const commitTrace = instrumentation.traces.at(-1)!;
    expect(commitTrace.error).toBe('could not serialize access due to concurrent update');
  });

  test('si la consulta interna de pg_current_xact_id() falla, el BEGIN no lanza, pero su xid y el de las consultas siguientes quedan null', async () => {
    const conn = new FakeConnection();
    conn.xidQueryThrows = true;
    const instrumentation = instrument(conn);

    await expect(conn.query('begin')).resolves.toEqual({ rows: [], rowCount: 0, command: 'BEGIN' });
    await conn.query('select 1');

    const [beginTrace, queryTrace] = instrumentation.traces;
    expect(beginTrace.realTransactionId).toBeNull();
    expect(beginTrace.error).toMatch(/pg_current_xact_id/);
    expect(queryTrace.realTransactionId).toBeNull(); // nunca propaga un xid que nunca se obtuvo
  });
});
