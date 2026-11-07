/**
 * Pruebas puras y ejecutables ahora (sin `pg`, con filas de catálogo fabricadas a mano) de
 * tests/integration/lf-002a/preflight-policy.ts — hallazgo 3 de la revisión independiente
 * del PR #19. Demuestran la lógica de clasificación; no sustituyen la evidencia pendiente
 * de ejecutar el preflight real contra PostgreSQL en la fase 2.
 */
import { describe, expect, test } from 'vitest';
import { evaluatePreflight, type PreflightInputs } from '../../integration/lf-002a/preflight-policy.js';

const EXPECTED_DATABASE_NAME = 'lf002a_spike';
const EXPECTED_RUNTIME_ROLE = 'lf002a_runtime';
const EXPECTED_SCHEMA = 'public';
const EXPECTED_TABLE = 'tenant_probe';

function baseInputs(overrides: Partial<PreflightInputs> = {}): PreflightInputs {
  return {
    expectedDatabaseName: EXPECTED_DATABASE_NAME,
    actualDatabaseName: EXPECTED_DATABASE_NAME,
    expectedRuntimeRole: EXPECTED_RUNTIME_ROLE,
    expectedSchema: EXPECTED_SCHEMA,
    expectedTable: EXPECTED_TABLE,
    identity: { currentUser: EXPECTED_RUNTIME_ROLE, sessionUser: EXPECTED_RUNTIME_ROLE },
    roleAttributes: { rolname: EXPECTED_RUNTIME_ROLE, rolsuper: false, rolbypassrls: false },
    ownership: { schemaName: EXPECTED_SCHEMA, tableName: EXPECTED_TABLE, tableOwner: 'lf002a_provisioner' },
    rlsStatus: { relrowsecurity: true, relforcerowsecurity: true },
    policies: [
      {
        policyName: 'tenant_probe_isolation',
        permissive: true,
        roles: ['public'],
        cmd: 'ALL',
        usingExpr: "tenant_id = current_setting('app.tenant_id', true)",
        withCheckExpr: "tenant_id = current_setting('app.tenant_id', true)",
      },
    ],
    excessGrants: [],
    privilegedMemberships: [],
    ...overrides,
  };
}

describe('preflight-policy: evaluatePreflight', () => {
  test('configuración segura: ok, sin razones', () => {
    expect(evaluatePreflight(baseInputs())).toEqual({ ok: true, reasons: [] });
  });

  test('base de datos inesperada corta de inmediato, con una sola razón', () => {
    const result = evaluatePreflight(baseInputs({ actualDatabaseName: 'postgres' }));
    expect(result).toEqual({ ok: false, reasons: ['unexpected_database:postgres'] });
  });

  test('detecta current_user distinto de session_user', () => {
    const result = evaluatePreflight(
      baseInputs({ identity: { currentUser: EXPECTED_RUNTIME_ROLE, sessionUser: 'someone_else' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(`current_user_session_user_mismatch:${EXPECTED_RUNTIME_ROLE}!=someone_else`);
  });

  test('detecta que la conexión real no es el rol esperado, aunque la configuración lo declare', () => {
    // Este es exactamente el hallazgo: no basta con un nombre de rol que "llega por
    // configuración" — se exige que la identidad conectada de verdad sea esa.
    const result = evaluatePreflight(
      baseInputs({ identity: { currentUser: 'postgres', sessionUser: 'postgres' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('connected_as_unexpected_role:postgres');
  });

  test('detecta rolsuper/rolbypassrls en el rol conectado', () => {
    const superResult = evaluatePreflight(
      baseInputs({ roleAttributes: { rolname: EXPECTED_RUNTIME_ROLE, rolsuper: true, rolbypassrls: false } }),
    );
    expect(superResult.reasons).toContain('runtime_role_is_superuser');

    const bypassResult = evaluatePreflight(
      baseInputs({ roleAttributes: { rolname: EXPECTED_RUNTIME_ROLE, rolsuper: false, rolbypassrls: true } }),
    );
    expect(bypassResult.reasons).toContain('runtime_role_has_bypassrls');
  });

  test('detecta que el rol runtime es propietario de la tabla (ignora RLS por defecto)', () => {
    const result = evaluatePreflight(
      baseInputs({ ownership: { schemaName: EXPECTED_SCHEMA, tableName: EXPECTED_TABLE, tableOwner: EXPECTED_RUNTIME_ROLE } }),
    );
    expect(result.reasons).toContain('runtime_role_owns_tenant_probe');
  });

  test('detecta que la fila de propiedad identifica un objeto distinto al esperado', () => {
    const result = evaluatePreflight(
      baseInputs({ ownership: { schemaName: 'other_schema', tableName: 'tenant_probe', tableOwner: 'x' } }),
    );
    expect(result.reasons).toContain('ownership_row_for_wrong_object:other_schema.tenant_probe');
  });

  test('detecta RLS no habilitada o no forzada', () => {
    expect(
      evaluatePreflight(baseInputs({ rlsStatus: { relrowsecurity: false, relforcerowsecurity: true } })).reasons,
    ).toContain('rls_not_enabled');
    expect(
      evaluatePreflight(baseInputs({ rlsStatus: { relrowsecurity: true, relforcerowsecurity: false } })).reasons,
    ).toContain('rls_not_forced');
  });

  test('detecta una política permisiva vacía (using (true)) que abriría acceso', () => {
    const result = evaluatePreflight(
      baseInputs({
        policies: [
          {
            policyName: 'too_open',
            permissive: true,
            roles: ['public'],
            cmd: 'ALL',
            usingExpr: 'true',
            withCheckExpr: 'true',
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('permissive_policy_without_tenant_condition:too_open');
  });

  test('una política RESTRICTIVE sin condición de tenant no se marca como abriendo acceso (restrictiva solo puede negar)', () => {
    const result = evaluatePreflight(
      baseInputs({
        policies: [
          baseInputs().policies[0],
          { policyName: 'extra_restrictive', permissive: false, roles: ['public'], cmd: 'ALL', usingExpr: 'true', withCheckExpr: null },
        ],
      }),
    );
    expect(result.reasons.some((r) => r.includes('extra_restrictive'))).toBe(false);
  });

  test('detecta cobertura de comandos incompleta (p. ej. solo SELECT, sin INSERT/UPDATE/DELETE)', () => {
    const result = evaluatePreflight(
      baseInputs({
        policies: [
          {
            policyName: 'select_only',
            permissive: true,
            roles: ['public'],
            cmd: 'SELECT',
            usingExpr: "tenant_id = current_setting('app.tenant_id', true)",
            withCheckExpr: null,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('command_not_covered:INSERT');
    expect(result.reasons).toContain('command_not_covered:UPDATE');
    expect(result.reasons).toContain('command_not_covered:DELETE');
    expect(result.reasons).not.toContain('command_not_covered:SELECT');
  });

  test('ignora una política que no se aplica al rol runtime (ni public ni el rol exacto)', () => {
    const result = evaluatePreflight(
      baseInputs({
        policies: [
          {
            policyName: 'for_someone_else',
            permissive: true,
            roles: ['some_other_role'],
            cmd: 'ALL',
            usingExpr: 'true',
            withCheckExpr: 'true',
          },
        ],
      }),
    );
    // No cuenta como cobertura para el runtime (ninguno de los cuatro comandos queda
    // cubierto para él) y tampoco se marca como permisiva-abierta: esa política
    // simplemente no es asunto suyo, no se aplica al rol que nos importa.
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'command_not_covered:SELECT',
        'command_not_covered:INSERT',
        'command_not_covered:UPDATE',
        'command_not_covered:DELETE',
      ]),
    );
    expect(result.reasons.some((r) => r.includes('for_someone_else'))).toBe(false);
  });

  test('detecta grants en exceso (TRUNCATE) y roles heredados privilegiados', () => {
    const result = evaluatePreflight(
      baseInputs({
        excessGrants: [{ privilegeType: 'TRUNCATE', grantee: EXPECTED_RUNTIME_ROLE }],
        privilegedMemberships: [{ inheritedRole: 'some_admin_role', reason: 'bypassrls' }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(`excess_grant:TRUNCATE:${EXPECTED_RUNTIME_ROLE}`);
    expect(result.reasons).toContain('inherits_privileged_role:some_admin_role:bypassrls');
  });

  test('ausencia total de política cuenta como no_rls_policy', () => {
    const result = evaluatePreflight(baseInputs({ policies: [] }));
    expect(result.reasons).toContain('no_rls_policy');
  });

  test('identidad/atributos/propiedad ausentes (null) se tratan como inseguros, nunca como "no aplica"', () => {
    const result = evaluatePreflight(
      baseInputs({ identity: null, roleAttributes: null, ownership: null, rlsStatus: null }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'connected_identity_unavailable',
        'runtime_role_missing',
        'tenant_probe_missing',
        'rls_not_enabled',
        'rls_not_forced',
      ]),
    );
  });
});
