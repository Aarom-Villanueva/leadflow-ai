import { snapshotsRequest } from "@/modules/analytics/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) { const p = await params; return snapshotsRequest(request, p.organizationId); }
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) { const p = await params; return snapshotsRequest(request, p.organizationId); }
