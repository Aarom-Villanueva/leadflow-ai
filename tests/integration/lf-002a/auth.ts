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
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Pool, PoolClient } from 'pg';

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

export interface QueryTrace {
  /** SQL real tal como se envió, sin valores de parámetros — nunca material de sesión. */
  readonly sql: string;
  /** Backend físico que ejecutó la consulta (ver database.ts:getBackendIdentity). */
  readonly backendPid: number;
  /** Clasificación por inspección del propio texto SQL, nunca por suposición (P13). */
  readonly classification: 'tenant' | 'global';
}

export interface AuthInstrumentation {
  readonly traces: QueryTrace[];
}

const TENANT_COLUMN_PATTERN = /\b(tenant_id|organization_id)\b/i;

/**
 * Crea una instancia de Better Auth instrumentada sobre el pool dado. Cada consulta real
 * que el adaptador Drizzle emite en una conexión física del pool queda registrada (SQL
 * sin valores, backend PID real, clasificación tenant/global) — nunca una afirmación del
 * propio adaptador. Satisface P13 del plan: permite, una vez ejecutado en la fase 2,
 * determinar empíricamente si una llamada de Better Auth comparte el backend físico de
 * una transacción con contexto de tenant ya abierta, en vez de suponerlo.
 *
 * El `secret` y `baseURL` deben venir de configuración de la fase 2 (nunca un valor por
 * defecto aquí) — ver docs/specs/LF-023.md §4.3 sobre el material sintético propuesto.
 */
export function createInstrumentedAuth(pool: Pool, opts: { secret: string; baseURL: string }) {
  const instrumentation: AuthInstrumentation = { traces: [] };

  pool.on('connect', (client: PoolClient) => {
    const backendPid = (client as unknown as { processID?: number }).processID ?? -1;
    const originalQuery = client.query.bind(client);
    (client as unknown as { query: typeof client.query }).query = ((...args: Parameters<typeof client.query>) => {
      const first = args[0];
      const sql = typeof first === 'string' ? first : (first as { text?: string } | undefined)?.text ?? '';
      instrumentation.traces.push({
        sql,
        backendPid,
        classification: TENANT_COLUMN_PATTERN.test(sql) ? 'tenant' : 'global',
      });
      return originalQuery(...args);
    }) as typeof client.query;
  });

  const db = drizzle(pool, { schema: drizzleSchema });

  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: drizzleSchema }),
    secret: opts.secret,
    baseURL: opts.baseURL,
    emailAndPassword: { enabled: true },
  });

  return { auth, instrumentation };
}
