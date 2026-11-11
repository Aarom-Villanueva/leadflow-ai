import type { ReactNode } from "react";
import "../design/tokens.css";
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <div className="lf-design-root">{children}</div>;
}
