/**
 * Fuente única de verdad del destino autorizado del laboratorio LF-002a/LF-023, y
 * verificación de procedencia real antes de cualquier operación destructiva o de
 * escritura de esquema — hallazgo 2 de la revisión independiente del PR #19.
 *
 * El diseño anterior de `dropSpikeDatabaseIfMatching` aceptaba dos cadenas provistas por
 * quien llama (`expectedDatabaseName`, `confirmedDatabaseName`) y solo comparaba que
 * fueran iguales entre sí. Un doble local demostró el fallo exacto: si ambos argumentos
 * son `"postgres"`, la función los acepta como "coincidentes" y procede — dos cadenas
 * iguales nunca son, por sí solas, prueba de autorización, sobre todo cuando ambas las
 * controla la misma llamada.
 *
 * Este módulo corrige eso de dos maneras:
 * 1. El nombre esperado deja de ser un parámetro: es una única constante exportada
 *    (`SPIKE_DATABASE_NAME`), para que nunca pueda compararse contra sí misma por error.
 * 2. Antes de cualquier operación destructiva, se exige una comprobación de PROCEDENCIA
 *    real contra el propio servidor: además de `current_database() = SPIKE_DATABASE_NAME`,
 *    se exige una fila marcadora (`SPIKE_MARKER_TABLE`/`SPIKE_MARKER_VALUE`) que solo la
 *    propia inicialización de este laboratorio (`schema.sql`, aplicado por
 *    `applySchemaSql` en database.ts) habría escrito. Una base preexistente, ajena, que
 *    coincidiera por casualidad en el nombre nunca tendría esa fila — se rechaza.
 * 3. Las bases de sistema (`postgres`, `template0`, `template1`) se rechazan siempre,
 *    incluso si por un error futuro `SPIKE_DATABASE_NAME` llegara a coincidir con una
 *    (chequeo en tiempo de módulo, no solo en tiempo de ejecución).
 *
 * Puro, sin importaciones externas: `QueryableConnection` es la única superficie que este
 * módulo necesita de una conexión real (`pg.PoolClient`/`pg.Pool` la satisfacen
 * estructuralmente, ya que ambos exponen `.query(sql, params)` devolviendo
 * `{rows, rowCount}` — pero este módulo nunca importa `pg`), así que es ejecutable y
 * probable ahora mismo con dobles de prueba, sin instalar nada
 * (ver tests/unit/lf-002a/lab-target.test.ts).
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

/**
 * Chequeo puro, solo por nombre (sin conexión ni marcador): la base candidata para
 * CREATE DATABASE o para la primera aplicación de schema.sql sobre una base recién creada
 * (que todavía no puede tener la fila marcadora — sería circular exigirla ahí). Nunca
 * sustituye a `verifyLabTarget` para operaciones posteriores (seed, DDL repetido,
 * alteración de políticas, DROP): esas exigen también el marcador de procedencia.
 */
export function checkDatabaseNameOnly(actualDatabaseName: string | null): LabTargetVerification {
  if (actualDatabaseName === null || FORBIDDEN_DATABASE_NAMES.has(actualDatabaseName)) {
    return { ok: false, reasons: [`refusing_system_database:${actualDatabaseName}`] };
  }
  if (actualDatabaseName !== SPIKE_DATABASE_NAME) {
    return { ok: false, reasons: [`unexpected_database:${actualDatabaseName}`] };
  }
  return { ok: true, reasons: [] };
}

/**
 * Verifica, contra la propia conexión dada (debe apuntar ya a la base candidata — este
 * módulo nunca decide a qué base conectarse), que es realmente la base reservada del
 * laboratorio: nombre correcto Y marcador de procedencia presente. No emite ninguna
 * sentencia de escritura/DDL: solo SELECT de solo lectura contra catálogos y la tabla
 * marcadora.
 */
export async function verifyLabTarget(conn: QueryableConnection): Promise<LabTargetVerification> {
  const reasons: string[] = [];

  const dbRow = await conn.query<{ db: string }>('select current_database() as db');
  const nameCheck = checkDatabaseNameOnly(dbRow.rows[0]?.db ?? null);
  if (!nameCheck.ok) return nameCheck;

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

/** Lanza si la verificación no pasó — para usar como guarda obligatoria antes de cualquier
 * seed/DDL/alteración de políticas/terminación de conexiones/borrado. */
export function assertLabTargetAuthorized(verification: LabTargetVerification): void {
  if (!verification.ok) {
    throw new Error(`Refusing to operate on unauthorized target: ${verification.reasons.join(', ')}`);
  }
}
