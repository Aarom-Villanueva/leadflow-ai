import { leadsRequest } from "@/modules/leads/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; leadId: string }> }) {
  const p = await params;
  return leadsRequest(request, p.organizationId, "archive", p.leadId);
}
