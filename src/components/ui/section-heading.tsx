import type { ReactNode } from "react";
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h2>;
}
