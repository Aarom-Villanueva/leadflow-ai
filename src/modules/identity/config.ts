import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
});

export class IdentityUnavailable extends Error {
  constructor() { super("Identity is not configured"); }
}

export function identityConfig(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new IdentityUnavailable();
  const database = new URL(result.data.DATABASE_URL);
  const origin = new URL(result.data.APP_ORIGIN);
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/") throw new IdentityUnavailable();
  if (origin.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) throw new IdentityUnavailable();
  return { databaseUrl: result.data.DATABASE_URL, secret: result.data.AUTH_SECRET, origin: origin.origin };
}

/** A missing Origin may use Referer, but an explicitly wrong Origin never does. */
export function hasTrustedOrigin(headers: Headers, expected: string): boolean {
  const origin = headers.get("origin");
  if (origin !== null) return origin === expected;
  try { return new URL(headers.get("referer") ?? "").origin === expected; }
  catch { return false; }
}
