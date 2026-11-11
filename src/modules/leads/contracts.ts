import { z } from "zod";

export const sources = ["referido", "sitio web", "evento", "llamada en frío", "otro"] as const;
export const leadFields = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254).nullable(),
  phoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable(),
  source: z.enum(sources).nullable(),
  stageId: z.uuid(),
  assignedUserId: z.string().min(1).max(128).nullable(),
}).strict();
export const createLeadInput = leadFields;
export const updateLeadInput = leadFields.partial().extend({ version: z.number().int().positive() }).strict()
  .refine(value => Object.keys(value).length > 1);
export const archiveInput = z.object({ version: z.number().int().positive() }).strict();
export const createStageInput = z.object({ name: z.string().trim().min(1).max(60), kind: z.enum(["open", "won", "lost"]) }).strict();
export const updateStageInput = createStageInput.partial().extend({
  version: z.number().int().positive(), position: z.number().int().min(1).max(50).optional(), active: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 1);
export const listInput = z.object({
  q: z.string().trim().max(100).default(""), stageId: z.uuid().optional(), assignedUserId: z.string().min(1).max(128).optional(),
  source: z.enum(sources).optional(), archived: z.enum(["false", "true"]).default("false"),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(2048).optional(),
}).strict();
export interface Lead { id: string; name: string; email: string | null; phoneE164: string | null; source: string | null; stageId: string; assignedUserId: string | null; version: number; archivedAt: string | null; createdAt: string; updatedAt: string }
export interface Stage { id: string; name: string; kind: "open" | "won" | "lost"; position: number; active: boolean; version: number }
export interface Member { userId: string; name: string; role: "owner" | "admin" | "sales" }
export interface PipelineMetadata { pipeline: { id: string; name: string }; timezone: string; stages: Stage[]; members: Member[]; role: Member["role"] }
export interface LeadPage { leads: Lead[]; nextCursor: string | null }
export interface StageEvent { id: string; fromStage: string | null; toStage: string; happenedAt: string; actorName: string }
