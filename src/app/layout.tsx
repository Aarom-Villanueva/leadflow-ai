import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadFlow AI | Claridad para tu gestión comercial",
  description: "Un espacio para organizar relaciones comerciales con asistencia de inteligencia artificial. En desarrollo.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es"><body><a href="#main" className="skip-link">Saltar al contenido</a>{children}</body></html>;
}
