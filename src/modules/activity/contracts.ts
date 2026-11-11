import { z } from "zod";
export const uuid = z.uuid().transform(value => value.toLowerCase());
export const instant = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value))).transform(value => new Date(value).toISOString()).refine(value => value >= "2000-01-01T00:00:00.000Z" && value < "2101-01-01T00:00:00.000Z");
export const kinds = { note: "Nota", call: "Llamada", meeting: "Reunión", conversation: "Conversación" } as const;
// Iterate code points so valid surrogate pairs (e.g. emoji) remain valid text.
function validDatabaseText(value: string) {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) return false;
  }
  return true;
}
const text = (max: number, min = 0) => z.string().trim().min(min).max(max).refine(validDatabaseText);
const memberReference = z.string().min(1).max(128).refine(validDatabaseText);
const interactionFields = z.object({ kind: z.enum(["note", "call", "meeting", "conversation"]), body: text(4000, 1), occurredAt: instant });
const followupFields = z.object({ title: text(200, 1), detail: text(2000).nullable(), assignedUserId: memberReference, dueAt: instant });
export const interactionCreate = interactionFields.extend({ leadId: uuid, creationKey: uuid }).strict();
export const interactionEdit = interactionFields.partial().extend({ version: z.number().int().positive() }).strict().refine(value => Object.keys(value).length > 1);
export const followupCreate = followupFields.extend({ leadId: uuid, creationKey: uuid }).strict();
export const followupEdit = followupFields.partial().extend({ version: z.number().int().positive() }).strict().refine(value => Object.keys(value).length > 1);
export const transitionInput = z.object({ version: z.number().int().positive() }).strict();
const common = { leadId: uuid.optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(2048).optional() };
export const interactionQuery = z.object({ ...common, kind: interactionFields.shape.kind.optional() }).strict();
export const followupQuery = z.object({ ...common, assignedUserId: memberReference.optional(), status: z.enum(["pending", "completed", "canceled"]).default("pending"), window: z.enum(["all", "overdue", "upcoming"]).default("all") }).strict().refine(value => value.status === "pending" || value.window === "all");
export interface Interaction { id: string; leadId: string; authorUserId: string; authorName?: string; kind: keyof typeof kinds; body: string; occurredAt: string; createdAt: string; updatedAt: string; version: number }
export interface Followup { id: string; leadId: string; leadName?: string; archivedAt?: string | null; createdBy: string; title: string; detail: string | null; assignedUserId: string; assignedName?: string; dueAt: string; status: "pending" | "completed" | "canceled"; completedAt: string | null; closedBy: string | null; version: number }
export interface ActivityPage<T> { items: T[]; nextCursor: string | null; asOf: string }
