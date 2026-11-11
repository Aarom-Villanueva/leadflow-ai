import { Workspace } from "@/modules/leads/workspace";
import { DetailClient } from "@/modules/leads/detail-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string; leadId: string }> }) {
  const { organizationId, leadId } = await params;
  return <Workspace organizationId={organizationId} title="Ficha del prospecto"><DetailClient organizationId={organizationId} leadId={leadId} /></Workspace>;
}
