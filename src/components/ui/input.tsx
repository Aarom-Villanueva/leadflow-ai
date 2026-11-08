import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const controlBase =
  "min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 " +
  "text-[0.9375rem] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] " +
  "aria-invalid:border-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[controlBase, className].filter(Boolean).join(" ")} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[controlBase, "min-h-24 py-2.5", className].filter(Boolean).join(" ")} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={[controlBase, "appearance-none bg-no-repeat pr-9", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </select>
  );
}
