import Link from "next/link";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold " +
  "transition disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-[0.8125rem]",
  md: "min-h-11 px-5 text-[0.9375rem]",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-[#0b1418] hover:bg-[var(--accent-strong)]",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--accent)]",
  ghost: "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]",
  danger: "border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20",
};

function classesFor(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button className={classesFor(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children, ...props }: ButtonLinkProps) {
  return (
    <Link href={href} className={classesFor(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}

/** Botón que solo contiene un icono: exige una etiqueta accesible explícita. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, ...props },
  ref,
) {
  const iconSize = size === "sm" ? "size-9 px-0" : "size-11 px-0";
  return (
    <button ref={ref} aria-label={label} className={classesFor(variant, size, [iconSize, className].filter(Boolean).join(" "))} {...props}>
      {children}
    </button>
  );
});
