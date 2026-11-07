import type { ReactNode } from "react";

/** Estado vacío/error con acción contextual — nunca una tabla o lista en blanco sin explicación. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-6 py-12 text-center">
      {icon ? <div aria-hidden="true" className="text-[var(--text-tertiary)]">{icon}</div> : null}
      <h3 className="text-[1rem] font-semibold text-[var(--text-primary)]">{title}</h3>
      {description ? <p className="max-w-sm text-[0.8125rem] text-[var(--text-secondary)]">{description}</p> : null}
      {action}
    </div>
  );
}
