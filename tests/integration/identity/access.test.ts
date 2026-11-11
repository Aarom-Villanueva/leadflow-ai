import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleAuth, consumeIdentityAttempt } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { assertRuntimeRole, identityPool, withActor } from "../../../src/shared/database/runtime";

const origin = "http://127.0.0.1:4310";
let admin: Pool;
let runtime: Pool;
let cookieA: string;
let cookieB: string;
let userA: string;
let userB: string;
let organizationA: string;
const password = "Synthetic-only-password-025!";

function request(path: string, method = "GET", cookie = "", body?: unknown, source: string | null = origin) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  if (source) headers.set("origin", source);
  return new Request(origin + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function signUp(label: string) {
  const email = `${label}@identity-test.invalid`;
  const response = await handleAuth(request("/api/auth/sign-up/email", "POST", "", { name: "Persona sintética", email, password }));
  expect(response.status).toBe(200);
  const cookies = response.headers.getSetCookie();
  expect(cookies.some(c => /httponly/i.test(c))).toBe(true);
  const cookie = cookies.map(c => c.split(";")[0]).join("; ");
  const data = await response.json();
  return { cookie, userId: data.user.id as string };
}

describe("LF-025 real PostgreSQL and Better Auth boundary", () => {
  beforeAll(async () => {
    const urlText = process.env.IDENTITY_TEST_ADMIN_URL;
    if (!urlText) throw new Error("IDENTITY_TEST_ADMIN_URL is required; integration is never silently skipped");
    const url = new URL(urlText);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search || url.pathname !== "/lf025_identity_test") throw new Error("Refusing DDL outside the dedicated local test database");
    admin = new Pool({ connectionString: urlText, max: 2 });
    const existing = await admin.query("select to_regclass('public.organizations') as existing");
    if (existing.rows[0].existing) throw new Error("Use a fresh disposable test database; existing schema is never overwritten");
    await admin.query("create role lf025_test_owner login nosuperuser nocreatedb nocreaterole nobypassrls");
    await admin.query("create role lf025_test_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
    await admin.query("alter database lf025_identity_test owner to lf025_test_owner");
    const provisionerUrl = new URL(url); provisionerUrl.username = "lf025_test_owner"; provisionerUrl.password = "";
    execFileSync(process.execPath, ["scripts/identity/migrate.mjs"], {
      env: { ...process.env, IDENTITY_MIGRATION_URL: provisionerUrl.toString(), IDENTITY_RUNTIME_ROLE: "lf025_test_runtime" },
      encoding: "utf8",
    });
    url.username = "lf025_test_runtime"; url.password = "";
    process.env.DATABASE_URL = url.toString();
    process.env.AUTH_SECRET = randomBytes(32).toString("hex");
    process.env.APP_ORIGIN = origin;
    runtime = await identityPool();
    const a = await signUp("alpha"), b = await signUp("beta");
    cookieA = a.cookie; cookieB = b.cookie; userA = a.userId; userB = b.userId;
  });

  afterAll(async () => { await runtime?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

  test("runtime is neither owner nor privileged", async () => {
    await expect(assertRuntimeRole(runtime)).resolves.toBeUndefined();
    await expect(assertRuntimeRole(admin)).rejects.toThrow();
    await expect(runtime.query("insert into memberships(organization_id,user_id,role) values($1,$2,'owner')", [randomUUID(), userA])).rejects.toThrow();
  });
  test("login rejects bad credentials generically and accepts the registered password", async () => {
    const invalid = await handleAuth(request("/api/auth/sign-in/email", "POST", "", { email: "alpha@identity-test.invalid", password: "Wrong-password-123" }));
    const unknown = await handleAuth(request("/api/auth/sign-in/email", "POST", "", { email: "absent@identity-test.invalid", password }));
    expect(invalid.status).toBe(401); expect(unknown.status).toBe(401);
    expect(await invalid.json()).toEqual(await unknown.json());
    const valid = await handleAuth(request("/api/auth/sign-in/email", "POST", "", { email: "alpha@identity-test.invalid", password }));
    expect(valid.status).toBe(200);
  });
  test("missing or hostile origin is rejected before an auth mutation", async () => {
    for (const source of [null, "https://hostile.invalid"]) {
      const response = await handleAuth(request("/api/auth/sign-up/email", "POST", "", { email: "never@identity-test.invalid", name: "Never", password }, source));
      expect(response.status).toBe(403);
    }
  });
  test("oversized auth body without Content-Length is bounded before the library reads it", async () => {
    const response = await handleAuth(request("/api/auth/sign-in/email", "POST", "", { email: "oversize@identity-test.invalid", password: "x".repeat(9000) }));
    expect(response.status).toBe(422);
  });
  test("anonymous and tampered sessions cannot list organizations", async () => {
    expect((await organizationsRequest(request("/api/organizations"))).status).toBe(401);
    expect((await organizationsRequest(request("/api/organizations", "GET", "better-auth.session_token=invalid"))).status).toBe(401);
  });
  test("organization mutations require an origin even with a valid session", async () => {
    expect((await organizationsRequest(request("/api/organizations", "POST", cookieA, { name: "Blocked", slug: "blocked-team", timezone: "UTC" }, null))).status).toBe(403);
  });
  test("create atomically records organization, owner membership and audit", async () => {
    const response = await organizationsRequest(request("/api/organizations", "POST", cookieA, { name: "Equipo Alpha", slug: "alpha-team", timezone: "America/Lima" }));
    expect(response.status).toBe(201); organizationA = (await response.json()).id;
    const rows = await admin.query("select role from memberships where organization_id=$1 and user_id=$2", [organizationA, userA]);
    expect(rows.rows).toEqual([{ role: "owner" }]);
    const audit = await admin.query("select action from organization_audit where organization_id=$1", [organizationA]);
    expect(audit.rows).toEqual([{ action: "organization.created" }]);
  });
  test("foreign IDs and listings disclose no other organization", async () => {
    const list = await organizationsRequest(request("/api/organizations", "GET", cookieB));
    expect((await list.json()).organizations).toEqual([]);
    expect((await organizationsRequest(request(`/api/organizations/${organizationA}`, "GET", cookieB), organizationA)).status).toBe(404);
    expect((await organizationsRequest(request(`/api/organizations/${randomUUID()}`, "GET", cookieB), randomUUID())).status).toBe(404);
  });
  test("role and actor injection are rejected; duplicate slug rolls back completely", async () => {
    const input = { name: "Other", slug: "alpha-team", timezone: "UTC" };
    expect((await organizationsRequest(request("/api/organizations", "POST", cookieB, { ...input, role: "owner", userId: userA }))).status).toBe(422);
    expect((await organizationsRequest(request("/api/organizations", "POST", cookieB, input))).status).toBe(409);
    const rows = await admin.query("select count(*)::int as n from memberships where user_id=$1", [userB]);
    expect(rows.rows[0].n).toBe(0);
  });
  test("an audit failure rolls back both the new organization and its owner membership", async () => {
    await admin.query("alter table organization_audit add constraint lf025_test_fail check(action <> 'organization.created') not valid");
    try {
      const response = await organizationsRequest(request("/api/organizations", "POST", cookieB, { name: "Must Roll Back", slug: "rollback-team", timezone: "UTC" }));
      expect(response.status).toBe(503);
      expect((await admin.query("select id from organizations where slug='rollback-team'")).rowCount).toBe(0);
      expect((await admin.query("select id from memberships where user_id=$1", [userB])).rowCount).toBe(0);
    } finally { await admin.query("alter table organization_audit drop constraint lf025_test_fail"); }
  });
  test("RLS denies absent actor and resets actor when a pool connection is reused", async () => {
    const single = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      expect((await single.query("select id from organizations")).rowCount).toBe(0);
      expect((await withActor(single, userA, c => c.query("select id from organizations"))).rowCount).toBe(1);
      expect((await single.query("select id from organizations")).rowCount).toBe(0);
      expect((await withActor(single, userB, c => c.query("select id from organizations"))).rowCount).toBe(0);
      await expect(withActor(single, userA, async () => { throw new Error("synthetic rollback"); })).rejects.toThrow("synthetic rollback");
      expect((await single.query("select id from organizations")).rowCount).toBe(0);
      await expect(single.query("select lf_create_organization($1,$2,$3,$4)", ["Anonymous", "anonymous-team", "UTC", randomUUID()])).rejects.toThrow("actor required");
    } finally { await single.end(); }
  });
  test("real sales membership cannot gain administrative capabilities by headers or body", async () => {
    await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [organizationA, userB]);
    const normal = await organizationsRequest(request(`/api/organizations/${organizationA}`, "GET", cookieB), organizationA);
    expect((await normal.json()).capabilities.manageMembers).toBe(false);
    const forged = request(`/api/organizations/${organizationA}/administration`, "GET", cookieB); forged.headers.set("x-role", "owner");
    expect((await organizationsRequest(forged, organizationA, true)).status).toBe(403);
    expect((await organizationsRequest(request(`/api/organizations/${organizationA}/administration`, "GET", cookieA), organizationA, true)).status).toBe(200);
  });
  test("revoked membership immediately loses access while its session stays valid", async () => {
    await admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [organizationA, userB]);
    expect((await organizationsRequest(request(`/api/organizations/${organizationA}`, "GET", cookieB), organizationA)).status).toBe(404);
  });
  test("a genuinely expired database session cannot access organizations", async () => {
    await admin.query('update "session" set "expiresAt"=now()-interval \'1 day\' where "userId"=$1', [userB]);
    expect((await organizationsRequest(request("/api/organizations", "GET", cookieB))).status).toBe(401);
  });
  test("persistent attempt limit remains enforced across two independent pools", async () => {
    const other = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const key = "rate-test:" + randomUUID();
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => consumeIdentityAttempt(i % 2 ? other : runtime, key)));
      expect(results.filter(Boolean)).toHaveLength(5);
    } finally { await other.end(); }
  });
  test("logout invalidates the exact session used to authenticate", async () => {
    const response = await handleAuth(request("/api/auth/sign-out", "POST", cookieA, {}));
    expect(response.status).toBe(200);
    expect((await organizationsRequest(request("/api/organizations", "GET", cookieA))).status).toBe(401);
  });
});
