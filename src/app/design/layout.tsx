import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./tokens.css";

export const metadata: Metadata = {
  title: "LeadFlow AI | Propuesta de diseño",
  description: "Propuesta navegable de diseño visual y experiencia de uso del CRM, con datos sintéticos. No es un producto en funcionamiento real.",
  robots: { index: false, follow: false },
};

export default function DesignLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lf-design-root">
      <div
        role="note"
        aria-label="Aviso de propuesta de diseño"
        className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 bg-[var(--accent)] px-4 py-2 text-center text-[0.8125rem] font-semibold text-[#0b1418]"
      >
        Propuesta de diseño — datos sintéticos, sin conexión a backend real
      </div>
      {children}
    </div>
  );
}
