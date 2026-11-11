import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { handleAuth } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { identityPool } from "../../../src/shared/database/runtime";
import { createLead, pipelineMetadata, updateLead, withOrganization } from "../../../src/modules/leads/service";
import { activityRequest, type ActivityAction } from "../../../src/modules/activity/http";
import { leadsRequest } from "../../../src/modules/leads/http";
import { closeFollowup, createActivity, editActivity, listActivity } from "../../../src/modules/activity/service";
import type { Followup, Interaction } from "../../../src/modules/activity/contracts";

const origin = "http://127.0.0.1:4312";
let admin: Pool, runtime: Pool, provisioner: URL, orgA: string, orgB: string, leadA: string, leadB: string;
let a: { id: string; cookie: string }, b: typeof a, sales: typeof a;
const req = (path: string, method: string, cookie: string, body?: unknown, source: string | null = origin) => new Request(origin + path, { method, headers: { cookie, "content-type": "application/json", ...(source ? { origin: source } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function signup(name: string) {
  const response = await handleAuth(req("/api/auth/sign-up/email", "POST", "", { name: "Persona " + name, email: name + "@activity-test.invalid", password: "Synthetic-activity-password-027!" }));
  expect(response.status).toBe(200); return { id: (await response.json()).user.id as string, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function organization(user: typeof a, slug: string) {
  const response = await organizationsRequest(req("/api/organizations", "POST", user.cookie, { name: "Equipo " + slug, slug, timezone: "America/Lima" })); expect(response.status).toBe(201); return (await response.json()).id as string;
}
function migrate() { return execFileSync(process.execPath, ["scripts/activity/migrate.mjs"], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: "lf027_test_runtime" }, encoding: "utf8", stdio: "pipe" }); }
const note = (leadId = leadA) => ({ leadId, creationKey: randomUUID(), kind: "note", body: "Texto sintético <script>no ejecutar</script>", occurredAt: "2026-01-01T12:00:00Z" });
const followup = (leadId = leadA, assignedUserId = a.id) => ({ leadId, assignedUserId, creationKey: randomUUID(), title: "Seguimiento sintético", detail: "Contenido local", dueAt: "2020-01-01T15:00:00Z" });
const call = (resource: "interactions" | "followups", action: ActivityAction, body?: unknown, id = "", org = orgA, cookie = a.cookie, source: string | null = origin, query = "") => activityRequest(req("/api/test" + query, action === "list" ? "GET" : action === "edit" ? "PATCH" : "POST", cookie, body, source), org, resource, action, id);
async function waitBlockedBy(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await admin.query("select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))", [pid])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error("Expected actual PostgreSQL lock contention");
}
beforeAll(async () => {
  const text = process.env.ACTIVITY_TEST_ADMIN_URL;
  if (!text) throw Error("ACTIVITY_TEST_ADMIN_URL required; never silently skip");
  const url = new URL(text);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search || url.pathname !== "/lf027_activity_test") throw Error("Dedicated local activity test database required");
  const maintenance = new URL(url); maintenance.pathname = "/postgres";
  const setup = new Pool({ connectionString: maintenance.toString() });
  try {
    if ((await setup.query("select 1 from pg_database where datname='lf027_activity_test'")).rowCount) throw Error("Existing database never overwritten");
    await setup.query("create role lf027_test_owner login nosuperuser nocreatedb nocreaterole nobypassrls; create role lf027_test_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
    await setup.query("create database lf027_activity_test owner lf027_test_owner");
  } finally { await setup.end(); }
  admin = new Pool({ connectionString: text }); provisioner = new URL(url); provisioner.username = "lf027_test_owner"; provisioner.password = "";
  for (const file of ["scripts/identity/migrate.mjs", "scripts/leads/migrate.mjs"]) execFileSync(process.execPath, [file], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: "lf027_test_runtime" }, encoding: "utf8", stdio: "pipe" });
  const runtimeUrl = new URL(url); runtimeUrl.username = "lf027_test_runtime"; runtimeUrl.password = "";
  process.env.DATABASE_URL = runtimeUrl.toString(); process.env.AUTH_SECRET = randomBytes(32).toString("hex"); process.env.APP_ORIGIN = origin;
  runtime = await identityPool(); a = await signup("alpha"); b = await signup("beta"); sales = await signup("sales");
  orgA = await organization(a, "activity-alpha"); orgB = await organization(b, "activity-beta");
  await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, sales.id]);
  for (const [org, actor, set] of [[orgA, a.id, (value: string) => { leadA = value; }], [orgB, b.id, (value: string) => { leadB = value; }]] as const) {
    const stage = (await pipelineMetadata(runtime, actor, org)).stages[0].id;
    set((await createLead(runtime, actor, org, { name: "Prospecto sintético", stageId: stage, email: null, phoneE164: null, source: null, assignedUserId: null })).id);
  }
  await admin.query(`create function lf027_fail_ddl() returns event_trigger language plpgsql as $$ begin if exists(select 1 from pg_event_trigger_ddl_commands() where object_identity='public.followups') then raise exception 'synthetic DDL failure'; end if;end; $$; create event trigger lf027_fail_ddl_trigger on ddl_command_end when tag in('CREATE TABLE') execute function lf027_fail_ddl()`);
  try { expect(() => migrate()).toThrow(); expect((await admin.query("select to_regclass('public.interactions') i,to_regclass('public.followups') f")).rows[0]).toEqual({ i: null, f: null }); expect((await admin.query("select 1 from app_migrations where version='0003_activity'")).rowCount).toBe(0); }
  finally { await admin.query("drop event trigger lf027_fail_ddl_trigger;drop function lf027_fail_ddl()"); }
  migrate();
});
afterAll(async () => { await runtime?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

test("real migration preserves leads, repeats safely and rejects altered checksums", async () => {
  expect((await admin.query("select count(*)::int n from leads")).rows[0].n).toBe(2);
  expect(migrate()).toContain("already applied");
  await admin.query("update app_migrations set sha256='altered' where version='0003_activity'");
  try { expect(() => migrate()).toThrow(); }
  finally { const hash = createHash("sha256").update(readFileSync("src/shared/database/migrations/0003_activity.sql", "utf8").replace(/\r\n/g, "\n")).digest("hex"); await admin.query("update app_migrations set sha256=$1 where version='0003_activity'", [hash]); }
});
test("session, origin, bounded JSON and server-controlled identities are enforced", async () => {
  expect((await call("interactions", "list", undefined, "", orgA, "")).status).toBe(401);
  for (const source of [null, "https://hostile.invalid"]) expect((await call("interactions", "create", note(), "", orgA, a.cookie, source)).status).toBe(403);
  for (const data of [{ ...note(), actor: b.id }, { ...followup(), status: "completed" }, { ...note(), body: "x".repeat(21000) }]) expect((await call("interactions", "create", data)).status).toBe(422);
  expect((await call("followups", "create", { ...followup(), dueAt: "2026-11-01T01:30:00" })).status).toBe(422);
  expect((await call("followups", "create", { ...followup(), status: "completed" })).status).toBe(422);
  expect((await call("followups", "list", undefined, "", "invalid-org")).status).toBe(404);
});
test("foreign organization, lead and record identifiers do not cross tenants", async () => {
  const foreign = await createActivity(runtime, b.id, orgB, "interactions", note(leadB));
  expect((await call("interactions", "edit", { version: 1, body: "Stolen" }, foreign.id)).status).toBe(404);
  expect((await call("interactions", "create", note(leadB))).status).toBe(404);
  expect((await call("followups", "create", followup(leadB))).status).toBe(404);
  expect((await call("followups", "list", undefined, "", orgB)).status).toBe(404);
  expect((await call("interactions", "list", undefined, "", orgA, a.cookie, origin, "?leadId=" + leadB)).status).toBe(404);
  expect((await call("followups", "create", followup(leadA, b.id))).status).toBe(422);
});
test("concurrent create replay makes one interaction and one audit; changed payload conflicts", async () => {
  const input = note();
  const rows = await Promise.all([1, 2].map(() => createActivity(runtime, a.id, orgA, "interactions", input)));
  expect(rows[0].id).toBe(rows[1].id);
  expect((await admin.query("select count(*)::int n from organization_audit where entity_id=$1", [rows[0].id])).rows[0].n).toBe(1);
  expect((await call("interactions", "create", { ...input, body: "Different" })).status).toBe(409);
  const edited = await editActivity(runtime, sales.id, orgA, "interactions", rows[0].id, { version: 1, body: "Edited" }) as Interaction;
  expect(edited.authorUserId).toBe(a.id); expect(edited.version).toBe(2);
  expect((await admin.query("select actor_user_id from organization_audit where entity_id=$1 and action='interaction.updated'", [edited.id])).rows[0].actor_user_id).toBe(sales.id);
  expect((await call("interactions", "edit", { version: 1, body: "Stale" }, rows[0].id)).status).toBe(409);
});
test("followup creation is replay-safe and concurrent same-target completion is exactly once", async () => {
  const input = followup();
  const rows = await Promise.all([1, 2].map(() => createActivity(runtime, a.id, orgA, "followups", input)));
  expect(rows[0].id).toBe(rows[1].id);
  const closed = await Promise.all([a.id, sales.id].map(actor => closeFollowup(runtime, actor, orgA, rows[0].id, "completed", { version: 1 })));
  expect(closed[0]).toEqual(closed[1]); expect(closed[0].version).toBe(2); expect(closed[0].completedAt).toBeTruthy();
  expect((await admin.query("select count(*)::int n from organization_audit where entity_id=$1 and action='followup.completed'", [rows[0].id])).rows[0].n).toBe(1);
  expect((await call("followups", "cancel", { version: 2 }, rows[0].id)).status).toBe(409);
  expect((await call("followups", "edit", { version: 2, title: "Reopen" }, rows[0].id)).status).toBe(409);
});
test("opposite terminal transitions and concurrent edits yield one winner without overwriting", async () => {
  const row = await createActivity(runtime, a.id, orgA, "followups", followup());
  const updates = await Promise.all(["One", "Two"].map(title => call("followups", "edit", { version: 1, title }, row.id)));
  expect(updates.map(value => value.status).sort()).toEqual([200, 409]);
  const results = await Promise.all(["complete", "cancel"].map(action => call("followups", action as ActivityAction, { version: 2 }, row.id)));
  expect(results.map(value => value.status).sort()).toEqual([200, 409]);
});
test("audit failure atomically rolls back note edit, creation and followup closure", async () => {
  const row = await createActivity(runtime, a.id, orgA, "followups", followup());
  const interaction = await createActivity(runtime, a.id, orgA, "interactions", note());
  const count = (await admin.query("select count(*)::int n from interactions")).rows[0].n;
  await admin.query("alter table organization_audit add constraint lf027_fail_audit check(action not in('interaction.created','interaction.updated','followup.completed')) not valid");
  try {
    await expect(createActivity(runtime, a.id, orgA, "interactions", note())).rejects.toThrow();
    await expect(editActivity(runtime, a.id, orgA, "interactions", interaction.id, { version: 1, body: "Never persisted" })).rejects.toThrow();
    await expect(closeFollowup(runtime, a.id, orgA, row.id, "completed", { version: 1 })).rejects.toThrow();
    expect((await admin.query("select status,version,completed_at from followups where id=$1", [row.id])).rows[0]).toEqual({ status: "pending", version: 1, completed_at: null });
    expect((await admin.query("select version from interactions where id=$1", [interaction.id])).rows[0].version).toBe(1);
    expect((await admin.query("select count(*)::int n from interactions")).rows[0].n).toBe(count);
  } finally { await admin.query("alter table organization_audit drop constraint lf027_fail_audit"); }
});
test("archived leads keep history and allow pending closure, but prohibit creation and editing", async () => {
  const stageId = (await pipelineMetadata(runtime, a.id, orgA)).stages[0].id;
  const lead = await createLead(runtime, a.id, orgA, { name: "Archived activity", stageId, email: null, phoneE164: null, source: null, assignedUserId: null });
  const interaction = await createActivity(runtime, a.id, orgA, "interactions", note(lead.id));
  const row = await createActivity(runtime, a.id, orgA, "followups", followup(lead.id));
  await updateLead(runtime, a.id, orgA, lead.id, { version: 1 }, true);
  expect((await call("interactions", "create", note(lead.id))).status).toBe(422);
  expect((await call("interactions", "edit", { version: 1, body: "No" }, interaction.id)).status).toBe(422);
  expect((await call("followups", "create", followup(lead.id))).status).toBe(422);
  expect((await call("followups", "edit", { version: 1, title: "No" }, row.id)).status).toBe(422);
  expect((await listActivity(runtime, a.id, orgA, "interactions", { leadId: lead.id })).items).toHaveLength(1);
  expect((await closeFollowup(runtime, a.id, orgA, row.id, "canceled", { version: 1 })).status).toBe("canceled");
});
test("RLS/FKs, trusted functions and runtime grants prevent direct SQL escalation", async () => {
  expect((await runtime.query("select * from interactions")).rows).toEqual([]);
  expect((await runtime.query("select * from followups")).rows).toEqual([]);
  await expect(runtime.query("delete from followups")).rejects.toThrow();
  await expect(runtime.query("select lf_activity_lead($1,$2,true)", [orgA, leadA])).rejects.toThrow();
  await expect(withOrganization(runtime, a.id, orgA, async ({ client }) => client.query("insert into interactions(organization_id,lead_id,author_user_id,kind,body,occurred_at,creation_key,creation_hash) values($1,$2,$3,'note','Cross tenant',now(),$4,$5)", [orgA, leadB, a.id, randomUUID(), "0".repeat(64)]))).rejects.toThrow();
  const forced = await admin.query("select bool_and(relrowsecurity and relforcerowsecurity) forced from pg_class where relnamespace='public'::regnamespace and relname in('interactions','followups')"); expect(forced.rows[0].forced).toBe(true);
  const functions = await admin.query("select count(*)::int n,bool_and(prosecdef and proconfig @> array['search_path=pg_catalog']) fixed,bool_and(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) restricted from pg_proc p where pronamespace='public'::regnamespace and proname in('lf_activity_lead','lf_validate_interaction','lf_validate_followup','lf_record_activity')"); expect(functions.rows[0]).toEqual({ n: 4, fixed: true, restricted: true });
});
test("cursor filters/cutoff persist across pages and overdue/upcoming contain correct pending records", async () => {
  const key = "Pagination " + randomUUID();
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) ids.push((await createActivity(runtime, a.id, orgA, "followups", { ...followup(leadB, b.id), leadId: leadA, assignedUserId: sales.id, title: key, dueAt: index ? "2099-01-01T00:00:00Z" : "2001-01-01T00:00:00Z" })).id);
  const overdue = await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: sales.id, window: "overdue" }); expect(overdue.items.map(item => item.id)).toEqual([ids[0]]);
  const first = await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: sales.id, limit: 1 });
  const second = await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: sales.id, limit: 1, cursor: first.nextCursor });
  expect(second.asOf).toBe(first.asOf); expect(second.items[0].id).not.toBe(first.items[0].id);
  const third = await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: sales.id, limit: 1, cursor: second.nextCursor });
  expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(3);
  expect((await call("followups", "list", undefined, "", orgA, a.cookie, origin, "?window=upcoming&cursor=" + first.nextCursor)).status).toBe(422);
  expect((await call("followups", "list", undefined, "", orgA, a.cookie, origin, "?limit=1&limit=2")).status).toBe(422);
  const upcoming = await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: sales.id, window: "upcoming" }); expect(upcoming.items).toHaveLength(2);
});
test("assignment and revocation serialize in both orders without orphaned responsibility", async () => {
  const member = await signup("concurrent-assignee");
  await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [orgA, member.id]);
  const revoker = await admin.connect();
  try {
    await revoker.query("begin"); const pid = (await revoker.query("select pg_backend_pid() pid")).rows[0].pid;
    await revoker.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, member.id]);
    const creation = createActivity(runtime, a.id, orgA, "followups", followup(leadA, member.id)).then(value => ({ value, error: null }), error => ({ value: null, error }));
    try { await waitBlockedBy(pid); } finally { await revoker.query("commit"); }
    expect((await creation).error).toMatchObject({ code: "23514" });
  } finally { await revoker.query("rollback"); revoker.release(); }
  await admin.query("update memberships set revoked_at=null where organization_id=$1 and user_id=$2", [orgA, member.id]);
  let entered!: () => void, release!: () => void, writerPid = 0;
  const ready = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
  const insertion = withOrganization(runtime, a.id, orgA, async ({ client }) => {
    writerPid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("insert into followups(organization_id,lead_id,created_by,title,assigned_user_id,due_at,creation_key,creation_hash) values($1,$2,$3,'Concurrent responsibility',$4,now(),$5,$6)", [orgA, leadA, a.id, member.id, randomUUID(), "0".repeat(64)]);
    entered(); await hold;
  });
  await ready; const revocation = admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, member.id]);
  try { await waitBlockedBy(writerPid); } finally { release(); await insertion; await revocation; }
  expect((await listActivity(runtime, a.id, orgA, "followups", { assignedUserId: member.id })).items).toHaveLength(1);
});
test("archive and activity insertion serialize in both orders", async () => {
  const makeLead = async () => createLead(runtime, a.id, orgA, { name: "Archive race", stageId: (await pipelineMetadata(runtime, a.id, orgA)).stages[0].id, email: null, phoneE164: null, source: null, assignedUserId: null });
  const lead = await makeLead(), archiver = await admin.connect();
  try {
    await archiver.query("begin"); const pid = (await archiver.query("select pg_backend_pid() pid")).rows[0].pid;
    await archiver.query("select set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true),set_config('app.request_id',$3,true)", [a.id, orgA, randomUUID()]);
    await archiver.query("update leads set archived_at=clock_timestamp() where id=$1", [lead.id]);
    const creation = createActivity(runtime, a.id, orgA, "interactions", note(lead.id)).then(value => ({ value, error: null }), error => ({ value: null, error }));
    try { await waitBlockedBy(pid); } finally { await archiver.query("commit"); }
    expect((await creation).error).toMatchObject({ code: "23514" });
  } finally { await archiver.query("rollback"); archiver.release(); }
  const next = await makeLead(); let entered!: () => void, release!: () => void, writerPid = 0;
  const ready = new Promise<void>(resolve => { entered = resolve; }), hold = new Promise<void>(resolve => { release = resolve; });
  const insertion = withOrganization(runtime, a.id, orgA, async ({ client }) => {
    writerPid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("insert into interactions(organization_id,lead_id,author_user_id,kind,body,occurred_at,creation_key,creation_hash) values($1,$2,$3,'note','Before archive',now(),$4,$5)", [orgA, next.id, a.id, randomUUID(), "0".repeat(64)]);
    entered(); await hold;
  });
  await ready; const archive = updateLead(runtime, a.id, orgA, next.id, { version: 1 }, true);
  try { await waitBlockedBy(writerPid); } finally { release(); await insertion; await archive; }
  expect((await listActivity(runtime, a.id, orgA, "interactions", { leadId: next.id })).items).toHaveLength(1);
});
test("SQL cannot forge author, version, terminal timestamps or reopen a confirmed followup", async () => {
  const row = await withOrganization(runtime, a.id, orgA, async ({ client }) => (await client.query("insert into followups(organization_id,lead_id,created_by,title,assigned_user_id,due_at,status,completed_at,closed_by,version,creation_key,creation_hash) values($1,$2,$3,'Forced server fields',$4,now(),'completed',now(),$3,999,$5,$6) returning id,created_by,status,completed_at,closed_by,version", [orgA, leadA, b.id, a.id, randomUUID(), "0".repeat(64)])).rows[0]);
  expect(row).toMatchObject({ created_by: a.id, status: "pending", completed_at: null, closed_by: null, version: 1 });
  await closeFollowup(runtime, a.id, orgA, row.id, "completed", { version: 1 });
  await expect(withOrganization(runtime, a.id, orgA, async ({ client }) => client.query("update followups set status='pending',completed_at=null,closed_by=null where id=$1", [row.id]))).rejects.toThrow();
});
test("revoked assignee cannot receive a new followup; historical responsibility and closure survive", async () => {
  const row = await createActivity(runtime, a.id, orgA, "followups", followup(leadA, sales.id));
  await admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [orgA, sales.id]);
  expect((await call("followups", "create", followup(leadA, sales.id))).status).toBe(422);
  expect((await call("followups", "list", undefined, "", orgA, sales.cookie)).status).toBe(404);
  expect((await editActivity(runtime, a.id, orgA, "followups", row.id, { version: 1, title: "Historical assignee" }) as Followup).assignedUserId).toBe(sales.id);
  expect((await closeFollowup(runtime, a.id, orgA, row.id, "completed", { version: 2 })).status).toBe("completed");
});
test("activity and leads share the same identity limit; malformed routes allocate no counters", async () => {
  const limited = await signup("limited"); const org = await organization(limited, "activity-limited");
  const before = (await admin.query("select count(*)::int n from auth_attempts")).rows[0].n;
  for (let index = 0; index < 5; index++) expect((await call("followups", "create", {}, "", "invalid-" + index, limited.cookie)).status).toBe(404);
  expect((await admin.query("select count(*)::int n from auth_attempts")).rows[0].n).toBe(before);
  const key = createHash("sha256").update("commercial:" + limited.id).digest("hex");
  let stable = false;
  for (let attempt = 0; attempt < 3 && !stable; attempt++) {
    const minute = (await admin.query("select date_trunc('minute',clock_timestamp()) as minute")).rows[0].minute.toISOString();
    await admin.query("insert into auth_attempts(key,window_start,attempts) values($1,date_trunc('minute',clock_timestamp()),119) on conflict(key) do update set attempts=119,window_start=excluded.window_start", [key]);
    const lastAllowed = await leadsRequest(req("/api/test", "POST", limited.cookie, {}), org, "create");
    const blocked = await call("followups", "create", {}, "", org.toUpperCase(), limited.cookie);
    stable = minute === (await admin.query("select date_trunc('minute',clock_timestamp()) as minute")).rows[0].minute.toISOString();
    if (stable) { expect(lastAllowed.status).toBe(422); expect(blocked.status).toBe(429); }
  }
  expect(stable).toBe(true);
  expect((await call("followups", "list", undefined, "", org, limited.cookie)).status).toBe(200);
  expect((await admin.query("select count(*)::int n from auth_attempts")).rows[0].n).toBe(before + 1);
});
