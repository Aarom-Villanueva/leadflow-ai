import type { ReactNode } from "react";

export function ActionLink({ href, children }: { href: `#${string}`; children: ReactNode }) {
  return <a className="inline-flex min-h-12 items-center justify-center rounded-xl bg-lime-300 px-6 font-semibold text-slate-950 transition hover:bg-lime-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime-300" href={href}>{children}</a>;
}
