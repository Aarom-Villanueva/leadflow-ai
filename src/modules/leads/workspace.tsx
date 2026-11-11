import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireSession } from "@/modules/identity/current-session";
import { LogoutButton } from "@/modules/identity/logout-button";
import { identityPool } from "@/shared/database/runtime";
import { getOrganization } from "@/modules/organizations/service";
import { RoleBadge } from "@/components/ui/role-badge";

export async function Workspace({ organizationId, title, children }: { organizationId: string; title: string; children: ReactNode }) {
  const session = await requireSession();
  const org = await getOrganization(await identityPool(), session.user.id, organizationId);
  if (!org) notFound();
  const root = `/app/${org.id}`;
  return <div className="min-h-screen"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4"><Link href="/organizations" className="font-semibold">LeadFlow <span className="text-[var(--accent)]">AI</span></Link><div className="flex flex-wrap items-center gap-3"><span>{org.name}</span><RoleBadge role={org.role} /><LogoutButton /></div></header>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><nav aria-label="Espacio comercial" className="mb-8 flex flex-wrap gap-5 text-sm text-[var(--accent)]"><Link href={root}>Inicio</Link><Link href={`${root}/leads`}>Prospectos</Link><Link href={`${root}/pipeline`}>Pipeline</Link>{org.role !== "sales" && <Link href={`${root}/stages`}>Etapas</Link>}<Link href="/organizations">Cambiar organización</Link></nav><main id="main" tabIndex={-1}><h1 className="mb-6 text-3xl font-semibold tracking-tight">{title}</h1>{children}</main></div>
  </div>;
}
