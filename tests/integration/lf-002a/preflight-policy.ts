/**
 * Clasificador puro del preflight de rol/políticas del laboratorio LF-002a/LF-023 —
 * hallazgo 3 de la revisión independiente del PR #19.
 *
 * El preflight anterior solo comprobaba los atributos de un rol cuyo NOMBRE llegaba por
 * configuración (`pg_roles where rolname = $1`), nunca la identidad real de la conexión
 * que ejecuta las pruebas; contaba políticas (`count(*) >= 1`) sin inspeccionar a qué
 * roles/comandos se aplican ni qué exigen sus condiciones `USING`/`WITH CHECK`, así que una
 * política permisiva vacía (`using (true)`) habría contado igual que una política correcta.
 *
 * Este módulo separa la DECISIÓN (pura, qué hace que una configuración sea insegura) de la
 * CONSULTA (impura, cómo se obtienen esos datos de PostgreSQL — en `database.ts`, no
 * ejecutable todavía). La decisión es puramente una función de las filas ya obtenidas, así
 * que es ejecutable y probable ahora mismo con filas fabricadas a mano, sin instalar `pg`
 * ni conectar nada (ver tests/unit/lf-002a/preflight-policy.test.ts).
 */

export interface ConnectedIdentity {
  readonly currentUser: string;
  readonly sessionUser: string;
}

export interface RoleAttributesRow {
  readonly rolname: string;
  readonly rolsuper: boolean;
  readonly rolbypassrls: boolean;
}

export interface TableOwnershipRow {
  readonly schemaName: string;
  readonly tableName: string;
  readonly tableOwner: string;
}

export interface RlsStatusRow {
  readonly relrowsecurity: boolean;
  readonly relforcerowsecurity: boolean;
}

export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface PolicyRow {
  readonly policyName: string;
  readonly permissive: boolean; // true = PERMISSIVE, false = RESTRICTIVE
  readonly roles: readonly string[]; // tal como las expone pg_policies.roles; incluye 'public' si aplica a todos
  readonly cmd: PolicyCommand;
  readonly usingExpr: string | null;
  readonly withCheckExpr: string | null;
}

export interface GrantRow {
  readonly privilegeType: string;
  readonly grantee: string;
}

export interface PrivilegedMembershipRow {
  readonly inheritedRole: string;
  readonly reason: 'superuser' | 'bypassrls' | 'table_owner';
}

export interface PreflightInputs {
  readonly expectedDatabaseName: string;
  readonly actualDatabaseName: string | null;
  readonly expectedRuntimeRole: string;
  readonly expectedSchema: string;
  readonly expectedTable: string;
  readonly identity: ConnectedIdentity | null;
  readonly roleAttributes: RoleAttributesRow | null;
  readonly ownership: TableOwnershipRow | null;
  readonly rlsStatus: RlsStatusRow | null;
  readonly policies: readonly PolicyRow[];
  /** Grants ya filtrados por quien consulta: privilegios presentes fuera de
   * SELECT/INSERT/UPDATE/DELETE (p. ej. TRUNCATE/TRIGGER/REFERENCES) para el rol conectado
   * o para PUBLIC. */
  readonly excessGrants: readonly GrantRow[];
  /** Roles que el rol conectado hereda (directa o transitivamente) y que son superusuario,
   * tienen BYPASSRLS, o son propietarios de la tabla protegida. */
  readonly privilegedMemberships: readonly PrivilegedMembershipRow[];
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

const REQUIRED_TENANT_CONTEXT_PATTERN = /current_setting\s*\(\s*'app\.tenant_id'/i;
const REQUIRED_COMMANDS: readonly PolicyCommand[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

function commandsCoveredBy(cmd: PolicyCommand): readonly PolicyCommand[] {
  return cmd === 'ALL' ? REQUIRED_COMMANDS : [cmd];
}

/**
 * Evalúa si la configuración descrita por `inputs` es segura para ejecutar los casos del
 * laboratorio. Fail-closed: cualquier dato ausente (`null`) o inesperado se trata como
 * inseguro, nunca como "no aplica".
 */
export function evaluatePreflight(inputs: PreflightInputs): PreflightResult {
  const reasons: string[] = [];

  if (inputs.actualDatabaseName !== inputs.expectedDatabaseName) {
    // Destino equivocado: no tiene sentido seguir inspeccionando roles/políticas de una
    // base que no es la del spike. Fallar cerrado de inmediato, igual que antes.
    return { ok: false, reasons: [`unexpected_database:${inputs.actualDatabaseName ?? 'unknown'}`] };
  }

  if (!inputs.identity) {
    reasons.push('connected_identity_unavailable');
  } else {
    if (inputs.identity.currentUser !== inputs.identity.sessionUser) {
      reasons.push(
        `current_user_session_user_mismatch:${inputs.identity.currentUser}!=${inputs.identity.sessionUser}`,
      );
    }
    if (inputs.identity.currentUser !== inputs.expectedRuntimeRole) {
      // La identidad REAL de la conexión, no un nombre que llegó por configuración, es lo
      // que determina qué atributos/propiedad/políticas importan. Si no coincide con lo
      // que se esperaba usar, es una configuración de entorno equivocada: fallar cerrado.
      reasons.push(`connected_as_unexpected_role:${inputs.identity.currentUser}`);
    }
  }

  if (!inputs.roleAttributes) {
    reasons.push('runtime_role_missing');
  } else {
    if (inputs.roleAttributes.rolname !== inputs.expectedRuntimeRole) {
      reasons.push(`role_attributes_for_wrong_role:${inputs.roleAttributes.rolname}`);
    }
    if (inputs.roleAttributes.rolsuper) reasons.push('runtime_role_is_superuser');
    if (inputs.roleAttributes.rolbypassrls) reasons.push('runtime_role_has_bypassrls');
  }

  if (!inputs.ownership) {
    reasons.push('tenant_probe_missing');
  } else {
    if (inputs.ownership.schemaName !== inputs.expectedSchema || inputs.ownership.tableName !== inputs.expectedTable) {
      reasons.push(
        `ownership_row_for_wrong_object:${inputs.ownership.schemaName}.${inputs.ownership.tableName}`,
      );
    }
    if (inputs.ownership.tableOwner === inputs.expectedRuntimeRole) {
      reasons.push('runtime_role_owns_tenant_probe');
    }
  }

  if (!inputs.rlsStatus || !inputs.rlsStatus.relrowsecurity) reasons.push('rls_not_enabled');
  if (!inputs.rlsStatus || !inputs.rlsStatus.relforcerowsecurity) reasons.push('rls_not_forced');

  if (inputs.policies.length === 0) {
    reasons.push('no_rls_policy');
  } else {
    const commandsCovered = new Set<PolicyCommand>();
    for (const policy of inputs.policies) {
      const appliesToRuntime = policy.roles.includes('public') || policy.roles.includes(inputs.expectedRuntimeRole);
      if (!appliesToRuntime) continue;

      for (const covered of commandsCoveredBy(policy.cmd)) commandsCovered.add(covered);

      const usingOk = policy.usingExpr !== null && REQUIRED_TENANT_CONTEXT_PATTERN.test(policy.usingExpr);
      const checkNeeded = policy.cmd === 'ALL' || policy.cmd === 'INSERT' || policy.cmd === 'UPDATE';
      const checkOk = !checkNeeded || (policy.withCheckExpr !== null && REQUIRED_TENANT_CONTEXT_PATTERN.test(policy.withCheckExpr));

      // Una política PERMISSIVE sin una condición de tenant verificable en USING (o en
      // WITH CHECK cuando el comando lo exige) es exactamente la "política permisiva que
      // abre acceso" que el hallazgo pide detectar — p. ej. `using (true)`.
      if (policy.permissive && (!usingOk || !checkOk)) {
        reasons.push(`permissive_policy_without_tenant_condition:${policy.policyName}`);
      }
    }
    for (const required of REQUIRED_COMMANDS) {
      if (!commandsCovered.has(required)) reasons.push(`command_not_covered:${required}`);
    }
  }

  for (const grant of inputs.excessGrants) {
    reasons.push(`excess_grant:${grant.privilegeType}:${grant.grantee}`);
  }
  for (const membership of inputs.privilegedMemberships) {
    reasons.push(`inherits_privileged_role:${membership.inheritedRole}:${membership.reason}`);
  }

  return { ok: reasons.length === 0, reasons };
}
