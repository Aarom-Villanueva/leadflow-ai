import { Workspace } from "@/modules/leads/workspace";
import { LeadsClient } from "@/modules/leads/leads-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <Workspace organizationId={organizationId} title="Pipeline"><LeadsClient organizationId={organizationId} board /></Workspace>;
}
