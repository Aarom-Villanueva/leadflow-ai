import { z } from "zod";
import { identityAuth } from "@/modules/identity/auth";
import { hasTrustedOrigin, identityConfig } from "@/modules/identity/config";
import { boundedBody, consumeIdentityAttempt, safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { CommercialError } from "@/modules/leads/service";
import { dashboardMetrics, listDashboardSnapshots, saveDashboardSnapshot } from "./service";

function failure(error: unknown) {
  if (error instanceof z.ZodError) return safeError("INVALID_INPUT", 422, "Revisa el intervalo.");
  if (error instanceof CommercialError && error.status === 404) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
  if (error instanceof CommercialError && error.status === 409) return safeError("CONFLICT", 409, "Esa clave ya se usó con otro intervalo. Vuelve a intentarlo.");
  if (error instanceof CommercialError) return safeError(error.code, error.status, "Solicitud inválida.");
  return safeError("DEPENDENCY_UNAVAILABLE", 503, "No pudimos completar la operación. Inténtalo de nuevo.");
}
function singleParams(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length > 1)) throw new CommercialError(422, "INVALID_INPUT");
  return Object.fromEntries(params);
}

/** Solo lectura: no consume contadores ni escribe auditoría. El corte nunca proviene del cliente. */
export async function dashboardRequest(request: Request, org: string) {
  try {
    if (request.method !== "GET") return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const result = await dashboardMetrics(await identityPool(), session.user.id, org, singleParams(request));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

/** GET lista cortes guardados sin efectos; POST guarda uno nuevo de forma atómica e idempotente. */
export async function snapshotsRequest(request: Request, org: string) {
  try {
    if (!["GET", "POST"].includes(request.method)) return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    const saving = request.method === "POST";
    if (saving && !hasTrustedOrigin(request.headers, identityConfig(process.env).origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const db = await identityPool();
    if (!saving) return Response.json({ snapshots: await listDashboardSnapshots(db, session.user.id, org, singleParams(request)) }, { headers: { "Cache-Control": "no-store" } });
    if (!await consumeIdentityAttempt(db, "commercial:" + session.user.id, 120)) return safeError("RATE_LIMITED", 429, "Demasiados cambios. Espera un minuto.");
    let input: unknown;
    try { input = JSON.parse(await boundedBody(request, 2048)); } catch { throw new CommercialError(422, "INVALID_INPUT"); }
    return Response.json({ snapshot: await saveDashboardSnapshot(db, session.user.id, org, input) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
