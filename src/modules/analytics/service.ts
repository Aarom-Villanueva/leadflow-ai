import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { CommercialError, withOrganization } from "@/modules/leads/service";
import { dashboardQuery, snapshotCreate, snapshotQuery, type DashboardMetrics, type DashboardSnapshot } from "./contracts";

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
const iso = (expression: string) => `to_char(${expression} at time zone 'UTC', ${ISO})`;
const cutoff = z.iso.datetime({ offset: true });

/**
 * Una sola sentencia: las tres métricas comparten instantánea y corte (docs/specs/LF-028.md).
 * $1 organización, $2 corte opcional (solo pruebas; ningún endpoint lo envía), $3 días del intervalo.
 * Corre con el rol runtime bajo RLS y, además, filtra explícitamente por organización.
 *
 * `from_at` es el primer instante real del día local: el instante c con fecha local d cuyo microsegundo anterior
 * tiene otra fecha. `fecha::timestamp at time zone zona` no sirve solo: ante una medianoche repetida elige la
 * segunda ocurrencia. Se busca entre candidatos alrededor de la medianoche nominal y, si el día entero no existe
 * en esa zona, se usa el primer instante posterior al día anterior.
 *
 * La conversión lee `to_stage_kind`, el tipo que la etapa destino tenía en el momento del evento (0004);
 * reconfigurar una etapa después no convierte ni desconvierte prospectos.
 */
const METRICS = `
with base as (
  select o.id as org, o.timezone as tz, c.as_of, ((c.as_of at time zone o.timezone)::date - ($3::int - 1)) as d
  from organizations o
  cross join (select coalesce($2::timestamptz, date_trunc('milliseconds', clock_timestamp())) as as_of) c
  where o.id = $1
),
p as (
  select base.org, base.tz, base.as_of, coalesce(
    (select min(candidate.c) from (
        select (base.d::timestamp at time zone base.tz) + make_interval(mins => step * 15) as c from generate_series(-16, 16) step
        union all
        select ((base.d::timestamp - interval '1 microsecond') at time zone base.tz) + interval '1 microsecond'
      ) candidate
      where (candidate.c at time zone base.tz)::date = base.d and ((candidate.c - interval '1 microsecond') at time zone base.tz)::date <> base.d),
    least(base.d::timestamp at time zone base.tz, ((base.d::timestamp - interval '1 microsecond') at time zone base.tz) + interval '1 microsecond')
  ) as from_at
  from base
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
      where e.organization_id = l.organization_id and e.lead_id = l.id and e.to_stage_kind = 'won' and e.happened_at <= p.as_of
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
select json_build_object(
  'asOf', ${iso("p.as_of")}, 'timezone', p.tz,
  'interval', json_build_object('days', $3::int, 'from', ${iso("p.from_at")}, 'to', ${iso("p.as_of")}),
  'activeLeads', (select coalesce(sum(count), 0)::int from stage_rows),
  'stages', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'kind', kind, 'position', position, 'active', active, 'count', count) order by position, id), '[]'::json)
     from stage_rows where active or count > 0),
  'conversion', json_build_object(
    'created', (select count(*)::int from cohort_leads),
    'won', (select (count(*) filter (where won))::int from cohort_leads),
    'archivedIncluded', (select (count(*) filter (where archived))::int from cohort_leads),
    'cohorts', (select coalesce(json_agg(json_build_object('month', month, 'created', created, 'won', won) order by month), '[]'::json) from cohorts)),
  'followups', json_build_object('pending', f.pending, 'overdue', f.overdue, 'upcoming', f.upcoming, 'onArchivedLeads', f.on_archived)
) as metrics
from p cross join f`;

const SNAPSHOT = `s.id, ${iso("s.created_at")} as "createdAt", s.created_by as "createdBy", u.name as "createdByName", s.metrics`;
type SnapshotRow = DashboardSnapshot & { intervalDays: number };
const parseCutoff = (value: string | undefined) => value === undefined ? null : cutoff.parse(value);

export async function dashboardMetrics(db: Pool, actor: string, org: string, raw: unknown, options: { asOf?: string } = {}): Promise<DashboardMetrics> {
  const days = Number(dashboardQuery.parse(raw).interval), asOf = parseCutoff(options.asOf);
  return withOrganization(db, actor, org, async ({ client }) => {
    const row = (await client.query<{ metrics: DashboardMetrics }>(METRICS, [org, asOf, days])).rows[0];
    if (!row) throw new CommercialError(404, "NOT_FOUND");
    return row.metrics;
  });
}

async function savedByKey(client: PoolClient, org: string, actor: string, key: string) {
  return (await client.query<SnapshotRow>(`select ${SNAPSHOT}, s.interval_days as "intervalDays" from dashboard_snapshots s left join "user" u on u.id = s.created_by
    where s.organization_id = $1 and s.created_by = $2 and s.creation_key = $3`, [org, actor, key])).rows[0];
}

/**
 * Guarda un corte: calcula e inserta en una sola sentencia, de modo que lo guardado es exactamente lo calculado.
 * La misma clave con el mismo intervalo devuelve el corte existente sin recalcular; con otro intervalo, 409.
 */
export async function saveDashboardSnapshot(db: Pool, actor: string, org: string, raw: unknown, options: { asOf?: string } = {}): Promise<DashboardSnapshot> {
  const input = snapshotCreate.parse(raw), asOf = parseCutoff(options.asOf);
  return withOrganization(db, actor, org, async ({ client }) => {
    const confirmed = (row: SnapshotRow | undefined) => {
      if (!row) return undefined;
      if (row.intervalDays !== input.interval) throw new CommercialError(409, "CONFLICT");
      const { intervalDays, ...snapshot } = row; void intervalDays; return snapshot;
    };
    const prior = confirmed(await savedByKey(client, org, actor, input.creationKey));
    if (prior) return prior;
    await client.query(`with m as (${METRICS})
      insert into dashboard_snapshots(organization_id, created_by, creation_key, interval_days, as_of, timezone, interval_from, metrics)
      select $1, $4, $5, $3::int, (m.metrics->>'asOf')::timestamptz, m.metrics->>'timezone', (m.metrics->'interval'->>'from')::timestamptz, m.metrics::jsonb from m
      on conflict (organization_id, created_by, creation_key) do nothing`, [org, asOf, input.interval, actor, input.creationKey]);
    const saved = confirmed(await savedByKey(client, org, actor, input.creationKey));
    if (!saved) throw new CommercialError(404, "NOT_FOUND");
    return saved;
  });
}

export async function listDashboardSnapshots(db: Pool, actor: string, org: string, raw: unknown): Promise<DashboardSnapshot[]> {
  const { limit } = snapshotQuery.parse(raw);
  return withOrganization(db, actor, org, async ({ client }) => (await client.query<DashboardSnapshot>(`select ${SNAPSHOT} from dashboard_snapshots s left join "user" u on u.id = s.created_by
    where s.organization_id = $1 order by s.as_of desc, s.id desc limit $2`, [org, limit])).rows);
}
