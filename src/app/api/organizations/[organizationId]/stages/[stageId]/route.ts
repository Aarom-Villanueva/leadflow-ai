import { leadsRequest } from "@/modules/leads/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; stageId: string }> }) {
  const p = await params;
  return leadsRequest(request, p.organizationId, "updateStage", p.stageId);
}
