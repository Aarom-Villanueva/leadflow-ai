import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleAuth } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { leadsRequest, type Action } from "../../../src/modules/leads/http";
import { createLead, getLead, listLeads, pipelineMetadata, updateLead, withOrganization, configureStage, leadHistory } from "../../../src/modules/leads/service";
import { identityPool } from "../../../src/shared/database/runtime";

const origin = "http://127.0.0.1:4311";
let admin: Pool, runtime: Pool, owner: Pool;
let a: { cookie: string; id: string }, b: { cookie: string; id: string }, sales: { cookie: string; id: string };
let orgA: string, orgB: string, duringMigration: string, stageA: string, stageB: string, won: string;
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
async function waitForBlockedBy(blocker: number): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await admin.query("select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))", [blocker]);
    if (result.rows[0]) return result.rows[0].pid;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error("Expected a real blocked PostgreSQL session");
}
async function migrateWithOrganizationInFlight() {
  const blocker = await admin.connect();
  await blocker.query("begin; lock table memberships in row exclusive mode");
  const blockerPid = (await blocker.query("select pg_backend_pid() pid")).rows[0].pid;
  const child = spawn(process.execPath, ["scripts/leads/migrate.mjs"], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisionerUrl.toString(), IDENTITY_RUNTIME_ROLE: "lf026_test_runtime" }, stdio: "pipe" });
  child.stdout.resume(); child.stderr.resume();
  const finished = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  let creation: Promise<string> | undefined;
  try {
    const migratorPid = await waitForBlockedBy(blockerPid);
    creation = organization(a, "during-migration-team");
    // This proves the call has entered 0001 and is waiting on organizations, not just queued in Node.
    await waitForBlockedBy(migratorPid);
  } finally { await blocker.query("rollback"); blocker.release(); }
  expect(await finished).toBe(0);
  if (!creation) throw Error("Concurrent organization was not started");
  duringMigration = await creation;
}

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
    await migrateWithOrganizationInFlight();
    const meta = await pipelineMetadata(runtime, a.id, orgA);
    stageA = meta.stages[0].id; won = meta.stages.find(stage => stage.kind === "won")!.id;
    stageB = (await pipelineMetadata(runtime, b.id, orgB)).stages[0].id;
    await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, sales.id]);
  });
  afterAll(async () => { await runtime?.end(); await owner?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

  test("incremental migration preserves organizations and backfills defaults; repeat verifies checksum", async () => {
    expect((await pipelineMetadata(runtime, a.id, orgA)).stages).toHaveLength(5);
    expect(migrate()).toContain("already applied");
    expect((await admin.query("select count(*)::int n from organizations")).rows[0].n).toBe(3);
    const id = await organization(a, "post-migration-team");
    expect((await pipelineMetadata(runtime, a.id, id)).stages).toHaveLength(5);
    await owner.query("update app_migrations set sha256='invalid'");
    try { expect(() => migrate()).toThrow(); } finally { await owner.query("update app_migrations set sha256=$1", [(await import("node:crypto")).createHash("sha256").update((await import("node:fs")).readFileSync("src/shared/database/migrations/0002_leads_pipeline.sql", "utf8").replace(/\r\n/g, "\n")).digest("hex")]); }
  });
  test("an organization already executing 0001 while 0002 migrates gets a pipeline and five stages", async () => {
    const meta = await pipelineMetadata(runtime, a.id, duringMigration);
    expect(meta.stages).toHaveLength(5);
    expect(meta.stages.map(stage => stage.kind)).toEqual(["open", "open", "open", "won", "lost"]);
    expect(migrate()).toContain("already applied");
    expect((await pipelineMetadata(runtime, a.id, duringMigration)).stages).toHaveLength(5);
  });
  test("a bootstrap stage failure rolls back organization, membership, pipeline and audit", async () => {
    const counts = async () => (await admin.query("select (select count(*) from organizations)::int organizations,(select count(*) from memberships)::int memberships,(select count(*) from pipelines)::int pipelines,(select count(*) from stages)::int stages,(select count(*) from organization_audit)::int audit")).rows[0];
    const before = await counts();
    await admin.query("alter table stages add constraint lf026_fail_bootstrap check(name<>'Propuesta') not valid");
    try {
      const response = await organizationsRequest(request("POST", a.cookie, { name: "Failed bootstrap", slug: "failed-bootstrap-team", timezone: "America/Lima" }));
      expect(response.status).toBe(503);
      expect(await counts()).toEqual(before);
    } finally { await admin.query("alter table stages drop constraint lf026_fail_bootstrap"); }
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
  test("detail and history reads do not wait for a lead write lock", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Nonblocking reads"));
    const writer = await admin.connect();
    const reader = new Pool({ connectionString: process.env.DATABASE_URL, options: "-c lock_timeout=250ms" });
    try {
      await writer.query("begin");
      await writer.query("select id from leads where id=$1 for update", [lead.id]);
      expect((await getLead(reader, a.id, orgA, lead.id)).id).toBe(lead.id);
      expect(await leadHistory(reader, a.id, orgA, lead.id)).toHaveLength(1);
    } finally { await writer.query("rollback"); writer.release(); await reader.end(); }
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
  test("history follows committed lead versions even when timestamps collide and UUIDs sort oppositely", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Same millisecond"));
    await updateLead(runtime, a.id, orgA, lead.id, { version: 1, stageId: won });
    // Administrator changes only synthetic test rows to make the ordering edge deterministic.
    await admin.query("update lead_stage_events set happened_at='2026-01-01T00:00:00Z',id=case when lead_version=1 then 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end where lead_id=$1", [lead.id]);
    expect((await leadHistory(runtime, a.id, orgA, lead.id)).map(event => [event.fromStage, event.toStage])).toEqual([[null, "Nuevo"], ["Nuevo", "Ganado"]]);
  });
  test("creation and archival roll back on audit failure, and creation rolls back on event failure", async () => {
    const lead = await createLead(runtime, a.id, orgA, input("Archive rollback"));
    const before = (await admin.query("select (select count(*) from leads)::int leads,(select count(*) from lead_stage_events)::int events,(select count(*) from organization_audit)::int audit")).rows[0];
    await admin.query("alter table organization_audit add constraint lf026_reject_create_archive check(action not in('lead.created','lead.archived')) not valid");
    try {
      await expect(createLead(runtime, a.id, orgA, input("Failed creation"))).rejects.toThrow();
      await expect(updateLead(runtime, a.id, orgA, lead.id, { version: 1 }, true)).rejects.toThrow();
      expect((await admin.query("select archived_at,version from leads where id=$1", [lead.id])).rows[0]).toEqual({ archived_at: null, version: 1 });
    } finally { await admin.query("alter table organization_audit drop constraint lf026_reject_create_archive"); }
    await admin.query("alter table lead_stage_events add constraint lf026_reject_initial check(from_stage_id is not null) not valid");
    try { await expect(createLead(runtime, a.id, orgA, input("Failed event"))).rejects.toThrow(); }
    finally { await admin.query("alter table lead_stage_events drop constraint lf026_reject_initial"); }
    expect((await admin.query("select (select count(*) from leads)::int leads,(select count(*) from lead_stage_events)::int events,(select count(*) from organization_audit)::int audit")).rows[0]).toEqual(before);
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
    const functions = await admin.query("select count(*)::int n,bool_and(prosecdef and proconfig @> array['search_path=pg_catalog']) as fixed,bool_and(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) as restricted from pg_proc p where pronamespace='public'::regnamespace and proname in('lf_create_organization','lf_bootstrap_pipeline','lf_validate_lead','lf_record_lead','lf_lock_stage','lf_lock_membership','lf_lock_assignee','lf_organization_members')");
    expect(functions.rows[0].fixed).toBe(true);
    expect(functions.rows[0].n).toBe(8); expect(functions.rows[0].restricted).toBe(true);
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
  test("stage configuration serializes concurrent creates and preserves the last active terminal type", async () => {
    const org = await organization(a, "concurrent-stages-team");
    const created = await Promise.all(["Stage A", "Stage B", "Stage C"].map(name => configureStage(runtime, a.id, org, { name, kind: "open" })));
    expect(created.map(stage => stage.position).sort()).toEqual([6, 7, 8]);
    const extraWon = await configureStage(runtime, a.id, org, { name: "Second won", kind: "won" });
    const originalWon = (await pipelineMetadata(runtime, a.id, org)).stages.find(stage => stage.kind === "won" && stage.id !== extraWon.id)!;
    const results = await Promise.all([originalWon, extraWon].map(stage => call("updateStage", a.cookie, { version: stage.version, active: false }, stage.id, org)));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect((await pipelineMetadata(runtime, a.id, org)).stages.filter(stage => stage.active && stage.kind === "won")).toHaveLength(1);
    const lead = await createLead(runtime, a.id, org, input("Archived stage reference", created[0].id));
    await updateLead(runtime, a.id, org, lead.id, { version: 1 }, true);
    for (const patch of [{ kind: "lost" }, { active: false }]) expect((await call("updateStage", a.cookie, { version: created[0].version, ...patch }, created[0].id, org)).status).toBe(409);
  });
  test("assignment and assignee revocation serialize in both directions", async () => {
    const assignee = await signup("assignment-lock");
    await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, assignee.id]);
    const revoker = await admin.connect();
    try {
      await revoker.query("begin");
      const pid = (await revoker.query("select pg_backend_pid() pid")).rows[0].pid;
      await revoker.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, assignee.id]);
      const assignment = createLead(runtime, a.id, orgA, { ...input("Reject pending revocation"), assignedUserId: assignee.id }).then(value => ({ value, error: null }), error => ({ value: null, error }));
      try { await waitForBlockedBy(pid); } finally { await revoker.query("commit"); }
      expect((await assignment).error).toMatchObject({ code: "23514" });
    } finally { await revoker.query("rollback"); revoker.release(); }
    await admin.query("update memberships set revoked_at=null where organization_id=$1 and user_id=$2", [orgA, assignee.id]);
    let entered!: () => void, release!: () => void;
    const admitted = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    let assignmentPid = 0;
    const assignment = withOrganization(runtime, a.id, orgA, async ({ client }) => {
      assignmentPid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
      await client.query("insert into leads(organization_id,name,stage_id,assigned_user_id) values($1,'Assignment in flight',$2,$3)", [orgA, stageA, assignee.id]);
      entered(); await hold;
    });
    await admitted;
    const secondRevoker = await admin.connect();
    const revoked = secondRevoker.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, assignee.id]);
    try { await waitForBlockedBy(assignmentPid); }
    finally { release(); await assignment; await revoked; secondRevoker.release(); }
    expect((await listLeads(runtime, a.id, orgA, { q: "Assignment in flight" })).leads[0].assignedUserId).toBe(assignee.id);
  });
  test("120 mutation attempts share one identity counter across route spellings; malformed IDs allocate none", async () => {
    const limited = await signup("limited");
    const org = await organization(limited, "limited-team");
    const before = (await admin.query("select count(*)::int n from auth_attempts")).rows[0].n;
    for (let index = 0; index < 10; index++) expect((await call("create", limited.cookie, {}, "", "invalid-" + index)).status).toBe(404);
    expect((await admin.query("select count(*)::int n from auth_attempts")).rows[0].n).toBe(before);
    const key = createHash("sha256").update("commercial:" + limited.id).digest("hex");
    let stableWindow = false;
    // A legitimate minute rollover resets the limit. Repeat that fixture in a new window rather than failing spuriously.
    for (let attempt = 0; attempt < 3 && !stableWindow; attempt++) {
      await admin.query("delete from auth_attempts where key=$1", [key]);
      const minute = (await admin.query("select date_trunc('minute',clock_timestamp()) as minute")).rows[0].minute.toISOString();
      for (let index = 0; index < 120; index++) expect((await call("create", limited.cookie, {}, "", index % 2 ? org.toUpperCase() : org)).status).toBe(422);
      stableWindow = minute === (await admin.query("select date_trunc('minute',clock_timestamp()) as minute")).rows[0].minute.toISOString();
    }
    expect(stableWindow).toBe(true);
    expect((await call("create", limited.cookie, {}, "", org)).status).toBe(429);
    expect((await call("create", limited.cookie, {}, "", randomUUID())).status).toBe(429);
    expect((await admin.query("select count(*)::int n from auth_attempts")).rows[0].n).toBe(before + 1);
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
