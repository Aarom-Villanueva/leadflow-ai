/**
 * Configuración e instrumentación de Better Auth para el laboratorio LF-002a/LF-023.
 *
 * Fase 1 (actual): escrito y revisado, no ejecutable — depende de `better-auth`,
 * `drizzle-orm` y `pg` (pendientes de autorización, docs/specs/LF-023.md §4.1). Sin
 * proveedores externos: solo `emailAndPassword`, nunca OAuth ni correo real.
 *
 * El esquema Drizzle de abajo coincide exactamente con las columnas que
 * `@better-auth/core@1.7.18` declara en `getAuthTables` — verificado por lectura directa
 * del paquete publicado, no por suposición (docs/specs/LF-023.md §3). Ninguna de estas
 * cuatro tablas tiene `tenant_id`/`organization_id`: son identidad global, nunca sujetas
 * a RLS por tenant.
 *
 * Revisión independiente del PR #19, hallazgo 5: la instrumentación anterior clasificaba
 * cada consulta por si el texto SQL contenía la subcadena `tenant_id`/`organization_id` —
 * eso no demuestra qué TABLA toca una consulta, ni si comparte transacción con un contexto
 * de tenant ya abierto. Ahora se extraen los nombres de tabla realmente referenciados
 * (FROM/INTO/UPDATE/TABLE/JOIN, con o sin esquema — ver query-classifier.ts) contra el
 * conjunto CERRADO de tablas del laboratorio, nunca una heurística de subcadena.
 *
 * Revisión independiente, SEGUNDA ronda (candidato `212e201`), hallazgo 4:
 * - La primera corrección llamaba `transactionId` a una etiqueta puramente de este
 *   proceso (`backendPid:secuencia_local_de_BEGIN`) — eso NO es el identificador de
 *   transacción real de PostgreSQL, y presentarlo como tal sería engañoso. Se renombra a
 *   `observedTransactionSpanId` y se documenta exactamente qué es: un agrupador local
 *   para correlacionar trazas de ESTE proceso, nunca una prueba contra el servidor.
 * - Para una prueba VERIFICABLE de "misma transacción", se captura además
 *   `realTransactionId`: justo tras cada BEGIN, se consulta `pg_current_xact_id()` (función
 *   real de PostgreSQL 13+, documentada, estable) en la MISMA conexión, ESPERANDO esa
 *   consulta antes de devolver el control a quien llamó a `client.query('begin')` — así se
 *   evita una carrera entre "la transacción ya abrió" y "ya se capturó su xid real". Si la
 *   consulta falla (p. ej. una versión de Postgres anterior a la 13, sin esa función —
 *   no verificado en esta fase), `realTransactionId` queda `null` explícitamente, nunca se
 *   inventa un valor.
 * - También se registra el cierre de cada transacción: al ver COMMIT/ROLLBACK, se retrocede
 *   sobre las trazas de ese mismo `observedTransactionSpanId` que seguían `'open'` y se les
 *   asigna `'committed'`/`'rolledback'` — éxito/fallo y cierre quedan registrados, no solo
 *   el propio marcador aislado.
 * Queda pendiente, como el resto de esta fase, confirmar contra PostgreSQL real que
 * `pg_current_xact_id()` se comporta como se espera aquí (fase 2, no ejecutable todavía).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';
import { classifyQuery, sqlMarker, type QueryClassification, type TransactionMarker } from './query-classifier.js';

export const userTable = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTable = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => userTable.id, { onDelete: 'cascade' }),
});

export const accountTable = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => userTable.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const verificationTable = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const drizzleSchema = {
  user: userTable,
  session: sessionTable,
  account: accountTable,
  verification: verificationTable,
};

export type { QueryClassification, TransactionMarker };

export type TransactionOutcome = 'open' | 'committed' | 'rolledback';

export interface QueryTrace {
  /** SQL real tal como se envió, sin valores de parámetros — nunca material de sesión. */
  readonly sql: string;
  /** Backend físico que ejecutó la consulta (ver database.ts:getBackendIdentity). */
  readonly backendPid: number;
  /** Agrupador LOCAL de este proceso: `${backendPid}:${secuencia_de_BEGIN}`. Sirve para
   * correlacionar trazas de la misma instrumentación, pero NO es un identificador de
   * transacción real de PostgreSQL — nunca tratarlo como evidencia contra el servidor;
   * para eso ver `realTransactionId`. */
  readonly observedTransactionSpanId: string;
  /** El `pg_current_xact_id()` real, capturado justo tras el BEGIN de este span en la
   * MISMA conexión (consulta propia de la instrumentación, awaited antes de devolver el
   * control — nunca una carrera). `null` si esa consulta falló (p. ej. versión de
   * PostgreSQL sin esa función, no verificado todavía) o si la traza no pertenece a
   * ningún span con BEGIN observado. Esta es la evidencia VERIFICABLE de "misma
   * transacción"; `observedTransactionSpanId` es solo un agrupador local. */
  realTransactionId: string | null;
  /** Si esta traza ES un marcador de límite transaccional, cuál. */
  readonly marker: TransactionMarker;
  readonly classification: QueryClassification;
  /** Éxito/fallo y cierre del span transaccional al que pertenece esta traza —
   * retroactivamente puesto a 'committed'/'rolledback' cuando se observa el COMMIT/
   * ROLLBACK correspondiente; 'open' mientras la transacción sigue abierta. */
  outcome: TransactionOutcome;
}

export interface AuthInstrumentation {
  readonly traces: QueryTrace[];
}

interface ClientTxnState {
  readonly backendPid: number;
  txnSeq: number;
}

/** Envuelve `client.query` para registrar cada consulta real con su backend, su
 * agrupador local y el xid real de PostgreSQL cuando el span lo tiene, su marcador de
 * límite transaccional si aplica, y su clasificación por tabla referenciada. Compartido
 * por el pool entero (`createInstrumentedAuth`) y por un cliente ya existente de una sola
 * conexión (`createClientScopedAuth`, P13: frontera transaccional compartida). */
function instrumentClient(client: PoolClient, instrumentation: AuthInstrumentation): void {
  const backendPid = (client as unknown as { processID?: number }).processID ?? -1;
  const state: ClientTxnState = { backendPid, txnSeq: 0 };
  const originalQuery = client.query.bind(client);
  (client as unknown as { query: typeof client.query }).query = (async (...args: Parameters<typeof client.query>) => {
    const first = args[0];
    const sql = typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text ?? '';
    const marker = sqlMarker(sql);
    if (marker === 'begin') state.txnSeq += 1;
    const spanId = `${backendPid}:${state.txnSeq}`;
    const trace: QueryTrace = {
      sql,
      backendPid,
      observedTransactionSpanId: spanId,
      realTransactionId: null,
      marker,
      classification: marker ? 'other' : classifyQuery(sql),
      outcome: 'open',
    };
    instrumentation.traces.push(trace);

    const result = await originalQuery(...args);

    if (marker === 'begin') {
      // Se espera esta consulta ANTES de devolver el control a quien llamó a
      // `client.query('begin')`, para que el xid real ya esté disponible en cuanto el
      // propio BEGIN se considera terminado — nunca una carrera entre "ya abrió" y "ya se
      // capturó su identificador real".
      try {
        const xidResult = await originalQuery('select pg_current_xact_id()::text as xid');
        trace.realTransactionId = (xidResult as { rows: Array<{ xid: string }> }).rows[0]?.xid ?? null;
      } catch {
        trace.realTransactionId = null;
      }
    } else if (marker === 'commit' || marker === 'rollback') {
      const finalOutcome: TransactionOutcome = marker === 'commit' ? 'committed' : 'rolledback';
      for (const pastTrace of instrumentation.traces) {
        if (pastTrace.observedTransactionSpanId === spanId && pastTrace.outcome === 'open') {
          pastTrace.outcome = finalOutcome;
        }
      }
    }

    return result;
  }) as unknown as typeof client.query;
}

export interface CreateAuthOptions {
  readonly secret: string;
  readonly baseURL: string;
  /**
   * P14 del plan: Better Auth no tiene, en su núcleo, ningún hook documentado que escriba
   * en una tabla de membresías propia de la aplicación — `probe_memberships` es enteramente
   * nuestra, nunca algo que Better Auth conozca nativamente. En vez de inventar un hook que
   * no existe, se conecta la ruta alternativa autorizada: el hook de ciclo de vida
   * `databaseHooks.user.create.after` (superficie estándar y conocida de Better Auth, no
   * verificada todavía contra `1.7.18` instalado — si la forma exacta difiriera, la prueba
   * que la ejercita fallará de forma visible en la fase 2, nunca se declarará pasada sin
   * ejecutarla) invoca este callback, que la prueba implementa usando
   * `withTenantContext`/`authorizeTenantSelection` — nunca una escritura directa sin pasar
   * por el wrapper autorizado.
   */
  readonly onUserCreated?: (user: { readonly id: string }) => Promise<void>;
}

/**
 * Crea una instancia de Better Auth instrumentada sobre el POOL dado: cada conexión física
 * que el pool entrega al adaptador queda instrumentada (vía el evento `connect` del pool).
 * Útil para P10/P11/P12/P13 (caso "no comparten cliente"): el adaptador adquiere sus
 * propias conexiones del pool, normalmente distintas de cualquier conexión que el propio
 * código de prueba tenga ya extraída aparte.
 */
export function createInstrumentedAuth(pool: Pool, opts: CreateAuthOptions) {
  const instrumentation: AuthInstrumentation = { traces: [] };
  pool.on('connect', (client: PoolClient) => instrumentClient(client, instrumentation));

  const db = drizzle(pool, { schema: drizzleSchema });
  const auth = buildAuth(db, opts);
  return { auth, instrumentation };
}

/**
 * Crea una instancia de Better Auth cuyo adaptador Drizzle está ligado a UN CLIENTE YA
 * ADQUIRIDO (`pg.PoolClient`), no al pool entero — P13: la prueba de verdad de si las
 * consultas del adaptador comparten la MISMA conexión/transacción que un contexto de
 * tenant ya abierto en esa conexión. `drizzle-orm/node-postgres` acepta un `Client`/
 * `PoolClient` además de un `Pool` (ambos exponen la misma interfaz `.query()` que su
 * adaptador exige) — superficie estándar, no verificada todavía contra la versión
 * instalada en esta fase. Si el cliente recibido ya tiene su propia instrumentación
 * adjunta (p. ej. por haber pasado antes por `instrumentClient` en otra llamada), no se
 * re-envuelve dos veces.
 */
const INSTRUMENTED_CLIENTS = new WeakSet<PoolClient>();

export function createClientScopedAuth(client: PoolClient, opts: CreateAuthOptions, instrumentation: AuthInstrumentation) {
  if (!INSTRUMENTED_CLIENTS.has(client)) {
    instrumentClient(client, instrumentation);
    INSTRUMENTED_CLIENTS.add(client);
  }
  const db = drizzle(client, { schema: drizzleSchema });
  const auth = buildAuth(db, opts);
  return { auth };
}

function buildAuth(db: ReturnType<typeof drizzle>, opts: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: drizzleSchema }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    emailAndPassword: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string }) => {
            await opts.onUserCreated?.(user);
          },
        },
      },
    },
  });
}
