import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
  success: "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  warning: "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
  danger: "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
  info: "border-[var(--info)]/30 bg-[var(--info)]/10 text-[var(--info)]",
};

/** Insignia de estado: el texto siempre acompaña al color (nunca solo color, docs/specs/LF-003.md §5.2). */
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide",
        tones[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
