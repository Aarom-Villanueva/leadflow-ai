"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { NavLink } from "@/components/ui/nav-link";
import { IconButton } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  AdminIcon,
  ChevronDownIcon,
  DashboardIcon,
  FollowupsIcon,
  LeadsIcon,
  LogoutIcon,
  MenuIcon,
  PipelineIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { useRolePreview, ROLE_PREVIEW_OPTIONS } from "@/app/design/_lib/role-context";
import { SYNTHETIC_ORG } from "@/app/design/_data/fixtures";
import { AiPanel } from "@/app/design/app/_components/ai-panel";
import { MobileNavDrawer } from "@/app/design/app/_components/mobile-nav-drawer";

function NavItems() {
  const { role } = useRolePreview();
  return (
    <>
      <NavLink href="/design/app/dashboard" icon={<DashboardIcon />}>
        Dashboard
      </NavLink>
      <NavLink href="/design/app/leads" icon={<LeadsIcon />}>
        Prospectos
      </NavLink>
      <NavLink href="/design/app/pipeline" icon={<PipelineIcon />}>
        Pipeline
      </NavLink>
      <NavLink href="/design/app/seguimientos" icon={<FollowupsIcon />}>
        Seguimientos
      </NavLink>
      {role === "owner" || role === "admin" ? (
        <NavLink href="/design/app/administracion" icon={<AdminIcon />}>
          Administración
        </NavLink>
      ) : null}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const { role, memberName, setRole } = useRolePreview();
  const roleSelectId = "role-preview-select";
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Cierra el cajón móvil si la ventana crece hasta el punto de corte de escritorio.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-2.5rem)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 lg:flex">
        <Link href="/design" className="mb-6 flex items-center gap-2.5 px-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-[#0b1418]">
            L
          </span>
          <span className="text-[0.9375rem] font-semibold">
            LeadFlow <span className="text-[var(--accent)]">AI</span>
          </span>
        </Link>
        <nav aria-label="Navegación principal" className="flex flex-col gap-1">
          <NavItems />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6">
          <IconButton ref={menuButtonRef} label="Abrir menú de navegación" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>

          <Link
            href="/design/org/seleccionar"
            className="hidden min-w-0 items-center gap-1.5 truncate rounded text-[0.8125rem] font-medium text-[var(--text-primary)] hover:text-[var(--accent)] sm:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {SYNTHETIC_ORG.name}
            <ChevronDownIcon className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
          </Link>

          <div className="relative ml-auto hidden max-w-xs flex-1 sm:block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <label htmlFor="global-search" className="sr-only">
              Buscar prospectos
            </label>
            <input
              id="global-search"
              type="search"
              placeholder="Buscar prospectos…"
              disabled
              title="Solo visual en esta etapa"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] pl-9 pr-3 text-[0.8125rem] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed"
            />
          </div>

          <IconButton
            label={aiOpen ? "Cerrar asistente de IA" : "Abrir asistente de IA"}
            aria-expanded={aiOpen}
            onClick={() => setAiOpen((value) => !value)}
            className="ml-auto sm:ml-0"
          >
            <SparklesIcon />
          </IconButton>

          <div className="hidden items-center gap-2 sm:flex">
            <label htmlFor={roleSelectId} className="text-[0.75rem] text-[var(--text-tertiary)]">
              Vista de rol (solo prototipo)
            </label>
            <select
              id={roleSelectId}
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
              className="h-9 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] px-2 text-[0.8125rem] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {ROLE_PREVIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <details className="group relative list-none">
            <summary
              aria-label={`Cuenta de ${memberName}`}
              className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] px-2 [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <Avatar name={memberName} size="sm" />
              <span className="hidden text-[0.8125rem] font-medium text-[var(--text-primary)] md:inline">{memberName}</span>
            </summary>
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 shadow-xl">
              <p className="px-1 text-[0.8125rem] font-medium text-[var(--text-primary)]">{memberName}</p>
              <div className="mt-1 px-1">
                <RoleBadge role={role} />
              </div>
              <Link
                href="/design/access/iniciar-sesion"
                className="mt-3 flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-[0.8125rem] text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <LogoutIcon className="size-4" />
                Cerrar sesión
              </Link>
            </div>
          </details>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <NavItems />
      </MobileNavDrawer>
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
