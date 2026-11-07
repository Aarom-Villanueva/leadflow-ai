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
 * Revisión independiente, SEGUNDA ronda (candidato `212e201`), hallazgo 4: se introdujo
 * `observedTransactionSpanId` (agrupador LOCAL de este proceso, nunca un identificador de
 * transacción real) y `realTransactionId` (el `pg_current_xact_id()` real, capturado tras
 * cada BEGIN). La TERCERA ronda (candidato `bde090b`, hallazgo 2) encontró que esa primera
 * versión tenía tres bugs reales — detalle completo y la corrección en
 * transaction-instrumentation.ts, donde ahora vive toda esta lógica (extraída para que sea
 * ejecutable y probada con un doble inyectado, sin `pg`, en
 * tests/unit/lf-002a/transaction-instrumentation.test.ts). Este archivo solo instrumenta
 * conexiones `pg.PoolClient` reales llamando a esa función pura.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';
import {
  instrumentConnection,
  type AuthInstrumentation,
  type QueryClassification,
  type QueryTrace,
  type TransactionMarker,
  type TransactionOutcome,
} from './transaction-instrumentation.js';

export type { AuthInstrumentation, QueryClassification, QueryTrace, TransactionMarker, TransactionOutcome };

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

/** Envuelve `client.query` instrumentando la conexión real vía `instrumentConnection`
 * (transaction-instrumentation.ts — toda la lógica de decisión vive allí, pura y probada
 * con un doble). Compartido por el pool entero (`createInstrumentedAuth`) y por un cliente
 * ya existente de una sola conexión (`createClientScopedAuth`, P13: frontera transaccional
 * compartida). */
function instrumentClient(client: PoolClient, instrumentation: AuthInstrumentation): void {
  instrumentConnection(client as unknown as Parameters<typeof instrumentConnection>[0], instrumentation);
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
