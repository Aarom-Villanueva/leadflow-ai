import { randomUUID } from "node:crypto";
import { getHealth } from "@/modules/platform/application/health";
import { loadEnvironment } from "@/shared/config/environment";
import { internalErrorResponse } from "@/shared/errors/http-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const requestId = randomUUID();
  try {
    loadEnvironment(process.env);
    return Response.json(getHealth(), {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch {
    // Fixed metadata only: no raw exception, environment, or request content.
    console.error(JSON.stringify({ level: "error", code: "HEALTH_FAILED", requestId }));
    return internalErrorResponse(requestId);
  }
}
