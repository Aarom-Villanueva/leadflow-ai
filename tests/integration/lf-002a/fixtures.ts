/**
 * Datos completamente sintéticos para el laboratorio descartable de LF-002a/LF-023.
 * Ningún valor aquí es una credencial real, corresponde a una persona real, ni se usa
 * fuera de la base descartable del spike. Los correos usan el dominio reservado
 * `.invalid` (nunca resoluble por diseño), nunca un dominio real.
 *
 * Sin importaciones externas: este archivo no depende de `better-auth`/`drizzle-orm`/
 * `pg`, por lo que sigue siendo válido para TypeScript aunque esos paquetes no estén
 * instalados todavía (fase 1 de LF-023).
 */

export type MembershipRole = 'owner' | 'admin' | 'sales';

export interface SyntheticUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface SyntheticTenant {
  readonly tenantId: string;
  readonly label: string;
}

export interface SyntheticMembership {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: MembershipRole;
  readonly revoked: boolean;
}

export const TENANT_A: SyntheticTenant = { tenantId: 'tenant-a-lf002a', label: 'Tenant A (LF-002a spike)' };
export const TENANT_B: SyntheticTenant = { tenantId: 'tenant-b-lf002a', label: 'Tenant B (LF-002a spike)' };

export const USER_A_OWNER: SyntheticUser = { id: 'user-a-owner', name: 'A Owner', email: 'a-owner@example.invalid' };
export const USER_A_SALES: SyntheticUser = { id: 'user-a-sales', name: 'A Sales', email: 'a-sales@example.invalid' };
export const USER_B_ADMIN: SyntheticUser = { id: 'user-b-admin', name: 'B Admin', email: 'b-admin@example.invalid' };
export const USER_NO_MEMBERSHIP: SyntheticUser = {
  id: 'user-no-membership', name: 'No Membership', email: 'no-membership@example.invalid',
};
export const USER_REVOKED: SyntheticUser = { id: 'user-revoked', name: 'Revoked Member', email: 'revoked@example.invalid' };
export const USER_MULTI_TENANT: SyntheticUser = {
  id: 'user-multi-tenant', name: 'Multi Tenant', email: 'multi@example.invalid',
};

export const ALL_SYNTHETIC_USERS: readonly SyntheticUser[] = [
  USER_A_OWNER, USER_A_SALES, USER_B_ADMIN, USER_NO_MEMBERSHIP, USER_REVOKED, USER_MULTI_TENANT,
];

/** Cubre, entre todas las filas: owner/sales/admin (P14), sin membresía (P11), membresía
 * revocada (P11), y un usuario con membresía válida en ambos tenants (P12). */
export const SYNTHETIC_MEMBERSHIPS: readonly SyntheticMembership[] = [
  { userId: USER_A_OWNER.id, tenantId: TENANT_A.tenantId, role: 'owner', revoked: false },
  { userId: USER_A_SALES.id, tenantId: TENANT_A.tenantId, role: 'sales', revoked: false },
  { userId: USER_B_ADMIN.id, tenantId: TENANT_B.tenantId, role: 'admin', revoked: false },
  { userId: USER_REVOKED.id, tenantId: TENANT_A.tenantId, role: 'sales', revoked: true },
  { userId: USER_MULTI_TENANT.id, tenantId: TENANT_A.tenantId, role: 'sales', revoked: false },
  { userId: USER_MULTI_TENANT.id, tenantId: TENANT_B.tenantId, role: 'sales', revoked: false },
];

export interface SyntheticTenantProbeRow {
  readonly id: string;
  readonly tenantId: string;
  readonly label: string;
}

export const TENANT_PROBE_ROWS: readonly SyntheticTenantProbeRow[] = [
  { id: 'probe-a-1', tenantId: TENANT_A.tenantId, label: 'A row 1' },
  { id: 'probe-a-2', tenantId: TENANT_A.tenantId, label: 'A row 2' },
  { id: 'probe-b-1', tenantId: TENANT_B.tenantId, label: 'B row 1' },
];
