import { z } from "zod";
import { identityAuth } from "@/modules/identity/auth";
import { hasTrustedOrigin, identityConfig } from "@/modules/identity/config";
import { boundedBody, consumeIdentityAttempt, safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { CommercialError } from "@/modules/leads/service";
import { closeFollowup, createActivity, editActivity, listActivity } from "./service";
export type ActivityAction = "list" | "create" | "edit" | "complete" | "cancel";
export async function activityRequest(request: Request, org: string, resource: "interactions" | "followups", action: ActivityAction, id = "") {
  try {
    const method = action === "list" ? "GET" : action === "edit" ? "PATCH" : "POST";
    if (request.method !== method || (resource === "interactions" && ["complete", "cancel"].includes(action))) return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    if (method !== "GET" && !hasTrustedOrigin(request.headers, identityConfig(process.env).origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const db = await identityPool(); let input: unknown;
    if (method !== "GET") {
      if (!await consumeIdentityAttempt(db, "commercial:" + session.user.id, 120)) return safeError("RATE_LIMITED", 429, "Demasiados cambios. Espera un minuto.");
      try { input = JSON.parse(await boundedBody(request, 20000)); } catch { throw new CommercialError(422, "INVALID_INPUT"); }
    }
    let result;
    if (action === "list") {
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => params.getAll(key).length > 1)) throw new CommercialError(422, "INVALID_INPUT");
      result = await listActivity(db, session.user.id, org, resource, Object.fromEntries(params));
    } else if (action === "create") result = { item: await createActivity(db, session.user.id, org, resource, input) };
    else if (action === "edit") result = { item: await editActivity(db, session.user.id, org, resource, id, input) };
    else result = { item: await closeFollowup(db, session.user.id, org, id, action === "complete" ? "completed" : "canceled", input) };
    return Response.json(result, { status: action === "create" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return safeError("INVALID_INPUT", 422, "Revisa los campos, las fechas y los filtros.");
    if (error instanceof CommercialError) return safeError(error.code, error.status, error.status === 404 ? "Registro no encontrado." : error.status === 409 ? "El registro cambió o la clave ya fue usada. Recarga antes de intentar de nuevo." : "Solicitud inválida.");
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (["23503", "23514", "22P02"].includes(code)) return safeError("INVALID_REFERENCE", 422, "El prospecto o el responsable no están disponibles.");
    if (["23505", "40001", "40P01"].includes(code)) return safeError("CONFLICT", 409, "El registro cambió. Recarga antes de intentar de nuevo.");
    return safeError("DEPENDENCY_UNAVAILABLE", 503, "No pudimos completar la operación. Inténtalo de nuevo.");
  }
}
