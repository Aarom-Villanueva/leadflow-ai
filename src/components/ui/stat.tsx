import type { ReactNode } from "react";

/** Métrica individual con etiqueta, valor y una nota opcional (p. ej. intervalo/zona horaria). */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-[0.75rem] uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-2 text-[1.75rem] font-semibold tracking-tight text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  );
}
