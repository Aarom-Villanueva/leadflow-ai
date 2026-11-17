import { administrationRequest } from "@/modules/organizations/admin-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ organizationId: string }> }) {
 const params = await context.params; return administrationRequest(request, params.organizationId, "members");
}
