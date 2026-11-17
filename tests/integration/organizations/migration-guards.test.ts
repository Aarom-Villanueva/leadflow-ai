import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
// Migration 0005 runner guards, on their own disposable database so the main suite keeps its single successful migration.
const DB = "lf030_guard_test", OWNER = "lf030g_owner", RUNTIME = "lf030g_runtime", INHERITED = "lf030g_inherited";
let maintenance: Pool, db: Pool, provisioner: URL, created = false;
const state = async () => (await db.query("select to_regclass('public.organization_admin_requests') t,exists(select 1 from information_schema.columns where table_name='memberships' and column_name='version') v,exists(select 1 from pg_proc where proname='lf_admin_mutate') f,(select count(*)::int from app_migrations where version='0005_organization_admin') n")).rows[0];
const untouched = { t: null, v: false, f: false, n: 0 };
function migrate(extra: Record<string, string> = {}) {
  const started = Date.now(), run = spawnSync(process.execPath, ["scripts/organizations/migrate.mjs"], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: RUNTIME, ...extra }, encoding: "utf8" });
  return { ok: run.status === 0, out: run.stdout, err: run.stderr, ms: Date.now() - started };
}
beforeAll(async () => {
  const text = process.env.ORGANIZATIONS_TEST_ADMIN_URL; if (!text) throw Error("ORGANIZATIONS_TEST_ADMIN_URL required");
  const url = new URL(text); if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.search || url.pathname !== "/lf030_organizations_test") throw Error("Dedicated local database required");
  const admin = new URL(url); admin.pathname = "/postgres"; maintenance = new Pool({ connectionString: admin.toString(), max: 2 });
  if ((await maintenance.query("select 1 from pg_database where datname=$1", [DB])).rowCount || (await maintenance.query("select 1 from pg_roles where rolname=any($1)", [[OWNER, RUNTIME, INHERITED]])).rowCount) throw Error("Refusing existing guard database or roles");
  await maintenance.query(`create role ${OWNER} login nosuperuser nocreatedb nocreaterole nobypassrls;create role ${RUNTIME} login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;create role ${INHERITED} nologin nosuperuser nocreatedb nocreaterole nobypassrls`);
  await maintenance.query(`create database ${DB} owner ${OWNER}`); created = true;
  const target = new URL(url); target.pathname = "/" + DB; db = new Pool({ connectionString: target.toString(), max: 3 });
  provisioner = new URL(target); provisioner.username = OWNER; provisioner.password = "";
  for (const file of ["identity", "leads", "activity", "analytics"]) { const run = spawnSync(process.execPath, [`scripts/${file}/migrate.mjs`], { env: { ...process.env, IDENTITY_MIGRATION_URL: provisioner.toString(), IDENTITY_RUNTIME_ROLE: RUNTIME }, encoding: "utf8" }); expect(run.status, run.stderr).toBe(0); }
});
afterAll(async () => { await db?.end(); if (created) { await maintenance.query(`drop database ${DB} with (force)`); await maintenance.query(`drop role ${INHERITED};drop role ${RUNTIME};drop role ${OWNER}`); } await maintenance?.end(); });

test("an old transaction makes the runner fail clearly within the bound, changing nothing and not leaving the database stuck", async () => {
  const old = await db.connect();
  try {
    await old.query("begin"); await old.query("select 1 from memberships limit 1");
    const result = migrate({ ORGANIZATIONS_MIGRATION_LOCK_TIMEOUT_MS: "300" });
    expect(result.ok).toBe(false); expect(result.err).toMatch(/Lock wait exceeded 300 ms and nothing was changed/); expect(result.err).toMatch(/Drain the previous application/); expect(result.ms).toBeLessThan(15000);
    expect(await state()).toEqual(untouched);
  } finally { await old.query("rollback"); old.release(); }
  expect((await db.query("select count(*)::int n from pg_locks where locktype='advisory' and objid=260026")).rows[0].n).toBe(0);
});
test("a runner that cannot get the migration advisory lock also fails within the bound", async () => {
  const holder = await db.connect();
  try { await holder.query("select pg_advisory_lock(260026)"); const result = migrate({ ORGANIZATIONS_MIGRATION_LOCK_TIMEOUT_MS: "300" }); expect(result.ok).toBe(false); expect(result.err).toMatch(/Lock wait exceeded 300 ms/); expect(await state()).toEqual(untouched); }
  finally { await holder.query("select pg_advisory_unlock(260026)"); holder.release(); }
});
test("an unusable lock timeout setting is refused before touching the database", () => {
  for (const value of ["50", "abc", "999999", "-5", "1e3"]) { const result = migrate({ ORGANIZATIONS_MIGRATION_LOCK_TIMEOUT_MS: value }); expect(result.ok, value).toBe(false); expect(result.err).toMatch(/must be between 100 and 30000/); }
});
const cases: [string, string, string, string][] = [
  ["direct table privilege of the runtime role", `grant insert on memberships to ${RUNTIME}`, `revoke insert on memberships from ${RUNTIME}`, "memberships INSERT (the runtime role itself)"],
  ["column-level privilege", `grant update(role) on memberships to ${RUNTIME}`, `revoke update(role) on memberships from ${RUNTIME}`, "memberships UPDATE (column-level grant)"],
  ["privilege granted to PUBLIC", "grant delete on organization_audit to public", "revoke delete on organization_audit from public", "organization_audit DELETE (PUBLIC)"],
  ["privilege inherited through role membership", `grant truncate on organizations to ${INHERITED}; grant ${INHERITED} to ${RUNTIME} with inherit true`, `revoke ${INHERITED} from ${RUNTIME}; revoke truncate on organizations from ${INHERITED}`, `organizations TRUNCATE (inherited from role ${INHERITED})`],
];
for (const [label, grant, cleanup, expected] of cases) {
  test(`incompatible runtime privilege is reported and nothing is applied or revoked: ${label}`, async () => {
    await db.query(grant);
    try {
      const result = migrate(); expect(result.ok).toBe(false); expect(result.err).toContain(expected); expect(result.err).toMatch(/Nothing was changed or revoked/); expect(await state()).toEqual(untouched);
      expect((await db.query("select count(*)::int n from pg_roles where rolname=$1", [RUNTIME])).rows[0].n).toBe(1);
    } finally { await db.query(cleanup); }
    const clean = await db.query("select bool_or(has_table_privilege($1,t::regclass,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege($1,t::regclass,'INSERT,UPDATE')) p from unnest(array['organizations','memberships','organization_audit']) t", [RUNTIME]); expect(clean.rows[0].p).toBe(false);
  });
}
test("a runtime that default privileges would give access to the private ledger rolls the whole migration back", async () => {
  await db.query(`alter default privileges for role ${OWNER} in schema public grant select on tables to ${RUNTIME}`);
  try { const result = migrate(); expect(result.ok).toBe(false); expect(result.err).toMatch(/private administration ledger/); expect(await state()).toEqual(untouched); }
  finally { await db.query(`alter default privileges for role ${OWNER} in schema public revoke select on tables from ${RUNTIME}`); }
});
test("with compatible privileges it applies once, repeats safely, and the check also guards an already applied schema", async () => {
  const first = migrate(); expect(first.ok, first.err).toBe(true); expect(first.out).toContain("applied atomically"); expect(await state()).toMatchObject({ v: true, f: true, n: 1 });
  const again = migrate(); expect(again.ok, again.err).toBe(true); expect(again.out).toContain("already applied");
  const ledger = await db.query("select has_table_privilege($1,'organization_admin_requests','SELECT,INSERT,UPDATE,DELETE') p", [RUNTIME]); expect(ledger.rows[0].p).toBe(false);
  await db.query(`grant update on memberships to ${RUNTIME}`);
  try { const result = migrate(); expect(result.ok).toBe(false); expect(result.err).toContain("memberships UPDATE"); } finally { await db.query(`revoke update on memberships from ${RUNTIME}`); }
  expect(migrate().ok).toBe(true);
});
