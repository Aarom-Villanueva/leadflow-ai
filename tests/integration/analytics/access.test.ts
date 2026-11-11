import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { handleAuth } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { identityPool } from "../../../src/shared/database/runtime";
import { configureStage, createLead, pipelineMetadata, updateLead, withOrganization } from "../../../src/modules/leads/service";
import { closeFollowup, createActivity } from "../../../src/modules/activity/service";
import { dashboardRequest, snapshotsRequest } from "../../../src/modules/analytics/http";
import { dashboardMetrics, listDashboardSnapshots, saveDashboardSnapshot } from "../../../src/modules/analytics/service";
import { conversionRate } from "../../../src/modules/analytics/metrics";
import type { DashboardMetrics, DashboardSnapshot } from "../../../src/modules/analytics/contracts";

const origin = "http://127.0.0.1:4313";
type User = { id: string; cookie: string };
type Org = { id: string; nuevo: string; calificacion: string; ganado: string; perdido: string; kinds: Record<string, string> };
let admin: Pool, runtime: Pool, seeder: PoolClient, provisioner: URL, a: User, b: User, sales: User, legacy: Org;

const req = (path: string, method: string, cookie: string, body?: unknown, source: string | null = origin) => new Request(origin + path, { method, headers: { cookie, "content-type": "application/json", ...(source ? { origin: source } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function signup(name: string): Promise<User> {
  const response = await handleAuth(req("/api/auth/sign-up/email", "POST", "", { name: "Persona " + name, email: name + "@analytics-test.invalid", password: "Synthetic-analytics-password-028!" }));
  expect(response.status).toBe(200); return { id: (await response.json()).user.id as string, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function organization(user: User, timezone = "UTC"): Promise<Org> {
  await admin.query("delete from auth_attempts"); // laboratory only: this suite creates more organizations per minute than the product limit allows
  const response = await organizationsRequest(req("/api/organizations", "POST", user.cookie, { name: "Equipo métricas", slug: "metrics-" + randomUUID().slice(0, 12), timezone }));
  expect(response.status).toBe(201); const id = (await response.json()).id as string;
  const stages = (await pipelineMetadata(runtime, user.id, id)).stages; const named = (name: string) => stages.find(stage => stage.name === name)!.id;
  return { id, nuevo: named("Nuevo"), calificacion: named("Calificación"), ganado: named("Ganado"), perdido: named("Perdido"), kinds: Object.fromEntries(stages.map(stage => [stage.id, stage.kind])) };
}
const http = (org: string, cookie: string, query = "", method = "GET") => dashboardRequest(req("/api/test" + query, method, cookie), org);
const snapshots = (org: string, cookie: string, method: "GET" | "POST" = "GET", body?: unknown, query = "", source: string | null = origin) => snapshotsRequest(req("/api/test" + query, method, cookie, body, source), org);
const metrics = (org: Org, actor: User, asOf: string, interval = "30") => dashboardMetrics(runtime, actor.id, org.id, { interval }, { asOf });
const ms = (iso: string, delta: number) => new Date(Date.parse(iso) + delta).toISOString();
const input = (stageId: string) => ({ name: "Prospecto real", stageId, email: null, phoneE164: null, source: null, assignedUserId: null });
const code = (error: unknown) => (error as { code?: string }).code ?? String(error);
const migrateEnv = () => ({ ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: "lf028_test_runtime" });
const migrate = () => execFileSync(process.execPath, ["scripts/analytics/migrate.mjs"], { env: migrateEnv(), encoding: "utf8", stdio: "pipe" });
async function waitBlockedBy(pid: number): Promise<number> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await admin.query("select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))", [pid]);
    if (result.rows[0]) return result.rows[0].pid;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error("Expected actual PostgreSQL lock contention");
}
function gate() { let enter!: () => void, release!: () => void; const entered = new Promise<void>(resolve => { enter = resolve; }), hold = new Promise<void>(resolve => { release = resolve; }); return { enter, entered, hold, release }; }

/** Synthetic, dated rows written by the laboratory administrator with triggers disabled: the runtime can never backdate records. */
async function seedLead(org: Org, actor: User, createdAt: string, options: { stage?: string; archivedAt?: string; moves?: [string, string][] } = {}) {
  const first = options.stage ?? org.nuevo, moves = options.moves ?? [], current = moves.at(-1)?.[0] ?? first;
  const id = (await seeder.query("insert into leads(organization_id,stage_id,name,created_at,updated_at,archived_at,version) values($1,$2,'Prospecto sintético',$3,$3,$4,$5) returning id", [org.id, current, createdAt, options.archivedAt ?? null, moves.length + 1])).rows[0].id as string;
  let previous: string | null = null, version = 1;
  for (const [stage, at] of [[first, createdAt], ...moves] as [string, string][]) {
    await seeder.query("insert into lead_stage_events(organization_id,lead_id,lead_version,from_stage_id,to_stage_id,to_stage_kind,actor_user_id,happened_at) values($1,$2,$3,$4,$5,$6,$7,$8)", [org.id, id, version++, previous, stage, org.kinds[stage], actor.id, at]);
    previous = stage;
  }
  return id;
}
async function seedFollowup(org: Org, actor: User, lead: string, dueAt: string, status: "pending" | "completed" | "canceled" = "pending") {
  await seeder.query("insert into followups(organization_id,lead_id,created_by,title,assigned_user_id,due_at,status,completed_at,closed_by,creation_key,creation_hash) values($1,$2,$3,'Seguimiento sintético',$3,$4,$5,$6,$7,$8,$9)",
    [org.id, lead, actor.id, dueAt, status, status === "completed" ? dueAt : null, status === "pending" ? null : actor.id, randomUUID(), "0".repeat(64)]);
}
const counts = (value: DashboardMetrics) => Object.fromEntries(value.stages.map(stage => [stage.name, stage.count]));
const written = async () => (await admin.query("select (select count(*) from organization_audit)::int audit,(select count(*) from auth_attempts)::int attempts,(select count(*) from leads)::int leads,(select count(*) from lead_stage_events)::int events,(select count(*) from followups)::int followups,(select count(*) from dashboard_snapshots)::int snapshots")).rows[0];

beforeAll(async () => {
  const text = process.env.ANALYTICS_TEST_ADMIN_URL;
  if (!text) throw Error("ANALYTICS_TEST_ADMIN_URL required; never silently skip");
  const url = new URL(text);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search || url.pathname !== "/lf028_analytics_test") throw Error("Dedicated local analytics test database required");
  const maintenance = new URL(url); maintenance.pathname = "/postgres";
  const setup = new Pool({ connectionString: maintenance.toString() });
  try {
    if ((await setup.query("select 1 from pg_database where datname='lf028_analytics_test'")).rowCount) throw Error("Existing database never overwritten");
    await setup.query("create role lf028_test_owner login nosuperuser nocreatedb nocreaterole nobypassrls; create role lf028_test_runtime login noinherit nosuperuser nocreatedb nocreaterole nobypassrls");
    await setup.query("create database lf028_analytics_test owner lf028_test_owner");
  } finally { await setup.end(); }
  admin = new Pool({ connectionString: text }); provisioner = new URL(url); provisioner.username = "lf028_test_owner"; provisioner.password = "";
  for (const file of ["scripts/identity/migrate.mjs", "scripts/leads/migrate.mjs", "scripts/activity/migrate.mjs"]) execFileSync(process.execPath, [file], { env: migrateEnv(), encoding: "utf8", stdio: "pipe" });
  const runtimeUrl = new URL(url); runtimeUrl.username = "lf028_test_runtime"; runtimeUrl.password = "";
  process.env.DATABASE_URL = runtimeUrl.toString(); process.env.AUTH_SECRET = randomBytes(32).toString("hex"); process.env.APP_ORIGIN = origin;
  runtime = await identityPool(); a = await signup("alpha"); b = await signup("beta"); sales = await signup("sales");

  // Data that exists before 0004, written by the real 0001–0003 code paths.
  legacy = await organization(a);
  await createLead(runtime, a.id, legacy.id, input(legacy.ganado));
  const left = await createLead(runtime, a.id, legacy.id, input(legacy.nuevo));
  await updateLead(runtime, a.id, legacy.id, left.id, { version: 1, stageId: legacy.ganado });
  await updateLead(runtime, a.id, legacy.id, left.id, { version: 2, stageId: legacy.perdido });
  const inFlight = await createLead(runtime, a.id, legacy.id, input(legacy.nuevo));
  const eventsBefore = (await admin.query("select count(*)::int n from lead_stage_events")).rows[0].n;

  // A DDL failure in the middle of 0004 must leave no column, table, ledger row or weakened RLS behind.
  await admin.query(`create function lf028_fail_ddl() returns event_trigger language plpgsql as $$ begin if exists(select 1 from pg_event_trigger_ddl_commands() where object_identity='public.dashboard_snapshots') then raise exception 'synthetic DDL failure'; end if;end; $$; create event trigger lf028_fail_ddl_trigger on ddl_command_end when tag in('CREATE TABLE') execute function lf028_fail_ddl()`);
  try {
    expect(() => migrate()).toThrow();
    expect((await admin.query("select to_regclass('public.dashboard_snapshots') t,(select count(*)::int from information_schema.columns where table_name='lead_stage_events' and column_name='to_stage_kind') c,(select count(*)::int from app_migrations where version='0004_analytics') ledger,(select relforcerowsecurity from pg_class where oid='public.lead_stage_events'::regclass) forced,(select count(*)::int from lead_stage_events) events")).rows[0]).toEqual({ t: null, c: 0, ledger: 0, forced: true, events: eventsBefore });
  } finally { await admin.query("drop event trigger lf028_fail_ddl_trigger;drop function lf028_fail_ddl()"); }

  // Apply 0004 while a lead move that started under the old function is waiting on the migration's locks.
  const blocker = await admin.connect();
  await blocker.query("begin; lock table memberships in row exclusive mode");
  const blockerPid = (await blocker.query("select pg_backend_pid() pid")).rows[0].pid;
  const child = spawn(process.execPath, ["scripts/analytics/migrate.mjs"], { env: migrateEnv(), stdio: "pipe" });
  child.stdout.resume(); child.stderr.resume();
  const finished = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  let move: Promise<unknown> | undefined;
  try {
    const migratorPid = await waitBlockedBy(blockerPid);
    move = updateLead(runtime, a.id, legacy.id, inFlight.id, { version: 1, stageId: legacy.ganado });
    await waitBlockedBy(migratorPid);
  } finally { await blocker.query("rollback"); blocker.release(); }
  expect(await finished).toBe(0); await move;
  seeder = await admin.connect(); await seeder.query("set session_replication_role = replica");
});
afterAll(async () => { seeder?.release(); await runtime?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

test("0004 backfills earlier events, stamps an in-flight move, repeats safely and keeps least privilege", async () => {
  const kinds = (await admin.query("select e.to_stage_kind kind,count(*)::int n from lead_stage_events e where e.organization_id=$1 group by 1 order by 1", [legacy.id])).rows;
  expect(kinds).toEqual([{ kind: "lost", n: 1 }, { kind: "open", n: 2 }, { kind: "won", n: 3 }]);
  expect((await admin.query("select count(*)::int n from lead_stage_events e join stages s on s.id=e.to_stage_id where e.to_stage_kind<>s.kind")).rows[0].n).toBe(0);
  // Created in won, won then lost, and won by the move that waited on the migration: three leads, each once.
  expect((await dashboardMetrics(runtime, a.id, legacy.id, { interval: "30" })).conversion).toMatchObject({ created: 3, won: 3, archivedIncluded: 0 });
  expect(migrate()).toContain("already applied");
  await admin.query("update app_migrations set sha256='altered' where version='0004_analytics'");
  try { expect(() => migrate()).toThrow(); }
  finally { await admin.query("update app_migrations set sha256=$1 where version='0004_analytics'", [createHash("sha256").update(readFileSync("src/shared/database/migrations/0004_analytics.sql", "utf8").replace(/\r\n/g, "\n")).digest("hex")]); }
  const grants = (await admin.query("select table_name,string_agg(privilege_type,',' order by privilege_type) g from information_schema.role_table_grants where grantee='lf028_test_runtime' and table_name in('dashboard_snapshots','lead_stage_events','organization_audit','app_migrations') group by 1 order by 1")).rows;
  expect(grants).toEqual([{ table_name: "dashboard_snapshots", g: "INSERT,SELECT" }, { table_name: "lead_stage_events", g: "SELECT" }]);
  expect((await admin.query("select relname,relrowsecurity and relforcerowsecurity forced from pg_class where relnamespace='public'::regnamespace and relname in('dashboard_snapshots','lead_stage_events') order by 1")).rows).toEqual([{ relname: "dashboard_snapshots", forced: true }, { relname: "lead_stage_events", forced: true }]);
  expect((await admin.query("select count(*)::int n,bool_and(prosecdef and proconfig @> array['search_path=pg_catalog']) fixed,bool_and(not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE')) restricted from pg_proc p where pronamespace='public'::regnamespace and proname in('lf_stamp_stage_event','lf_validate_dashboard_snapshot','lf_record_dashboard_snapshot')")).rows[0]).toEqual({ n: 3, fixed: true, restricted: true });
});

test("history is not reinterpreted: changing a stage's kind neither removes nor invents a conversion", async () => {
  const org = await organization(a), read = async () => (await dashboardMetrics(runtime, a.id, org.id, { interval: "30" })).conversion;
  // won → lost after the lead left: the reviewer's reproduction. The conversion must stay 1.
  const closing = await configureStage(runtime, a.id, org.id, { name: "Cierre", kind: "won" });
  const converted = await createLead(runtime, a.id, org.id, input(closing.id));
  await updateLead(runtime, a.id, org.id, converted.id, { version: 1, stageId: org.nuevo });
  expect(await read()).toMatchObject({ created: 1, won: 1 });
  expect((await configureStage(runtime, a.id, org.id, { version: closing.version, kind: "lost" }, closing.id)).kind).toBe("lost");
  expect(await read()).toMatchObject({ created: 1, won: 1 });
  // lost → won after the lead left: the inverse must not invent a conversion.
  const discarded = await configureStage(runtime, a.id, org.id, { name: "Descartado", kind: "lost" });
  const never = await createLead(runtime, a.id, org.id, input(discarded.id));
  await updateLead(runtime, a.id, org.id, never.id, { version: 1, stageId: org.nuevo });
  expect(await read()).toMatchObject({ created: 2, won: 1 });
  expect((await configureStage(runtime, a.id, org.id, { version: discarded.version, kind: "won" }, discarded.id)).kind).toBe("won");
  expect(await read()).toMatchObject({ created: 2, won: 1 });
  // A new entry after the change is judged by the new kind, and the old events keep theirs.
  await updateLead(runtime, a.id, org.id, never.id, { version: 2, stageId: discarded.id });
  expect(await read()).toMatchObject({ created: 2, won: 2 });
  const trail = (await admin.query("select e.lead_id=$2 as first,e.lead_version v,e.to_stage_kind kind from lead_stage_events e where e.organization_id=$1 order by 1 desc,2", [org.id, converted.id])).rows;
  expect(trail).toEqual([{ first: true, v: 1, kind: "won" }, { first: true, v: 2, kind: "open" }, { first: false, v: 1, kind: "lost" }, { first: false, v: 2, kind: "open" }, { first: false, v: 3, kind: "won" }]);
  // The stamp ignores a supplied kind, and the runtime can neither insert nor rewrite events.
  const forged = (await admin.query("insert into lead_stage_events(organization_id,lead_id,lead_version,from_stage_id,to_stage_id,to_stage_kind,actor_user_id) values($1,$2,99,null,$3,'won',$4) returning id,to_stage_kind", [org.id, converted.id, org.perdido, a.id])).rows[0];
  expect(forged.to_stage_kind).toBe("lost"); await seeder.query("delete from lead_stage_events where id=$1", [forged.id]);
  const attempts = await withOrganization(runtime, a.id, org.id, async ({ client }) => {
    const out: string[] = [];
    for (const sql of ["update lead_stage_events set to_stage_kind='won'", "delete from lead_stage_events", "insert into lead_stage_events(organization_id,lead_id,lead_version,to_stage_id,to_stage_kind,actor_user_id) select organization_id,id,50,stage_id,'won','x' from leads limit 1"]) {
      await client.query("savepoint s"); try { await client.query(sql); out.push("ALLOWED"); } catch (error) { out.push(code(error)); } await client.query("rollback to savepoint s");
    }
    return out;
  });
  expect(attempts).toEqual(["42501", "42501", "42501"]);
});

test("a kind change and a move into that stage serialize in both orders, and the event keeps the kind in force", async () => {
  const org = await organization(a);
  // Order 1: the move is in flight; the kind change waits and is then refused because the stage is in use.
  const target = await configureStage(runtime, a.id, org.id, { name: "Destino uno", kind: "open" }), lead = await createLead(runtime, a.id, org.id, input(org.nuevo));
  const first = gate(); let movePid = 0;
  const moving = withOrganization(runtime, a.id, org.id, async ({ client }) => {
    movePid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("update leads set stage_id=$3 where organization_id=$1 and id=$2", [org.id, lead.id, target.id]); first.enter(); await first.hold;
  });
  await first.entered;
  const change = configureStage(runtime, a.id, org.id, { version: target.version, kind: "won" }, target.id).then(() => "changed", code);
  try { await waitBlockedBy(movePid); } finally { first.release(); await moving; }
  expect(await change).toBe("CONFLICT");
  expect((await admin.query("select to_stage_kind from lead_stage_events where lead_id=$1 order by lead_version desc limit 1", [lead.id])).rows[0].to_stage_kind).toBe("open");
  expect((await dashboardMetrics(runtime, a.id, org.id, { interval: "30" })).conversion).toMatchObject({ created: 1, won: 0 });
  // Order 2: the kind change is in flight; the move waits and its event records the new kind.
  const second = await configureStage(runtime, a.id, org.id, { name: "Destino dos", kind: "open" }), other = await createLead(runtime, a.id, org.id, input(org.nuevo));
  const held = gate(); let changePid = 0;
  const changing = withOrganization(runtime, a.id, org.id, async ({ client }) => {
    changePid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    await client.query("select id from pipelines where organization_id=$1 for update", [org.id]);
    await client.query("update stages set kind='won',version=version+1 where organization_id=$1 and id=$2", [org.id, second.id]); held.enter(); await held.hold;
  });
  await held.entered;
  const move = updateLead(runtime, a.id, org.id, other.id, { version: 1, stageId: second.id }).then(() => "moved", code);
  try { await waitBlockedBy(changePid); } finally { held.release(); await changing; }
  expect(await move).toBe("moved");
  expect((await admin.query("select to_stage_kind from lead_stage_events where lead_id=$1 order by lead_version desc limit 1", [other.id])).rows[0].to_stage_kind).toBe("won");
  expect((await dashboardMetrics(runtime, a.id, org.id, { interval: "30" })).conversion).toMatchObject({ created: 2, won: 1 });
});

test("session, membership, role and strict parameters are enforced; reading writes nothing", async () => {
  const org = await organization(a), other = await organization(b);
  await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [org.id, sales.id]);
  await seedLead(org, a, "2026-01-01T00:00:00Z");
  const before = await written();
  expect((await http(org.id, "")).status).toBe(401);
  expect((await http(org.id, "better-auth.session_token=invalid")).status).toBe(401);
  for (const target of ["not-a-uuid", randomUUID(), other.id]) expect((await http(target, a.cookie)).status).toBe(404);
  const owner = await http(org.id, a.cookie); expect(owner.status).toBe(200); expect(owner.headers.get("cache-control")).toBe("no-store");
  const asSales = await http(org.id.toUpperCase(), sales.cookie); expect(asSales.status).toBe(200);
  const first = await owner.json() as DashboardMetrics, second = await asSales.json() as DashboardMetrics;
  expect(second.activeLeads).toBe(1); expect(second.stages).toEqual(first.stages); expect(first.interval.days).toBe(90);
  for (const query of ["?interval=7", "?interval=abc", "?interval=", "?interval=30&interval=90", "?asOf=2000-01-01T00:00:00Z", "?interval=30&timezone=UTC", "?from=2020-01-01"]) {
    const response = await http(org.id, a.cookie, query); expect(response.status).toBe(422); expect((await response.json()).code).toBe("INVALID_INPUT");
  }
  expect((await http(org.id, a.cookie, "", "POST")).status).toBe(405);
  expect(Math.abs(Date.parse(first.asOf) - Date.now())).toBeLessThan(60000);
  expect((await snapshots(org.id, a.cookie)).status).toBe(200);
  await admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [org.id, sales.id]);
  expect((await http(org.id, sales.cookie)).status).toBe(404);
  await expect(dashboardMetrics(runtime, sales.id, org.id, {})).rejects.toMatchObject({ status: 404 });
  expect(await written()).toEqual(before);
});

test("stage counts are exact, exclude archived leads, list empty active stages and hide unused inactive ones", async () => {
  const org = await organization(a), day = "2026-02-01T10:00:00Z";
  for (let index = 0; index < 3; index++) await seedLead(org, a, day);
  await seedLead(org, a, day, { archivedAt: "2026-02-02T00:00:00Z" });
  await seedLead(org, a, day, { moves: [[org.calificacion, "2026-02-03T00:00:00Z"]] });
  await seedLead(org, a, day, { moves: [[org.ganado, "2026-02-03T00:00:00Z"]] });
  await seedLead(org, a, day, { moves: [[org.ganado, "2026-02-03T00:00:00Z"]], archivedAt: "2026-02-04T00:00:00Z" });
  const extra = await configureStage(runtime, a.id, org.id, { name: "Sin uso", kind: "open" });
  await configureStage(runtime, a.id, org.id, { version: extra.version, active: false }, extra.id);
  const result = await metrics(org, a, "2026-03-01T00:00:00.000Z");
  expect(counts(result)).toEqual({ Nuevo: 3, "Calificación": 1, Propuesta: 0, Ganado: 1, Perdido: 0 });
  expect(result.stages.map(stage => stage.position)).toEqual([1, 2, 3, 4, 5]);
  expect(result.stages.map(stage => stage.kind)).toEqual(["open", "open", "open", "won", "lost"]);
  expect(result.activeLeads).toBe(5);
  expect((await admin.query("select count(*)::int n from leads where organization_id=$1", [org.id])).rows[0].n).toBe(7);
});

test("conversion counts each lead once: repeated, abandoned, direct, late and archived wins", async () => {
  const org = await organization(a), asOf = "2026-06-15T12:00:00.000Z";
  await seedLead(org, a, "2026-06-01T09:00:00Z", { moves: [[org.ganado, "2026-06-02T00:00:00Z"], [org.nuevo, "2026-06-03T00:00:00Z"], [org.ganado, "2026-06-04T00:00:00Z"], [org.calificacion, "2026-06-05T00:00:00Z"], [org.ganado, "2026-06-06T00:00:00Z"]] });
  await seedLead(org, a, "2026-06-02T09:00:00Z", { moves: [[org.ganado, "2026-06-03T00:00:00Z"], [org.perdido, "2026-06-04T00:00:00Z"]] });
  await seedLead(org, a, "2026-06-03T09:00:00Z", { stage: org.ganado });
  await seedLead(org, a, "2026-06-04T09:00:00Z", { moves: [[org.calificacion, "2026-06-05T00:00:00Z"]] });
  await seedLead(org, a, "2026-06-05T09:00:00Z", { moves: [[org.ganado, "2026-06-16T00:00:00Z"]] });
  await seedLead(org, a, "2026-06-06T09:00:00Z", { moves: [[org.ganado, "2026-06-07T00:00:00Z"]], archivedAt: "2026-06-08T00:00:00Z" });
  await seedLead(org, a, "2026-06-07T09:00:00Z", { archivedAt: "2026-06-08T00:00:00Z" });
  await seedLead(org, a, "2026-05-10T09:00:00Z", { moves: [[org.ganado, "2026-05-11T00:00:00Z"]] });
  const result = await metrics(org, a, asOf);
  expect(result.conversion).toEqual({ created: 7, won: 4, archivedIncluded: 2, cohorts: [{ month: "2026-05", created: 0, won: 0 }, { month: "2026-06", created: 7, won: 4 }] });
  expect(conversionRate(result.conversion.cohorts[0].won, result.conversion.cohorts[0].created)).toBeNull();
  expect(conversionRate(result.conversion.won, result.conversion.created)).toBeCloseTo(4 / 7, 12);
  expect((await admin.query("select count(*)::int n from lead_stage_events where organization_id=$1 and to_stage_kind='won' and happened_at<=$2", [org.id, asOf])).rows[0].n).toBe(7);
  // The wider interval reaches the May lead; the late win becomes visible only once the cutoff passes it.
  expect((await metrics(org, a, asOf, "90")).conversion).toMatchObject({ created: 8, won: 5 });
  expect((await metrics(org, a, "2026-06-16T00:00:00.000Z")).conversion).toMatchObject({ created: 7, won: 5 });
  expect((await metrics(org, a, "2026-06-15T23:59:59.999Z")).conversion).toMatchObject({ created: 7, won: 4 });
});

test("a zero denominator is reported as zero counts, distinguishable from a real 0% conversion", async () => {
  const empty = await organization(a), unconverted = await organization(a), asOf = "2026-06-15T12:00:00.000Z";
  await seedLead(unconverted, a, "2026-06-10T00:00:00Z");
  const none = await metrics(empty, a, asOf), zero = await metrics(unconverted, a, asOf);
  expect(none.conversion).toEqual({ created: 0, won: 0, archivedIncluded: 0, cohorts: [{ month: "2026-05", created: 0, won: 0 }, { month: "2026-06", created: 0, won: 0 }] });
  expect(none.activeLeads).toBe(0); expect(Object.values(counts(none))).toEqual([0, 0, 0, 0, 0]);
  expect(none.followups).toEqual({ pending: 0, overdue: 0, upcoming: 0, onArchivedLeads: 0 });
  expect(conversionRate(none.conversion.won, none.conversion.created)).toBeNull();
  expect(conversionRate(zero.conversion.won, zero.conversion.created)).toBe(0);
  expect(zero.conversion.cohorts).toEqual([{ month: "2026-05", created: 0, won: 0 }, { month: "2026-06", created: 1, won: 0 }]);
});

test("interval bounds are inclusive to the millisecond and reported exactly for 30, 90 and 180 days", async () => {
  const org = await organization(a), asOf = "2026-06-15T12:00:00.000Z", from = "2026-05-17T00:00:00.000Z";
  for (const instant of [from, ms(from, -1), asOf, ms(asOf, 1)]) await seedLead(org, a, instant);
  const result = await metrics(org, a, asOf);
  expect(result.asOf).toBe(asOf); expect(result.timezone).toBe("UTC");
  expect(result.interval).toEqual({ days: 30, from, to: asOf });
  expect(result.conversion.created).toBe(2);
  expect(result.conversion.cohorts).toEqual([{ month: "2026-05", created: 1, won: 0 }, { month: "2026-06", created: 1, won: 0 }]);
  expect((await metrics(org, a, ms(asOf, 1))).conversion.created).toBe(3);
  expect((await metrics(org, a, asOf, "90")).interval).toEqual({ days: 90, from: "2026-03-18T00:00:00.000Z", to: asOf });
  const wide = await metrics(org, a, asOf, "180");
  expect(wide.interval).toEqual({ days: 180, from: "2025-12-18T00:00:00.000Z", to: asOf });
  expect(wide.conversion.cohorts.map(cohort => cohort.month)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  expect(wide.conversion.created).toBe(3);
  // The stage distribution is a current state: it ignores the interval and the created date.
  expect(result.activeLeads).toBe(4);
});

test("the organization timezone decides day and month limits across both DST changes", async () => {
  const newYork = await organization(a, "America/New_York"), tokyo = await organization(a, "Asia/Tokyo");
  // Autumn: 2026-11-01 02:00 EDT falls back to 01:00 EST. Local midnight of 12 Oct is still EDT (UTC-4).
  const autumn = "2026-11-10T15:00:00.000Z", autumnFrom = "2026-10-12T04:00:00.000Z";
  const instants = [autumnFrom, ms(autumnFrom, -1), "2026-11-01T03:30:00.000Z", "2026-11-01T04:00:00.000Z", "2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"];
  for (const instant of instants) { await seedLead(newYork, a, instant); await seedLead(tokyo, a, instant); }
  const ny = await metrics(newYork, a, autumn);
  expect(ny.timezone).toBe("America/New_York"); expect(ny.interval).toEqual({ days: 30, from: autumnFrom, to: autumn });
  // 12 Oct 00:00 and 31 Oct 23:30 local belong to October; local midnight and both 01:30 instants of 1 Nov to November.
  expect(ny.conversion.cohorts).toEqual([{ month: "2026-10", created: 2, won: 0 }, { month: "2026-11", created: 3, won: 0 }]);
  const jp = await metrics(tokyo, a, autumn);
  // Tokyo is already 11 Nov 00:00 at the same instant: its 30 days start 13 Oct 00:00 JST and every 1 Nov instant is November there.
  expect(jp.interval.from).toBe("2026-10-12T15:00:00.000Z");
  expect(jp.conversion.cohorts).toEqual([{ month: "2026-10", created: 0, won: 0 }, { month: "2026-11", created: 4, won: 0 }]);
  // Spring: 2026-03-08 02:00 EST jumps to 03:00 EDT. Local midnight of 19 Feb is EST (UTC-5) although the cutoff is EDT.
  const spring = "2026-03-20T16:00:00.000Z", springFrom = "2026-02-19T05:00:00.000Z";
  await seedLead(newYork, a, springFrom); await seedLead(newYork, a, ms(springFrom, -1));
  await seedLead(newYork, a, "2026-03-01T04:59:59.999Z"); await seedLead(newYork, a, "2026-03-01T05:00:00.000Z");
  const result = await metrics(newYork, a, spring);
  expect(result.interval).toEqual({ days: 30, from: springFrom, to: spring });
  expect(result.conversion.cohorts).toEqual([{ month: "2026-02", created: 2, won: 0 }, { month: "2026-03", created: 1, won: 0 }]);
  // Calendar days, not N×24 h: 12 Oct 00:00 → 10 Nov 10:00 local is 29 d 10 h on the wall clock but 29 d 11 h elapsed (repeated hour);
  // 19 Feb 00:00 → 20 Mar 12:00 local is 29 d 12 h on the wall clock but 29 d 11 h elapsed (skipped hour).
  const hours = (to: string, from: string) => (Date.parse(to) - Date.parse(from)) / 3600000;
  expect(hours(autumn, autumnFrom)).toBe(29 * 24 + 11); expect(hours(spring, springFrom)).toBe(29 * 24 + 11);
});

test("the interval starts at the first real instant of the local day: repeated, missing and skipped midnights", async () => {
  const bounds = async (org: Org, asOf: string, from: string, inside: string[], outside: string[]) => {
    for (const instant of [...inside, ...outside]) await seedLead(org, a, instant);
    const result = await metrics(org, a, asOf);
    expect(result.interval).toEqual({ days: 30, from, to: asOf });
    expect(result.conversion.created).toBe(inside.length);
  };
  // America/Havana, 1 Nov 2026: 01:00 CDT falls back to 00:00 CST, so local midnight happens at 04:00Z and again at 05:00Z.
  // The reviewer's case: a lead created at 04:30Z belongs to the first local day and must be inside.
  const havana = await organization(a, "America/Havana");
  await bounds(havana, "2026-11-30T12:00:00.000Z", "2026-11-01T04:00:00.000Z", ["2026-11-01T04:00:00.000Z", "2026-11-01T04:30:00.000Z", "2026-11-01T05:00:00.000Z"], ["2026-11-01T03:59:59.999Z"]);
  // America/Havana, 8 Mar 2026: 00:00 CST jumps to 01:00 CDT, so local midnight does not exist; the day starts at the jump.
  await bounds(havana, "2026-04-06T12:00:00.000Z", "2026-03-08T05:00:00.000Z", ["2026-03-08T05:00:00.000Z"], ["2026-03-08T04:59:59.999Z"]);
  // America/Sao_Paulo, 18 Feb 2018: 00:00 falls back to 23:00 of the 17th; 02:30Z is 23:30 of the previous day, repeated.
  const saoPaulo = await organization(a, "America/Sao_Paulo");
  await bounds(saoPaulo, "2018-03-19T12:00:00.000Z", "2018-02-18T03:00:00.000Z", ["2018-02-18T03:00:00.000Z"], ["2018-02-18T02:30:00.000Z", "2018-02-18T01:00:00.000Z"]);
  // America/Sao_Paulo, 4 Nov 2018: 00:00 jumps to 01:00. The three February leads are before this interval.
  for (const instant of ["2018-11-04T03:00:00.000Z", "2018-11-04T02:59:59.999Z"]) await seedLead(saoPaulo, a, instant);
  const spring = await metrics(saoPaulo, a, "2018-12-03T12:00:00.000Z");
  expect(spring.interval.from).toBe("2018-11-04T03:00:00.000Z"); expect(spring.conversion.created).toBe(1);
  // Pacific/Apia skipped 30 Dec 2011 entirely: no instant has that local date, so the interval starts with 31 Dec.
  const apia = await organization(a, "Pacific/Apia");
  await bounds(apia, "2012-01-27T12:00:00.000Z", "2011-12-30T10:00:00.000Z", ["2011-12-30T10:00:00.000Z"], ["2011-12-30T09:59:59.999Z"]);
});

test("follow-ups: overdue is strictly before the cutoff; closed ones are ignored; archived leads keep theirs", async () => {
  const org = await organization(a), asOf = "2026-06-15T12:00:00.000Z";
  const lead = await seedLead(org, a, "2026-06-01T00:00:00Z"), archived = await seedLead(org, a, "2026-06-01T00:00:00Z", { archivedAt: "2026-06-02T00:00:00Z" });
  await seedFollowup(org, a, lead, ms(asOf, -1)); await seedFollowup(org, a, lead, asOf); await seedFollowup(org, a, lead, ms(asOf, 86400000));
  await seedFollowup(org, a, lead, ms(asOf, -86400000), "completed"); await seedFollowup(org, a, lead, ms(asOf, -86400000), "canceled");
  await seedFollowup(org, a, archived, ms(asOf, -3600000));
  const result = await metrics(org, a, asOf);
  expect(result.followups).toEqual({ pending: 4, overdue: 2, upcoming: 2, onArchivedLeads: 1 });
  expect((await metrics(org, a, ms(asOf, 1))).followups).toMatchObject({ overdue: 3, upcoming: 1 });
  expect((await metrics(org, a, asOf, "180")).followups).toEqual(result.followups);
});

test("two organizations never mix, and the runtime sees nothing without a session context", async () => {
  const first = await organization(a), second = await organization(b), asOf = "2026-06-15T12:00:00.000Z";
  for (let index = 0; index < 2; index++) await seedLead(first, a, "2026-06-10T00:00:00Z", { moves: [[first.ganado, "2026-06-11T00:00:00Z"]] });
  const leadB = await seedLead(second, b, "2026-06-10T00:00:00Z");
  for (let index = 0; index < 4; index++) await seedLead(second, b, "2026-06-10T00:00:00Z");
  await seedFollowup(second, b, leadB, ms(asOf, -1));
  const one = await metrics(first, a, asOf), two = await metrics(second, b, asOf);
  expect([one.activeLeads, one.conversion.created, one.conversion.won, one.followups.pending]).toEqual([2, 2, 2, 0]);
  expect([two.activeLeads, two.conversion.created, two.conversion.won, two.followups.pending]).toEqual([5, 5, 0, 1]);
  await saveDashboardSnapshot(runtime, b.id, second.id, { interval: 30, creationKey: randomUUID() });
  await expect(dashboardMetrics(runtime, a.id, second.id, {})).rejects.toMatchObject({ status: 404 });
  await expect(dashboardMetrics(runtime, b.id, first.id, {})).rejects.toMatchObject({ status: 404 });
  await expect(listDashboardSnapshots(runtime, a.id, second.id, {})).rejects.toMatchObject({ status: 404 });
  await expect(saveDashboardSnapshot(runtime, a.id, second.id, { interval: 30, creationKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
  expect(await listDashboardSnapshots(runtime, a.id, first.id, {})).toEqual([]);
  expect((await http(second.id, a.cookie)).status).toBe(404); expect((await snapshots(second.id, a.cookie)).status).toBe(404);
  expect((await snapshots(second.id, a.cookie, "POST", { interval: 30, creationKey: randomUUID() })).status).toBe(404);
  for (const table of ["leads", "stages", "lead_stage_events", "followups", "organizations", "dashboard_snapshots"]) expect((await runtime.query(`select count(*)::int n from ${table}`)).rows[0].n).toBe(0);
});

test("real services and the server clock: repeated wins, archive and follow-ups reach the endpoint without backdating", async () => {
  const org = await organization(a, "America/Lima");
  const repeated = await createLead(runtime, a.id, org.id, input(org.nuevo));
  await updateLead(runtime, a.id, org.id, repeated.id, { version: 1, stageId: org.ganado });
  await updateLead(runtime, a.id, org.id, repeated.id, { version: 2, stageId: org.calificacion });
  await updateLead(runtime, a.id, org.id, repeated.id, { version: 3, stageId: org.ganado });
  await createLead(runtime, a.id, org.id, input(org.ganado));
  const open = await createLead(runtime, a.id, org.id, input(org.nuevo));
  const archived = await createLead(runtime, a.id, org.id, input(org.calificacion));
  const followup = (leadId: string, dueAt: string) => createActivity(runtime, a.id, org.id, "followups", { leadId, creationKey: randomUUID(), title: "Real", detail: null, assignedUserId: a.id, dueAt });
  await followup(open.id, "2020-01-01T00:00:00Z"); await followup(open.id, "2099-01-01T00:00:00Z"); await followup(archived.id, "2020-01-01T00:00:00Z");
  const closed = await followup(open.id, "2020-01-01T00:00:00Z"); await closeFollowup(runtime, a.id, org.id, closed.id, "completed", { version: 1 });
  await updateLead(runtime, a.id, org.id, archived.id, { version: 1 }, true);
  const response = await http(org.id, a.cookie, "?interval=30"); expect(response.status).toBe(200);
  const result = await response.json() as DashboardMetrics;
  expect(counts(result)).toEqual({ Nuevo: 1, "Calificación": 0, Propuesta: 0, Ganado: 2, Perdido: 0 });
  expect(result.activeLeads).toBe(3);
  expect(result.conversion).toMatchObject({ created: 4, won: 2, archivedIncluded: 1 });
  expect(result.conversion.cohorts.at(-1)).toMatchObject({ created: 4, won: 2 });
  expect(result.followups).toEqual({ pending: 3, overdue: 2, upcoming: 1, onArchivedLeads: 1 });
  // The server cutoff is PostgreSQL's clock and the interval starts at a Lima midnight (UTC-5, no DST).
  expect(result.interval.to).toBe(result.asOf); expect(result.interval.from).toMatch(/T05:00:00\.000Z$/);
  const lima = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(iso));
  expect(Math.round((Date.parse(lima(result.asOf)) - Date.parse(lima(result.interval.from))) / 86400000)).toBe(29);
  // A later request has a later cutoff and reflects new data immediately.
  await updateLead(runtime, a.id, org.id, open.id, { version: 1, stageId: org.ganado });
  const next = await (await http(org.id, a.cookie, "?interval=30")).json() as DashboardMetrics;
  expect(next.conversion).toMatchObject({ created: 4, won: 3 }); expect(Date.parse(next.asOf)).toBeGreaterThanOrEqual(Date.parse(result.asOf));
});

test("saving a cutoff stores exactly the computed result with its organization, interval, zone and author", async () => {
  // A past cutoff: the database refuses to store one later than its own clock (asserted in the boundary test).
  const org = await organization(a, "America/Havana"), asOf = "2026-06-15T12:00:00.000Z";
  await seedLead(org, a, "2026-05-17T04:30:00.000Z", { moves: [[org.ganado, "2026-05-18T00:00:00Z"]] }); await seedLead(org, a, "2026-06-01T00:00:00Z");
  const lead = await seedLead(org, a, "2026-04-01T00:00:00Z"); await seedFollowup(org, a, lead, ms(asOf, -1));
  const expected = await metrics(org, a, asOf), key = randomUUID();
  const saved = await saveDashboardSnapshot(runtime, a.id, org.id, { interval: 30, creationKey: key }, { asOf });
  expect(saved.metrics).toEqual(expected); expect(saved.createdBy).toBe(a.id); expect(saved.createdByName).toBe("Persona alpha");
  expect(saved.metrics.conversion).toMatchObject({ created: 2, won: 1 }); expect(saved.metrics.interval.from).toBe("2026-05-17T04:00:00.000Z");
  const row = (await admin.query("select organization_id,created_by,creation_key,interval_days,as_of,timezone,interval_from,metrics,created_at from dashboard_snapshots where id=$1", [saved.id])).rows[0];
  expect(row).toMatchObject({ organization_id: org.id, created_by: a.id, creation_key: key, interval_days: 30, timezone: "America/Havana" });
  expect(row.as_of.toISOString()).toBe(asOf); expect(row.interval_from.toISOString()).toBe("2026-05-17T04:00:00.000Z"); expect(row.metrics).toEqual(expected);
  expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(60000);
  expect((await admin.query("select action,actor_user_id,request_id is not null rid from organization_audit where entity_id=$1", [saved.id])).rows).toEqual([{ action: "dashboard.snapshot_saved", actor_user_id: a.id, rid: true }]);
  // The saved copy does not move when the source data changes afterwards.
  await seedLead(org, a, "2026-06-10T00:00:00Z", { stage: org.ganado });
  expect((await metrics(org, a, asOf)).conversion).toMatchObject({ created: 3, won: 2 });
  expect((await listDashboardSnapshots(runtime, a.id, org.id, {}))[0]).toEqual(saved);
  expect((await saveDashboardSnapshot(runtime, a.id, org.id, { interval: 30, creationKey: key }, { asOf })).metrics.conversion).toMatchObject({ created: 2, won: 1 });
});

test("saving is idempotent and atomic: replays, concurrent requests, a reused key and an audit failure", async () => {
  const org = await organization(a); await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [org.id, sales.id]);
  await createLead(runtime, a.id, org.id, input(org.ganado));
  const key = randomUUID(), body = { interval: 90, creationKey: key };
  const first = await snapshots(org.id, a.cookie, "POST", body); expect(first.status).toBe(201); expect(first.headers.get("cache-control")).toBe("no-store");
  const saved = (await first.json()).snapshot as DashboardSnapshot;
  expect(saved.metrics.conversion).toMatchObject({ created: 1, won: 1 }); expect(saved.metrics.interval.days).toBe(90);
  // New data arrives; replaying the same key must return the confirmed cutoff, not a recomputed one.
  await createLead(runtime, a.id, org.id, input(org.nuevo));
  const replay = await snapshots(org.id, a.cookie, "POST", { ...body, creationKey: key.toUpperCase() }); expect(replay.status).toBe(201);
  expect((await replay.json()).snapshot).toEqual(saved);
  expect((await snapshots(org.id, a.cookie, "POST", { interval: 30, creationKey: key })).status).toBe(409);
  // The key is scoped to its author: another member may use the same value and gets a separate cutoff.
  const bySales = await snapshots(org.id, sales.cookie, "POST", body); expect(bySales.status).toBe(201);
  const other = (await bySales.json()).snapshot as DashboardSnapshot;
  expect(other.id).not.toBe(saved.id); expect(other.createdBy).toBe(sales.id); expect(other.metrics.conversion).toMatchObject({ created: 2, won: 1 });
  // Ten simultaneous requests with one key: one row and one audit entry.
  const shared = randomUUID(), burst = await Promise.all(Array.from({ length: 10 }, () => snapshots(org.id, a.cookie, "POST", { interval: 30, creationKey: shared })));
  expect(burst.map(response => response.status)).toEqual(Array(10).fill(201));
  const ids = new Set((await Promise.all(burst.map(response => response.json()))).map(value => value.snapshot.id)); expect(ids.size).toBe(1);
  expect((await admin.query("select (select count(*) from dashboard_snapshots where organization_id=$1)::int rows,(select count(*) from organization_audit where organization_id=$1 and action='dashboard.snapshot_saved')::int audit", [org.id])).rows[0]).toEqual({ rows: 3, audit: 3 });
  // If the audit cannot be written, nothing is saved; the same key then succeeds.
  const failing = randomUUID();
  await admin.query("alter table organization_audit add constraint lf028_reject_snapshot check(action<>'dashboard.snapshot_saved') not valid");
  try { expect((await snapshots(org.id, a.cookie, "POST", { interval: 30, creationKey: failing })).status).toBe(503); }
  finally { await admin.query("alter table organization_audit drop constraint lf028_reject_snapshot"); }
  expect((await admin.query("select count(*)::int n from dashboard_snapshots where creation_key=$1", [failing])).rows[0].n).toBe(0);
  expect((await snapshots(org.id, a.cookie, "POST", { interval: 30, creationKey: failing })).status).toBe(201);
  // Listing: newest cutoff first, bounded, strict, and without side effects.
  const before = await written();
  const listed = (await (await snapshots(org.id, a.cookie)).json()).snapshots as DashboardSnapshot[];
  expect(listed).toHaveLength(4); expect(listed.map(value => value.metrics.asOf)).toEqual([...listed.map(value => value.metrics.asOf)].sort().reverse());
  expect(((await (await snapshots(org.id, sales.cookie, "GET", undefined, "?limit=2")).json()).snapshots as DashboardSnapshot[]).map(value => value.id)).toEqual(listed.slice(0, 2).map(value => value.id));
  for (const query of ["?limit=0", "?limit=51", "?limit=x", "?limit=1&limit=2", "?cursor=x", "?asOf=2020-01-01T00:00:00Z"]) expect((await snapshots(org.id, a.cookie, "GET", undefined, query)).status).toBe(422);
  expect(await written()).toEqual(before);
});

test("the save boundary: session, origin, strict body, membership, shared limit and immutability", async () => {
  const org = await organization(a); await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [org.id, sales.id]);
  const valid = () => ({ interval: 30, creationKey: randomUUID() }), before = await written();
  expect((await snapshots(org.id, "", "POST", valid())).status).toBe(401); expect((await snapshots(org.id, "")).status).toBe(401);
  for (const source of [null, "https://hostile.invalid"]) expect((await snapshots(org.id, a.cookie, "POST", valid(), "", source)).status).toBe(403);
  for (const target of ["not-a-uuid", randomUUID()]) expect((await snapshots(target, a.cookie, "POST", valid())).status).toBe(404);
  for (const body of [{}, { interval: 30 }, { creationKey: randomUUID() }, { ...valid(), interval: 7 }, { ...valid(), interval: "30" }, { ...valid(), creationKey: "x" }, { ...valid(), asOf: "2020-01-01T00:00:00Z" },
    { ...valid(), metrics: { activeLeads: 999 } }, { ...valid(), timezone: "UTC" }, { ...valid(), createdBy: sales.id }, { ...valid(), organizationId: randomUUID() }, null, [], "text", { ...valid(), pad: "x".repeat(3000) }]) {
    const response = await snapshots(org.id, a.cookie, "POST", body); expect(response.status).toBe(422); expect((await response.json()).code).toBe("INVALID_INPUT");
  }
  expect((await snapshotsRequest(req("/api/test", "PATCH", a.cookie, valid()), org.id)).status).toBe(405);
  // Nothing was stored by any rejected request, although the valid-origin attempts did consume the shared counter.
  const after = await written(); expect({ ...after, attempts: before.attempts }).toEqual(before);
  const counter = async (user: User) => (await admin.query("select attempts from auth_attempts where key=$1", [createHash("sha256").update("commercial:" + user.id).digest("hex")])).rows[0]?.attempts ?? 0;
  const used = await counter(a); expect(used).toBeGreaterThan(0);
  expect((await snapshots(org.id, a.cookie, "POST", valid())).status).toBe(201); expect(await counter(a)).toBe(used + 1);
  expect((await snapshots(org.id, a.cookie)).status).toBe(200); expect(await counter(a)).toBe(used + 1);
  await admin.query("update auth_attempts set attempts=120 where key=$1", [createHash("sha256").update("commercial:" + a.id).digest("hex")]);
  expect((await snapshots(org.id, a.cookie, "POST", valid())).status).toBe(429);
  // A sales member may save; once revoked, neither saving nor reading is possible.
  expect((await snapshots(org.id, sales.cookie, "POST", valid())).status).toBe(201);
  await admin.query("update memberships set revoked_at=now() where organization_id=$1 and user_id=$2", [org.id, sales.id]);
  expect((await snapshots(org.id, sales.cookie, "POST", valid())).status).toBe(404); expect((await snapshots(org.id, sales.cookie)).status).toBe(404);
  // Direct SQL with a legitimate context: no edits or deletions, and server-owned fields cannot be forged.
  const stored = (await admin.query("select id,metrics from dashboard_snapshots where organization_id=$1 and created_by=$2", [org.id, a.id])).rows[0];
  const out = await withOrganization(runtime, a.id, org.id, async ({ client }) => {
    const result: Record<string, unknown> = {};
    const attempt = async (name: string, sql: string, params: unknown[] = []) => { await client.query("savepoint s"); try { const done = await client.query(sql, params); result[name] = done.rows[0] ?? done.rowCount; } catch (error) { result[name] = code(error); } await client.query("rollback to savepoint s"); };
    const insert = (zone: string, cut: string) => [`insert into dashboard_snapshots(organization_id,created_by,creation_key,interval_days,as_of,timezone,interval_from,metrics,created_at) values($1,$2,gen_random_uuid(),30,${cut},$3,'2000-01-01',jsonb_build_object('interval',jsonb_build_object('days',30),'timezone',$3::text),'2001-01-01') returning created_by=$4 as author_is_session,created_at>now()-interval '1 minute' as fresh`, [org.id, sales.id, zone, a.id]] as [string, unknown[]];
    await attempt("update", "update dashboard_snapshots set metrics='{}'::jsonb"); await attempt("delete", "delete from dashboard_snapshots"); await attempt("truncate", "truncate dashboard_snapshots");
    await attempt("forgedAuthorAndDate", ...insert("UTC", "now()-interval '1 hour'")); await attempt("wrongZone", ...insert("Asia/Tokyo", "now()-interval '1 hour'")); await attempt("futureCutoff", ...insert("UTC", "now()+interval '1 hour'"));
    await attempt("otherOrganization", "insert into dashboard_snapshots(organization_id,created_by,creation_key,interval_days,as_of,timezone,interval_from,metrics) values($1,$2,gen_random_uuid(),30,now(),'UTC','2000-01-01','{}'::jsonb)", [randomUUID(), a.id]);
    await attempt("incoherentColumns", "insert into dashboard_snapshots(organization_id,created_by,creation_key,interval_days,as_of,timezone,interval_from,metrics) values($1,$2,gen_random_uuid(),90,now()-interval '1 hour','UTC','2000-01-01',jsonb_build_object('interval',jsonb_build_object('days',30),'timezone','UTC'))", [org.id, a.id]);
    return result;
  });
  expect(out).toEqual({ update: "42501", delete: "42501", truncate: "42501", forgedAuthorAndDate: { author_is_session: true, fresh: true }, wrongZone: "23514", futureCutoff: "23514", otherOrganization: "42501", incoherentColumns: "23514" });
  // Even the table owner cannot rewrite or remove a saved cutoff.
  const owner = new Pool({ connectionString: provisioner.toString(), max: 1 });
  try {
    const client = await owner.connect();
    try {
      await client.query("begin"); await client.query("select set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)", [a.id, org.id]);
      for (const sql of ["update dashboard_snapshots set metrics='{}'::jsonb where id=$1", "delete from dashboard_snapshots where id=$1"]) { await client.query("savepoint s"); await expect(client.query(sql, [stored.id])).rejects.toMatchObject({ code: "23514" }); await client.query("rollback to savepoint s"); }
      await client.query("rollback");
    } finally { client.release(); }
  } finally { await owner.end(); }
  expect((await admin.query("select metrics from dashboard_snapshots where id=$1", [stored.id])).rows[0].metrics).toEqual(stored.metrics);
});
