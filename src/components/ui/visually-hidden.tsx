import type { ReactNode } from "react";

/** Texto presente para lectores de pantalla, nunca visible ni ocupando espacio. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
