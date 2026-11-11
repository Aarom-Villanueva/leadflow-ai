import { z } from "zod";
import { identityAuth } from "@/modules/identity/auth";
import { hasTrustedOrigin, identityConfig } from "@/modules/identity/config";
import { boundedBody, consumeIdentityAttempt, safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { CommercialError, configureStage, createLead, getLead, leadHistory, listLeads, pipelineMetadata, updateLead } from "./service";

export type Action = "list" | "create" | "get" | "update" | "archive" | "history" | "pipeline" | "createStage" | "updateStage";
const methods: Record<Action, string> = { list: "GET", create: "POST", get: "GET", update: "PATCH", archive: "POST", history: "GET", pipeline: "GET", createStage: "POST", updateStage: "PATCH" };
export async function leadsRequest(request: Request, org: string, action: Action, id = "") {
  try {
    if (request.method !== methods[action]) return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    const mutation = request.method !== "GET";
    if (mutation && !hasTrustedOrigin(request.headers, identityConfig(process.env).origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const db = await identityPool();
    let input: unknown;
    if (mutation) {
      // One counter per authenticated identity, shared across every organization and route spelling.
      if (!await consumeIdentityAttempt(db, `commercial:${session.user.id}`, 120)) return safeError("RATE_LIMITED", 429, "Demasiados cambios. Espera un minuto.");
      try { input = JSON.parse(await boundedBody(request, 4096)); } catch { throw new CommercialError(422, "INVALID_INPUT"); }
    }
    const actor = session.user.id;
    let result: unknown;
    switch (action) {
      case "list": {
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some(key => params.getAll(key).length > 1)) throw new CommercialError(422, "INVALID_INPUT");
        result = await listLeads(db, actor, org, Object.fromEntries(params)); break;
      }
      case "create": result = { lead: await createLead(db, actor, org, input) }; break;
      case "get": result = { lead: await getLead(db, actor, org, id) }; break;
      case "update": result = { lead: await updateLead(db, actor, org, id, input) }; break;
      case "archive": result = { lead: await updateLead(db, actor, org, id, input, true) }; break;
      case "history": result = { events: await leadHistory(db, actor, org, id) }; break;
      case "pipeline": result = await pipelineMetadata(db, actor, org); break;
      case "createStage": result = { stage: await configureStage(db, actor, org, input) }; break;
      case "updateStage": result = { stage: await configureStage(db, actor, org, input, id) }; break;
    }
    return Response.json(result, { status: action === "create" || action === "createStage" ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return safeError("INVALID_INPUT", 422, "Revisa los campos y los filtros.");
    if (error instanceof CommercialError) return safeError(error.code, error.status, error.status === 409 ? "El registro cambió o está en uso. Recarga antes de volver a intentar." : error.status === 404 ? "Registro no encontrado." : error.status === 403 ? "No tienes permiso para esta acción." : "No pudimos completar la solicitud.");
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    if (["23503", "23514", "22P02"].includes(String(code))) return safeError("INVALID_REFERENCE", 422, "La etapa o el responsable no están disponibles.");
    if (["23505", "40001", "40P01"].includes(String(code))) return safeError("CONFLICT", 409, "El registro cambió o ya existe. Recarga antes de intentar de nuevo.");
    return safeError("DEPENDENCY_UNAVAILABLE", 503, "No pudimos completar la operación. Inténtalo de nuevo.");
  }
}
