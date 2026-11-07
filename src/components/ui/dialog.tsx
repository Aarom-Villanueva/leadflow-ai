"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";

/**
 * Diálogo de confirmación sobre `<dialog>` nativo: atrapamiento de foco y
 * cierre con Escape son del propio elemento, no reimplementados a mano
 * (docs/specs/LF-003.md §5.6). Devuelve el foco al control que lo abrió.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
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
      aria-labelledby="dialog-title"
      className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-6 text-[var(--text-primary)] backdrop:bg-black/60"
      onClose={() => {
        onClose();
        if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        ref.current?.close();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="dialog-title" className="text-[1.125rem] font-semibold">
          {title}
        </h2>
        <IconButton label="Cerrar" onClick={() => ref.current?.close()}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </IconButton>
      </div>
      <div className="mt-4 text-[0.9375rem] text-[var(--text-secondary)]">{children}</div>
      <div className="mt-6 flex justify-end gap-2">{footer}</div>
    </dialog>
  );
}
