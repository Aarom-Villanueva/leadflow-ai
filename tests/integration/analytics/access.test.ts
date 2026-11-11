import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { handleAuth } from "../../../src/modules/identity/http";
import { organizationsRequest } from "../../../src/modules/organizations/http";
import { identityPool } from "../../../src/shared/database/runtime";
import { configureStage, createLead, pipelineMetadata, updateLead } from "../../../src/modules/leads/service";
import { closeFollowup, createActivity } from "../../../src/modules/activity/service";
import { dashboardRequest } from "../../../src/modules/analytics/http";
import { dashboardMetrics } from "../../../src/modules/analytics/service";
import { conversionRate } from "../../../src/modules/analytics/metrics";
import type { DashboardMetrics } from "../../../src/modules/analytics/contracts";

const origin = "http://127.0.0.1:4313";
type User = { id: string; cookie: string };
type Org = { id: string; nuevo: string; calificacion: string; ganado: string; perdido: string };
let admin: Pool, runtime: Pool, seeder: PoolClient, a: User, b: User, sales: User;

const req = (path: string, method: string, cookie: string, body?: unknown) => new Request(origin + path, { method, headers: { cookie, origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
async function signup(name: string): Promise<User> {
  const response = await handleAuth(req("/api/auth/sign-up/email", "POST", "", { name: "Persona " + name, email: name + "@analytics-test.invalid", password: "Synthetic-analytics-password-028!" }));
  expect(response.status).toBe(200); return { id: (await response.json()).user.id as string, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function organization(user: User, timezone = "UTC"): Promise<Org> {
  await admin.query("delete from auth_attempts"); // laboratory only: this suite creates more organizations per minute than the product limit allows
  const response = await organizationsRequest(req("/api/organizations", "POST", user.cookie, { name: "Equipo métricas", slug: "metrics-" + randomUUID().slice(0, 12), timezone }));
  expect(response.status).toBe(201); const id = (await response.json()).id as string;
  const stages = (await pipelineMetadata(runtime, user.id, id)).stages; const named = (name: string) => stages.find(stage => stage.name === name)!.id;
  return { id, nuevo: named("Nuevo"), calificacion: named("Calificación"), ganado: named("Ganado"), perdido: named("Perdido") };
}
const http = (org: string, cookie: string, query = "", method = "GET") => dashboardRequest(req("/api/test" + query, method, cookie), org);
const metrics = (org: Org, actor: User, asOf: string, interval = "30") => dashboardMetrics(runtime, actor.id, org.id, { interval }, { asOf });
const ms = (iso: string, delta: number) => new Date(Date.parse(iso) + delta).toISOString();

/** Synthetic, dated rows written by the laboratory administrator with triggers disabled: the runtime can never backdate records. */
async function seedLead(org: Org, actor: User, createdAt: string, options: { stage?: string; archivedAt?: string; moves?: [string, string][] } = {}) {
  const first = options.stage ?? org.nuevo, moves = options.moves ?? [], current = moves.at(-1)?.[0] ?? first;
  const id = (await seeder.query("insert into leads(organization_id,stage_id,name,created_at,updated_at,archived_at,version) values($1,$2,'Prospecto sintético',$3,$3,$4,$5) returning id", [org.id, current, createdAt, options.archivedAt ?? null, moves.length + 1])).rows[0].id as string;
  let previous: string | null = null, version = 1;
  for (const [stage, at] of [[first, createdAt], ...moves] as [string, string][]) {
    await seeder.query("insert into lead_stage_events(organization_id,lead_id,lead_version,from_stage_id,to_stage_id,actor_user_id,happened_at) values($1,$2,$3,$4,$5,$6,$7)", [org.id, id, version++, previous, stage, actor.id, at]);
    previous = stage;
  }
  return id;
}
async function seedFollowup(org: Org, actor: User, lead: string, dueAt: string, status: "pending" | "completed" | "canceled" = "pending") {
  await seeder.query("insert into followups(organization_id,lead_id,created_by,title,assigned_user_id,due_at,status,completed_at,closed_by,creation_key,creation_hash) values($1,$2,$3,'Seguimiento sintético',$3,$4,$5,$6,$7,$8,$9)",
    [org.id, lead, actor.id, dueAt, status, status === "completed" ? dueAt : null, status === "pending" ? null : actor.id, randomUUID(), "0".repeat(64)]);
}
const counts = (value: DashboardMetrics) => Object.fromEntries(value.stages.map(stage => [stage.name, stage.count]));

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
  admin = new Pool({ connectionString: text }); const provisioner = new URL(url); provisioner.username = "lf028_test_owner"; provisioner.password = "";
  for (const file of ["scripts/identity/migrate.mjs", "scripts/leads/migrate.mjs", "scripts/activity/migrate.mjs"]) execFileSync(process.execPath, [file], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: "lf028_test_runtime" }, encoding: "utf8", stdio: "pipe" });
  const runtimeUrl = new URL(url); runtimeUrl.username = "lf028_test_runtime"; runtimeUrl.password = "";
  process.env.DATABASE_URL = runtimeUrl.toString(); process.env.AUTH_SECRET = randomBytes(32).toString("hex"); process.env.APP_ORIGIN = origin;
  runtime = await identityPool(); a = await signup("alpha"); b = await signup("beta"); sales = await signup("sales");
  seeder = await admin.connect(); await seeder.query("set session_replication_role = replica");
});
afterAll(async () => { seeder?.release(); await runtime?.end(); await admin?.end(); delete process.env.AUTH_SECRET; });

test("session, membership, role and strict parameters are enforced; reading writes nothing", async () => {
  const org = await organization(a), other = await organization(b);
  await admin.query("insert into memberships(organization_id,user_id,role) values($1,$2,'sales')", [org.id, sales.id]);
  await seedLead(org, a, "2026-01-01T00:00:00Z");
  const written = async () => (await admin.query("select (select count(*) from organization_audit)::int audit,(select count(*) from auth_attempts)::int attempts,(select count(*) from leads)::int leads,(select count(*) from lead_stage_events)::int events,(select count(*) from followups)::int followups")).rows[0];
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
  const transitions = (await admin.query("select count(*)::int n from lead_stage_events e join stages s on s.id=e.to_stage_id where e.organization_id=$1 and s.kind='won' and e.happened_at<=$2", [org.id, asOf])).rows[0].n;
  expect(transitions).toBe(7);
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
  await expect(dashboardMetrics(runtime, a.id, second.id, {})).rejects.toMatchObject({ status: 404 });
  await expect(dashboardMetrics(runtime, b.id, first.id, {})).rejects.toMatchObject({ status: 404 });
  expect((await http(second.id, a.cookie)).status).toBe(404);
  for (const table of ["leads", "stages", "lead_stage_events", "followups", "organizations"]) expect((await runtime.query(`select count(*)::int n from ${table}`)).rows[0].n).toBe(0);
});

test("real services and the server clock: repeated wins, archive and follow-ups reach the endpoint without backdating", async () => {
  const org = await organization(a, "America/Lima");
  const input = (stageId: string) => ({ name: "Prospecto real", stageId, email: null, phoneE164: null, source: null, assignedUserId: null });
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
