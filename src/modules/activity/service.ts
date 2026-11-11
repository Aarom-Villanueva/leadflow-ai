import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { CommercialError, withOrganization } from "@/modules/leads/service";
import { followupCreate, followupEdit, followupQuery, instant, interactionCreate, interactionEdit, interactionQuery, transitionInput, uuid, type ActivityPage, type Followup, type Interaction } from "./contracts";
type Resource = "interactions" | "followups";
type RecordValue = Interaction | Followup;
const fields = {
  interactions: `id,lead_id as "leadId",author_user_id as "authorUserId",kind,body,occurred_at as "occurredAt",created_at as "createdAt",updated_at as "updatedAt",version`,
  followups: `id,lead_id as "leadId",created_by as "createdBy",title,detail,assigned_user_id as "assignedUserId",due_at as "dueAt",status,completed_at as "completedAt",closed_by as "closedBy",version`,
};
const conflict = () => new CommercialError(409, "CONFLICT");
const missing = () => new CommercialError(404, "NOT_FOUND");
async function existing(client: PoolClient, resource: Resource, org: string, id: string, lock: boolean): Promise<RecordValue> {
  if (!uuid.safeParse(id).success) throw missing();
  const result = await client.query<RecordValue>(`select ${fields[resource]} from ${resource} where organization_id=$1 and id=$2${lock ? " for update" : ""}`, [org, id]);
  if (!result.rows[0]) throw missing();
  return result.rows[0];
}
async function requireLead(client: PoolClient, org: string, id: string) {
  if (!(await client.query("select id from leads where organization_id=$1 and id=$2", [org, id])).rowCount) throw missing();
}
export async function createActivity(db: Pool, actor: string, org: string, resource: Resource, raw: unknown) {
  const input = resource === "interactions" ? interactionCreate.parse(raw) : followupCreate.parse(raw);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withOrganization(db, actor, org, async ({ client }) => {
    const author = resource === "interactions" ? "author_user_id" : "created_by";
    const readKey = async () => (await client.query<RecordValue & { creationHash: string }>(`select ${fields[resource]},creation_hash as "creationHash" from ${resource} where organization_id=$1 and ${author}=$2 and creation_key=$3`, [org, actor, input.creationKey])).rows[0];
    const prior = await readKey();
    if (prior) { if (prior.creationHash !== hash) throw conflict(); const { creationHash, ...value } = prior; void creationHash; return value; }
    await requireLead(client, org, input.leadId);
    let result;
    if (resource === "interactions") {
      const value = interactionCreate.parse(input);
      result = await client.query<RecordValue>(`insert into interactions(organization_id,lead_id,author_user_id,kind,body,occurred_at,creation_key,creation_hash) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(organization_id,author_user_id,creation_key) do nothing returning ${fields.interactions}`, [org, value.leadId, actor, value.kind, value.body, value.occurredAt, value.creationKey, hash]);
    } else {
      const value = followupCreate.parse(input);
      result = await client.query<RecordValue>(`insert into followups(organization_id,lead_id,created_by,title,detail,assigned_user_id,due_at,creation_key,creation_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(organization_id,created_by,creation_key) do nothing returning ${fields.followups}`, [org, value.leadId, actor, value.title, value.detail, value.assignedUserId, value.dueAt, value.creationKey, hash]);
    }
    if (result.rows[0]) return result.rows[0];
    const raced = await readKey();
    if (!raced || raced.creationHash !== hash) throw conflict();
    const { creationHash, ...value } = raced; void creationHash; return value;
  });
}
export async function editActivity(db: Pool, actor: string, org: string, resource: Resource, id: string, raw: unknown) {
  const input = resource === "interactions" ? interactionEdit.parse(raw) : followupEdit.parse(raw);
  return withOrganization(db, actor, org, async ({ client }) => {
    const row = await existing(client, resource, org, id, true);
    if (row.version !== input.version || ("status" in row && row.status !== "pending")) throw conflict();
    const mapping: Record<string, string> = { kind: "kind", body: "body", occurredAt: "occurred_at", title: "title", detail: "detail", assignedUserId: "assigned_user_id", dueAt: "due_at" };
    const values: unknown[] = [org, id];
    const changes = Object.entries(input).filter(([key]) => key !== "version").map(([key, value]) => { values.push(value); return mapping[key] + "=$" + values.length; });
    return (await client.query<RecordValue>(`update ${resource} set ${changes.join(",")} where organization_id=$1 and id=$2 returning ${fields[resource]}`, values)).rows[0];
  });
}
export async function closeFollowup(db: Pool, actor: string, org: string, id: string, target: "completed" | "canceled", raw: unknown): Promise<Followup> {
  const input = transitionInput.parse(raw);
  return withOrganization(db, actor, org, async ({ client }) => {
    const row = await existing(client, "followups", org, id, true) as Followup;
    if (row.status === target) return row;
    if (row.status !== "pending" || row.version !== input.version) throw conflict();
    return (await client.query<Followup>(`update followups set status=$3 where organization_id=$1 and id=$2 returning ${fields.followups}`, [org, id, target])).rows[0];
  });
}
const cursorSchema = z.object({ id: uuid, key: instant, asOf: instant, fingerprint: z.string().length(64) }).strict();
export async function listActivity(db: Pool, actor: string, org: string, resource: Resource, raw: unknown): Promise<ActivityPage<RecordValue>> {
  const input = resource === "interactions" ? interactionQuery.parse(raw) : followupQuery.parse(raw);
  const { cursor: encoded, limit, ...filters } = input;
  const fingerprint = createHash("sha256").update(JSON.stringify({ resource, org: org.toLowerCase(), ...filters })).digest("hex");
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (encoded) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))); }
    catch { throw new CommercialError(422, "INVALID_CURSOR"); }
    if (cursor.fingerprint !== fingerprint) throw new CommercialError(422, "INVALID_CURSOR");
  }
  const asOf = cursor?.asOf ?? new Date().toISOString();
  return withOrganization(db, actor, org, async ({ client }) => {
    if (input.leadId) await requireLead(client, org, input.leadId);
    const values: unknown[] = [org], clauses = ["organization_id=$1"];
    const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace("?", "$" + values.length)); };
    if (input.leadId) add("lead_id=?", input.leadId);
    if ("kind" in input && input.kind) add("kind=?", input.kind);
    if ("status" in input) {
      add("status=?", input.status);
      if (input.assignedUserId) add("assigned_user_id=?", input.assignedUserId);
      if (input.window !== "all") add(`due_at ${input.window === "overdue" ? "<" : ">="} ?::timestamptz`, asOf);
    }
    const date = resource === "interactions" ? "occurred_at" : "due_at", direction = resource === "interactions" ? "desc" : "asc";
    if (cursor) { values.push(cursor.key, cursor.id); clauses.push(`(${date},id) ${direction === "desc" ? "<" : ">"} ($${values.length - 1}::timestamptz,$${values.length}::uuid)`); }
    values.push(limit + 1);
    const rows = (await client.query<RecordValue & { cursorKey: string }>(`select x.*,l.name as "leadName",l.archived_at as "archivedAt",u.name as "${resource === "interactions" ? "authorName" : "assignedName"}" from
      (select ${fields[resource]},to_char(${date} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "cursorKey" from ${resource} where ${clauses.join(" and ")} order by ${date} ${direction},id ${direction} limit $${values.length}) x
      join leads l on l.organization_id=$1 and l.id=x."leadId" left join "user" u on u.id=x."${resource === "interactions" ? "authorUserId" : "assignedUserId"}" order by x."${resource === "interactions" ? "occurredAt" : "dueAt"}" ${direction},x.id ${direction}`, values)).rows;
    const page = rows.slice(0, limit), last = page.at(-1);
    return { asOf, items: page.map(row => { const { cursorKey, ...value } = row; void cursorKey; return value; }), nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ id: last.id, key: last.cursorKey, asOf, fingerprint })).toString("base64url") : null };
  });
}
