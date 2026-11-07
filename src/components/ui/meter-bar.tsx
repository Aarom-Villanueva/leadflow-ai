/**
 * Barra horizontal con el valor siempre expresado como texto junto a ella —
 * nunca solo color/longitud (docs/specs/LF-003.md §5.2): quien usa un lector
 * de pantalla obtiene el número real del texto, no de interpretar la barra.
 */
export function MeterBar({ label, count, total, tone = "accent" }: { label: string; count: number; total: number; tone?: "accent" | "success" | "danger" }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barColor = tone === "success" ? "bg-[var(--success)]" : tone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--accent)]";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
        <span className="text-[var(--text-primary)]">{label}</span>
        <span className="text-[var(--text-secondary)]">
          {count} · {pct}%
        </span>
      </div>
      <div aria-hidden="true" className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
