import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleAuth } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { leadsRequest, type Action } from "../../../src/modules/leads/http";
import { createLead, listLeads, pipelineMetadata, updateLead, withOrganization, configureStage, leadHistory } from "../../../src/modules/leads/service";
import { identityPool } from "../../../src/shared/database/runtime";

const origin = "http://127.0.0.1:4311";
let admin: Pool, runtime: Pool, owner: Pool;
let a: { cookie: string; id: string }, b: { cookie: string; id: string }, sales: { cookie: string; id: string };
let orgA: string, orgB: string, stageA: string, stageB: string, won: string;
let provisionerUrl: URL;
const request = (method: string, cookie: string, body?: unknown, source: string | null = origin, query = "") => new Request(origin + "/api/test" + query, {
  method, headers: { cookie, "content-type": "application/json", ...(source ? { origin: source } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function signup(label: string) {
  const response = await handleAuth(new Request(origin + "/api/auth/sign-up/email", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "Persona " + label, email: label + "@leads-test.invalid", password: "Synthetic-leads-password-026!" }) }));
  expect(response.status).toBe(200);
  return { cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "), id: (await response.json()).user.id as string };
}
async function organization(user: typeof a, slug: string) {
  const response = await organizationsRequest(request("POST", user.cookie, { name: "Equipo " + slug, slug, timezone: "America/Lima" }));
  expect(response.status).toBe(201); return (await response.json()).id as string;
}
const input = (name: string, stageId = stageA) => ({ name, stageId, email: null, phoneE164: null, source: null, assignedUserId: null });
const call = (action: Action, cookie = a.cookie, body?: unknown, id = "", org = orgA, source: string | null = origin, query = "") => leadsRequest(request(({ list: "GET", get: "GET", history: "GET", pipeline: "GET", update: "PATCH", updateStage: "PATCH" } as Partial<Record<Action, string>>)[action] ?? "POST", cookie, body, source, query), org, action, id);
function migrate() { return execFileSync(process.execPath, ["scripts/leads/migrate.mjs"], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisionerUrl.toString(), IDENTITY_RUNTIME_ROLE: "lf026_test_runtime" }, encoding: "utf8", stdio: "pipe" }); }

describe("LF-026 real PostgreSQL tenant and commercial boundary", () => {
  beforeAll(async () => {
    const text = process.env.LEADS_TEST_ADMIN_URL;
    if (!text) throw Error("LEADS_TEST_ADMIN_URL required; integration never silently skipped");
    const url = new URL(text);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search || url.pathname !== "/lf026_leads_test") throw Error("Dedicated local test target required");
    const maintenance = new URL(url); maintenance.pathname = "/postgres";
    const setup = new Pool({ connectionString: maintenance.toString() });
    try {
      if ((await setup.query("select 1 from pg_database where datname='lf026_leads_test'")).rowCount) throw Error("Existing test database never overwritten; use a fresh disposable cluster");
      await setup.query("create role lf026_test_owner login nosuperuser nocreatedb nocreaterole nobypassrls");
      await setup.query("create role lf026_test_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
      await setup.query("create database lf026_leads_test owner lf026_test_owner");
    } finally { await setup.end(); }
    admin = new Pool({ connectionString: text });
    provisionerUrl = new URL(url); provisionerUrl.username = "lf026_test_owner"; provisionerUrl.password = "";
    owner = new Pool({ connectionString: provisionerUrl.toString() });
    execFileSync(process.execPath, ["scripts/identity/migrate.mjs"], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisionerUrl.toString(), IDENTITY_RUNTIME_ROLE: "lf026_test_runtime" }, encoding: "utf8" });
    const runtimeUrl = new URL(url); runtimeUrl.username = "lf026_test_runtime"; runtimeUrl.password = "";
    process.env.DATABASE_URL = runtimeUrl.toString(); process.env.APP_ORIGIN = origin; process.env.AUTH_SECRET = randomBytes(32).toString("hex");
    runtime = await identityPool();
    a = await signup("alpha"); b = await signup("beta"); sales = await signup("sales");
    orgA = await organization(a, "alpha-team"); orgB = await organization(b, "beta-team");
    // Force the real DDL runner to fail after partial work, then prove rollback before retrying.
    await admin.query(`create function lf026_fail_ddl() returns event_trigger language plpgsql as $$ begin
      if exists(select 1 from pg_event_trigger_ddl_commands() where object_identity='public.stages') then raise exception 'synthetic DDL failure'; end if;
      end; $$; create event trigger lf026_ddl_failure on ddl_command_end when tag in('CREATE TABLE') execute function lf026_fail_ddl()`);
    try {
      expect(() => migrate()).toThrow();
      expect((await admin.query("select to_regclass('public.app_migrations') as ledger,to_regclass('public.pipelines') as pipeline")).rows[0]).toEqual({ ledger: null, pipeline: null });
      expect((await admin.query("select 1 from information_schema.columns where table_name='organization_audit' and column_name='entity_id'")).rowCount).toBe(0);
    } finally { await admin.query("drop event trigger lf026_ddl_failure; drop function lf026_fail_ddl()"); }
    migrate();
    const meta = await pipelineMetadata(runtime, a.id, orgA);
    stageA = meta.stages[0].id; won = meta.stages.find(stage => stage.kind === "won")!.id;
    stageB = (await pipelineMetadata(runtime, b.id, orgB)).stages[0].id;
    await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, sales.id]);
  });
  afterAll(async () => { await runtime?.end(); await owner?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

  test("incremental migration preserves organizations and backfills defaults; repeat verifies checksum", async () => {
    expect((await pipelineMetadata(runtime, a.id, orgA)).stages).toHaveLength(5);
    expect(migrate()).toContain("already applied");
    expect((await admin.query("select count(*)::int n from organizations")).rows[0].n).toBe(2);
    const id = await organization(a, "post-migration-team");
    expect((await pipelineMetadata(runtime, a.id, id)).stages).toHaveLength(5);
    await owner.query("update app_migrations set sha256='invalid'");
    try { expect(() => migrate()).toThrow(); } finally { await owner.query("update app_migrations set sha256=$1", [(await import("node:crypto")).createHash("sha256").update((await import("node:fs")).readFileSync("src/shared/database/migrations/0002_leads_pipeline.sql", "utf8").replace(/\r\n/g, "\n")).digest("hex")]); }
  });
  test("anonymous, tampered session, hostile or missing origin and oversized body fail", async () => {
    expect((await call("list", "")).status).toBe(401);
    expect((await call("list", "better-auth.session_token=invalid")).status).toBe(401);
    for (const source of [null, "https://hostile.invalid"]) expect((await call("create", a.cookie, input("Never"), "", orgA, source)).status).toBe(403);
    expect((await call("create", a.cookie, { ...input("x"), name: "x".repeat(5000) })).status).toBe(422);
    expect((await call("create", a.cookie, { ...input("Never"), role: "owner", actor: b.id })).status).toBe(422);
  });
  test("tenant IDs and references never cross the organization boundary", async () => {
    const lead = await createLead(runtime, b.id, orgB, input("Other tenant", stageB));
    expect((await call("get", a.cookie, undefined, lead.id)).status).toBe(404);
    expect((await call("history", a.cookie, undefined, lead.id)).status).toBe(404);
    expect((await call("update", a.cookie, { version: 1, name: "Stolen" }, lead.id)).status).toBe(404);
    expect((await call("pipeline", a.cookie, undefined, "", orgB)).status).toBe(404);
    expect((await call("create", a.cookie, input("Wrong stage", stageB))).status).toBe(422);
    expect((await call("create", a.cookie, { ...input("Wrong assignee"), assignedUserId: b.id })).status).toBe(422);
  });
  test("create/edit/assign persist normalized contact and an append-only creation event", async () => {
    const response = await call("create", a.cookie, { ...input("Prospecto real"), email: "LEAD@synthetic.invalid", phoneE164: "+51912345678", source: "referido", assignedUserId: sales.id });
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    const { lead } = await response.json();
    expect((await admin.query("select email_normalized from leads where id=$1", [lead.id])).rows[0].email_normalized).toBe("lead@synthetic.invalid");
    const patched = await updateLead(runtime, sales.id, orgA, lead.id, { version: 1, name: "Nombre actualizado" });
    expect(patched.version).toBe(2); expect(patched.name).toBe("Nombre actualizado");
    expect(await leadHistory(runtime, a.id, orgA, lead.id)).toHaveLength(1);
    await expect(runtime.query("delete from leads where id=$1", [lead.id])).rejects.toThrow();
    await expect(runtime.query("delete from lead_stage_events")).rejects.toThrow();
    await expect(runtime.query("insert into organization_audit(organization_id,actor_user_id,action,request_id) values($1,$2,'forged',$3)", [orgA, a.id, randomUUID()])).rejects.toThrow();
  });
  test("simultaneous edits yield one success and one conflict without overwriting", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Concurrent"));
    const results = await Promise.all(["First", "Second"].map(name => call("update", a.cookie, { version: 1, name }, lead.id)));
    expect(results.map(response => response.status).sort()).toEqual([200, 409]);
  });
  test("moving stages records one event; same stage does not; archive preserves history and rejects editing", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Move and archive"));
    await updateLead(runtime, a.id, orgA, lead.id, { version: 1, stageId: won });
    await updateLead(runtime, a.id, orgA, lead.id, { version: 2, stageId: won });
    expect(await leadHistory(runtime, a.id, orgA, lead.id)).toHaveLength(2);
    const archived = await updateLead(runtime, a.id, orgA, lead.id, { version: 3 }, true);
    expect(archived.archivedAt).toBeTruthy();
    expect((await call("update", a.cookie, { version: 4, name: "No" }, lead.id)).status).toBe(409);
    expect((await listLeads(runtime, a.id, orgA, { q: "Move and archive" })).leads).toHaveLength(0);
    expect((await listLeads(runtime, a.id, orgA, { q: "Move and archive", archived: "true" })).leads).toHaveLength(1);
    expect(await leadHistory(runtime, a.id, orgA, lead.id)).toHaveLength(2);
  });
  test("audit failure rolls back lead update and history insertion together", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Atomic"));
    await admin.query("alter table organization_audit add constraint lf026_reject_move check(action<>'lead.stage_changed') not valid");
    try {
      await expect(updateLead(runtime, a.id, orgA, lead.id, { version: 1, stageId: won })).rejects.toThrow();
      expect((await call("get", a.cookie, undefined, lead.id)).status).toBe(200);
      expect((await admin.query("select version,stage_id from leads where id=$1", [lead.id])).rows[0]).toEqual({ version: 1, stage_id: stageA });
      expect(await leadHistory(runtime, a.id, orgA, lead.id)).toHaveLength(1);
    } finally { await admin.query("alter table organization_audit drop constraint lf026_reject_move"); }
  });
  test("RLS rejects absent/wrong context and connection reuse does not retain it", async () => {
    expect((await runtime.query("select id from leads")).rows).toEqual([]);
    await expect(runtime.query("insert into leads(organization_id,name,stage_id) values($1,'No context',$2)", [orgA, stageA])).rejects.toThrow();
    const wrong = await withOrganization(runtime, a.id, orgA, async ({ client }) => (await client.query("select id from leads where organization_id=$1", [orgB])).rows);
    expect(wrong).toEqual([]);
    expect((await runtime.query("select id from leads")).rows).toEqual([]);
    expect((await runtime.query("select current_setting('app.organization_id',true) as ctx")).rows[0].ctx || "").toBe("");
    const forced = await admin.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname in('leads','lead_stage_events') order by relname");
    expect(forced.rows).toEqual([{ relname: "lead_stage_events", relrowsecurity: true, relforcerowsecurity: true }, { relname: "leads", relrowsecurity: true, relforcerowsecurity: true }]);
    const functions = await admin.query("select bool_and(prosecdef and proconfig @> array['search_path=pg_catalog']) as fixed from pg_proc where proname in('lf_validate_lead','lf_record_lead','lf_lock_stage','lf_lock_membership')");
    expect(functions.rows[0].fixed).toBe(true);
  });
  test("stage configuration enforces role, usage, last terminal kind, ordering and versions", async () => {
    expect((await call("createStage", sales.cookie, { name: "Forbidden", kind: "open" })).status).toBe(403);
    const created = await configureStage(runtime, a.id, orgA, { name: "Revisión", kind: "open" });
    const moved = await configureStage(runtime, a.id, orgA, { version: created.version, position: 2 }, created.id);
    expect(moved.position).toBe(2);
    const meta = await pipelineMetadata(runtime, a.id, orgA);
    expect(meta.stages.map(stage => stage.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const wonStage = meta.stages.find(stage => stage.id === won)!;
    expect((await call("updateStage", a.cookie, { version: wonStage.version, active: false }, won)).status).toBe(409);
    const unused = await configureStage(runtime, a.id, orgA, { version: moved.version, active: false }, moved.id);
    expect(unused.active).toBe(false);
    expect((await call("create", a.cookie, input("Inactive", moved.id))).status).toBe(422);
    expect((await call("updateStage", a.cookie, { version: 1, name: "Stale" }, moved.id)).status).toBe(409);
  });
  test("literal search, all cursor sorts, bounded input and cursor/filter binding", async () => {
    for (const name of ["Cursor Charlie", "Cursor Alpha", "Cursor Bravo", "Literal %_ marker"]) await createLead(runtime, a.id, orgA, input(name));
    expect((await listLeads(runtime, a.id, orgA, { q: "%_" })).leads.map(lead => lead.name)).toEqual(["Literal %_ marker"]);
    for (const sort of ["newest", "oldest", "name"]) {
      let cursor: string | undefined; const ids: string[] = [];
      do { const page = await listLeads(runtime, a.id, orgA, { q: "Cursor", sort, limit: 1, cursor }); ids.push(...page.leads.map(lead => lead.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
      expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(3);
    }
    const first = await listLeads(runtime, a.id, orgA, { q: "Cursor", limit: 1 });
    expect((await call("list", a.cookie, undefined, "", orgA, origin, "?q=Different&cursor=" + first.nextCursor)).status).toBe(422);
    for (const query of ["?limit=51", "?limit=-1", "?unexpected=1", "?limit=1&limit=2", "?cursor=invalid"]) expect((await call("list", a.cookie, undefined, "", orgA, origin, query)).status).toBe(422);
  });
  test("revoked assignee cannot be newly assigned, historical data survives; revoked actor loses access immediately", async () => {
    const lead = await createLead(runtime, a.id, orgA, { ...input("Historical assignee"), assignedUserId: sales.id });
    await admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, sales.id]);
    expect((await call("create", a.cookie, { ...input("Revoked"), assignedUserId: sales.id })).status).toBe(422);
    expect((await call("list", sales.cookie)).status).toBe(404);
    expect((await updateLead(runtime, a.id, orgA, lead.id, { version: 1, name: "Still visible" })).assignedUserId).toBe(sales.id);
    expect((await pipelineMetadata(runtime, a.id, orgA)).members.some(member => member.userId === sales.id)).toBe(false);
  });
  test("membership revocation waits for an admitted transaction and rejects subsequent access", async () => {
    await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, b.id]);
    let entered!: () => void, release!: () => void;
    const admitted = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const operation = withOrganization(runtime, b.id, orgA, async ({ client }) => { entered(); await hold; return (await client.query("select count(*)::int n from leads where organization_id=$1", [orgA])).rows[0].n; });
    await admitted;
    const revoker = await admin.connect();
    const pid = (await revoker.query("select pg_backend_pid() pid")).rows[0].pid;
    const revocation = revoker.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, b.id]);
    try {
      const deadline = Date.now() + 3000; let waiting = false;
      while (!waiting && Date.now() < deadline) {
        waiting = (await admin.query("select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1", [pid])).rows[0]?.waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
    } finally { release(); await operation; await revocation; revoker.release(); }
    expect((await call("list", b.cookie)).status).toBe(404);
  });
});
