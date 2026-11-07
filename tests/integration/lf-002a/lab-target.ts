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
 *
 * Revisión independiente, TERCERA ronda (sobre el candidato `bde090b`), hallazgo 1:
 * `database.ts#createSpikeDatabaseIfMatching` comprobaba el MISMO servidor
 * (`verifySameServer`) entre la conexión administrativa y la candidata, pero nunca
 * comprobaba qué base era realmente `targetConnectionStringForNewDb` antes de escribir el
 * marcador — dos bases distintas en el MISMO servidor (p. ej. `postgres` y
 * `lf002a_spike`) comparten `system_identifier` por definición, así que ese chequeo por sí
 * solo no detecta una cadena de conexión mal configurada que apuntara a otra base del
 * mismo clúster. `checkDatabaseNameOnly` vuelve a existir (se había retirado en la segunda
 * ronda al creer que `markLabTargetAsCreated` nunca necesitaría un chequeo "solo por
 * nombre") precisamente para cerrar ese hueco: `createSpikeDatabaseIfMatching` debe
 * comprobar `current_database()` de la conexión que va a marcar, ANTES de marcarla — ver
 * database.ts. A diferencia de la excepción retirada en la segunda ronda (que permitía que
 * CUALQUIER código, incluido `applySchemaSql`, aceptara una base preexistente ajena solo
 * por su nombre), este uso es estrictamente más limitado: solo se invoca dentro de
 * `createSpikeDatabaseIfMatching`, inmediatamente después de un `CREATE DATABASE` propio
 * ya exitoso, nunca como sustituto de `verifyLabTarget` en ningún otro punto.
 *
 * Fase 2 (ejecución real contra PostgreSQL 16, no simulada): el primer intento real de
 * `createSpikeTarget` falló con "permission denied for schema public" al llegar a
 * `markLabTargetAsCreated` — verificado al ejecutarlo, no supuesto. Desde PostgreSQL 15,
 * el esquema `public` de una base nueva ya no concede `CREATE` a `PUBLIC`; sin un `OWNER`
 * explícito, `CREATE DATABASE` deja la base propiedad de la conexión administrativa (p.
 * ej. `postgres`), y `lf002a_provisioner` no tenía privilegio para crear nada en `public`.
 * Se corrigió añadiendo `owner "${SPIKE_PROVISIONER_ROLE}"` al `CREATE DATABASE` — ver más
 * abajo.
 */

export const SPIKE_DATABASE_NAME = 'lf002a_spike';
export const SPIKE_PROVISIONER_ROLE = 'lf002a_provisioner';
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
 * Chequeo puro, solo por nombre (sin marcador): usado EXCLUSIVAMENTE por
 * `database.ts#createSpikeDatabaseIfMatching`, inmediatamente después de un
 * `CREATE DATABASE` propio ya exitoso, para confirmar que la conexión que está a punto de
 * marcar es de verdad la base recién creada — nunca, por ejemplo, la base de mantenimiento
 * `postgres` del mismo servidor por una cadena de conexión mal configurada. No sustituye a
 * `verifyLabTarget` en ningún otro punto: `applySchemaSql`/`seedFixtures`/cualquier
 * escritura posterior siguen exigiendo siempre la verificación completa (nombre +
 * marcador) — este chequeo nunca es una excepción general "por nombre" como la que la
 * segunda ronda de revisión retiró.
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
 * marcadora. Nunca tiene una excepción "solo por nombre": si la fila marcadora no está,
 * se rechaza, sin importar si el nombre coincide.
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

async function queryRealSystemIdentifier(conn: QueryableConnection): Promise<string> {
  const result = await conn.query<{ sysid: string }>(
    'select system_identifier::text as sysid from pg_control_system()',
  );
  const sysid = result.rows[0]?.sysid;
  if (!sysid) throw new Error('pg_control_system() did not return a system_identifier');
  return sysid;
}

export interface OpenedConnection {
  readonly conn: QueryableConnection;
  close(): Promise<void>;
}

/**
 * Secuencia REAL de creación controlada de la base reservada del laboratorio — no una
 * simulación aparte: `database.ts#createSpikeDatabaseIfMatching` es un envoltorio de pocas
 * líneas que le pasa conexiones `pg` reales a ESTA función, así que un doble que se le
 * inyecte aquí ejercita exactamente el código que corre en producción, nunca una copia de
 * su secuencia (hallazgo 1, tercera ronda sobre el candidato `bde090b`).
 *
 * Orden, todo validado ANTES de la única escritura (`markLabTargetAsCreated`) que no sea
 * el propio `CREATE DATABASE`:
 * 1. `adminConn` no está conectada ya a la propia base del spike.
 * 2. `system_identifier` real de `adminConn` (para el paso 5).
 * 3. `CREATE DATABASE` del nombre reservado — la única operación que, si la base ya
 *    existía, lanza y detiene todo lo siguiente (evidencia de creación controlada).
 * 4. Se abre la conexión hacia la base recién creada (`connectToNewDb`) y se comprueba su
 *    `current_database()` real ANTES de nada más — hallazgo 1 exacto: dos bases
 *    DISTINTAS del mismo servidor (p. ej. `postgres` y `lf002a_spike`) comparten
 *    `system_identifier` por definición, así que el chequeo de servidor por sí solo nunca
 *    detecta una cadena de conexión mal configurada que apuntara a la base equivocada.
 * 5. `system_identifier` real de esa conexión, comparado con el de `adminConn`
 *    (`verifySameServer`).
 * 6. Solo si 1, 3, 4 y 5 pasaron: `markLabTargetAsCreated`.
 */
export async function createSpikeTarget(
  adminConn: QueryableConnection,
  connectToNewDb: () => Promise<OpenedConnection>,
): Promise<void> {
  const adminDbRow = await adminConn.query<{ db: string }>('select current_database() as db');
  if (adminDbRow.rows[0]?.db === SPIKE_DATABASE_NAME) {
    throw new Error('adminConn must connect to a maintenance database, never the spike database itself');
  }
  const adminSystemIdentifier = await queryRealSystemIdentifier(adminConn);

  // OWNER explícito (hallazgo real de la fase 2, verificado al ejecutarlo contra
  // PostgreSQL 16 real, no supuesto): sin esto, la base queda propiedad del rol
  // administrativo (p. ej. `postgres`), y desde PostgreSQL 15 el esquema `public` de una
  // base nueva YA NO concede CREATE a PUBLIC — `lf002a_provisioner` recibía
  // "permission denied for schema public" al intentar la primera escritura
  // (`markLabTargetAsCreated`/`applySchemaSql`). Hacer a `lf002a_provisioner` propietario
  // de la base le da, por la pertenencia implícita a `pg_database_owner` dentro de ESA
  // base, los privilegios que necesita sobre `public` sin una concesión aparte.
  await adminConn.query(`create database "${SPIKE_DATABASE_NAME}" owner "${SPIKE_PROVISIONER_ROLE}"`);

  const { conn: newDbConn, close } = await connectToNewDb();
  try {
    const newDbRow = await newDbConn.query<{ db: string }>('select current_database() as db');
    assertLabTargetAuthorized(checkDatabaseNameOnly(newDbRow.rows[0]?.db ?? null));

    const targetSystemIdentifier = await queryRealSystemIdentifier(newDbConn);
    assertLabTargetAuthorized(
      verifySameServer({ systemIdentifier: adminSystemIdentifier }, { systemIdentifier: targetSystemIdentifier }),
    );

    await markLabTargetAsCreated(newDbConn);
  } finally {
    await close();
  }
}
