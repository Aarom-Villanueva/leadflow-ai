import Link from "next/link";
import { requireSession } from "@/modules/identity/current-session";
import { LogoutButton } from "@/modules/identity/logout-button";
import { identityPool } from "@/shared/database/runtime";
import { listOrganizations } from "@/modules/organizations/service";
import { Card } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/role-badge";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function OrganizationsPage() {
  const session = await requireSession();
  const organizations = await listOrganizations(await identityPool(), session.user.id);
  return <div className="flex flex-col gap-5"><h1 className="text-2xl font-semibold">Elige tu organización</h1><p className="text-sm text-[var(--text-secondary)]">Hola, {session.user.name}. Cada organización tiene sus propios datos y permisos.</p>
    {organizations.length ? organizations.map(org => <Link key={org.id} href={`/app/${org.id}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><Card><div className="flex items-center justify-between gap-3"><span>{org.name}</span><RoleBadge role={org.role} /></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{org.timezone}</p></Card></Link>) : <Card>Aún no perteneces a ninguna organización.</Card>}
    <ButtonLink href="/organizations/new" variant="primary">Crear organización</ButtonLink><LogoutButton /></div>;
}
