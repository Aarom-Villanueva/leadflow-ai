"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";

/** Cajón de navegación a pantalla completa en móvil, sobre `<dialog>` nativo (foco atrapado, Escape cierra). */
export function MobileNavDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
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
      aria-label="Navegación principal"
      className="m-0 h-full max-h-none w-72 max-w-[85vw] border-r border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--text-primary)] lg:hidden backdrop:bg-black/60"
      style={{ insetInlineStart: 0, insetBlockStart: 0 }}
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
        <span className="text-[0.9375rem] font-semibold">
          LeadFlow <span className="text-[var(--accent)]">AI</span>
        </span>
        <IconButton label="Cerrar menú" onClick={() => ref.current?.close()}>
          <CloseIcon />
        </IconButton>
      </div>
      <nav aria-label="Navegación principal" className="flex flex-col gap-1 p-3">
        {children}
      </nav>
    </dialog>
  );
}
