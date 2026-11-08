import Link from "next/link";
import type { ReactNode } from "react";

export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-[calc(100vh-2.5rem)] flex-col items-center justify-center px-6 py-12">
      <Link href="/design" className="mb-8 flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-[var(--accent)] text-lg font-bold text-[#0b1418]">
          L
        </span>
        <span className="text-lg font-semibold tracking-tight">
          LeadFlow <span className="text-[var(--accent)]">AI</span>
        </span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
