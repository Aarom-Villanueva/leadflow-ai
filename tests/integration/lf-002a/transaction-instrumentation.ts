/**
 * Instrumentación real de conexión/transacción del laboratorio LF-002a/LF-023 — hallazgo 5
 * de la revisión independiente del PR #19, hallazgo 4 de la segunda ronda, y hallazgo 2 de
 * la TERCERA ronda (sobre el candidato `bde090b`), que encontró tres bugs reales en el
 * diseño de la segunda ronda:
 *
 * 1. `realTransactionId` solo se asignaba a la propia traza de BEGIN (el objeto capturado
 *    en el cierre de esa llamada concreta) — cualquier consulta POSTERIOR dentro de la
 *    misma transacción quedaba con `realTransactionId: null` para siempre, así que ninguna
 *    comparación por xid real entre una consulta de identidad y el BEGIN que la contenía
 *    podía funcionar jamás. Ahora el xid real se guarda también en el ESTADO de la
 *    conexión (`currentRealTransactionId`) en cuanto se conoce, y cada traza posterior lo
 *    lee de ahí al crearse — no solo la del propio BEGIN.
 * 2. Nada limpiaba ese estado al cerrar la transacción: una consulta emitida DESPUÉS de un
 *    COMMIT/ROLLBACK podía quedar etiquetada con el xid de la transacción YA CERRADA.
 *    Ahora `currentRealTransactionId` se pone a `null` en cuanto se procesa el cierre.
 * 3. El cierre se decidía por el TEXTO enviado (`sqlMarker(sql) === 'commit'`), nunca por lo
 *    que el SERVIDOR confirmó. Si un error anterior dejó la transacción abortada, Postgres
 *    convierte un `COMMIT` real en un `ROLLBACK` server-side — `pg` expone esto en
 *    `result.command`, el tag de comando real devuelto por el servidor. Ahora el cierre
 *    final (`committed`/`rolledback`) se decide por `result.command`, nunca por el texto
 *    que se envió. Los errores de cada consulta (incluidos los del propio
 *    BEGIN/COMMIT/ROLLBACK) se registran en `trace.error` y siempre se re-lanzan — nunca
 *    se ocultan ni se convierten en un resultado inventado.
 *
 * Revisión independiente, CUARTA ronda (sobre el candidato `d5e7b2c`), hallazgo único: el
 * punto 3 anterior seguía inventando una confirmación en un caso real — si `COMMIT`/
 * `ROLLBACK` LANZABA (en vez de responder con un tag reconocido), el código asumía
 * `'rolledback'` sin pruebas. Una excepción al enviar `COMMIT` no prueba que el servidor no
 * lo haya aplicado: la conexión pudo perderse DESPUÉS de que el servidor confirmara el
 * commit y ANTES de que el cliente recibiera esa respuesta — declarar `'rolledback'` ahí
 * sería inventar una confirmación en la dirección contraria, igual de falsa que asumir
 * `'committed'`. Se añade un cuarto estado, `'unknown'`: una excepción durante el cierre, o
 * una respuesta exitosa sin un tag `'COMMIT'`/`'ROLLBACK'` reconocido, deja el resultado
 * como `'unknown'`, nunca como `'rolledback'` supuesto. El estado de transacción activa
 * (`currentRealTransactionId`) se limpia igual en ese caso: ninguna consulta posterior
 * hereda el identificador de una transacción cuyo cierre quedó incierto, sea cual sea el
 * motivo. El error y toda la evidencia disponible se conservan en `trace.error` de todos
 * modos.
 *
 * Puro en el sentido de esta fase: solo depende de query-classifier.ts (sin importaciones
 * externas) y de la interfaz mínima `InstrumentableConnection` — nunca de `pg` en sí. Es
 * ejecutable y probado AHORA con un doble inyectado (ver
 * tests/unit/lf-002a/transaction-instrumentation.test.ts: BEGIN→consulta→COMMIT, ROLLBACK,
 * consulta fuera de transacción, el caso exacto de un COMMIT que el servidor reporta como
 * ROLLBACK, y los tres casos de cierre incierto: COMMIT con respuesta perdida, ROLLBACK con
 * respuesta perdida, y un tag de cierre inesperado). `auth.ts` la usa para instrumentar
 * conexiones `pg.PoolClient` reales (que satisfacen esta interfaz estructuralmente); la
 * comprobación real contra PostgreSQL de que `pg_current_xact_id()`/los tags de comando se
 * comportan como se espera aquí queda pendiente, como el resto de esta fase, de la fase 2.
 */
import { classifyQuery, sqlMarker, type QueryClassification, type TransactionMarker } from './query-classifier.js';

export type { QueryClassification, TransactionMarker };

export type TransactionOutcome = 'open' | 'committed' | 'rolledback' | 'unknown';

export interface QueryTrace {
  /** SQL real tal como se envió, sin valores de parámetros — nunca material de sesión. */
  readonly sql: string;
  /** Backend físico que ejecutó la consulta. */
  readonly backendPid: number;
  /** Agrupador LOCAL de este proceso: `${backendPid}:${secuencia_de_BEGIN}`. Sirve para
   * correlacionar trazas de la misma instrumentación, pero NO es un identificador de
   * transacción real de PostgreSQL — para eso ver `realTransactionId`. */
  readonly observedTransactionSpanId: string;
  /** El `pg_current_xact_id()` real de la transacción a la que pertenece esta traza,
   * propagado desde el BEGIN que la abrió — `null` si esa consulta ocurrió fuera de
   * cualquier transacción observada, o si la consulta de xid del propio BEGIN falló. Esta
   * es la evidencia VERIFICABLE de "misma transacción"; `observedTransactionSpanId` es
   * solo un agrupador local de este proceso. */
  realTransactionId: string | null;
  /** Si esta traza ES un marcador de límite transaccional (según el TEXTO enviado — la
   * verdad del cierre real vive en `outcome`, no aquí). */
  readonly marker: TransactionMarker;
  readonly classification: QueryClassification;
  /** Éxito/fallo y cierre REAL del span transaccional al que pertenece esta traza,
   * decidido ÚNICAMENTE por `result.command` (el tag que el servidor confirmó), nunca por
   * el texto que se envió: 'committed' solo si el tag fue 'COMMIT', 'rolledback' solo si
   * fue 'ROLLBACK'. Si el intento de cierre lanzó una excepción, o respondió con éxito pero
   * sin uno de esos dos tags, el resultado es 'unknown' — una excepción no prueba que el
   * servidor no haya aplicado el commit antes de perderse la respuesta, así que nunca se
   * asume 'rolledback' sin esa confirmación. 'open' mientras la transacción sigue abierta. */
  outcome: TransactionOutcome;
  /** Mensaje de error si esta consulta concreta falló, `null` si no. */
  error: string | null;
}

export interface AuthInstrumentation {
  readonly traces: QueryTrace[];
}

export interface InstrumentableQueryResult {
  readonly rows: readonly unknown[];
  readonly rowCount: number | null;
  /** Tag de comando real devuelto por el servidor (p. ej. 'BEGIN'/'COMMIT'/'ROLLBACK'/
   * 'SELECT'/'INSERT') — la fuente de verdad del cierre, nunca el texto enviado. */
  readonly command?: string;
}

export interface InstrumentableConnection {
  processID?: number;
  query(...args: unknown[]): Promise<InstrumentableQueryResult>;
}

interface ConnectionTxnState {
  readonly backendPid: number;
  txnSeq: number;
  currentRealTransactionId: string | null;
}

function backfillOutcome(traces: readonly QueryTrace[], spanId: string, outcome: TransactionOutcome): void {
  for (const trace of traces) {
    if (trace.observedTransactionSpanId === spanId && trace.outcome === 'open') {
      trace.outcome = outcome;
    }
  }
}

function extractSql(args: readonly unknown[]): string {
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && typeof (first as { text?: unknown }).text === 'string') {
    return (first as { text: string }).text;
  }
  return '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Envuelve `conn.query` EN EL SITIO (muta `conn`), registrando cada consulta real en
 * `instrumentation.traces` con las correcciones de la tercera ronda descritas arriba.
 * Idempotente de nombre pero no de llamada: quien invoque esto dos veces sobre la misma
 * conexión la envolvería dos veces — la protección contra eso (un `WeakSet` de conexiones
 * ya instrumentadas) vive en `auth.ts`, no aquí, porque este módulo no decide identidad de
 * objetos, solo instrumenta lo que se le pase.
 */
export function instrumentConnection(conn: InstrumentableConnection, instrumentation: AuthInstrumentation): void {
  const backendPid = conn.processID ?? -1;
  const state: ConnectionTxnState = { backendPid, txnSeq: 0, currentRealTransactionId: null };
  const originalQuery = conn.query.bind(conn);

  conn.query = (async (...args: unknown[]) => {
    const sql = extractSql(args);
    const marker = sqlMarker(sql);
    if (marker === 'begin') {
      state.txnSeq += 1;
      state.currentRealTransactionId = null; // el xid real de ESTA transacción aún no se conoce
    }
    const spanId = `${backendPid}:${state.txnSeq}`;
    const trace: QueryTrace = {
      sql,
      backendPid,
      observedTransactionSpanId: spanId,
      realTransactionId: state.currentRealTransactionId,
      marker,
      classification: marker ? 'other' : classifyQuery(sql),
      outcome: 'open',
      error: null,
    };
    instrumentation.traces.push(trace);

    let result: InstrumentableQueryResult;
    try {
      result = await originalQuery(...args);
    } catch (error) {
      trace.error = errorMessage(error);
      if (marker === 'commit' || marker === 'rollback') {
        // Una excepción al enviar COMMIT/ROLLBACK NUNCA prueba que el servidor no lo haya
        // aplicado: la conexión pudo perderse después de que el servidor confirmara el
        // commit y antes de que el cliente recibiera esa respuesta. Asumir 'rolledback'
        // aquí sería inventar una confirmación tan falsa como asumir 'committed' — el
        // resultado real es desconocido, nunca un valor supuesto. El estado de
        // transacción activa se limpia igual: ninguna consulta posterior debe heredar el
        // identificador de una transacción cuyo cierre quedó incierto.
        backfillOutcome(instrumentation.traces, spanId, 'unknown');
        state.currentRealTransactionId = null;
      }
      throw error;
    }

    if (marker === 'begin') {
      // Se espera esta consulta ANTES de devolver el control a quien llamó a
      // `conn.query('begin')`, para que el xid real ya esté disponible en cuanto el propio
      // BEGIN se considera terminado — nunca una carrera entre "ya abrió" y "ya se capturó
      // su identificador real". Se guarda en `state`, no solo en `trace`, para que las
      // consultas SIGUIENTES de esta misma transacción también lo lean al crearse.
      try {
        const xidResult = await originalQuery('select pg_current_xact_id()::text as xid');
        const xid = (xidResult.rows[0] as { xid?: string } | undefined)?.xid ?? null;
        trace.realTransactionId = xid;
        state.currentRealTransactionId = xid;
      } catch (xidError) {
        trace.realTransactionId = null;
        state.currentRealTransactionId = null;
        trace.error = trace.error ?? errorMessage(xidError);
      }
    } else if (marker === 'commit' || marker === 'rollback') {
      // La verdad del cierre es ÚNICAMENTE el tag de comando que el SERVIDOR devolvió
      // (`result.command`), nunca el texto que se envió: tras un error dentro de la
      // transacción, Postgres convierte un COMMIT real en un ROLLBACK (transacción
      // abortada), y `result.command` lo refleja como 'ROLLBACK', no 'COMMIT'. Un tag que
      // no sea ninguno de los dos reconocidos tampoco se asume como fallo: queda
      // 'unknown', nunca 'rolledback' por defecto.
      const finalOutcome: TransactionOutcome =
        result.command === 'COMMIT' ? 'committed' : result.command === 'ROLLBACK' ? 'rolledback' : 'unknown';
      backfillOutcome(instrumentation.traces, spanId, finalOutcome);
      // Limpiar SIEMPRE al cerrar, incluido el caso 'unknown': ninguna consulta posterior
      // a un intento de cierre debe quedar etiquetada con el xid de una transacción cuyo
      // cierre ya sea confirmado o incierto.
      state.currentRealTransactionId = null;
    }

    return result;
  }) as InstrumentableConnection['query'];
}
