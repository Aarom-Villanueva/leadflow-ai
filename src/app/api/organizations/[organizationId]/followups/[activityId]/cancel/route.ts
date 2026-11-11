import { activityRequest } from "@/modules/activity/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; activityId: string }> }) { const p = await params; return activityRequest(request, p.organizationId, "followups", "cancel", p.activityId); }
