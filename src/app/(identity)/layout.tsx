import type { ReactNode } from "react";
import "../design/tokens.css";

export default function IdentityLayout({ children }: { children: ReactNode }) {
  return <div className="lf-design-root"><main id="main" tabIndex={-1} className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12"><div className="mb-8 text-xl font-semibold">LeadFlow <span className="text-[var(--accent)]">AI</span></div>{children}</main></div>;
}
