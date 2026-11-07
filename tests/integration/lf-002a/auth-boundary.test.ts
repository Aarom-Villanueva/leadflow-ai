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
 * - Hallazgo 5: P13 usa `createClientScopedAuth` para demostrar, con el backend/instante de
 *   transacción real de la instrumentación (auth.ts/query-classifier.ts), si las consultas
 *   del adaptador comparten la misma transacción que un contexto de tenant ya abierto en la
 *   MISMA conexión — y, por separado, confirma que el caso normal (pool compartido, sin
 *   compartir cliente deliberadamente) nunca las mezcla, sin arriesgar un deadlock del pool.
 * - Hallazgo 5 (P14): se conecta `databaseHooks.user.create.after` (ver auth.ts) a una
 *   escritura de membresía autorizada vía `withTenantContext` — nunca una escritura directa
 *   sin pasar por el wrapper — y se confirma POSITIVAMENTE que la fila quedó creada con el
 *   tenant correcto, no solo que "ninguna consulta tocó probe_memberships".
 *
 * Revisión independiente, SEGUNDA ronda (sobre el candidato `212e201`), hallazgo 3:
 * - El hook `onUserCreated` (P14) estaba conectado a la MISMA instancia de Better Auth
 *   compartida por P10-P13 en `beforeAll` — cualquier alta real en esas pruebas disparaba
 *   también el hook, dándole a todo usuario una membresía automática en `TENANT_A`. Eso
 *   invalidaba P11 (el usuario "sin membresía" en realidad SÍ tenía una, creada por el
 *   hook) y hacía que P12 intentara insertar una SEGUNDA fila para el mismo
 *   `("userId", tenant_id)` que la que el hook ya había creado, violando el índice único.
 *   Ahora el hook se configura en una instancia de Better Auth SEPARADA, creada solo
 *   dentro de la propia prueba P14 — P10-P13 usan la instancia compartida sin hook alguno,
 *   así que un alta ahí nunca crea membresía por sí misma.
 * - Se añade la revocación REAL de sesión (vía `auth.api.signOut`) anunciada pero nunca
 *   implementada en la ronda anterior — comprobando su resultado y la consulta posterior
 *   con `getSession`, nunca una etiqueta declarada.
 * - `realGetSession` ya no convierte cualquier excepción en "sesión inválida": si
 *   `auth.api.getSession` lanza de forma inesperada (en vez de devolver una ausencia de
 *   sesión documentada), la prueba debe fallar visiblemente, no disfrazar un error propio
 *   como si fuera un resultado de autenticación legítimo.
 * - Los mensajes de error ya nunca incluyen `JSON.stringify(result)`: podría imprimir un
 *   token de sesión u otro dato sensible devuelto por la API real. Solo se describen los
 *   NOMBRES de clave presentes, nunca sus valores.
 *
 * Advertencia explícita (a diferencia del esquema de tablas, verificado por lectura
 * directa del código fuente — docs/specs/LF-023.md §3): la forma exacta de la API de
 * servidor de `better-auth@1.7.18` (`auth.api.signUpEmail`/`getSession`/`signOut`, el
 * formato de cabecera que `getSession` espera para un token de sesión, y si lanza o
 * devuelve una ausencia de sesión documentada) se escribió según el patrón público
 * conocido de Better Auth, pero **no se verificó ejecutándola** contra el paquete
 * instalado, porque no está instalado en esta fase. Esto está escrito, no ejecutado, y
 * pendiente de verificar contra Better Auth real: si la fase 2 encuentra una forma
 * distinta, este archivo debe corregirse para usar la real — nunca inventar un resultado
 * sin haberlo ejecutado.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Pool } from 'pg';
import { createSpikePool, requireEnvUrl, runPreflight } from './database.js';
import { authorizeTenantSelection, deriveSessionVerificationOutcome, withTenantContext } from './tenant-context.js';
import { createClientScopedAuth, createInstrumentedAuth, type AuthInstrumentation } from './auth.js';
import { assertSeedSanity, seedFixtures } from './seed.js';
import { TENANT_A, TENANT_B } from './fixtures.js';
import { DEFAULT_LOCK_FILE_PATH, acquireSuiteLock, type SuiteLockHandle } from './suite-lock.js';

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
    // on conflict do nothing como defensa en profundidad (hallazgo 3, segunda ronda): con
    // el hook de P14 ya aislado a su propia instancia de Better Auth (ver beforeAll), esta
    // inserción ya no debería competir con ninguna otra escritura para el mismo
    // ("userId", tenant_id) — pero una inserción directa sin manejo de conflicto, como
    // tenía antes, lanzaría en vez de ser idempotente si algo más llegara a insertar la
    // misma fila primero.
    await client.query(
      `insert into probe_memberships (id, "userId", tenant_id, role, revoked_at)
       values ($1, $2, $3, $4, $5)
       on conflict ("userId", tenant_id) do nothing`,
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
  let lockHandle: SuiteLockHandle | undefined;

  beforeAll(async () => {
    // Lo primero de todo: exclusión real con lifecycle.test.ts (hallazgo 5, segunda ronda)
    // antes de abrir ningún pool — ver suite-lock.ts.
    lockHandle = await acquireSuiteLock({ lockFilePath: DEFAULT_LOCK_FILE_PATH });

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

    // Instancia COMPARTIDA, SIN ningún hook — hallazgo 3, segunda ronda: conectar
    // `onUserCreated` aquí afectaría a TODAS las altas de P10-P13, dándoles membresía
    // automática y rompiendo tanto el "sin membresía" de P11 como el conteo esperado de
    // filas de P12. Solo P14 crea su PROPIA instancia, con su propio hook, dentro de su
    // propio test — ver más abajo.
    const created = createInstrumentedAuth(authPool, {
      secret: requireAuthSecret(),
      baseURL: 'http://127.0.0.1:0',
    });
    auth = created.auth;
    instrumentation = created.instrumentation;
  });

  afterAll(async () => {
    await provisionerPool?.end();
    await runtimePool?.end();
    await authPool?.end();
    lockHandle?.release();
  });

  async function realSignUp(email: string, password: string): Promise<{ userId: string; sessionToken: string }> {
    const result = await auth.api.signUpEmail({ body: { email, password, name: 'LF-002a test user' } });
    // Nunca se ignora el resultado: si no trae un id de usuario real, la prueba falla aquí
    // con un mensaje claro, no sigue adelante con un valor inventado. El mensaje nunca
    // incluye el propio `result` (hallazgo 3, segunda ronda: `JSON.stringify(result)`
    // podría imprimir un token de sesión u otro dato sensible) — solo los NOMBRES de
    // clave presentes en el nivel superior, nunca sus valores.
    const userId: string | undefined = result?.user?.id;
    const sessionToken: string | undefined = result?.session?.token ?? result?.token;
    if (!userId || !sessionToken) {
      const presentKeys = result && typeof result === 'object' ? Object.keys(result).join(', ') : String(result);
      throw new Error(`signUpEmail no devolvió user.id/session.token reales para ${email} (claves presentes: ${presentKeys})`);
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

  /**
   * Llamada REAL a `auth.api.getSession`, sin capturar ninguna excepción (hallazgo 3,
   * segunda ronda: "no conviertas errores inesperados... en rechazos válidos de
   * autenticación"). No se sabe todavía, sin haberlo ejecutado, si esta versión de Better
   * Auth lanza o devuelve una ausencia de sesión documentada (p. ej. `null`/`{session:
   * null}`) para un token inválido/expirado/revocado — `deriveSessionVerificationOutcome`
   * ya maneja el caso de un valor de retorno sin sesión. Si en cambio LANZA de forma
   * inesperada, esta función deja que esa excepción se propague: la prueba debe fallar
   * visiblemente para exponer esa incertidumbre real, nunca disfrazarla como si fuera un
   * resultado de autenticación válido.
   */
  async function realGetSession(token: string): Promise<unknown> {
    return await auth.api.getSession({ headers: headersForToken(token) });
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

    // Revocación REAL (hallazgo 3, segunda ronda — anunciada pero no implementada en la
    // ronda anterior): sesión fresca propia, revocada vía `auth.api.signOut` real,
    // comprobando su resultado explícitamente (nunca ignorado), y verificada de nuevo con
    // una llamada real a getSession usando el MISMO token ya revocado.
    const revocationCandidate = await realSignUp(uniqueEmail('p10-revocation'), syntheticPassword());
    const signOutResult = await auth.api.signOut({ headers: headersForToken(revocationCandidate.sessionToken) });
    if (!signOutResult || signOutResult.success === false) {
      const presentKeys = signOutResult && typeof signOutResult === 'object' ? Object.keys(signOutResult).join(', ') : String(signOutResult);
      throw new Error(`signOut no confirmó éxito para la sesión revocada (claves presentes: ${presentKeys})`);
    }
    const revokedSessionResult = await realGetSession(revocationCandidate.sessionToken);
    const revokedOutcome = deriveSessionVerificationOutcome(
      revokedSessionResult as Parameters<typeof deriveSessionVerificationOutcome>[0],
      'revoked',
    );
    expect(revokedOutcome.kind).not.toBe('valid');

    const client = await runtimePool.connect();
    const querySpy = vi.spyOn(client, 'query');
    try {
      // Ninguno de los tres resultados no-válidos llega a consultar membresías ni a fijar
      // contexto de tenant: cero llamadas a esta conexión antes de retornar.
      for (const outcome of [invalidOutcome, expiredOutcome, revokedOutcome]) {
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
    // Instrumentar PRIMERO (hallazgo 2, tercera ronda): `createClientScopedAuth` es lo que
    // envuelve `client.query` vía `instrumentConnection`. Antes, el BEGIN y el
    // `set_config` se emitían con el `.query` SIN envolver todavía, así que nunca
    // quedaban registrados — ni `beginTrace` podía existir, ni el xid real podía
    // propagarse a nada.
    const { auth: clientScopedAuth } = createClientScopedAuth(
      client,
      { secret: requireAuthSecret(), baseURL: 'http://127.0.0.1:0' },
      instrumentation,
    );
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [TENANT_A.tenantId]);

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
    // Evidencia VERIFICABLE, no el agrupador local: `realTransactionId` viene de
    // `pg_current_xact_id()` real, consultado contra el propio servidor justo tras el
    // BEGIN — se exige que de verdad se haya capturado (no null) antes de apoyarse en él,
    // para no caer de vuelta en una heurística local si esa consulta hubiera fallado.
    expect(beginTrace!.realTransactionId).not.toBeNull();
    const sharedRealTransactionId = beginTrace!.realTransactionId;
    const identityTracesInSameTransaction = instrumentation.traces.filter(
      (t) => t.realTransactionId === sharedRealTransactionId && t.classification === 'identity',
    );
    // Demostrado empíricamente, no supuesto: cuando el código de la aplicación comparte
    // deliberadamente su propia conexión/transacción con el adaptador (p. ej. pasando el
    // mismo `tx`/cliente a ambos), las consultas de identidad del adaptador SÍ quedan
    // dentro de esa misma transacción real — exactamente la pregunta original de
    // docs/specs/LF-002a.md, respondida con el xid real de Postgres, no con una heurística
    // local ni de texto. El cierre también queda registrado: la transacción completa debió
    // terminar en 'committed', nunca abierta ni abortada, para que esta prueba sea válida.
    expect(identityTracesInSameTransaction.length).toBeGreaterThan(0);
    const commitTrace = instrumentation.traces.find((t) => t.marker === 'commit');
    expect(commitTrace?.outcome).toBe('committed');
    expect(beginTrace!.outcome).toBe('committed');
  });

  // --- P14: ruta de membresía autorizada --------------------------------------
  test('P14: la ruta de membresía elegida (databaseHooks.user.create.after) pasa por el wrapper autorizado y crea la fila esperada', async () => {
    // Instancia de Better Auth PROPIA de esta prueba, con su PROPIO pool — hallazgo 3,
    // segunda ronda: aislada deliberadamente de la instancia compartida de P10-P13 (sin
    // hook) para que el hook de esta prueba nunca afecte a ninguna otra, y para evitar
    // adjuntar un segundo listener 'connect' sobre el mismo pool (que envolvería
    // `client.query` dos veces).
    const p14Pool = createSpikePool({ connectionString: requireEnvUrl('LF002A_RUNTIME_URL'), maxConnections: 2 });
    try {
      const { auth: p14Auth } = createInstrumentedAuth(p14Pool, {
        secret: requireAuthSecret(),
        baseURL: 'http://127.0.0.1:0',
        onUserCreated: async (user) => {
          // Ruta alternativa autorizada (ver auth.ts CreateAuthOptions — Better Auth no
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

      const signUpResult = await p14Auth.api.signUpEmail({
        body: { email: uniqueEmail('p14'), password: syntheticPassword(), name: 'LF-002a test user' },
      });
      const userId: string | undefined = signUpResult?.user?.id;
      if (!userId) {
        const presentKeys = signUpResult && typeof signUpResult === 'object' ? Object.keys(signUpResult).join(', ') : String(signUpResult);
        throw new Error(`signUpEmail no devolvió user.id real en P14 (claves presentes: ${presentKeys})`);
      }

      // Confirmación POSITIVA (no solo "ninguna consulta tocó probe_memberships", que por
      // sí sola no demuestra cobertura suficiente): el hook disparó una escritura
      // autorizada vía withTenantContext y la fila quedó creada con el tenant correcto,
      // consultada desde el provisionador (nunca sujeta a RLS).
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
    } finally {
      await p14Pool.end();
    }
  });
});
