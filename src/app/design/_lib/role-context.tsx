"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { OrgRole } from "@/components/ui/role-badge";
import { CURRENT_MEMBER_ID, SYNTHETIC_MEMBERS, memberById } from "@/app/design/_data/fixtures";

/**
 * Conmutador de rol de prueba — SOLO PROTOTIPO (docs/specs/LF-003.md §3): en
 * la aplicación real, el rol lo decide siempre el servidor a partir de la
 * sesión y la membresía, nunca el cliente (ver SECURITY.md, matriz de
 * autorización). Esto existe únicamente para revisar, sin backend, cómo
 * cambia la navegación y las acciones disponibles según el rol.
 */
interface RolePreviewValue {
  role: OrgRole;
  memberName: string;
  setRole: (role: OrgRole) => void;
}

const RolePreviewContext = createContext<RolePreviewValue | null>(null);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const initialRole = memberById(CURRENT_MEMBER_ID)?.role ?? "sales";
  const [role, setRole] = useState<OrgRole>(initialRole);
  const memberName = memberById(CURRENT_MEMBER_ID)?.name ?? "Persona de prueba";

  const value = useMemo(() => ({ role, memberName, setRole }), [role, memberName]);
  return <RolePreviewContext.Provider value={value}>{children}</RolePreviewContext.Provider>;
}

export function useRolePreview(): RolePreviewValue {
  const context = useContext(RolePreviewContext);
  if (!context) throw new Error("useRolePreview debe usarse dentro de RolePreviewProvider");
  return context;
}

export const ROLE_PREVIEW_OPTIONS: { value: OrgRole; label: string }[] = [
  { value: "owner", label: "Propietario" },
  { value: "admin", label: "Administrador" },
  { value: "sales", label: "Ventas" },
];

export { SYNTHETIC_MEMBERS };
