"use client";

import { useEffect, useRef } from "react";
import { IconButton } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { CloseIcon, SparklesIcon } from "@/components/ui/icons";

/**
 * Ubicación del asistente de IA (docs/specs/LF-003.md §4.2): solo su punto de
 * activación y dónde vive en la estructura. El contenido real (resumen,
 * recomendaciones, borradores revisables) se diseña en la etapa 2.
 */
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
        <Banner tone="info" title="Se diseña en la etapa 2">
          Aquí vivirán el resumen de la organización, recomendaciones y borradores de IA, siempre revisables por la
          persona antes de usarse — nunca enviados automáticamente.
        </Banner>
        <p className="text-[0.8125rem] text-[var(--text-secondary)]">
          Esta etapa solo fija su ubicación en la estructura: un panel accesible desde cualquier pantalla del CRM,
          mediante el botón con el icono de chispa en la barra superior.
        </p>
      </div>
    </dialog>
  );
}
