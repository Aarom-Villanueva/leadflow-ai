import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { hasTrustedOrigin, identityConfig } from "./config";
import { identityAuth } from "./auth";
import { identityPool } from "@/shared/database/runtime";

export function safeError(code: string, status: number, message: string) {
  return Response.json({ code, message, requestId: randomUUID() }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function boundedBody(request: Request, limit: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("Request body too large"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}

export async function consumeIdentityAttempt(db: Pool, key: string, max = 5): Promise<boolean> {
  const digest = createHash("sha256").update(key).digest("hex");
  const result = await db.query<{ attempts: number }>(`
    insert into auth_attempts (key, window_start, attempts)
    values ($1, date_trunc('minute', clock_timestamp()), 1)
    on conflict (key) do update set
      attempts=case when auth_attempts.window_start < date_trunc('minute',clock_timestamp()) then 1 else auth_attempts.attempts+1 end,
      window_start=date_trunc('minute',clock_timestamp())
    returning attempts
  `, [digest]);
  return result.rows[0].attempts <= max;
}

export async function handleAuth(request: Request) {
  try {
    const config = identityConfig(process.env);
    const path = new URL(request.url).pathname;
    let forwarded = request;
    if (request.method === "GET" && !path.endsWith("/get-session")) return safeError("NOT_AVAILABLE", 404, "Esta función todavía no está disponible.");
    if (request.method !== "GET") {
      if (!hasTrustedOrigin(request.headers, config.origin)) return safeError("FORBIDDEN_ORIGIN", 403, "Solicitud no permitida.");
      if (Number(request.headers.get("content-length") ?? 0) > 8192) return safeError("INVALID_INPUT", 422, "Solicitud demasiado grande.");
      let raw: string;
      try { raw = await boundedBody(request, 8192); }
      catch { return safeError("INVALID_INPUT", 422, "Solicitud demasiado grande."); }
      forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: raw });
      const endpoint = new URL(request.url).pathname.split("/").at(-1);
      // Better Auth uses /sign-in/email and /sign-up/email; match the complete suffix.
      if (path.endsWith("/sign-in/email") || path.endsWith("/sign-up/email")) {
        let email: unknown;
        try { email = (JSON.parse(raw) as { email?: unknown }).email; } catch { return safeError("INVALID_INPUT", 422, "Solicitud inválida."); }
        if (typeof email !== "string" || email.length > 254) return safeError("INVALID_INPUT", 422, "Revisa los datos ingresados.");
        if (!await consumeIdentityAttempt(await identityPool(), path + ":" + email.trim().toLowerCase())) {
          const response = safeError("RATE_LIMITED", 429, "Demasiados intentos. Espera un minuto.");
          response.headers.set("Retry-After", "60");
          return response;
        }
      } else if (endpoint !== "sign-out") {
        // Email delivery, password resets and other account mutations are not enabled in this increment.
        return safeError("NOT_AVAILABLE", 404, "Esta función todavía no está disponible.");
      }
    }
    const result = await (await identityAuth()).handler(forwarded);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch { return safeError("IDENTITY_UNAVAILABLE", 503, "El acceso no está disponible temporalmente."); }
}
