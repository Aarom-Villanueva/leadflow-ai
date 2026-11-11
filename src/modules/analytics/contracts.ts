import { z } from "zod";
import type { IntervalDays } from "./metrics";

/** El único parámetro del cliente es el intervalo; el corte lo fija el servidor. */
export const dashboardQuery = z.object({ interval: z.enum(["30", "90", "180"]).default("90") }).strict();
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
