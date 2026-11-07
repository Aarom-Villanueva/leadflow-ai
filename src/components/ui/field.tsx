import type { ReactNode } from "react";

/**
 * Envoltorio de campo accesible: asocia etiqueta real, texto de ayuda y
 * error mediante `aria-describedby`/`aria-invalid` reales, nunca solo color
 * (docs/specs/LF-003.md §6).
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-[var(--text-secondary)]">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-[var(--danger)]">
            *
          </span>
        ) : null}
      </label>
      {children(describedBy)}
      {hint ? (
        <p id={hintId} className="text-[0.8125rem] text-[var(--text-tertiary)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[0.8125rem] text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
