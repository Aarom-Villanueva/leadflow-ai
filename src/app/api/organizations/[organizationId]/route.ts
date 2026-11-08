import { organizationsRequest } from "@/modules/organizations/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  return organizationsRequest(request, (await context.params).organizationId);
}
