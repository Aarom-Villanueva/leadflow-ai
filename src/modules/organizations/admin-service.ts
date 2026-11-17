import { z } from "zod";
import type { Pool } from "pg";
import { withActor } from "@/shared/database/runtime";
import { capabilities } from "./service";
import { auditCursor, memberCursor, memberInput, pageInput, profileInput, transferInput, type AdminAudit, type AdminInfo, type AdminMember, type AdminPage, type AdminReceipt } from "./admin-contracts";
export class AdministrationError extends Error { constructor(public status: number, public code: string) { super(code); } }
const organizationId = (org: string) => { if (!z.uuid().safeParse(org).success) throw new AdministrationError(404, "NOT_FOUND"); return org.toLowerCase(); };
async function call<T>(db: Pool, actor: string, org: string, sql: string, params: unknown[]): Promise<T> {
  const id = organizationId(org);
  return withActor(db, actor, async client => (await client.query<{ value: T }>(sql, [id, ...params])).rows[0].value);
}
export async function administrationInfo(db: Pool, actor: string, org: string): Promise<AdminInfo> {
  const value = await call<AdminInfo>(db, actor, org, "select lf_admin_info($1) as value", []);
  return { ...value, capabilities: capabilities(value.organization.role) };
}
function decode<T>(cursor: string | undefined, schema: z.ZodType<T>, org: string): T | undefined {
  if (!cursor) return undefined;
  try { const parsed = schema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); if ((parsed as { org: string }).org !== org.toLowerCase()) throw Error(); return parsed; }
  catch { throw new AdministrationError(422, "INVALID_CURSOR"); }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
export async function administrationMembers(db: Pool, actor: string, org: string, raw: unknown): Promise<AdminPage<AdminMember>> {
  const id = organizationId(org), { limit, cursor } = pageInput.parse(raw), after = decode(cursor, memberCursor, id);
  const rows = await call<AdminMember[]>(db, actor, id, "select lf_admin_members($1,$2,$3) as value", [after?.id ?? null, limit + 1]);
  const items = rows.slice(0, limit), last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encode({ org: id, id: last.id }) : null };
}
export async function administrationAudit(db: Pool, actor: string, org: string, raw: unknown): Promise<AdminPage<AdminAudit>> {
  const id = organizationId(org), { limit, cursor } = pageInput.parse(raw), after = decode(cursor, auditCursor, id);
  const rows = await call<(AdminAudit & { cursorAt: string })[]>(db, actor, id, "select lf_admin_audit($1,$2,$3,$4) as value", [after?.at ?? null, after?.id ?? null, limit + 1]);
  const page = rows.slice(0, limit), last = page.at(-1);
  return { items: page.map(({ cursorAt, ...item }) => { void cursorAt; return item; }), nextCursor: rows.length > limit && last ? encode({ org: id, id: last.id, at: last.cursorAt }) : null };
}
export async function administrationMutate(db: Pool, actor: string, org: string, resource: "profile" | "member" | "transfer", raw: unknown, target = ""): Promise<AdminReceipt> {
  let requestId: string, operation: string, payload: object;
  if (resource === "profile") { const { requestId: key, ...input } = profileInput.parse(raw); requestId = key; operation = "profile"; payload = input; }
  else if (resource === "transfer") { const { requestId: key, ...input } = transferInput.parse(raw); requestId = key; operation = "transfer"; payload = input; }
  else { if (!z.uuid().safeParse(target).success) throw new AdministrationError(404, "NOT_FOUND"); const { requestId: key, action, ...input } = memberInput.parse(raw); requestId = key; operation = action; payload = { ...input, targetMembershipId: target.toLowerCase() }; }
  return call(db, actor, org, "select lf_admin_mutate($1,$2,$3,$4::jsonb) as value", [requestId, operation, JSON.stringify(payload)]);
}
