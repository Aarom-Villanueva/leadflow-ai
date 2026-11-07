/**
 * Datos completamente sintéticos para el laboratorio descartable de LF-002a/LF-023.
 * Ningún valor aquí es una credencial real, corresponde a una persona real, ni se usa
 * fuera de la base descartable del spike.
 *
 * Sin importaciones externas: este archivo no depende de `better-auth`/`drizzle-orm`/
 * `pg`, por lo que sigue siendo válido para TypeScript aunque esos paquetes no estén
 * instalados todavía (fase 1 de LF-023).
 *
 * Revisión independiente del PR #19, hallazgo 4: ya no se declaran usuarios/membresías
 * sintéticos estáticos aquí (p. ej. un "usuario sin membresía" con un `id` fijo e
 * inventado). Esos usuarios nunca pasaban por un alta real de Better Auth — eran
 * precisamente el tipo de sesión "declarada" que la revisión pidió sustituir. Las pruebas
 * de sesión/membresía (P10-P14, auth-boundary.test.ts) ahora dan de alta usuarios reales
 * vía `auth.api.signUpEmail` y solo entonces insertan, para ESE `id` real devuelto por
 * Better Auth, la fila de `probe_memberships` que cada caso necesite — nunca al revés.
 * Solo quedan aquí los tenants y las filas de `tenant_probe`, que P02-P09
 * (isolation.test.ts) sí ejercitan de forma puramente RLS, sin pasar por Better Auth.
 */

export interface SyntheticTenant {
  readonly tenantId: string;
  readonly label: string;
}

export const TENANT_A: SyntheticTenant = { tenantId: 'tenant-a-lf002a', label: 'Tenant A (LF-002a spike)' };
export const TENANT_B: SyntheticTenant = { tenantId: 'tenant-b-lf002a', label: 'Tenant B (LF-002a spike)' };

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
