import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/modules/identity/current-session";
import { LogoutButton } from "@/modules/identity/logout-button";
import { identityPool } from "@/shared/database/runtime";
import { capabilities, getOrganization } from "@/modules/organizations/service";
import { RoleBadge } from "@/components/ui/role-badge";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";

export default async function OrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const session = await requireSession();
  const org = await getOrganization(await identityPool(), session.user.id, (await params).organizationId);
  if (!org) notFound();
  return <div className="min-h-screen"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4"><Link href="/organizations" className="font-semibold">LeadFlow <span className="text-[var(--accent)]">AI</span></Link><div className="flex items-center gap-3"><span>{org.name}</span><RoleBadge role={org.role} /><LogoutButton /></div></header>
    <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-6 py-10"><h1 className="text-3xl font-semibold">Tu espacio de trabajo</h1><p className="mt-3 text-[var(--text-secondary)]">Has accedido a {org.name} con una membresía verificada.</p><div className="mt-8"><Card><h2 className="text-lg font-semibold">La organización está lista</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">Zona horaria: {org.timezone}. Los prospectos, el pipeline y los seguimientos se conectarán en el siguiente incremento.</p></Card></div>
      <div className="mt-6 flex flex-wrap gap-5"><Link href="/organizations" className="text-[var(--accent)] underline">Cambiar organización</Link>{capabilities(org.role).manageMembers && <Link href={`/app/${org.id}/administration`} className="text-[var(--accent)] underline">Administración</Link>}</div>
    </main></div>;
}
