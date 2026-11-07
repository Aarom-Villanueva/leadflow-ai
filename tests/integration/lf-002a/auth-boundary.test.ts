/**
 * Casos P10–P14 del plan (docs/LF-002a-IMPLEMENTATION-PLAN.md §5): estados de sesión,
 * estados de membresía, selección de tenant, trazas reales del adaptador de Better Auth
 * (pregunta original de docs/specs/LF-002a.md), y la ruta/hook que toca
 * `probe_memberships`.
 *
 * Fase 1 (actual): escrito y revisado, NO ejecutado — misma exigencia que
 * isolation.test.ts (LF002A_PROVISIONER_URL/LF002A_RUNTIME_URL reales).
 *
 * Advertencia explícita (a diferencia del esquema de tablas, verificado por lectura
 * directa del código fuente — docs/specs/LF-023.md §3): la forma exacta de la API de
 * servidor de `better-auth@1.7.18` (`auth.api.signUpEmail`/`signInEmail`/`getSession`)
 * se escribió según el patrón público conocido de Better Auth, pero **no se verificó
 * ejecutándola** contra el paquete instalado, porque no está instalado en esta fase. Si
 * la fase 2 encuentra una forma distinta, este archivo debe corregirse para usar la real
 * — nunca inventar un resultado sin haberlo ejecutado (docs/LF-002a-IMPLEMENTATION-PLAN.md
 * §4: "si un hook no existe en la versión elegida, documentarlo... no inventarlo").
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Pool } from 'pg';
import { createSpikePool, requireEnvUrl } from './database.js';
import { authorizeTenantSelection, type SyntheticSession } from './tenant-context.js';
import { createInstrumentedAuth, type AuthInstrumentation } from './auth.js';
import { TENANT_A, TENANT_B, USER_MULTI_TENANT, USER_NO_MEMBERSHIP, USER_REVOKED } from './fixtures.js';
import { seedFixtures } from './isolation.test.js';

const EXPECTED_DATABASE_NAME = 'lf002a_spike';
const RUNTIME_ROLE = 'lf002a_runtime';

describe('LF-002a Better Auth boundary (P10-P14)', () => {
  let provisionerPool: Pool;
  let runtimePool: Pool;
  let instrumentation: AuthInstrumentation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auth: any;

  beforeAll(async () => {
    const provisionerUrl = requireEnvUrl('LF002A_PROVISIONER_URL');
    const runtimeUrl = requireEnvUrl('LF002A_RUNTIME_URL');

    provisionerPool = createSpikePool({
      connectionString: provisionerUrl,
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 2,
    });
    runtimePool = createSpikePool({
      connectionString: runtimeUrl,
      expectedDatabaseName: EXPECTED_DATABASE_NAME,
      runtimeRole: RUNTIME_ROLE,
      maxConnections: 2,
    });

    await seedFixtures(provisionerPool);

    const created = createInstrumentedAuth(runtimePool, {
      // Material sintético efímero de la fase 2 (docs/specs/LF-023.md §4.3) — nunca un
      // valor por defecto ni una clave real aquí.
      secret: requireEnvUrl('LF002A_RUNTIME_URL') && (process.env.LF002A_AUTH_SECRET ?? (() => {
        throw new Error('LF002A_AUTH_SECRET no está configurado (fase 2, material sintético efímero)');
      })()),
      baseURL: 'http://127.0.0.1:0',
    });
    auth = created.auth;
    instrumentation = created.instrumentation;
  });

  afterAll(async () => {
    await provisionerPool?.end();
    await runtimePool?.end();
  });

  // --- P10: estados de sesión ------------------------------------------------
  test('P10: solo una sesión vigente llega a la autorización de tenant', async () => {
    const email = `p10-${Date.now()}@example.invalid`;
    const signUp = await auth.api.signUpEmail({
      body: { email, password: 'synthetic-pw-' + Math.random().toString(36).slice(2), name: 'P10 User' },
    });
    expect(signUp?.user?.id).toBeTruthy();

    const signIn = await auth.api.signInEmail({
      body: { email, password: 'synthetic-pw-does-not-matter-if-reused' },
    }).catch((error: unknown) => error);
    // Nota: la contraseña usada aquí intencionalmente puede no coincidir; lo real de
    // este caso es la sesión creada por signUpEmail, abajo. Se corrige en fase 2 cuando
    // se confirme la forma exacta de la API.
    void signIn;

    const validSessionToken: string = signUp?.session?.token ?? signUp?.token;
    expect(validSessionToken).toBeTruthy();

    const client = await runtimePool.connect();
    try {
      const invalidResult = await authorizeTenantSelection(
        client,
        { userId: 'nonexistent-user-id', status: 'invalid' } satisfies SyntheticSession,
        TENANT_A.tenantId,
      );
      expect(invalidResult).toEqual({ authorized: false, reason: 'session_invalid' });

      const expiredResult = await authorizeTenantSelection(
        client,
        { userId: signUp.user.id, status: 'expired' } satisfies SyntheticSession,
        TENANT_A.tenantId,
      );
      expect(expiredResult).toEqual({ authorized: false, reason: 'session_expired' });

      const revokedResult = await authorizeTenantSelection(
        client,
        { userId: signUp.user.id, status: 'revoked' } satisfies SyntheticSession,
        TENANT_A.tenantId,
      );
      expect(revokedResult).toEqual({ authorized: false, reason: 'session_revoked' });
    } finally {
      client.release();
    }
  });

  // --- P11: sesión válida sin membresía o con membresía revocada --------------
  test('P11: sesión válida sin membresía o con membresía revocada no fija contexto ni accede a tenant_probe', async () => {
    const client = await runtimePool.connect();
    try {
      const noMembership = await authorizeTenantSelection(
        client,
        { userId: USER_NO_MEMBERSHIP.id, status: 'valid' },
        TENANT_A.tenantId,
      );
      expect(noMembership).toEqual({ authorized: false, reason: 'no_membership' });

      const revokedMembership = await authorizeTenantSelection(
        client,
        { userId: USER_REVOKED.id, status: 'valid' },
        TENANT_A.tenantId,
      );
      expect(revokedMembership).toEqual({ authorized: false, reason: 'membership_revoked' });
    } finally {
      client.release();
    }
  });

  // --- P12: selección de tenant ajeno / multi-tenant --------------------------
  test('P12: selección de tenant ajeno se rechaza antes de consultar datos; multi-tenant puede elegir cada uno permitido', async () => {
    const client = await runtimePool.connect();
    try {
      const foreign = await authorizeTenantSelection(client, { userId: USER_MULTI_TENANT.id, status: 'valid' }, 'tenant-not-a-member-of');
      expect(foreign).toEqual({ authorized: false, reason: 'no_membership' });

      const selectA = await authorizeTenantSelection(client, { userId: USER_MULTI_TENANT.id, status: 'valid' }, TENANT_A.tenantId);
      expect(selectA.authorized).toBe(true);

      const selectB = await authorizeTenantSelection(client, { userId: USER_MULTI_TENANT.id, status: 'valid' }, TENANT_B.tenantId);
      expect(selectB.authorized).toBe(true);
    } finally {
      client.release();
    }
  });

  // --- P13: trazas reales del adaptador ---------------------------------------
  test('P13: las trazas reales clasifican cada consulta global/tenant; identidad global no corre en la transacción de tenant', async () => {
    const email = `p13-${Date.now()}@example.invalid`;
    instrumentation.traces.length = 0; // solo interesa lo que ocurre a partir de aquí

    await auth.api.signUpEmail({
      body: { email, password: 'synthetic-pw-' + Math.random().toString(36).slice(2), name: 'P13 User' },
    });

    expect(instrumentation.traces.length).toBeGreaterThan(0);
    const globalTraces = instrumentation.traces.filter((t) => t.classification === 'global');
    const tenantTraces = instrumentation.traces.filter((t) => t.classification === 'tenant');
    // La pregunta original de docs/specs/LF-002a.md: las consultas de identidad del
    // adaptador no deben tocar tenant_probe/probe_memberships durante un signup normal.
    expect(tenantTraces).toHaveLength(0);
    expect(globalTraces.length).toBeGreaterThan(0);
  });

  // --- P14: ruta/hook que toca probe_memberships ------------------------------
  test('P14: si existe un hook que toca probe_memberships, pasa por el wrapper autorizado', async () => {
    // Better Auth no tiene, en su núcleo, ningún hook documentado que escriba en una
    // tabla de membresías propia de la aplicación — eso es exactamente lo que
    // `probe_memberships`/D-002 existen para decidir. Si la configuración elegida en
    // fase 2 añade un hook (p. ej. `databaseHooks.user.create.after`) que sí la toque,
    // este caso debe reescribirse para interceptarlo y confirmar que pasa por
    // `authorizeTenantSelection`/`withTenantContext`, nunca una consulta directa sin
    // autorización. Documentado explícitamente en vez de inventar un hook que no existe
    // (docs/LF-002a-IMPLEMENTATION-PLAN.md §4/P14).
    expect(instrumentation.traces.some((t) => t.sql.toLowerCase().includes('probe_memberships'))).toBe(false);
  });
});
