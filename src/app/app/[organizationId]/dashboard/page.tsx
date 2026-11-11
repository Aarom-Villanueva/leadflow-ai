import { Workspace } from "@/modules/leads/workspace";
import { DashboardClient } from "@/modules/analytics/dashboard-client";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <Workspace organizationId={organizationId} title="Dashboard"><DashboardClient organizationId={organizationId} /></Workspace>;
}
