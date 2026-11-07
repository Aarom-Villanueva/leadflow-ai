/** Marcador de carga; `aria-hidden` porque el contenedor que lo usa anuncia "cargando" por texto. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={["animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-raised)]", className].filter(Boolean).join(" ")} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
