/**
 * Casos P10–P14 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): estados de sesión reales
 * de Better Auth, estados de membresía, selección de tenant, frontera transaccional real
 * del adaptador, y la ruta de membresía elegida. P01 (preflight) es precondición
 * obligatoria de `beforeAll`, no un caso de prueba independiente — igual que en
 * isolation.test.ts.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — misma exigencia que
 * isolation.test.ts (variables de entorno reales, sin omitir en silencio).
 *
 * Revisión independiente del PR #19:
 * - Hallazgo 4: ya no se construyen sesiones a mano (`{userId, status: 'expired'}`
 *   declarado por la propia prueba). Cada estado (válida/inválida/expirada/revocada) se
 *   produce manipulando una sesión REAL emitida por `auth.api.signUpEmail` y se verifica
 *   siempre con una llamada REAL a `auth.api.getSession`, nunca una etiqueta inventada.
 *   Resultado y errores de cada llamada se comprueban explícitamente, nunca se ignoran.
 * - Hallazgo 5: P13 usa `createClientScopedAuth` para demostrar, con el backend/
 *   transactionId REAL de la instrumentación (auth.ts/query-classifier.ts), si las
 *   consultas del adaptador comparten la misma transacción que un contexto de tenant ya
 *   abierto en la MISMA conexión — y, por separado, confirma que el caso normal (pool
 *   compartido, sin compartir cliente deliberadamente) nunca las mezcla, sin arriesgar un
 *   deadlock del pool (ver comentarios en cada escenario).
 * - Hallazgo 5 (P14): se conecta `databaseHooks.user.create.after` (ver auth.ts) a una
 *   escritura de membresía autorizada vía `withTenantContext` — nunca una escritura directa
 *   sin pasar por el wrapper — y se confirma POSITIVAMENTE que la fila quedó creada con el
 *   tenant correcto, no solo que "ninguna consulta tocó probe_memberships" (esa
 *   comprobación por sí sola no demuestra cobertura suficiente).
 *
 * Advertencia explícita (a diferencia del esquema de tablas, verificado por lectura
 * directa del código fuente — docs/specs/LF-023.md §3): la forma exacta de la API de
 * servidor de `better-auth@1.7.18` (`auth.api.signUpEmail`/`getSession`/`signOut`, y el
 * formato de cabecera que `getSession` espera para un token de sesión) se escribió según
 * el patrón público conocido de Better Auth, pero **no se verificó ejecutándola** contra
 * el paquete instalado, porque no está instalado en esta fase. Si la fase 2 encuentra una
 * forma distinta, este archivo debe corregirse para usar la real — nunca inventar un
 * resultado sin haberlo ejecutado.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Pool } from 'pg';
import { createSpikePool, requireEnvUrl, runPreflight } from './database.js';
import { authorizeTenantSelection, deriveSessionVerificationOutcome, withTenantContext } from './tenant-context.js';
import { createClientScopedAuth, createInstrumentedAuth, type AuthInstrumentation } from './auth.js';
import { assertSeedSanity, seedFixtures } from './seed.js';
import { TENANT_A, TENANT_B } from './fixtures.js';

function requireAuthSecret(): string {
  const secret = process.env.LF002A_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'LF002A_AUTH_SECRET no está configurado: material sintético efímero de la fase 2 ' +
        '(docs/specs/LF-023.md §4.3) — nunca un valor por defecto aquí.',
    );
  }
  return secret;
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

function syntheticPassword(): string {
  return 'synthetic-pw-' + Math.random().toString(36).slice(2);
}

async function insertMembership(
  provisionerPool: Pool,
  userId: string,
  tenantId: string,
  role: string,
  revoked: boolean,
): Promise<void> {
  const client = await provisionerPool.connect();
  try {
    await client.query(
      `insert into probe_memberships (id, "userId", tenant_id, role, revoked_at)
       values ($1, $2, $3, $4, $5)`,
      [`probe-membership-${userId}-${tenantId}`, userId, tenantId, role, revoked ? new Date() : null],
    );
  } finally {
    client.release();
  }
}

describe('LF-002a Better Auth boundary (P10-P14; P01 es precondición obligatoria de beforeAll)', () => {
  let provisionerPool: Pool;
  let runtimePool: Pool;
  let authPool: Pool; // ligado a la instancia de Better Auth de todo el pool (P10-P12, P14, y el escenario "no comparten cliente" de P13); max>=2 para que nunca bloquee al pool esperando una conexión mientras otra sigue ocupada.
  let instrumentation: AuthInstrumentation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;

  beforeAll(async () => {
    const provisionerUrl = requireEnvUrl('LF002A_PROVISIONER_URL');
    const runtimeUrl = requireEnvUrl('LF002A_RUNTIME_URL');

    provisionerPool = createSpikePool({ connectionString: provisionerUrl, maxConnections: 2 });
    runtimePool = createSpikePool({ connectionString: runtimeUrl, maxConnections: 2 });
    authPool = createSpikePool({ connectionString: runtimeUrl, maxConnections: 3 });

    await seedFixtures(provisionerPool);
    await assertSeedSanity(provisionerPool);

    // P01, como precondición obligatoria — igual que en isolation.test.ts: si falla,
    // lanza aquí y detiene TODA la suite, nunca un test() independiente cuyo fallo deja
    // correr los demás casos sobre un destino/rol que no se confirmaron seguros primero.
    const preflight = await runPreflight(runtimePool);
    if (!preflight.ok) {
      throw new Error(`P01 preflight failed, refusing to run any lab case: ${preflight.reasons.join(', ')}`);
    }

    const created = createInstrumentedAuth(authPool, {
      secret: requireAuthSecret(),
      baseURL: 'http://127.0.0.1:0',
      onUserCreated: async (user) => {
        // P14: ruta alternativa autorizada (ver auth.ts CreateAuthOptions — Better Auth no
        // tiene un hook nativo para una tabla de membresías propia). Nunca una escritura
        // directa sin wrapper: pasa por `withTenantContext`, igual que cualquier otra
        // escritura de tenant_probe en el resto de la suite.
        const client = await runtimePool.connect();
        try {
          await withTenantContext(client, TENANT_A.tenantId, async (c) => {
            await c.query(
              `insert into probe_memberships (id, "userId", tenant_id, role)
               values ($1, $2, $3, $4)
               on conflict ("userId", tenant_id) do nothing`,
              [`probe-membership-hook-${user.id}`, user.id, TENANT_A.tenantId, 'owner'],
            );
          });
        } finally {
          client.release();
        }
      },
    });
    auth = created.auth;
    instrumentation = created.instrumentation;
  });

  afterAll(async () => {
    await provisionerPool?.end();
    await runtimePool?.end();
    await authPool?.end();
  });

  async function realSignUp(email: string, password: string): Promise<{ userId: string; sessionToken: string }> {
    const result = await auth.api.signUpEmail({ body: { email, password, name: 'LF-002a test user' } });
    // Nunca se ignora el resultado: si no trae un id de usuario real, la prueba falla aquí
    // con un mensaje claro, no sigue adelante con un valor inventado.
    const userId: string | undefined = result?.user?.id;
    const sessionToken: string | undefined = result?.session?.token ?? result?.token;
    if (!userId || !sessionToken) {
      throw new Error(`signUpEmail no devolvió user.id/session.token reales para ${email}: ${JSON.stringify(result)}`);
    }
    return { userId, sessionToken };
  }

  function headersForToken(token: string): Headers {
    // Forma no verificada (ver advertencia del encabezado del archivo): se intenta primero
    // el header Authorization Bearer, patrón estándar documentado de Better Auth para uso
    // de servidor directo. Si la versión pinneada exige otro header (p. ej. una cookie con
    // el nombre configurado), esta llamada fallará de forma visible en la fase 2 — nunca
    // se declara un resultado sin haberlo ejecutado.
    return new Headers({ authorization: `Bearer ${token}` });
  }

  async function realGetSession(token: string): Promise<unknown> {
    try {
      return await auth.api.getSession({ headers: headersForToken(token) });
    } catch {
      // Un token que nunca existió, o una sesión inválida, puede rechazarse lanzando en
      // vez de devolver null, dependiendo de la versión — ambos casos se tratan igual:
      // "no hay sesión válida", nunca un resultado inventado.
      return null;
    }
  }

  // --- P10: estados de sesión reales ------------------------------------------
  test('P10: solo una sesión vigente, verificada por getSession real, llega a la autorización de tenant', async () => {
    const email = uniqueEmail('p10');
    const password = syntheticPassword();
    const { sessionToken } = await realSignUp(email, password);

    const validSessionResult = await realGetSession(sessionToken);
    const validOutcome = deriveSessionVerificationOutcome(
      validSessionResult as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'invalid',
    );
    expect(validOutcome.kind).toBe('valid');

    const invalidSessionResult = await realGetSession('never-issued-token-' + Math.random().toString(36).slice(2));
    const invalidOutcome = deriveSessionVerificationOutcome(
      invalidSessionResult as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'invalid',
    );
    expect(invalidOutcome.kind).not.toBe('valid');

    // Expirar de verdad la sesión (provisionador, nunca una etiqueta declarada) y
    // verificar de nuevo con una llamada real.
    const provisionerClient = await provisionerPool.connect();
    try {
      await provisionerClient.query('update "session" set "expiresAt" = now() - interval \'1 day\' where token = $1', [
        sessionToken,
      ]);
    } finally {
      provisionerClient.release();
    }
    const expiredSessionResult = await realGetSession(sessionToken);
    const expiredOutcome = deriveSessionVerificationOutcome(
      expiredSessionResult as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'expired',
    );
    expect(expiredOutcome.kind).not.toBe('valid');

    const client = await runtimePool.connect();
    const querySpy = vi.spyOn(client, 'query');
    try {
      // Ninguno de los tres resultados no-válidos llega a consultar membresías ni a fijar
      // contexto de tenant: cero llamadas a esta conexión antes de retornar.
      for (const outcome of [invalidOutcome, expiredOutcome]) {
        querySpy.mockClear();
        const authResult = await authorizeTenantSelection(client, outcome, TENANT_A.tenantId);
        expect(authResult.authorized).toBe(false);
        expect((authResult as { reason: string }).reason).toBe(`session_${outcome.kind}`);
        expect(querySpy).not.toHaveBeenCalled();
      }
    } finally {
      querySpy.mockRestore();
      client.release();
    }
  });

  // --- P11: sesión válida sin membresía o con membresía revocada --------------
  test('P11: sesión válida (real) sin membresía o con membresía revocada no fija contexto ni accede a tenant_probe', async () => {
    const noMembershipUser = await realSignUp(uniqueEmail('p11-no-membership'), syntheticPassword());
    const revokedUser = await realSignUp(uniqueEmail('p11-revoked'), syntheticPassword());
    await insertMembership(provisionerPool, revokedUser.userId, TENANT_A.tenantId, 'sales', true);

    const noMembershipOutcome = deriveSessionVerificationOutcome(
      (await realGetSession(noMembershipUser.sessionToken)) as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'invalid',
    );
    expect(noMembershipOutcome.kind).toBe('valid'); // la sesión SÍ es real y válida; falta es la membresía

    const revokedOutcome = deriveSessionVerificationOutcome(
      (await realGetSession(revokedUser.sessionToken)) as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'invalid',
    );
    expect(revokedOutcome.kind).toBe('valid');

    const client = await runtimePool.connect();
    try {
      const noMembershipResult = await authorizeTenantSelection(client, noMembershipOutcome, TENANT_A.tenantId);
      expect(noMembershipResult).toEqual({ authorized: false, reason: 'no_membership' });

      const revokedMembershipResult = await authorizeTenantSelection(client, revokedOutcome, TENANT_A.tenantId);
      expect(revokedMembershipResult).toEqual({ authorized: false, reason: 'membership_revoked' });
    } finally {
      client.release();
    }
  });

  // --- P12: selección de tenant ajeno / multi-tenant --------------------------
  test('P12: selección de tenant ajeno se rechaza antes de autorizar; multi-tenant puede elegir cada uno permitido', async () => {
    const multiTenantUser = await realSignUp(uniqueEmail('p12-multi-tenant'), syntheticPassword());
    await insertMembership(provisionerPool, multiTenantUser.userId, TENANT_A.tenantId, 'sales', false);
    await insertMembership(provisionerPool, multiTenantUser.userId, TENANT_B.tenantId, 'sales', false);

    const outcome = deriveSessionVerificationOutcome(
      (await realGetSession(multiTenantUser.sessionToken)) as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'invalid',
    );
    expect(outcome.kind).toBe('valid');

    const client = await runtimePool.connect();
    try {
      const foreign = await authorizeTenantSelection(client, outcome, 'tenant-not-a-member-of');
      expect(foreign).toEqual({ authorized: false, reason: 'no_membership' });

      const selectA = await authorizeTenantSelection(client, outcome, TENANT_A.tenantId);
      expect(selectA.authorized).toBe(true);

      const selectB = await authorizeTenantSelection(client, outcome, TENANT_B.tenantId);
      expect(selectB.authorized).toBe(true);
    } finally {
      client.release();
    }
  });

  // --- P13: frontera transaccional real ---------------------------------------
  test('P13a: con el pool compartido (sin compartir cliente deliberadamente), el adaptador nunca comparte backend/transacción con un contexto de tenant ya abierto', async () => {
    instrumentation.traces.length = 0;

    const tenantClient = await authPool.connect(); // del MISMO pool que `auth`, a propósito
    try {
      await tenantClient.query('begin');
      await tenantClient.query("select set_config('app.tenant_id', $1, true)", [TENANT_A.tenantId]);

      // El pool tiene maxConnections=3 (ver beforeAll): con una conexión ya ocupada por
      // nuestra transacción abierta, el adaptador siempre puede obtener otra sin esperar —
      // sin riesgo de deadlock, a diferencia de usar un pool de una sola conexión aquí.
      await realSignUp(uniqueEmail('p13a'), syntheticPassword());

      await tenantClient.query('commit');
    } catch (error) {
      await tenantClient.query('rollback');
      throw error;
    } finally {
      tenantClient.release();
    }

    const tenantClientPid = (tenantClient as unknown as { processID?: number }).processID;
    const identityTraces = instrumentation.traces.filter((t) => t.classification === 'identity');
    expect(identityTraces.length).toBeGreaterThan(0);
    for (const trace of identityTraces) {
      expect(trace.backendPid).not.toBe(tenantClientPid); // backend real distinto, no supuesto
    }
    expect(instrumentation.traces.some((t) => t.classification === 'tenant')).toBe(false);
  });

  test('P13b: compartiendo DELIBERADAMENTE el mismo cliente, las consultas del adaptador SÍ corren dentro de la transacción de tenant ya abierta', async () => {
    instrumentation.traces.length = 0;
    const client = await runtimePool.connect(); // pool separado: aquí no hace falta margen de conexiones, es la MISMA conexión para todo
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [TENANT_A.tenantId]);

      const { auth: clientScopedAuth } = createClientScopedAuth(
        client,
        { secret: requireAuthSecret(), baseURL: 'http://127.0.0.1:0' },
        instrumentation,
      );
      await clientScopedAuth.api.signUpEmail({
        body: { email: uniqueEmail('p13b'), password: syntheticPassword(), name: 'LF-002a P13b' },
      });

      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const beginTrace = instrumentation.traces.find((t) => t.marker === 'begin');
    expect(beginTrace).toBeDefined();
    const sharedTransactionId = beginTrace!.transactionId;
    const identityTracesInSameTransaction = instrumentation.traces.filter(
      (t) => t.transactionId === sharedTransactionId && t.classification === 'identity',
    );
    // Demostrado empíricamente, no supuesto: cuando el código de la aplicación comparte
    // deliberadamente su propia conexión/transacción con el adaptador (p. ej. pasando el
    // mismo `tx`/cliente a ambos), las consultas de identidad del adaptador SÍ quedan
    // dentro de esa misma transacción — exactamente la pregunta original de
    // docs/specs/LF-002a.md, respondida con el transactionId real, no con una heurística
    // de texto.
    expect(identityTracesInSameTransaction.length).toBeGreaterThan(0);
  });

  // --- P14: ruta de membresía autorizada --------------------------------------
  test('P14: la ruta de membresía elegida (databaseHooks.user.create.after) pasa por el wrapper autorizado y crea la fila esperada', async () => {
    const { userId } = await realSignUp(uniqueEmail('p14'), syntheticPassword());

    // Confirmación POSITIVA (no solo "ninguna consulta tocó probe_memberships", que por sí
    // sola no demuestra cobertura suficiente): el hook disparó una escritura autorizada vía
    // withTenantContext (ver beforeAll/onUserCreated) y la fila quedó creada con el tenant
    // correcto, consultada desde el provisionador (nunca sujeta a RLS, nunca a la duda de
    // si el propio runtime podría estar ocultándola).
    const client = await provisionerPool.connect();
    try {
      const result = await client.query<{ tenant_id: string; role: string }>(
        'select tenant_id, role from probe_memberships where "userId" = $1',
        [userId],
      );
      expect(result.rows).toEqual([{ tenant_id: TENANT_A.tenantId, role: 'owner' }]);
    } finally {
      client.release();
    }
  });
});
