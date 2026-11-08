function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Avatar basado únicamente en iniciales (nunca una foto de un host externo):
 * cumple `img-src 'self' data:` de next.config.ts sin ninguna petición de red.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "size-7 text-[0.6875rem]" : "size-9 text-[0.8125rem]";
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)] ring-1 ring-inset ring-[var(--border-strong)]",
        dimension,
      ].join(" ")}
    >
      {initialsOf(name)}
    </span>
  );
}
