import type { Pool } from "pg";
import { z } from "zod";
import { CommercialError, withOrganization } from "@/modules/leads/service";
import { dashboardQuery, type Cohort, type DashboardMetrics, type StageCount } from "./contracts";
import type { IntervalDays } from "./metrics";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const cutoff = z.iso.datetime({ offset: true });

/**
 * Una sola sentencia: las tres métricas comparten instantánea y corte (docs/specs/LF-028.md).
 * $1 organización, $2 corte opcional (solo pruebas; el endpoint nunca lo envía), $3 días del intervalo.
 * Corre con el rol runtime bajo RLS y, además, filtra explícitamente por organización.
 */
const QUERY = `
with p as (
  select o.id as org, o.timezone as tz, c.as_of,
    ((date_trunc('day', c.as_of at time zone o.timezone) - make_interval(days => $3::int - 1)) at time zone o.timezone) as from_at
  from organizations o
  cross join (select coalesce($2::timestamptz, date_trunc('milliseconds', clock_timestamp())) as as_of) c
  where o.id = $1
),
stage_rows as (
  select s.id, s.name, s.kind, s.position, s.active,
    (select count(*) from leads l where l.organization_id = s.organization_id and l.stage_id = s.id and l.archived_at is null)::int as count
  from stages s where s.organization_id = $1
),
cohort_leads as (
  select l.id, l.archived_at is not null as archived, to_char(l.created_at at time zone p.tz, 'YYYY-MM') as month,
    exists(
      select 1 from lead_stage_events e
      join stages s on s.organization_id = e.organization_id and s.id = e.to_stage_id
      where e.organization_id = l.organization_id and e.lead_id = l.id and s.kind = 'won' and e.happened_at <= p.as_of
    ) as won
  from leads l cross join p
  where l.organization_id = $1 and l.created_at >= p.from_at and l.created_at <= p.as_of
),
months as (
  select to_char(m, 'YYYY-MM') as month
  from p, generate_series(date_trunc('month', p.from_at at time zone p.tz), date_trunc('month', p.as_of at time zone p.tz), interval '1 month') m
),
cohorts as (
  select m.month, count(c.id)::int as created, (count(c.id) filter (where c.won))::int as won
  from months m left join cohort_leads c on c.month = m.month group by m.month
),
f as (
  select count(*)::int as pending,
    (count(*) filter (where fu.due_at < p.as_of))::int as overdue,
    (count(*) filter (where fu.due_at >= p.as_of))::int as upcoming,
    (count(*) filter (where l.archived_at is not null))::int as on_archived
  from followups fu
  join leads l on l.organization_id = fu.organization_id and l.id = fu.lead_id
  cross join p
  where fu.organization_id = $1 and fu.status = 'pending'
)
select to_char(p.as_of at time zone 'UTC', ${ISO}) as "asOf", p.tz as timezone,
  to_char(p.from_at at time zone 'UTC', ${ISO}) as "from",
  (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'kind', kind, 'position', position, 'active', active, 'count', count) order by position, id), '[]'::json)
     from stage_rows where active or count > 0) as stages,
  (select coalesce(sum(count), 0)::int from stage_rows) as "activeLeads",
  (select coalesce(json_agg(json_build_object('month', month, 'created', created, 'won', won) order by month), '[]'::json) from cohorts) as cohorts,
  (select count(*)::int from cohort_leads) as created,
  (select (count(*) filter (where won))::int from cohort_leads) as won,
  (select (count(*) filter (where archived))::int from cohort_leads) as "archivedIncluded",
  f.pending, f.overdue, f.upcoming, f.on_archived as "onArchivedLeads"
from p cross join f`;

interface Row { asOf: string; timezone: string; from: string; stages: StageCount[]; activeLeads: number; cohorts: Cohort[]; created: number; won: number; archivedIncluded: number; pending: number; overdue: number; upcoming: number; onArchivedLeads: number }

export async function dashboardMetrics(db: Pool, actor: string, org: string, raw: unknown, options: { asOf?: string } = {}): Promise<DashboardMetrics> {
  const days = Number(dashboardQuery.parse(raw).interval) as IntervalDays;
  const asOf = options.asOf === undefined ? null : cutoff.parse(options.asOf);
  return withOrganization(db, actor, org, async ({ client }) => {
    const row = (await client.query<Row>(QUERY, [org, asOf, days])).rows[0];
    if (!row) throw new CommercialError(404, "NOT_FOUND");
    return {
      asOf: row.asOf, timezone: row.timezone, interval: { days, from: row.from, to: row.asOf },
      activeLeads: row.activeLeads, stages: row.stages,
      conversion: { created: row.created, won: row.won, archivedIncluded: row.archivedIncluded, cohorts: row.cohorts },
      followups: { pending: row.pending, overdue: row.overdue, upcoming: row.upcoming, onArchivedLeads: row.onArchivedLeads },
    };
  });
}
