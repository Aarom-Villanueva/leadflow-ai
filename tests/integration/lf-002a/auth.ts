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
 * eso no demuestra qué TABLA toca una consulta (una consulta podría mencionar esas
 * palabras en un comentario, un alias, o ni mencionarlas y aun así tocar `tenant_probe`),
 * ni si comparte transacción con un contexto de tenant ya abierto. Ahora: (a) se extraen
 * los nombres de tabla realmente referenciados (FROM/INTO/UPDATE/TABLE/JOIN) contra el
 * conjunto CERRADO de tablas del laboratorio, nunca una heurística de subcadena; (b) se
 * instrumentan también los marcadores BEGIN/COMMIT/ROLLBACK y se asigna un identificador
 * de transacción real (`backendPid:secuencia`) a cada consulta, para poder comprobar
 * verificablemente si una consulta cayó dentro de una transacción de tenant ya abierta,
 * no solo clasificar su texto de forma aislada.
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

export interface QueryTrace {
  /** SQL real tal como se envió, sin valores de parámetros — nunca material de sesión. */
  readonly sql: string;
  /** Backend físico que ejecutó la consulta (ver database.ts:getBackendIdentity). */
  readonly backendPid: number;
  /** Identificador real de transacción: `${backendPid}:${secuencia}`, incrementado en cada
   * BEGIN visto en ESTE backend. Dos trazas con el mismo transactionId corrieron dentro de
   * la misma transacción explícita en la misma conexión física — verificable, no supuesto. */
  readonly transactionId: string;
  /** Si esta traza ES un marcador de límite transaccional, cuál. */
  readonly marker: TransactionMarker;
  readonly classification: QueryClassification;
}

export interface AuthInstrumentation {
  readonly traces: QueryTrace[];
}

interface ClientTxnState {
  readonly backendPid: number;
  txnSeq: number;
}

/** Envuelve `client.query` para registrar cada consulta real con su backend, su
 * transactionId real (ver arriba), su marcador de límite transaccional si aplica, y su
 * clasificación por tabla referenciada. Compartido por el pool entero
 * (`createInstrumentedAuth`) y por un cliente ya existente de una sola conexión
 * (`createClientScopedAuth`, P13: frontera transaccional compartida). */
function instrumentClient(client: PoolClient, instrumentation: AuthInstrumentation): void {
  const backendPid = (client as unknown as { processID?: number }).processID ?? -1;
  const state: ClientTxnState = { backendPid, txnSeq: 0 };
  const originalQuery = client.query.bind(client);
  (client as unknown as { query: typeof client.query }).query = ((...args: Parameters<typeof client.query>) => {
    const first = args[0];
    const sql = typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text ?? '';
    const marker = sqlMarker(sql);
    if (marker === 'begin') state.txnSeq += 1;
    instrumentation.traces.push({
      sql,
      backendPid,
      transactionId: `${backendPid}:${state.txnSeq}`,
      marker,
      classification: marker ? 'other' : classifyQuery(sql),
    });
    return originalQuery(...args);
  }) as typeof client.query;
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
