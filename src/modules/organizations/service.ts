import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { withActor } from "@/shared/database/runtime";

export const organizationInput = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; } }),
}).strict();

export type Role = "owner" | "admin" | "sales";
export function capabilities(role: Role) {
  return { manageMembers: role === "owner" || role === "admin", importLeads: role === "owner" || role === "admin", transferOwnership: role === "owner" };
}
export interface Organization { id: string; name: string; slug: string; timezone: string; role: Role }

export async function listOrganizations(db: Pool, userId: string): Promise<Organization[]> {
  return withActor(db, userId, async client => (await client.query<Organization>(`
    select o.id,o.name,o.slug,o.timezone,m.role from organizations o
    join memberships m on m.organization_id=o.id
    where m.user_id=$1 and m.revoked_at is null order by o.created_at,o.id
  `, [userId])).rows);
}

export async function createOrganization(db: Pool, userId: string, input: z.infer<typeof organizationInput>): Promise<string> {
  const valid = organizationInput.parse(input);
  return withActor(db, userId, async client => {
    const { rows } = await client.query<{ id: string }>("select lf_create_organization($1,$2,$3,$4) as id", [valid.name, valid.slug, valid.timezone, randomUUID()]);
    return rows[0].id;
  });
}

export async function getOrganization(db: Pool, userId: string, id: string): Promise<Organization | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withActor(db, userId, async client => (await client.query<Organization>(`
    select o.id,o.name,o.slug,o.timezone,m.role from organizations o
    join memberships m on m.organization_id=o.id
    where o.id=$1 and m.user_id=$2 and m.revoked_at is null
  `, [id, userId])).rows[0] ?? null);
}
