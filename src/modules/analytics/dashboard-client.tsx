"use client";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef } from "react";
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
import { classifySave, freshAttempt, initialState, reduce, retryAttempt, savedNotice, visibleSnapshots, type IntervalChoice, type SaveAttempt } from "./dashboard-state";
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
  const root = `/app/${organizationId}`, api = `/api/organizations/${organizationId}/dashboard`;
  // Todo el estado vive en un reductor puro (dashboard-state.ts). Aquí solo se lanzan solicitudes con identidad
  // y se entregan sus respuestas como eventos; el reductor descarta las que ya no están vigentes.
  const [state, dispatch] = useReducer(reduce, initialState);
  const alive = useRef(true), metricsRequest = useRef(1), listRequest = useRef(1), sending = useRef(false);
  const metricsAbort = useRef<AbortController | undefined>(undefined), listAbort = useRef<AbortController | undefined>(undefined);
  const fetchMetrics = useCallback((request: number, interval: IntervalChoice) => {
    metricsAbort.current?.abort(); const controller = new AbortController(); metricsAbort.current = controller;
    commercialApi<DashboardMetrics>(`${api}?interval=${interval}`, { signal: controller.signal })
      .then(metrics => { if (alive.current) dispatch({ type: "metricsLoaded", request, metrics }); })
      .catch(() => { if (alive.current && !controller.signal.aborted) dispatch({ type: "metricsFailed", request }); });
  }, [api]);
  const fetchList = useCallback((request: number) => {
    listAbort.current?.abort(); const controller = new AbortController(); listAbort.current = controller;
    commercialApi<{ snapshots: DashboardSnapshot[] }>(`${api}/snapshots`, { signal: controller.signal })
      .then(result => { if (alive.current) dispatch({ type: "listLoaded", request, items: result.snapshots }); })
      .catch(() => { if (alive.current && !controller.signal.aborted) dispatch({ type: "listFailed", request }); });
  }, [api]);
  useEffect(() => {
    alive.current = true; fetchMetrics(1, initialState.interval); fetchList(1);
    // Tras desmontar no se entrega ningún evento: las lecturas se abortan y un guardado en vuelo termina en el servidor sin tocar la pantalla.
    return () => { alive.current = false; metricsAbort.current?.abort(); listAbort.current?.abort(); };
  }, [fetchMetrics, fetchList]);
  function load(interval: IntervalChoice = state.interval) { const request = ++metricsRequest.current; dispatch({ type: "metricsRequested", request, interval }); fetchMetrics(request, interval); }
  function reloadList() { const request = ++listRequest.current; dispatch({ type: "listRequested", request }); fetchList(request); }
  /** Guardar calcula el corte en el servidor: el cliente solo envía intervalo y clave. `sending` cierra la ventana del doble clic antes del siguiente render. */
  async function send(attempt: SaveAttempt | undefined) {
    if (!attempt || sending.current) return;
    sending.current = true; dispatch({ type: "saveStarted", attempt });
    let status: number | undefined, body: unknown;
    try {
      const response = await fetch(`${api}/snapshots`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval: Number(attempt.interval), creationKey: attempt.key }) });
      status = response.status; body = await response.json();
    } catch { /* Sin respuesta o con cuerpo ilegible: classifySave decide con lo que haya llegado. */ }
    sending.current = false;
    if (!alive.current) return;
    const result = classifySave(attempt, status, body);
    dispatch(result.outcome === "confirmed" ? { type: "saveConfirmed", attempt, snapshot: result.snapshot } : result.outcome === "rejected" ? { type: "saveRejected", attempt, reason: result.reason } : { type: "saveUncertain", attempt });
  }

  const { view, save } = state, data = view?.metrics, notice = savedNotice(state), snapshots = visibleSnapshots(state);
  const loading = state.metrics.status === "loading", error = state.metrics.status === "error", saving = save.status === "saving";
  const stale = data !== undefined && String(data.interval.days) !== state.interval;
  const messages = [
    loading && data ? "Actualizando métricas…" : "",
    saving ? `Guardando corte de los últimos ${save.attempt.interval} días…` : "",
    notice && data ? `Corte guardado: ${displayInstant(notice.snapshot.metrics.asOf, notice.snapshot.metrics.timezone)} · últimos ${notice.snapshot.metrics.interval.days} días. ${notice.shown ? "Las cifras mostradas son las guardadas." : "Las cifras mostradas no son las de ese corte; está en «Cortes guardados»."}` : "",
  ].filter(Boolean);
  return (
    <div aria-busy={loading || saving}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-[0.8125rem] text-[var(--text-secondary)]">
          {data ? (
            <>
              <p>Zona horaria: {data.timezone}</p>
              <p className="mt-1">Intervalo: últimos {data.interval.days} días, del {displayInstant(data.interval.from, data.timezone)} al {displayInstant(data.interval.to, data.timezone)}</p>
              <p className="mt-1" data-as-of={data.asOf} data-snapshot-id={view?.snapshotId ?? ""}>Corte: {displayInstant(data.asOf, data.timezone)}</p>
            </>
          ) : <p>Métricas calculadas con los datos guardados de tu organización.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="interval-select" className="sr-only">Intervalo</label>
          <div className="w-48">
            <Select id="interval-select" value={state.interval} onChange={event => load(event.target.value as IntervalChoice)}>
              {INTERVAL_DAYS.map(days => <option key={days} value={days}>Últimos {days} días</option>)}
            </Select>
          </div>
          <Button size="sm" disabled={loading} onClick={() => load()}>Actualizar</Button>
          <Button size="sm" variant="primary" disabled={!data || saving || save.status === "uncertain"} onClick={() => void send(freshAttempt(state, crypto.randomUUID()))}>Guardar corte</Button>
        </div>
      </div>
      <p role="status" aria-live="polite" data-saved-snapshot={notice?.snapshot.id ?? ""} className="mt-2 min-h-5 text-[0.8125rem] text-[var(--text-secondary)]">{messages.join(" ")}</p>

      <div className="mt-4">
        {!data && !error ? <SkeletonRows rows={4} /> : !data ? (
          <Banner tone="danger" title="No pudimos cargar las métricas" action={<Button size="sm" variant="secondary" onClick={() => load()}>Reintentar</Button>}>
            Ocurrió un problema al calcularlas. Inténtalo de nuevo.
          </Banner>
        ) : (
          <div className="flex flex-col gap-6">
            {error && (
              <Banner tone="danger" title="No pudimos actualizar las métricas" action={<Button size="sm" variant="secondary" onClick={() => load()}>Reintentar</Button>}>
                Se muestran las cifras anteriores: corte {displayInstant(data.asOf, data.timezone)}{stale ? `, calculadas para los últimos ${data.interval.days} días` : ""}.
              </Banner>
            )}
            {save.status === "uncertain" && (
              <Banner tone="warning" title="No sabemos si el corte se guardó" action={<Button size="sm" variant="secondary" aria-label={`Reintentar guardado de los últimos ${save.attempt.interval} días`} onClick={() => void send(retryAttempt(state))}>Reintentar guardado</Button>}>
                No llegó una respuesta válida del servidor para el corte de los últimos {save.attempt.interval} días: puede haberse guardado o no. Reintenta para confirmarlo; se repite exactamente la misma solicitud, así que no se crea un duplicado.{save.attempt.interval !== state.interval ? ` Aunque el selector muestre ahora otro intervalo, el reintento sigue siendo el de ${save.attempt.interval} días.` : ""}{save.retryRefused ? ` El último reintento fue rechazado${save.retryRefused === "limit" ? " por demasiados cambios seguidos; espera un minuto" : ""}, lo que no aclara si el corte original se guardó.` : ""} Hasta resolverlo no se puede guardar otro corte.
              </Banner>
            )}
            {save.status === "rejected" && (
              <Banner tone="danger" title="El servidor rechazó el guardado">
                {save.reason === "limit" ? "Hay demasiados cambios seguidos; espera un minuto y vuelve a guardar. " : ""}No se guardó ningún corte nuevo.
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
              {state.list.status === "error" && (
                <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-[0.8125rem] text-[var(--danger)]">
                  <p>No pudimos cargar los cortes guardados{snapshots.length > 0 ? "; solo se muestran los confirmados en esta sesión" : ""}.</p>
                  <Button size="sm" variant="secondary" onClick={reloadList}>Reintentar lista</Button>
                </div>
              )}
              {snapshots.length === 0 ? (state.list.status === "error" ? null : <p className="text-[0.8125rem] text-[var(--text-secondary)]">{state.list.status === "loading" ? "Cargando cortes guardados…" : "Aún no hay cortes guardados."}</p>) : (
                <ul className="flex flex-col gap-3">
                  {snapshots.map(({ id, createdByName, metrics }) => (
                    <li key={id} data-snapshot-id={id} className="border-l-2 border-[var(--accent)] pl-4 text-[0.8125rem]">
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
