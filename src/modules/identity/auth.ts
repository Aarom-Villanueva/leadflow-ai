import { betterAuth } from "better-auth";
import type { Pool } from "pg";
import { identityConfig } from "./config";
import { identityPool } from "@/shared/database/runtime";

export function createIdentityAuth(db: Pool, config: { origin: string; secret: string }) {
  return betterAuth({
    database: db,
    secret: config.secret,
    baseURL: config.origin,
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    // Persistent identity-keyed limits are enforced by our HTTP boundary, not process memory.
    rateLimit: { enabled: false },
    advanced: { useSecureCookies: config.origin.startsWith("https:"), ipAddress: { disableIpTracking: true } },
  });
}

let auth: ReturnType<typeof createIdentityAuth> | undefined;
export async function identityAuth() {
  if (!auth) auth = createIdentityAuth(await identityPool(), identityConfig(process.env));
  return auth;
}
