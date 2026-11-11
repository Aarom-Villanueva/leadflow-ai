import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/modules/identity/current-session";
import { identityPool } from "@/shared/database/runtime";
import { capabilities, getOrganization } from "@/modules/organizations/service";
export const dynamic = "force-dynamic";
export default async function AdministrationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const session = await requireSession();
  const org = await getOrganization(await identityPool(), session.user.id, (await params).organizationId);
  if (!org) notFound();
  return <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12"><h1 className="text-2xl font-semibold">Administración</h1>{capabilities(org.role).manageMembers ? <><p className="mt-5">{org.name} · {org.timezone}</p><p className="mt-3 text-[var(--text-secondary)]">Tu rol permite administrar esta organización. La gestión de invitaciones y miembros estará disponible en el siguiente incremento.</p></> : <p role="alert" className="mt-5 text-[var(--danger)]">No tienes permiso para administrar esta organización.</p>}<Link className="mt-6 inline-block text-[var(--accent)] underline" href={`/app/${org.id}`}>Volver al espacio</Link></main>;
}
