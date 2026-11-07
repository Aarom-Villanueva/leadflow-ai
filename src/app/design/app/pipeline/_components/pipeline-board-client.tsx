"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { PipelineIcon } from "@/components/ui/icons";
import { SYNTHETIC_LEADS, SYNTHETIC_STAGES, memberById } from "@/app/design/_data/fixtures";

type PreviewState = "normal" | "carga" | "error" | "vacio";

export function PipelineBoardClient() {
  const [stageByLead, setStageByLead] = useState<Record<string, string>>(() =>
    Object.fromEntries(SYNTHETIC_LEADS.filter((lead) => !lead.archived).map((lead) => [lead.id, lead.stageId])),
  );
  const [preview, setPreview] = useState<PreviewState>("normal");
  const selectIdBase = useId();

  const columns = useMemo(() => {
    return SYNTHETIC_STAGES.map((stage) => ({
      stage,
      leads: SYNTHETIC_LEADS.filter((lead) => !lead.archived && stageByLead[lead.id] === stage.id),
    }));
  }, [stageByLead]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
            Mueve un prospecto de columna con el selector de su tarjeta — cambio real en memoria, no se guarda al recargar.
          </p>
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
            {value === "normal" ? "Normal" : value === "carga" ? "Cargando" : value === "error" ? "Error" : "Vacío (sin prospectos)"}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {preview === "carga" ? (
          <SkeletonRows rows={5} />
        ) : preview === "error" ? (
          <Banner tone="danger" title="No pudimos cargar el pipeline" action={<Button size="sm" variant="secondary">Reintentar</Button>}>
            Ocurrió un problema al obtener las etapas. Inténtalo de nuevo.
          </Banner>
        ) : preview === "vacio" ? (
          <EmptyState icon={<PipelineIcon className="size-8" />} title="Todavía no hay prospectos en el pipeline" description="Crea un prospecto para empezar a moverlo entre etapas." />
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label="Tablero del pipeline, columnas por etapa"
            className="flex gap-4 overflow-x-auto pb-2 md:[&>*]:min-w-[270px] flex-col md:flex-row"
          >
            {columns.map(({ stage, leads }) => (
              <section key={stage.id} aria-labelledby={`${selectIdBase}-${stage.id}`} className="flex min-w-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 md:min-w-[270px]">
                <h2 id={`${selectIdBase}-${stage.id}`} className="flex items-center justify-between px-1 pb-3 text-[0.8125rem] font-semibold text-[var(--text-primary)]">
                  {stage.name}
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[0.75rem] text-[var(--text-secondary)]">{leads.length}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {leads.map((lead) => {
                    const owner = memberById(lead.assignedMemberId);
                    const selectId = `${selectIdBase}-move-${lead.id}`;
                    return (
                      <li key={lead.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                        <Link
                          href={`/design/app/leads/${lead.id}`}
                          className="font-medium text-[var(--text-primary)] underline-offset-4 hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        >
                          {lead.name}
                        </Link>
                        <div className="mt-2 flex items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                          {owner ? (
                            <>
                              <Avatar name={owner.name} size="sm" />
                              {owner.name}
                            </>
                          ) : null}
                        </div>
                        <label htmlFor={selectId} className="sr-only">
                          Mover {lead.name} a otra etapa
                        </label>
                        <Select
                          id={selectId}
                          value={stage.id}
                          onChange={(event) => setStageByLead((prev) => ({ ...prev, [lead.id]: event.target.value }))}
                          className="mt-2 h-9 text-[0.75rem]"
                        >
                          {SYNTHETIC_STAGES.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </Select>
                      </li>
                    );
                  })}
                  {leads.length === 0 ? <li className="py-4 text-center text-[0.75rem] text-[var(--text-tertiary)]">Sin prospectos en esta etapa</li> : null}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
