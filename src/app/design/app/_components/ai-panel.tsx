"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { IconButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { CloseIcon, SparklesIcon } from "@/components/ui/icons";
import { AiDraftTab } from "@/app/design/app/_components/ai-draft-tab";
import { SYNTHETIC_AI_SUMMARY, SYNTHETIC_AI_RECOMMENDATIONS, leadById } from "@/app/design/_data/fixtures";

/**
 * Asistente de IA — etapa 2 (docs/specs/LF-003.md §2.1/§4): contenido
 * sintético fijo, siempre con la etiqueta "Generado por IA" visible y no
 * evitable (R09, SECURITY.md) mientras el panel está abierto, en cualquier
 * pestaña. El borrador solo se copia o descarta — ninguna ruta de envío.
 */
function ResumenTab() {
  return <p className="text-[0.9375rem] leading-7 text-[var(--text-secondary)]">{SYNTHETIC_AI_SUMMARY}</p>;
}

function RecomendacionesTab() {
  return (
    <ul className="flex flex-col gap-3">
      {SYNTHETIC_AI_RECOMMENDATIONS.map((rec) => {
        const lead = rec.leadId ? leadById(rec.leadId) : undefined;
        return (
          <li key={rec.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-[0.875rem] text-[var(--text-secondary)]">
            {rec.text}
            {lead ? (
              <Link href={`/design/app/leads/${lead.id}`} className="mt-2 block font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                Ver {lead.name}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
export function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Asistente de IA"
      className={[
        "m-0 max-h-none max-w-none border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--text-primary)]",
        "h-[75vh] w-full rounded-t-[var(--radius-lg)] border-t",
        "lg:h-full lg:w-96 lg:rounded-none lg:rounded-l-[var(--radius-lg)] lg:border-l lg:border-t-0",
        "backdrop:bg-black/60",
      ].join(" ")}
      style={{ insetInlineEnd: 0, insetBlockEnd: 0 }}
      onClose={() => {
        onClose();
        if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        ref.current?.close();
      }}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <SparklesIcon className="text-[var(--info)]" />
          <span className="text-[0.9375rem] font-semibold">Asistente de IA</span>
        </div>
        <IconButton label="Cerrar asistente de IA" onClick={() => ref.current?.close()}>
          <CloseIcon />
        </IconButton>
      </div>
      <div className="flex h-[calc(100%-57px)] flex-col gap-4 overflow-y-auto p-5">
        <div>
          <Badge tone="info">Generado por IA</Badge>
          <p className="mt-2 text-[0.75rem] text-[var(--text-tertiary)]">
            Siempre revisable antes de usarse. Nunca se envía nada automáticamente.
          </p>
        </div>
        <Tabs
          items={[
            { id: "resumen", label: "Resumen", content: <ResumenTab /> },
            { id: "recomendaciones", label: "Recomendaciones", content: <RecomendacionesTab /> },
            { id: "borrador", label: "Borrador", content: <AiDraftTab /> },
          ]}
        />
      </div>
    </dialog>
  );
}
