import { organizationsRequest } from "@/modules/organizations/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => organizationsRequest(request);
export const POST = (request: Request) => organizationsRequest(request);
