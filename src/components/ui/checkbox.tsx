import type { InputHTMLAttributes } from "react";

export function Checkbox({ id, label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string }) {
  return (
    <div className={["flex items-start gap-2.5", className].filter(Boolean).join(" ")}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface)] accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        {...props}
      />
      <label htmlFor={id} className="text-[0.8125rem] leading-5 text-[var(--text-secondary)]">
        {label}
      </label>
    </div>
  );
}
