import type { ReactNode } from "react";
import { RolePreviewProvider } from "@/app/design/_lib/role-context";
import { AppShell } from "@/app/design/app/_components/app-shell";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <RolePreviewProvider>
      <AppShell>{children}</AppShell>
    </RolePreviewProvider>
  );
}
