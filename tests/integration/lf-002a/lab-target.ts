/**
 * Fuente única de verdad del destino autorizado del laboratorio LF-002a/LF-023, y
 * verificación de procedencia real antes de cualquier operación destructiva o de
 * escritura de esquema — hallazgo 2 de la revisión independiente del PR #19, endurecido
 * por el hallazgo 1 de la segunda ronda de revisión sobre el candidato `212e201`.
 *
 * El diseño original de `dropSpikeDatabaseIfMatching` aceptaba dos cadenas provistas por
 * quien llama y solo comparaba que fueran iguales entre sí (bypass confirmado con un
 * doble: dos "postgres" se aceptaban). La primera corrección fijó el nombre esperado como
 * una única constante y exigió una fila marcadora de procedencia — pero dejó dos huecos
 * reales, cerrados aquí:
 *
 * 1. La conexión que VERIFICA procedencia (contra la base candidata) y la conexión
 *    ADMINISTRATIVA que de verdad ejecuta el DROP/CREATE nunca se comprobaban como el
 *    MISMO servidor — compartir el nombre de base no prueba que ambas apunten al mismo
 *    clúster. `verifySameServer` compara el `system_identifier` real de PostgreSQL
 *    (`pg_control_system()`, estable y único por clúster desde `initdb`) de ambas
 *    conexiones antes de confiar en cualquier operación que combine las dos.
 * 2. El "bootstrap" (primera aplicación de schema.sql sobre una base recién creada, que
 *    todavía no puede tener la fila marcadora) se resolvía con una excepción general por
 *    nombre — una base preexistente y ajena que por pura coincidencia se llamara
 *    `lf002a_spike` pasaba igual esa excepción. Ahora no existe ninguna excepción por
 *    nombre: `markLabTargetAsCreated` es la ÚNICA función de todo el código que escribe la
 *    fila marcadora, y solo se invoca (desde `database.ts#createSpikeDatabaseIfMatching`)
 *    justo después de que un `CREATE DATABASE` del nombre reservado haya tenido éxito de
 *    verdad — si la base ya existía, `CREATE DATABASE` lanza y este código nunca se
 *    alcanza. `applySchemaSql`/`seedFixtures`/cualquier escritura posterior exigen siempre
 *    la verificación COMPLETA (`verifyLabTarget`: nombre + marcador), sin ninguna
 *    excepción de arranque.
 *
 * Puro, sin importaciones externas: `QueryableConnection` es la única superficie que este
 * módulo necesita de una conexión real (`pg.PoolClient`/`pg.Pool` la satisfacen
 * estructuralmente) — así que es ejecutable y probado ya mismo con dobles de prueba, sin
 * instalar nada (ver tests/unit/lf-002a/lab-target.test.ts). Limitación explícita: esta
 * marca es un valor fijo, no un nonce criptográfico — protege contra una base ajena
 * preexistente sin marcador (el riesgo real reportado), no contra un atacante con acceso
 * de escritura simultáneo al mismo clúster reproduciendo el valor exacto; ese nivel de
 * amenaza excede el alcance de un laboratorio descartable solo-loopback.
 */

export const SPIKE_DATABASE_NAME = 'lf002a_spike';
export const SPIKE_RUNTIME_ROLE = 'lf002a_runtime';
export const SPIKE_SCHEMA = 'public';
export const SPIKE_MARKER_TABLE = 'lf002a_lab_marker';
export const SPIKE_MARKER_VALUE = 'lf002a-identity-spike-v1';

export const FORBIDDEN_DATABASE_NAMES: ReadonlySet<string> = new Set(['postgres', 'template0', 'template1']);

// Chequeo en tiempo de carga del módulo: si alguna vez se edita `SPIKE_DATABASE_NAME` para
// que coincida con un nombre de sistema, este módulo falla al importarse, no en tiempo de
// ejecución de una operación destructiva.
if (FORBIDDEN_DATABASE_NAMES.has(SPIKE_DATABASE_NAME)) {
  throw new Error('SPIKE_DATABASE_NAME must never be a system database name');
}

export interface QueryableConnection {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface LabTargetVerification {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export interface ServerIdentity {
  readonly systemIdentifier: string;
}

/**
 * Compara el `system_identifier` real de dos conexiones (obtenido por quien llama vía
 * `select system_identifier::text from pg_control_system()`, no por este módulo — puro,
 * sin `pg`). Única forma fiable de confirmar que una conexión "administrativa" (p. ej. a
 * la base de mantenimiento `postgres`) y una conexión "candidata" (a la base del spike)
 * pertenecen al MISMO clúster físico de PostgreSQL — compartir solo el nombre de la base
 * nunca es suficiente (hallazgo 1, segunda ronda).
 */
export function verifySameServer(adminIdentity: ServerIdentity, targetIdentity: ServerIdentity): LabTargetVerification {
  if (adminIdentity.systemIdentifier !== targetIdentity.systemIdentifier) {
    return {
      ok: false,
      reasons: [`admin_and_target_different_server:${adminIdentity.systemIdentifier}!=${targetIdentity.systemIdentifier}`],
    };
  }
  return { ok: true, reasons: [] };
}

/**
 * Verifica, contra la propia conexión dada (debe apuntar ya a la base candidata — este
 * módulo nunca decide a qué base conectarse), que es realmente la base reservada del
 * laboratorio: nombre correcto Y marcador de procedencia presente. No emite ninguna
 * sentencia de escritura/DDL: solo SELECT de solo lectura contra catálogos y la tabla
 * marcadora. Nunca tiene una excepción "solo por nombre": si la fila marcadora no está,
 * se rechaza, sin importar si el nombre coincide.
 */
export async function verifyLabTarget(conn: QueryableConnection): Promise<LabTargetVerification> {
  const reasons: string[] = [];

  const dbRow = await conn.query<{ db: string }>('select current_database() as db');
  const actualDatabaseName = dbRow.rows[0]?.db ?? null;
  if (actualDatabaseName === null || FORBIDDEN_DATABASE_NAMES.has(actualDatabaseName)) {
    return { ok: false, reasons: [`refusing_system_database:${actualDatabaseName}`] };
  }
  if (actualDatabaseName !== SPIKE_DATABASE_NAME) {
    return { ok: false, reasons: [`unexpected_database:${actualDatabaseName}`] };
  }

  let markerRow: { rows: Array<{ created_for: string }> };
  try {
    markerRow = await conn.query<{ created_for: string }>(
      `select created_for from "${SPIKE_MARKER_TABLE}" limit 1`,
    );
  } catch {
    return { ok: false, reasons: ['marker_table_missing_or_unreadable'] };
  }
  if (markerRow.rows.length === 0) {
    reasons.push('marker_row_missing');
  } else if (markerRow.rows[0]?.created_for !== SPIKE_MARKER_VALUE) {
    reasons.push('marker_value_mismatch');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Escribe la fila marcadora de procedencia. **La única función de todo el laboratorio que
 * escribe algo en lab-target.ts.** Debe llamarse EXCLUSIVAMENTE justo después de que un
 * `CREATE DATABASE` del nombre reservado (`SPIKE_DATABASE_NAME`) haya tenido éxito de
 * verdad, sobre una conexión recién abierta hacia esa base concreta — nunca sobre una base
 * que pudiera haber existido de antes: si `CREATE DATABASE` falla porque ya existe (el
 * comportamiento normal de Postgres: no hay `CREATE DATABASE IF NOT EXISTS`), el código
 * que llama a esta función nunca se alcanza (ver database.ts#createSpikeDatabaseIfMatching).
 * Esa es la "evidencia de creación controlada" exigida: ninguna base puede tener una marca
 * válida salvo que haya pasado, en este mismo proceso, por un `CREATE DATABASE` que
 * realmente tuvo éxito.
 */
export async function markLabTargetAsCreated(conn: QueryableConnection): Promise<void> {
  await conn.query(`create table if not exists "${SPIKE_MARKER_TABLE}" (created_for text primary key)`);
  await conn.query(
    `insert into "${SPIKE_MARKER_TABLE}" (created_for) values ($1) on conflict (created_for) do nothing`,
    [SPIKE_MARKER_VALUE],
  );
}

/** Lanza si la verificación no pasó — para usar como guarda obligatoria antes de cualquier
 * seed/DDL/alteración de políticas/terminación de conexiones/borrado. */
export function assertLabTargetAuthorized(verification: LabTargetVerification): void {
  if (!verification.ok) {
    throw new Error(`Refusing to operate on unauthorized target: ${verification.reasons.join(', ')}`);
  }
}
