import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withActor } from "@/shared/database/runtime";
import { archiveInput, createLeadInput, createStageInput, listInput, updateLeadInput, updateStageInput, type Lead, type LeadPage, type PipelineMetadata, type Stage, type StageEvent } from "./contracts";

export class CommercialError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const notFound = () => new CommercialError(404, "NOT_FOUND");
const conflict = () => new CommercialError(409, "CONFLICT");
const columns = `id,name,email,phone_e164 as "phoneE164",source,stage_id as "stageId",assigned_user_id as "assignedUserId",version,archived_at as "archivedAt",created_at as "createdAt",updated_at as "updatedAt"`;
type Context = { client: PoolClient; role: "owner" | "admin" | "sales" };
export async function withOrganization<T>(db: Pool, userId: string, organizationId: string, fn: (context: Context) => Promise<T>): Promise<T> {
  if (!z.uuid().safeParse(organizationId).success) throw notFound();
  const org = organizationId.toLowerCase();
  return withActor(db, userId, async client => {
    const { rows } = await client.query("select lf_lock_membership($1) as role", [org]);
    if (!rows[0]?.role) throw notFound();
    await client.query("select set_config('app.organization_id',$1,true),set_config('app.request_id',$2,true)", [org, randomUUID()]);
    return fn({ client, role: rows[0].role });
  });
}
async function lockedLead(client: PoolClient, org: string, id: string, version?: number): Promise<Lead> {
  if (!z.uuid().safeParse(id).success) throw notFound();
  const lead = (await client.query<Lead>(`select ${columns} from leads where organization_id=$1 and id=$2${version === undefined ? "" : " for update"}`, [org, id])).rows[0];
  if (!lead) throw notFound();
  if (version !== undefined && (lead.version !== version || lead.archivedAt)) throw conflict();
  return lead;
}
export async function getLead(db: Pool, actor: string, org: string, id: string) {
  return withOrganization(db, actor, org, async ({ client }) => lockedLead(client, org, id));
}
export async function createLead(db: Pool, actor: string, org: string, raw: unknown): Promise<Lead> {
  const input = createLeadInput.parse(raw);
  return withOrganization(db, actor, org, async ({ client }) => (await client.query<Lead>(`insert into leads(organization_id,name,email,phone_e164,source,stage_id,assigned_user_id) values($1,$2,$3,$4,$5,$6,$7) returning ${columns}`,
    [org, input.name, input.email, input.phoneE164, input.source, input.stageId, input.assignedUserId])).rows[0]);
}
export async function updateLead(db: Pool, actor: string, org: string, id: string, raw: unknown, archive = false): Promise<Lead> {
  const input = archive ? archiveInput.parse(raw) : updateLeadInput.parse(raw);
  return withOrganization(db, actor, org, async ({ client }) => {
    await lockedLead(client, org, id, input.version);
    const mapping: Record<string, string> = { name: "name", email: "email", phoneE164: "phone_e164", source: "source", stageId: "stage_id", assignedUserId: "assigned_user_id" };
    const values: unknown[] = [org, id];
    const updates = archive ? ["archived_at=clock_timestamp()"] : Object.entries(input).filter(([key]) => key !== "version").map(([key, value]) => {
      values.push(value); return `${mapping[key]}=$${values.length}`;
    });
    return (await client.query<Lead>(`update leads set ${updates.join(",")} where organization_id=$1 and id=$2 returning ${columns}`, values)).rows[0];
  });
}
const cursorSchema = z.object({ id: z.uuid(), key: z.string().max(200), fingerprint: z.string().length(64) }).strict();
export async function listLeads(db: Pool, actor: string, org: string, raw: unknown): Promise<LeadPage> {
  const input = listInput.parse(raw);
  const fingerprint = createHash("sha256").update(JSON.stringify({ org: org.toLowerCase(), q: input.q, stageId: input.stageId, assignedUserId: input.assignedUserId, source: input.source, archived: input.archived, sort: input.sort })).digest("hex");
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"))); }
    catch { throw new CommercialError(422, "INVALID_CURSOR"); }
    if (cursor.fingerprint !== fingerprint || (input.sort !== "name" && !z.iso.datetime().safeParse(cursor.key).success)) throw new CommercialError(422, "INVALID_CURSOR");
  }
  return withOrganization(db, actor, org, async ({ client }) => {
    const values: unknown[] = [org];
    const clauses = ["organization_id=$1", `archived_at is ${input.archived === "true" ? "not " : ""}null`];
    const add = (clause: string, value: unknown) => { values.push(value); clauses.push(clause.replace("?", "$" + values.length)); };
    if (input.q) add("(name ilike ? escape '\\' or email ilike ? escape '\\')", "%" + input.q.replace(/[\\%_]/g, "\\$&") + "%");
    // Both search operands use the same bound parameter.
    if (input.q) clauses[clauses.length - 1] = clauses[clauses.length - 1].replace("?", "$" + values.length);
    if (input.stageId) add("stage_id=?", input.stageId);
    if (input.assignedUserId) add("assigned_user_id=?", input.assignedUserId);
    if (input.source) add("source=?", input.source);
    const key = input.sort === "name" ? "lower(name)" : "created_at";
    const direction = input.sort === "newest" ? "desc" : "asc";
    if (cursor) {
      values.push(cursor.key, cursor.id);
      clauses.push(`(${key},id) ${direction === "desc" ? "<" : ">"} ($${values.length - 1}${input.sort === "name" ? "::text" : "::timestamptz"},$${values.length}::uuid)`);
    }
    values.push(input.limit + 1);
    const rows = (await client.query<Lead & { cursorKey: string }>(`select ${columns},${input.sort === "name" ? "lower(name)" : "to_char(created_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')"} as "cursorKey" from leads where ${clauses.join(" and ")} order by ${key} ${direction},id ${direction} limit $${values.length}`, values)).rows;
    const more = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return { leads: page.map(row => { const { cursorKey, ...lead } = row; void cursorKey; return lead; }), nextCursor: more && last ? Buffer.from(JSON.stringify({ id: last.id, key: last.cursorKey, fingerprint })).toString("base64url") : null };
  });
}
export async function pipelineMetadata(db: Pool, actor: string, org: string): Promise<PipelineMetadata> {
  return withOrganization(db, actor, org, async ({ client, role }) => {
    const pipeline = (await client.query("select p.id,p.name,o.timezone from pipelines p join organizations o on o.id=p.organization_id where p.organization_id=$1", [org])).rows[0];
    if (!pipeline) throw new CommercialError(503, "MIGRATION_REQUIRED");
    const stages = (await client.query<Stage>("select id,name,kind,position,active,version from stages where organization_id=$1 order by position,id", [org])).rows;
    const members = (await client.query("select * from lf_organization_members($1)", [org])).rows;
    return { pipeline: { id: pipeline.id, name: pipeline.name }, timezone: pipeline.timezone, stages, members, role };
  });
}
export async function leadHistory(db: Pool, actor: string, org: string, id: string): Promise<StageEvent[]> {
  return withOrganization(db, actor, org, async ({ client }) => {
    await lockedLead(client, org, id);
    return (await client.query<StageEvent>(`select e.id,f.name as "fromStage",t.name as "toStage",e.happened_at as "happenedAt",coalesce(u.name,'Miembro anterior') as "actorName" from lead_stage_events e
      left join stages f on f.organization_id=e.organization_id and f.id=e.from_stage_id
      join stages t on t.organization_id=e.organization_id and t.id=e.to_stage_id
      left join "user" u on u.id=e.actor_user_id
      where e.organization_id=$1 and e.lead_id=$2 order by e.lead_version`, [org, id])).rows;
  });
}
export async function configureStage(db: Pool, actor: string, org: string, raw: unknown, id?: string): Promise<Stage> {
  const input = id ? updateStageInput.parse(raw) : createStageInput.parse(raw);
  return withOrganization(db, actor, org, async ({ client, role }) => {
    if (role === "sales") throw new CommercialError(403, "FORBIDDEN");
    await client.query("select id from pipelines where organization_id=$1 for update", [org]);
    const stages = (await client.query<Stage>("select id,name,kind,position,active,version from stages where organization_id=$1 order by position for update", [org])).rows;
    let result: Stage;
    if (id) {
      const patch = updateStageInput.parse(input);
      const previous = stages.find(stage => stage.id === id);
      if (!previous) throw notFound();
      if (previous.version !== patch.version) throw conflict();
      const next = { ...previous, ...patch };
      if (next.position > stages.length) throw new CommercialError(422, "INVALID_INPUT");
      if ((!next.active || next.kind !== previous.kind) && (await client.query("select 1 from leads where organization_id=$1 and stage_id=$2 limit 1", [org, id])).rowCount) throw conflict();
      if (previous.active && (!next.active || next.kind !== previous.kind) && !stages.some(stage => stage.id !== id && stage.active && stage.kind === previous.kind)) throw conflict();
      await client.query("set constraints stages_order_key deferred");
      // Increment every displaced row's version, preventing an old editor from silently undoing an ordering change.
      await client.query(`update stages set position=position+$4,version=version+1 where organization_id=$1 and id<>$2 and position between $3 and $5`, [org, id, Math.min(previous.position, next.position), previous.position < next.position ? -1 : 1, Math.max(previous.position, next.position)]);
      result = (await client.query<Stage>("update stages set name=$3,kind=$4,active=$5,position=$6,version=version+1 where organization_id=$1 and id=$2 returning id,name,kind,position,active,version", [org, id, next.name, next.kind, next.active, next.position])).rows[0];
    } else {
      if (stages.length >= 50) throw conflict();
      const value = createStageInput.parse(input);
      result = (await client.query<Stage>("insert into stages(organization_id,pipeline_id,name,kind,position) select $1,id,$2,$3,$4 from pipelines where organization_id=$1 returning id,name,kind,position,active,version", [org, value.name, value.kind, stages.length + 1])).rows[0];
    }
    return result;
  });
}
