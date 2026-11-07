import { Badge } from "@/components/ui/badge";

export type OrgRole = "owner" | "admin" | "sales";

const labels: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  sales: "Ventas",
};

export function RoleBadge({ role }: { role: OrgRole }) {
  return <Badge tone={role === "owner" ? "info" : "neutral"}>{labels[role]}</Badge>;
}
