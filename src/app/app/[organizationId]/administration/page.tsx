import { Workspace } from "@/modules/leads/workspace";
import { AdministrationClient } from "@/modules/organizations/admin-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <Workspace organizationId={organizationId} title="Administración"><AdministrationClient key={organizationId} organizationId={organizationId} /></Workspace>;
}
