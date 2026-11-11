"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/input";
import { MeterBar } from "@/components/ui/meter-bar";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { displayInstant } from "@/modules/activity/time";
import { commercialApi } from "@/modules/leads/client-api";
import type { DashboardMetrics, DashboardSnapshot } from "./contracts";
import { INTERVAL_DAYS, NO_DATA, barPercent, cohortLabel, conversionRate, formatRate } from "./metrics";

/** Misma apariencia que MeterBar, pero con numerador, denominador y tasa exactos en texto; denominador cero se muestra como «Sin datos». */
function ConversionRow({ label, won, created }: { label: string; won: number; created: number }) {
  const rate = conversionRate(won, created);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="text-[var(--text-primary)]">{label}</span>
        <span className="text-[var(--text-secondary)]">{rate === null ? NO_DATA : `${won} de ${created} · ${formatRate(rate)}`}</span>
      </div>
      {rate !== null && (
        <div aria-hidden="true" className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${barPercent(won, created)}%` }} />
        </div>
      )}
    </div>
  );
}

export function DashboardClient({ organizationId }: { organizationId: string }) {
  const root = `/app/${organizationId}`;
  const [request, setRequest] = useState({ interval: "90", nonce: 0 });
  const [data, setData] = useState<DashboardMetrics>();
  const [error, setError] = useState(false), [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    commercialApi<DashboardMetrics>(`/api/organizations/${organizationId}/dashboard?interval=${request.interval}`, { signal: controller.signal })
      .then(result => { setData(result); setError(false); setRefreshing(false); })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setRefreshing(false); } });
    return () => controller.abort();
  }, [organizationId, request]);
  function load(interval = request.interval) { setRefreshing(true); setError(false); setSavedAt(undefined); setRequest(previous => ({ interval, nonce: previous.nonce + 1 })); }

  // Cortes guardados: guardar calcula un corte nuevo en el servidor; el cliente solo envía intervalo y clave de idempotencia.
  const [snapshots, setSnapshots] = useState<DashboardSnapshot[]>(), [listError, setListError] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(false), [savedAt, setSavedAt] = useState<string>();
  const pendingSave = useRef<{ key: string; interval: string } | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    commercialApi<{ snapshots: DashboardSnapshot[] }>(`/api/organizations/${organizationId}/dashboard/snapshots`, { signal: controller.signal })
      .then(result => { setSnapshots(result.snapshots); setListError(false); })
      .catch(() => { if (!controller.signal.aborted) setListError(true); });
    return () => controller.abort();
  }, [organizationId]);
  async function save() {
    // Un reintento tras un fallo reutiliza la misma clave: si el primer intento sí se guardó, no se duplica.
    if (pendingSave.current?.interval !== request.interval) pendingSave.current = { key: crypto.randomUUID(), interval: request.interval };
    const attempt = pendingSave.current;
    setSaving(true); setSaveError(false); setSavedAt(undefined);
    try {
      const { snapshot } = await commercialApi<{ snapshot: DashboardSnapshot }>(`/api/organizations/${organizationId}/dashboard/snapshots`, { method: "POST", body: JSON.stringify({ interval: Number(attempt.interval), creationKey: attempt.key }) });
      pendingSave.current = undefined;
      setData(snapshot.metrics); setError(false); setSavedAt(snapshot.metrics.asOf); setListError(false);
      setSnapshots(previous => [snapshot, ...(previous ?? []).filter(value => value.id !== snapshot.id)].slice(0, 10));
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  }

  const stale = data !== undefined && String(data.interval.days) !== request.interval;
  return (
    <div aria-busy={refreshing}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-[0.8125rem] text-[var(--text-secondary)]">
          {data ? (
            <>
              <p>Zona horaria: {data.timezone}</p>
              <p className="mt-1">Intervalo: últimos {data.interval.days} días, del {displayInstant(data.interval.from, data.timezone)} al {displayInstant(data.interval.to, data.timezone)}</p>
              <p className="mt-1">Corte: {displayInstant(data.asOf, data.timezone)}</p>
            </>
          ) : <p>Métricas calculadas con los datos guardados de tu organización.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="interval-select" className="sr-only">Intervalo</label>
          <div className="w-48">
            <Select id="interval-select" value={request.interval} onChange={event => load(event.target.value)}>
              {INTERVAL_DAYS.map(days => <option key={days} value={days}>Últimos {days} días</option>)}
            </Select>
          </div>
          <Button size="sm" disabled={refreshing || saving || (!data && !error)} onClick={() => load()}>Actualizar</Button>
          <Button size="sm" variant="primary" disabled={!data || refreshing || saving} onClick={() => void save()}>Guardar corte</Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[0.8125rem] text-[var(--text-secondary)]">{refreshing && data ? "Actualizando métricas…" : saving ? "Guardando corte…" : savedAt && data ? `Corte guardado: ${displayInstant(savedAt, data.timezone)}. Las cifras mostradas son las guardadas.` : ""}</p>

      <div className="mt-4">
        {!data && !error ? <SkeletonRows rows={4} /> : !data ? (
          <Banner tone="danger" title="No pudimos cargar las métricas" action={<Button size="sm" variant="secondary" onClick={() => load()}>Reintentar</Button>}>
            Ocurrió un problema al calcularlas. Inténtalo de nuevo.
          </Banner>
        ) : (
          <div className="flex flex-col gap-6">
            {error && (
              <Banner tone="danger" title="No pudimos actualizar las métricas" action={<Button size="sm" variant="secondary" onClick={() => load()}>Reintentar</Button>}>
                Se muestran las cifras del corte anterior{stale ? `, calculadas para los últimos ${data.interval.days} días` : ""}.
              </Banner>
            )}
            {saveError && (
              <Banner tone="danger" title="No pudimos guardar el corte" action={<Button size="sm" variant="secondary" disabled={saving} onClick={() => void save()}>Reintentar guardado</Button>}>
                No se guardó ningún corte nuevo. Reintentar no crea duplicados.
              </Banner>
            )}
            <div role="group" aria-label="Resumen" className="grid gap-4 sm:grid-cols-3">
              <Stat label="Prospectos activos" value={data.activeLeads} hint="No archivados, todas las etapas" />
              <Stat label="Creados en el intervalo" value={data.conversion.created} hint={`Últimos ${data.interval.days} días, archivados incluidos`} />
              <Stat label="Seguimientos vencidos" value={data.followups.overdue} hint={<Link href={`${root}/followups`} className="text-[var(--accent)] underline underline-offset-4">Ver seguimientos</Link>} />
            </div>

            <Card role="region" aria-label="Prospectos por etapa">
              <CardHeader title="Prospectos por etapa" description="Prospectos no archivados según su etapa actual, al corte. No depende del intervalo." />
              {data.activeLeads === 0 ? (
                <EmptyState icon={<DashboardIcon className="size-8" />} title="Aún no hay prospectos activos" description="Cuando registres prospectos verás aquí cuántos hay en cada etapa." action={<ButtonLink href={`${root}/leads`} size="sm">Ir a prospectos</ButtonLink>} />
              ) : (
                <div className="flex flex-col gap-3">
                  {data.stages.map(stage => <MeterBar key={stage.id} label={stage.active ? stage.name : `${stage.name} (inactiva)`} count={stage.count} total={data.activeLeads} tone={stage.kind === "won" ? "success" : stage.kind === "lost" ? "danger" : "accent"} />)}
                </div>
              )}
            </Card>

            <Card role="region" aria-label="Conversión a ganado por cohorte">
              <CardHeader title="Conversión a ganado por cohorte" description="Prospectos creados en cada mes del intervalo que llegaron a ganado alguna vez. Cada prospecto cuenta una sola vez." />
              {data.conversion.created === 0 ? (
                <EmptyState icon={<DashboardIcon className="size-8" />} title="Sin datos para este intervalo" description="Ningún prospecto se creó en el intervalo seleccionado. Esto nunca se muestra como una conversión del 0 %: son cosas distintas." />
              ) : (
                <div className="flex flex-col gap-3">
                  <ConversionRow label="Todo el intervalo" won={data.conversion.won} created={data.conversion.created} />
                  {data.conversion.cohorts.map(cohort => <ConversionRow key={cohort.month} label={`Creados en ${cohortLabel(cohort.month)}`} won={cohort.won} created={cohort.created} />)}
                  <p className="text-[0.75rem] text-[var(--text-secondary)]">Incluye prospectos archivados ({data.conversion.archivedIncluded} en este intervalo). Un mes sin prospectos creados se muestra como «{NO_DATA}», no como 0 %.</p>
                </div>
              )}
            </Card>

            <Card role="region" aria-label="Seguimientos pendientes">
              <CardHeader title="Seguimientos pendientes" description="Estado al corte. Vencido: pendiente con vencimiento anterior al corte. No depende del intervalo." />
              {data.followups.pending === 0 ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">No hay seguimientos pendientes.</p> : (
                <div className="flex flex-col gap-3">
                  <MeterBar label="Vencidos" count={data.followups.overdue} total={data.followups.pending} tone="danger" />
                  <MeterBar label="Próximos" count={data.followups.upcoming} total={data.followups.pending} />
                  <p className="text-[0.75rem] text-[var(--text-secondary)]">Pendientes en total: {data.followups.pending}. En prospectos archivados, todavía abiertos: {data.followups.onArchivedLeads}.</p>
                </div>
              )}
            </Card>

            <Card role="region" aria-label="Cortes guardados">
              <CardHeader title="Cortes guardados" description="Copias de los resultados calculados en cada corte. No se pueden editar ni borrar, y guardar no modifica los datos de origen." />
              {listError ? <p role="alert" className="text-[0.8125rem] text-[var(--danger)]">No pudimos cargar los cortes guardados.</p>
                : !snapshots ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">Cargando cortes guardados…</p>
                : snapshots.length === 0 ? <p className="text-[0.8125rem] text-[var(--text-secondary)]">Aún no hay cortes guardados.</p> : (
                  <ul className="flex flex-col gap-3">
                    {snapshots.map(({ id, createdByName, metrics }) => (
                      <li key={id} className="border-l-2 border-[var(--accent)] pl-4 text-[0.8125rem]">
                        <p className="text-[var(--text-primary)]">Corte {displayInstant(metrics.asOf, metrics.timezone)} · últimos {metrics.interval.days} días · {metrics.timezone}</p>
                        <p className="mt-1 text-[var(--text-secondary)]">
                          {metrics.activeLeads} activos · conversión: {conversionRate(metrics.conversion.won, metrics.conversion.created) === null ? NO_DATA : `${metrics.conversion.won} de ${metrics.conversion.created} · ${formatRate(conversionRate(metrics.conversion.won, metrics.conversion.created))}`} · vencidos: {metrics.followups.overdue} de {metrics.followups.pending} pendientes · guardado por {createdByName ?? "Miembro anterior"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          </div>
        )}
      </div>

      <div className="mt-6">
        <ButtonLink href={`${root}/pipeline`} variant="ghost">Ver pipeline completo →</ButtonLink>
      </div>
    </div>
  );
}
