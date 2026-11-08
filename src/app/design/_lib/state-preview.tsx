import Link from "next/link";

export interface StatePreviewOption {
  value: string;
  label: string;
}

/**
 * Conmutador de estados visuales — SOLO PROTOTIPO (docs/specs/LF-003.md §7):
 * fuerza una pantalla a un estado concreto (vacío/carga/error/validación) por
 * parámetro de URL, sin depender de red ni de ningún valor real tecleado por
 * quien revisa la propuesta.
 */
export function StatePreviewSwitcher({
  basePath,
  current,
  options,
}: {
  basePath: string;
  current: string;
  options: StatePreviewOption[];
}) {
  return (
    <nav aria-label="Vista previa de estados (solo prototipo)" className="mb-6 flex flex-wrap gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-1.5">
      {options.map((option) => {
        const active = option.value === current;
        const href = option.value === "default" ? basePath : `${basePath}?vista=${option.value}`;
        return (
          <Link
            key={option.value}
            href={href}
            aria-current={active ? "true" : undefined}
            className={[
              "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[0.75rem] font-medium transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              active ? "bg-[var(--accent)] text-[#0b1418]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
