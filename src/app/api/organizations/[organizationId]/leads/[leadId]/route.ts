import { leadsRequest } from "@/modules/leads/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string; leadId: string }> }) {
  const p = await params;
  return leadsRequest(request, p.organizationId, "get", p.leadId);
}
export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; leadId: string }> }) {
  const p = await params;
  return leadsRequest(request, p.organizationId, "update", p.leadId);
}
