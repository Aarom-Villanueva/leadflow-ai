import { z } from "zod";
import type { IntervalDays } from "./metrics";

/** El único parámetro del cliente es el intervalo; el corte lo fija el servidor. */
export const dashboardQuery = z.object({ interval: z.enum(["30", "90", "180"]).default("90") }).strict();
/** Guardar un corte: intervalo y clave de idempotencia. Nunca cifras, corte, zona, autor ni organización del cliente. */
export const snapshotCreate = z.object({ interval: z.union([z.literal(30), z.literal(90), z.literal(180)]), creationKey: z.uuid().transform(value => value.toLowerCase()) }).strict();
export const snapshotQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }).strict();
export interface StageCount { id: string; name: string; kind: "open" | "won" | "lost"; position: number; active: boolean; count: number }
export interface Cohort { month: string; created: number; won: number }
export interface DashboardMetrics {
  asOf: string;
  timezone: string;
  interval: { days: IntervalDays; from: string; to: string };
  activeLeads: number;
  stages: StageCount[];
  conversion: { created: number; won: number; archivedIncluded: number; cohorts: Cohort[] };
  followups: { pending: number; overdue: number; upcoming: number; onArchivedLeads: number };
}
export interface DashboardSnapshot { id: string; createdAt: string; createdBy: string; createdByName: string | null; metrics: DashboardMetrics }
