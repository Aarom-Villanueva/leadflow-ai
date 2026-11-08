import type { ReactNode } from "react";

export type BannerTone = "info" | "success" | "warning" | "danger" | "prototype";

const tones: Record<BannerTone, string> = {
  info: "border-[var(--info)]/30 bg-[var(--info)]/10 text-[var(--info)]",
  success: "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  warning: "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
  danger: "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
  prototype: "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]",
};

export function Banner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: BannerTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const role = tone === "danger" ? "alert" : "status";
  return (
    <div role={role} className={["rounded-[var(--radius-md)] border px-4 py-3 text-[0.8125rem]", tones[tone]].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{title}</p>
          {children ? <p className="mt-0.5 text-[var(--text-secondary)]">{children}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
