/**
 * Pool, preflight y destino descartable del laboratorio LF-002a/LF-023.
 *
 * Fase 1 (actual): este archivo se escribe y se revisa, pero no se ejecuta — depende de
 * `pg`, que no está instalado todavía (docs/specs/LF-023.md §4.1, pendiente de
 * autorización). No contiene ningún valor de conexión por defecto que apunte a una base
 * real: todo viene de variables de entorno que la fase 2 definiría explícitamente.
 *
 * Nunca se imprime ni se registra una cadena de conexión completa, una contraseña, ni
 * cualquier variable de entorno fuera de las explícitamente usadas aquí.
 *
 * Revisión independiente del PR #19 (hallazgos 1-3): la validación de host y la
 * autorización de destino/preflight ahora se apoyan en módulos puros, sin `pg`, ejecutables
 * y probados ya mismo con dobles (connection-guard.ts, lab-target.ts, preflight-policy.ts).
 * Este archivo queda como el orquestador impuro: solo decide QUÉ consultar y CUÁNDO exigir
 * la verificación antes de escribir, nunca la lógica de decisión en sí.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { assertLocalOnly } from './connection-guard.js';
import {
  SPIKE_DATABASE_NAME,
  SPIKE_RUNTIME_ROLE,
  SPIKE_SCHEMA,
  assertLabTargetAuthorized,
  checkDatabaseNameOnly,
  verifyLabTarget,
} from './lab-target.js';
import {
  evaluatePreflight,
  type PreflightInputs,
  type PreflightResult,
  type PrivilegedMembershipRow,
} from './preflight-policy.js';

export type { PreflightResult } from './preflight-policy.js';

/**
 * Exige una variable de entorno de conexión del spike; si falta, falla con un error (no
 * omite la suite silenciosamente como si fuera verde) — docs/LF-002a-IMPLEMENTATION-PLAN.md
 * §7: "una DB ausente produce resultado bloqueado/exit no exitoso, no tests omitidos
 * presentados como verdes". Tres variables distintas: `LF002A_PROVISIONER_URL` (DDL/seed,
 * puede eludir RLS), `LF002A_RUNTIME_URL` (el rol de aplicación que todas las aserciones de
 * aislamiento deben usar), y `LF002A_MAINTENANCE_URL` (una base de mantenimiento, p. ej.
 * `postgres` — nunca la propia base del spike, porque Postgres no permite crear/soltar la
 * base a la que la propia conexión está conectada).
 */
export function requireEnvUrl(
  varName: 'LF002A_PROVISIONER_URL' | 'LF002A_RUNTIME_URL' | 'LF002A_MAINTENANCE_URL',
): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(
      `${varName} no está configurado: este laboratorio exige PostgreSQL real; ` +
        'la suite falla, nunca se omite silenciosamente.',
    );
  }
  return value;
}

export interface SpikeDatabaseConfig {
  /** Cadena de conexión completa; debe apuntar solo a loopback local (ver assertLocalOnly
   * en connection-guard.ts). Nunca incluye el nombre de la base esperada ni el rol como
   * "prueba" de nada: ambos son constantes únicas en lab-target.ts, nunca parámetros. */
  readonly connectionString: string;
  /** Tamaño máximo del pool. 1 fuerza la reutilización de la misma conexión física (P07/P08);
   * un valor mayor habilita las pruebas de concurrencia real (P09/P13). Sin valor por
   * defecto implícito aquí: cada prueba lo fija explícitamente según qué esté verificando. */
  readonly maxConnections: number;
}

export function createSpikePool(config: SpikeDatabaseConfig): Pool {
  assertLocalOnly(config.connectionString);
  const pool = new Pool({ connectionString: config.connectionString, max: config.maxConnections });
  // Un cliente ocioso del pool puede perder su conexión física del lado del servidor sin
  // que esta aplicación haga nada (p. ej. P16 llama a pg_terminate_backend sobre todos los
  // backends de la base del spike antes de borrarla). `pg.Pool` emite 'error' en ese caso;
  // sin un listener, Node trata ese evento como una excepción no capturada y puede matar
  // el proceso de pruebas entero. El error real de cada operación concreta ya se propaga
  // por su propia llamada a `.query()`/`.connect()`; aquí solo se evita el crash global.
  pool.on('error', () => {});
  return pool;
}

/**
 * Comprueba, contra la base candidata misma (nunca por una cadena que el propio llamador
 * controle), que es realmente la base reservada del laboratorio antes de cualquier
 * seed/DDL. A diferencia del diseño anterior, no acepta un "nombre esperado" como
 * parámetro: usa siempre la única constante `SPIKE_DATABASE_NAME`/el marcador de
 * procedencia de lab-target.ts. Lanza si no está autorizado.
 */
async function assertAuthorizedLabTarget(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    assertLabTargetAuthorized(await verifyLabTarget(client));
  } finally {
    client.release();
  }
}

/**
 * Chequeo más ligero, solo por nombre, para la primera aplicación de schema.sql sobre una
 * base recién creada que todavía no puede tener la fila marcadora (exigirla aquí sería
 * circular: nadie la ha escrito todavía). Nunca sustituye a `assertAuthorizedLabTarget`
 * para operaciones posteriores.
 */
async function assertCandidateDatabaseNameOnly(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const dbRow = await client.query<{ db: string }>('select current_database() as db');
    assertLabTargetAuthorized(checkDatabaseNameOnly(dbRow.rows[0]?.db ?? null));
  } finally {
    client.release();
  }
}

/**
 * Aplica tests/integration/lf-002a/schema.sql tal cual está en disco — la fuente única de
 * verdad del DDL del laboratorio, incluida la fila marcadora de procedencia y los
 * GRANT/REVOKE del rol runtime — en vez de transcribirlo a una cadena separada en TS, para
 * que ambos nunca puedan divergir. Exige primero que el destino sea, al menos por nombre,
 * la base candidata correcta (ver `assertCandidateDatabaseNameOnly`: la verificación
 * completa por marcador no aplica aquí porque la primera aplicación es precisamente lo que
 * escribe ese marcador). Es también la operación segura para RE-aplicar GRANT/REVOKE tras
 * un ciclo de borrado/recreación (P16): toda su DDL usa `if not exists`/es idempotente.
 */
export async function applySchemaSql(pool: Pool): Promise<void> {
  await assertCandidateDatabaseNameOnly(pool);
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

/**
 * Preflight real: identidad CONECTADA (current_user/session_user), no un nombre que
 * llegue por configuración; propiedad y estado de RLS del objeto exacto
 * `SPIKE_SCHEMA.tenant_probe`; cada política con sus roles/comando/condiciones
 * USING/WITH CHECK (detecta políticas permisivas sin condición de tenant verificable, no
 * solo cuenta filas); grants en exceso (TRUNCATE/TRIGGER/REFERENCES) sobre el rol conectado
 * o PUBLIC; y roles heredados que fueran superusuario/BYPASSRLS/propietarios de la tabla.
 * Orquesta las consultas (impuro); toda la decisión vive en preflight-policy.ts (puro,
 * probado ya con filas fabricadas — ver tests/unit/lf-002a/preflight-policy.test.ts).
 */
export async function runPreflight(pool: Pool): Promise<PreflightResult> {
  const client = await pool.connect();
  try {
    const dbRow = await client.query<{ db: string }>('select current_database() as db');
    const actualDatabaseName = dbRow.rows[0]?.db ?? null;
    if (actualDatabaseName !== SPIKE_DATABASE_NAME) {
      // Destino equivocado: no tiene sentido seguir consultando roles/políticas de una
      // base que no es la del spike. Igual que antes: fallar cerrado de inmediato.
      return evaluatePreflight(
        baseInputs({ actualDatabaseName, identity: null, roleAttributes: null, ownership: null, rlsStatus: null, policies: [], excessGrants: [], privilegedMemberships: [] }),
      );
    }

    const identityRow = await client.query<{ current_user: string; session_user: string }>(
      'select current_user, session_user',
    );
    const identity = identityRow.rows[0]
      ? { currentUser: identityRow.rows[0].current_user, sessionUser: identityRow.rows[0].session_user }
      : null;

    const roleRow = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolname, rolsuper, rolbypassrls from pg_roles where rolname = $1',
      [identity?.currentUser ?? SPIKE_RUNTIME_ROLE],
    );
    const roleAttributes = roleRow.rows[0] ?? null;

    const ownerRow = await client.query<{ schemaname: string; tablename: string; tableowner: string }>(
      `select n.nspname as schemaname, c.relname as tablename, pg_get_userbyid(c.relowner) as tableowner
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relname = 'tenant_probe'`,
      [SPIKE_SCHEMA],
    );
    const ownership = ownerRow.rows[0]
      ? { schemaName: ownerRow.rows[0].schemaname, tableName: ownerRow.rows[0].tablename, tableOwner: ownerRow.rows[0].tableowner }
      : null;

    const rlsRow = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relrowsecurity, c.relforcerowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relname = 'tenant_probe'`,
      [SPIKE_SCHEMA],
    );
    const rlsStatus = rlsRow.rows[0] ?? null;

    const policyRows = await client.query<{
      policyname: string;
      permissive: 'PERMISSIVE' | 'RESTRICTIVE';
      roles: string[];
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select policyname, permissive, roles, cmd, qual, with_check
       from pg_policies where schemaname = $1 and tablename = 'tenant_probe'`,
      [SPIKE_SCHEMA],
    );
    const policies = policyRows.rows.map((row) => ({
      policyName: row.policyname,
      permissive: row.permissive === 'PERMISSIVE',
      roles: row.roles,
      cmd: (row.cmd === '*' ? 'ALL' : row.cmd) as PreflightInputs['policies'][number]['cmd'],
      usingExpr: row.qual,
      withCheckExpr: row.with_check,
    }));

    const grantRows = await client.query<{ privilege_type: string; grantee: string }>(
      `select privilege_type, grantee from information_schema.role_table_grants
       where table_schema = $1 and table_name = 'tenant_probe'
         and grantee in ($2, 'PUBLIC')
         and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')`,
      [SPIKE_SCHEMA, identity?.currentUser ?? SPIKE_RUNTIME_ROLE],
    );
    const excessGrants = grantRows.rows.map((row) => ({ privilegeType: row.privilege_type, grantee: row.grantee }));

    const membershipRows = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `with recursive role_membership as (
         select roleid from pg_auth_members where member = (select oid from pg_roles where rolname = $1)
         union
         select m.roleid from pg_auth_members m
         join role_membership rm on m.member = rm.roleid
       )
       select r.rolname, r.rolsuper, r.rolbypassrls
       from role_membership rm
       join pg_roles r on r.oid = rm.roleid`,
      [identity?.currentUser ?? SPIKE_RUNTIME_ROLE],
    );
    const privilegedMemberships: PrivilegedMembershipRow[] = [];
    for (const row of membershipRows.rows) {
      if (row.rolsuper) privilegedMemberships.push({ inheritedRole: row.rolname, reason: 'superuser' });
      if (row.rolbypassrls) privilegedMemberships.push({ inheritedRole: row.rolname, reason: 'bypassrls' });
      if (ownership && row.rolname === ownership.tableOwner) {
        privilegedMemberships.push({ inheritedRole: row.rolname, reason: 'table_owner' });
      }
    }

    return evaluatePreflight(
      baseInputs({ actualDatabaseName, identity, roleAttributes, ownership, rlsStatus, policies, excessGrants, privilegedMemberships }),
    );
  } finally {
    client.release();
  }
}

function baseInputs(partial: Omit<PreflightInputs, 'expectedDatabaseName' | 'expectedRuntimeRole' | 'expectedSchema' | 'expectedTable'>): PreflightInputs {
  return {
    expectedDatabaseName: SPIKE_DATABASE_NAME,
    expectedRuntimeRole: SPIKE_RUNTIME_ROLE,
    expectedSchema: SPIKE_SCHEMA,
    expectedTable: 'tenant_probe',
    ...partial,
  };
}

export interface BackendIdentity {
  readonly backendPid: number;
}

/** Identidad real del backend de una conexión concreta — para P07/P08 (confirmar reutilización
 * real, no asumida, del mismo backend físico bajo un pool de una sola conexión). */
export async function getBackendIdentity(client: PoolClient): Promise<BackendIdentity> {
  const result = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
  return { backendPid: result.rows[0].pid };
}

/**
 * Crea la única base reservada del laboratorio. Ya no acepta un nombre como parámetro — el
 * hallazgo 2 de la revisión mostró que dos cadenas provistas por quien llama, comparadas
 * entre sí, nunca son prueba de autorización. Quitar el parámetro por completo cierra ese
 * vector: no hay nada que un llamador pueda hacer coincidir consigo mismo. `adminPool` debe
 * apuntar a una base de mantenimiento (p. ej. `postgres`), nunca a la propia base del
 * spike (Postgres no permite crear/soltar la base a la que la conexión está conectada).
 */
export async function createSpikeDatabaseIfMatching(adminPool: Pool): Promise<void> {
  const client = await adminPool.connect();
  try {
    const dbRow = await client.query<{ db: string }>('select current_database() as db');
    if (dbRow.rows[0]?.db === SPIKE_DATABASE_NAME) {
      throw new Error('adminPool must connect to a maintenance database, never the spike database itself');
    }
    await client.query(`create database "${SPIKE_DATABASE_NAME}"`);
  } finally {
    client.release();
  }
}

/**
 * Destruye únicamente la base reservada del laboratorio, y solo tras verificar, por una
 * conexión real a la base candidata (`targetConnectionString`), que es realmente esa base:
 * nombre Y fila marcadora de procedencia (`verifyLabTarget`/`lab-target.ts`) — nunca una
 * comparación de dos cadenas provistas por quien llama (el hallazgo 2 exacto: un doble
 * local confirmó que `dropSpikeDatabaseIfMatching(pool, "postgres", "postgres")` se
 * aceptaba con el diseño anterior). `adminPool` debe apuntar a una base de mantenimiento,
 * nunca a la propia base del spike.
 */
export async function dropSpikeDatabaseIfMatching(adminPool: Pool, targetConnectionString: string): Promise<void> {
  const targetPool = createSpikePool({ connectionString: targetConnectionString, maxConnections: 1 });
  try {
    await assertAuthorizedLabTarget(targetPool);
  } finally {
    await targetPool.end();
  }

  const client = await adminPool.connect();
  try {
    const dbRow = await client.query<{ db: string }>('select current_database() as db');
    if (dbRow.rows[0]?.db === SPIKE_DATABASE_NAME) {
      throw new Error('adminPool must connect to a maintenance database, never the spike database itself');
    }
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [SPIKE_DATABASE_NAME],
    );
    await client.query(`drop database if exists "${SPIKE_DATABASE_NAME}"`);
  } finally {
    client.release();
  }
}
