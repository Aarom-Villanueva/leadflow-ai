import { z } from "zod";
import { identityAuth } from "@/modules/identity/auth";
import { safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { CommercialError } from "@/modules/leads/service";
import { dashboardMetrics } from "./service";

/** Solo lectura: no consume contadores ni escribe auditoría. El corte nunca proviene del cliente. */
export async function dashboardRequest(request: Request, org: string) {
  try {
    if (request.method !== "GET") return safeError("METHOD_NOT_ALLOWED", 405, "Método no permitido.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(org).success) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length > 1)) return safeError("INVALID_INPUT", 422, "Revisa el intervalo.");
    const result = await dashboardMetrics(await identityPool(), session.user.id, org, Object.fromEntries(params));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return safeError("INVALID_INPUT", 422, "Revisa el intervalo.");
    if (error instanceof CommercialError && error.status === 404) return safeError("NOT_FOUND", 404, "Registro no encontrado.");
    return safeError("DEPENDENCY_UNAVAILABLE", 503, "No pudimos calcular las métricas. Inténtalo de nuevo.");
  }
}
