"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { MeterBar } from "@/components/ui/meter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { DashboardIcon } from "@/components/ui/icons";
import { SYNTHETIC_LEADS, SYNTHETIC_STAGES, SYNTHETIC_FOLLOWUPS, SYNTHETIC_ORG } from "@/app/design/_data/fixtures";
import { monthCohort } from "@/app/design/app/dashboard/_lib/cohort";

type PreviewState = "normal" | "carga" | "error" | "vacio";
const INTERVALS = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "180", label: "Últimos 180 días" },
];

export function DashboardClient() {
  const [intervalDays, setIntervalDays] = useState("90");
  const [preview, setPreview] = useState<PreviewState>("normal");

  // react-hooks/purity prohíbe leer el reloj durante el render; un inicializador
  // perezoso de useState es la vía reconocida para una lectura impura única.
  const [now] = useState(() => Date.now());

  const activeLeads = useMemo(() => SYNTHETIC_LEADS.filter((lead) => !lead.archived), []);

  const inInterval = useMemo(() => {
    const cutoff = now - Number(intervalDays) * 86_400_000;
    return activeLeads.filter((lead) => new Date(lead.createdAt).getTime() >= cutoff);
  }, [activeLeads, intervalDays, now]);

  const byStage = useMemo(
    () =>
      SYNTHETIC_STAGES.map((stage) => ({
        stage,
        count: activeLeads.filter((lead) => lead.stageId === stage.id).length,
      })),
    [activeLeads],
  );

  const cohorts = useMemo(() => {
    const groups = new Map<string, { total: number; won: number }>();
    for (const lead of inInterval) {
      const key = monthCohort(lead.createdAt, SYNTHETIC_ORG.timezone);
      const entry = groups.get(key) ?? { total: 0, won: 0 };
      entry.total += 1;
      const stage = SYNTHETIC_STAGES.find((s) => s.id === lead.stageId);
      if (stage?.kind === "won") entry.won += 1;
      groups.set(key, entry);
    }
    return Array.from(groups.entries());
  }, [inInterval]);

  const overdueFollowups = useMemo(
    () => SYNTHETIC_FOLLOWUPS.filter((followup) => followup.status === "pending" && new Date(followup.dueAt).getTime() < now),
    [now],
  );

  const noDataForInterval = inInterval.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">Zona horaria: {SYNTHETIC_ORG.timezone}</p>
        </div>
        <div>
          <label htmlFor="interval-select" className="sr-only">
            Intervalo
          </label>
          <Select id="interval-select" value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)}>
            {INTERVALS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <nav aria-label="Vista previa de estados (solo prototipo)" className="mt-5 flex flex-wrap gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-1.5">
        {(["normal", "carga", "error", "vacio"] as PreviewState[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-current={preview === value ? "true" : undefined}
            onClick={() => setPreview(value)}
            className={[
              "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[0.75rem] font-medium transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              preview === value ? "bg-[var(--accent)] text-[#0b1418]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {value === "normal" ? "Normal" : value === "carga" ? "Cargando" : value === "error" ? "Error" : "Sin datos (denominador cero)"}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {preview === "carga" ? (
          <SkeletonRows rows={4} />
        ) : preview === "error" ? (
          <Banner tone="danger" title="No pudimos cargar las métricas" action={<Button size="sm" variant="secondary">Reintentar</Button>}>
            Ocurrió un problema al calcularlas. Inténtalo de nuevo.
          </Banner>
        ) : preview === "vacio" || noDataForInterval ? (
          <EmptyState
            icon={<DashboardIcon className="size-8" />}
            title="Sin datos para este intervalo"
            description="Ningún prospecto se creó en el intervalo seleccionado. Esto nunca se muestra como una conversión del 0% — son cosas distintas."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Prospectos activos" value={activeLeads.length} hint="No archivados, todas las etapas" />
              <Stat label="Creados en el intervalo" value={inInterval.length} hint={INTERVALS.find((i) => i.value === intervalDays)?.label} />
              <Stat label="Seguimientos vencidos" value={overdueFollowups.length} hint={<Link href="/design/app/seguimientos" className="text-[var(--accent)] underline-offset-4 hover:underline">Ver en Historial y seguimientos</Link>} />
            </div>

            <Card>
              <CardHeader title="Prospectos por etapa" description="Todos los prospectos activos, sin filtrar por intervalo (R08)." />
              <div className="flex flex-col gap-3">
                {byStage.map(({ stage, count }) => (
                  <MeterBar key={stage.id} label={stage.name} count={count} total={activeLeads.length} tone={stage.kind === "won" ? "success" : stage.kind === "lost" ? "danger" : "accent"} />
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Conversión a ganado por cohorte" description="Prospectos creados en cada mes del intervalo que llegaron a ganado." />
              <div className="flex flex-col gap-3">
                {cohorts.map(([label, { total, won }]) => (
                  <MeterBar key={label} label={`Creados en ${label}`} count={won} total={total} tone="success" />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className="mt-6">
        <ButtonLink href="/design/app/pipeline" variant="ghost">
          Ver pipeline completo →
        </ButtonLink>
      </div>
    </div>
  );
}
