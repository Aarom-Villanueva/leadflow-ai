import { Workspace } from "@/modules/leads/workspace";
import { StagesClient } from "@/modules/leads/stages-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <Workspace organizationId={organizationId} title="Etapas del pipeline"><StagesClient organizationId={organizationId} /></Workspace>;
}
