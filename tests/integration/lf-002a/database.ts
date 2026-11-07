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
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

/**
 * Exige una variable de entorno de conexión del spike; si falta, falla con un error (no
 * omite la suite silenciosamente como si fuera verde) — docs/LF-002a-IMPLEMENTATION-PLAN.md
 * §7: "una DB ausente produce resultado bloqueado/exit no exitoso, no tests omitidos
 * presentados como verdes". Dos roles separados exigen dos variables distintas:
 * `LF002A_PROVISIONER_URL` (DDL/seed, puede eludir RLS) y `LF002A_RUNTIME_URL` (el rol de
 * aplicación que todas las aserciones de aislamiento deben usar). `LF002A_MAINTENANCE_URL`
 * es una tercera, distinta de ambas: apunta a una base de mantenimiento (p. ej. `postgres`),
 * nunca a la propia base del spike, porque Postgres no permite crear/soltar la base a la
 * que la propia conexión está conectada (P16: ciclo real de borrado/recreación).
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
  /** Cadena de conexión completa; debe apuntar solo a loopback/socket local (ver assertLocalOnly). */
  readonly connectionString: string;
  /** Nombre exacto de la base descartable del spike. Toda operación destructiva lo verifica primero. */
  readonly expectedDatabaseName: string;
  /** Rol de runtime esperado (no superusuario, sin BYPASSRLS, sin ser propietario de las tablas). */
  readonly runtimeRole: string;
  /** Tamaño máximo del pool. 1 fuerza la reutilización de la misma conexión física (P07/P08);
   * un valor mayor habilita las pruebas de concurrencia real (P09). Sin valor por defecto implícito
   * aquí: cada prueba lo fija explícitamente según qué esté verificando. */
  readonly maxConnections: number;
}

/**
 * Falla cerrado ante cualquier host que no sea loopback/socket local — nunca una base
 * remota, incluso si alguien la pasara por variable de entorno (docs/LF-002a-IMPLEMENTATION-PLAN.md §3:
 * "accesible solo por loopback o socket local").
 */
export function assertLocalOnly(connectionString: string): void {
  const url = new URL(connectionString);
  const host = url.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  if (!isLoopback) {
    throw new Error(`Refusing non-local database host for the LF-002a spike: "${host}"`);
  }
}

export function createSpikePool(config: SpikeDatabaseConfig): Pool {
  assertLocalOnly(config.connectionString);
  return new Pool({ connectionString: config.connectionString, max: config.maxConnections });
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

/**
 * Comprueba, desde la propia base (nunca desde una variable que "diga" ser el rol de
 * runtime), que el destino es exactamente el esperado y que el rol de runtime no puede
 * eludir RLS por ninguna de las dos vías reales: ser superusuario/BYPASSRLS, o ser
 * propietario de la tabla protegida (los propietarios de tabla ignoran RLS por defecto,
 * incluso sin BYPASSRLS — por eso se comprueban ambas, no solo el atributo del rol).
 * P01 del plan. Un preflight fallido detiene todo lo demás: nunca se siguen ejecutando
 * los casos negativos sobre un destino o un rol que no se confirmaron seguros primero.
 */
export async function runPreflight(pool: Pool, config: Pick<SpikeDatabaseConfig, 'expectedDatabaseName' | 'runtimeRole'>): Promise<PreflightResult> {
  const reasons: string[] = [];
  const client = await pool.connect();
  try {
    const dbRow = await client.query<{ db: string }>('select current_database() as db');
    const actualDb = dbRow.rows[0]?.db;
    if (actualDb !== config.expectedDatabaseName) {
      // Destino equivocado: no tiene sentido seguir inspeccionando roles/políticas de una
      // base que no es la del spike. Fallar cerrado de inmediato.
      return { ok: false, reasons: [`unexpected_database:${actualDb ?? 'unknown'}`] };
    }

    const roleRow = await client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper, rolbypassrls from pg_roles where rolname = $1',
      [config.runtimeRole],
    );
    if (roleRow.rowCount === 0) {
      reasons.push('runtime_role_missing');
    } else {
      if (roleRow.rows[0].rolsuper) reasons.push('runtime_role_is_superuser');
      if (roleRow.rows[0].rolbypassrls) reasons.push('runtime_role_has_bypassrls');
    }

    const ownerRow = await client.query<{ tableowner: string }>(
      `select tableowner from pg_tables where schemaname = 'public' and tablename = 'tenant_probe'`,
    );
    if (ownerRow.rowCount === 0) {
      reasons.push('tenant_probe_missing');
    } else if (ownerRow.rows[0].tableowner === config.runtimeRole) {
      reasons.push('runtime_role_owns_tenant_probe');
    }

    const rlsRow = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'tenant_probe'`,
    );
    if (rlsRow.rowCount === 0 || rlsRow.rows[0].relrowsecurity !== true) {
      reasons.push('rls_not_enabled');
    }

    const policyRow = await client.query<{ n: number }>(
      `select count(*)::int as n from pg_policies where tablename = 'tenant_probe'`,
    );
    if ((policyRow.rows[0]?.n ?? 0) < 1) {
      reasons.push('no_rls_policy');
    }
  } finally {
    client.release();
  }
  return { ok: reasons.length === 0, reasons };
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
 * Destruye únicamente la base identificada en `config.expectedDatabaseName`, y solo si
 * coincide exactamente con el nombre pasado aquí — nunca por una variable de entorno
 * arbitraria (docs/LF-002a-IMPLEMENTATION-PLAN.md §3: "una conexión arbitraria
 * suministrada por entorno nunca autoriza borrar una base"). `adminPool` debe apuntar a
 * una base de mantenimiento (p. ej. `postgres`), nunca a la propia base del spike, para
 * poder soltar sus conexiones y dropearla.
 */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export async function dropSpikeDatabaseIfMatching(
  adminPool: Pool,
  expectedDatabaseName: string,
  confirmedDatabaseName: string,
): Promise<void> {
  if (confirmedDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `Refusing to drop "${confirmedDatabaseName}": does not match the identified spike database "${expectedDatabaseName}"`,
    );
  }
  // DROP DATABASE never accepts a parameterized identifier; guard its shape explicitly
  // instead of trusting string interpolation alone.
  if (!SAFE_IDENTIFIER.test(confirmedDatabaseName)) {
    throw new Error(`Refusing to drop database with an unexpected name shape: "${confirmedDatabaseName}"`);
  }
  const client = await adminPool.connect();
  try {
    await client.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [confirmedDatabaseName],
    );
    await client.query(`drop database if exists "${confirmedDatabaseName}"`);
  } finally {
    client.release();
  }
}

/**
 * Contraparte simétrica de `dropSpikeDatabaseIfMatching`, con la misma doble comprobación
 * (coincidencia exacta de nombre + forma de identificador seguro) antes de interpolar en
 * un `CREATE DATABASE`, que tampoco acepta un identificador parametrizado. Usada por P16
 * para recrear, tras el borrado, exactamente la misma base reservada del spike — nunca
 * una base con otro nombre.
 */
export async function createSpikeDatabaseIfMatching(
  adminPool: Pool,
  expectedDatabaseName: string,
  confirmedDatabaseName: string,
): Promise<void> {
  if (confirmedDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `Refusing to create "${confirmedDatabaseName}": does not match the identified spike database "${expectedDatabaseName}"`,
    );
  }
  if (!SAFE_IDENTIFIER.test(confirmedDatabaseName)) {
    throw new Error(`Refusing to create database with an unexpected name shape: "${confirmedDatabaseName}"`);
  }
  const client = await adminPool.connect();
  try {
    await client.query(`create database "${confirmedDatabaseName}"`);
  } finally {
    client.release();
  }
}

/**
 * Aplica tests/integration/lf-002a/schema.sql tal cual está en disco — la fuente única de
 * verdad del DDL del laboratorio — en vez de transcribirlo a una cadena separada en TS,
 * para que ambos nunca puedan divergir. Usado por P16 para confirmar que un ciclo de
 * borrado/recreación produce un esquema idéntico, de forma trazable.
 */
export async function applySchemaSql(pool: Pool): Promise<void> {
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}
