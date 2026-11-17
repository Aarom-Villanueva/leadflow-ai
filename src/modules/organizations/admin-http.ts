import { z } from "zod";
import { identityAuth } from "@/modules/identity/auth";
import { hasTrustedOrigin, identityConfig } from "@/modules/identity/config";
import { boundedBody, consumeIdentityAttempt, safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { administrationAudit, administrationInfo, administrationMembers, administrationMutate, AdministrationError } from "./admin-service";
type Resource = "profile" | "members" | "member" | "audit" | "transfer";
export async function administrationRequest(request: Request, org: string, resource: Resource, target = "") {
  try {
    const reading = request.method === "GET", allowed = resource === "profile" ? ["GET", "PATCH"] : resource === "member" ? ["PATCH"] : resource === "transfer" ? ["POST"] : ["GET"];
    if (!allowed.includes(request.method)) return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    if (!reading && !hasTrustedOrigin(request.headers, identityConfig(process.env).origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success || (resource === "member" && !z.uuid().safeParse(target).success)) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const db = await identityPool(); let result: unknown;
    if (reading) {
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new AdministrationError(422, "INVALID_INPUT");
      if (resource === "profile") { if ([...params].length) throw new AdministrationError(422, "INVALID_INPUT"); result = await administrationInfo(db, session.user.id, org); }
      else result = resource === "members" ? await administrationMembers(db, session.user.id, org, Object.fromEntries(params)) : await administrationAudit(db, session.user.id, org, Object.fromEntries(params));
    } else {
      if (!await consumeIdentityAttempt(db, "organization-admin:" + session.user.id, 120)) { const error = safeError("RATE_LIMITED", 429, "Demasiados cambios. Espera un minuto."); error.headers.set("Retry-After", "60"); return error; }
      let input: unknown; try { input = JSON.parse(await boundedBody(request, 2048)); } catch { throw new AdministrationError(422, "INVALID_INPUT"); }
      result = await administrationMutate(db, session.user.id, org, resource === "profile" ? "profile" : resource === "transfer" ? "transfer" : "member", input, target);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const pg = error as { code?: string; message?: string };
    let status = error instanceof AdministrationError ? error.status : 503, code = error instanceof AdministrationError ? error.code : "DEPENDENCY_UNAVAILABLE";
    if (error instanceof z.ZodError || ["22023", "22021", "22P05", "22P02", "22003"].includes(pg.code ?? "")) { status = 422; code = "INVALID_INPUT"; }
    if (pg.code === "P0002") { status = 404; code = "NOT_FOUND"; }
    if (pg.code === "42501") { status = 403; code = "FORBIDDEN"; }
    if (["40001", "40P01", "23505"].includes(pg.code ?? "")) { status = 409; code = "CONFLICT"; }
    if (pg.code === "P0001" && ["SELF_CHANGE", "LAST_OWNER", "INVALID_STATE", "VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT"].includes(pg.message ?? "")) { status = 409; code = pg.message!; }
    const message = status === 404 ? "Registro no encontrado." : status === 403 ? "No tienes permiso para esta operación." : status === 409 ? "El equipo o la organización cambiaron, o la operación no está permitida. Recarga antes de intentarlo de nuevo." : status === 422 ? "Revisa los campos y filtros." : "No pudimos completar la operación. El resultado puede no estar confirmado; conserva el intento para reintentarlo.";
    return safeError(code, status, message);
  }
}
