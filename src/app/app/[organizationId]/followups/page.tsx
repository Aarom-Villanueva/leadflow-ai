import { Workspace } from "@/modules/leads/workspace";
import { FollowupsClient } from "@/modules/activity/followups-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <Workspace organizationId={organizationId} title="Próximas acciones"><FollowupsClient organizationId={organizationId} /></Workspace>;
}
