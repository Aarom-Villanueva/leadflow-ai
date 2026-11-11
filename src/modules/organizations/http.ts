import { identityAuth } from "@/modules/identity/auth";
import { hasTrustedOrigin, identityConfig } from "@/modules/identity/config";
import { boundedBody, consumeIdentityAttempt, safeError } from "@/modules/identity/http";
import { identityPool } from "@/shared/database/runtime";
import { capabilities, createOrganization, getOrganization, listOrganizations, organizationInput } from "./service";

export async function organizationsRequest(request: Request, id?: string, administration = false) {
  try {
    if (request.method !== "GET" && !hasTrustedOrigin(request.headers, identityConfig(process.env).origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
    const session = await (await identityAuth()).api.getSession({ headers: request.headers });
    if (!session) return safeError("UNAUTHENTICATED", 401, "Inicia sesión para continuar.");
    const db = await identityPool();
    if (id) {
      const organization = await getOrganization(db, session.user.id, id);
      if (!organization) return safeError("NOT_FOUND", 404, "Organización no encontrada.");
      if (administration && !capabilities(organization.role).manageMembers) return safeError("FORBIDDEN", 403, "No tienes permiso para administrar esta organización.");
      return Response.json({ organization, capabilities: capabilities(organization.role) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "GET") return Response.json({ organizations: await listOrganizations(db, session.user.id) }, { headers: { "Cache-Control": "no-store" } });
    if (!await consumeIdentityAttempt(db, "create-org:" + session.user.id, 10)) return safeError("RATE_LIMITED", 429, "Demasiados intentos. Espera un minuto.");
    let raw: string;
    try { raw = await boundedBody(request, 2048); }
    catch { return safeError("INVALID_INPUT", 422, "Revisa los datos ingresados."); }
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return safeError("INVALID_INPUT", 422, "Solicitud inválida."); }
    const input = organizationInput.safeParse(body);
    if (!input.success) return safeError("INVALID_INPUT", 422, "Revisa el nombre, identificador y zona horaria.");
    const organizationId = await createOrganization(db, session.user.id, input.data);
    return Response.json({ id: organizationId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return safeError("SLUG_UNAVAILABLE", 409, "Ese identificador no está disponible.");
    return safeError("DEPENDENCY_UNAVAILABLE", 503, "No pudimos completar la operación. Inténtalo de nuevo.");
  }
}
