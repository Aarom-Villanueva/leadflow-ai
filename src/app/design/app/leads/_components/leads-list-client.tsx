"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { StageBadge } from "@/components/ui/stage-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { Pagination } from "@/components/ui/pagination";
import { LeadsIcon, PlusIcon } from "@/components/ui/icons";
import { useRolePreview } from "@/app/design/_lib/role-context";
import { SYNTHETIC_LEADS, SYNTHETIC_STAGES, SYNTHETIC_MEMBERS, memberById, stageById } from "@/app/design/_data/fixtures";

const PAGE_SIZE = 8;
type SortOption = "recientes" | "nombre" | "seguimiento";
type PreviewState = "normal" | "carga" | "error" | "vacio";

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function isOverdue(iso?: string): boolean {
  return Boolean(iso) && new Date(iso!).getTime() < Date.now();
}

export function LeadsListClient() {
  const { role } = useRolePreview();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sort, setSort] = useState<SortOption>("recientes");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<PreviewState>("normal");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let leads = SYNTHETIC_LEADS.filter((lead) => !lead.archived);
    if (term) leads = leads.filter((lead) => lead.name.toLowerCase().includes(term) || lead.email?.toLowerCase().includes(term));
    if (stageFilter !== "all") leads = leads.filter((lead) => lead.stageId === stageFilter);
    if (ownerFilter !== "all") leads = leads.filter((lead) => lead.assignedMemberId === ownerFilter);

    const sorted = [...leads];
    if (sort === "nombre") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "seguimiento") {
      sorted.sort((a, b) => {
        if (!a.nextFollowupAt && !b.nextFollowupAt) return 0;
        if (!a.nextFollowupAt) return 1;
        if (!b.nextFollowupAt) return -1;
        return new Date(a.nextFollowupAt).getTime() - new Date(b.nextFollowupAt).getTime();
      });
    } else sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return sorted;
  }, [search, stageFilter, ownerFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const filtersActive = search.trim() !== "" || stageFilter !== "all" || ownerFilter !== "all";

  function resetFilters() {
    setSearch("");
    setStageFilter("all");
    setOwnerFilter("all");
    setPage(1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight">Prospectos</h1>
          <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{filtered.length} resultados de {SYNTHETIC_LEADS.length} prospectos.</p>
        </div>
        <div className="flex gap-2">
          {role !== "sales" ? (
            <Button variant="secondary" title="Demostración visual: el permiso se oculta para el rol Ventas">
              Importar
            </Button>
          ) : null}
          <Button variant="primary">
            <PlusIcon className="size-4" />
            Nuevo prospecto
          </Button>
        </div>
      </div>

      <nav aria-label="Vista previa de estados (solo prototipo)" className="mt-5 flex flex-wrap gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-1.5">
        {(["normal", "carga", "error", "vacio"] as PreviewState[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-current={preview === value ? "true" : undefined}
            onClick={() => setPreview(value)}
            className={[
              "rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[0.75rem] font-medium transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
              preview === value ? "bg-[var(--accent)] text-[#0b1418]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {value === "normal" ? "Normal" : value === "carga" ? "Cargando" : value === "error" ? "Error" : "Vacío (sin prospectos)"}
          </button>
        ))}
      </nav>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="lead-search" className="sr-only">
            Buscar por nombre o correo
          </label>
          <Input id="lead-search" type="search" placeholder="Buscar por nombre o correo…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        </div>
        <div>
          <label htmlFor="stage-filter" className="sr-only">
            Filtrar por etapa
          </label>
          <Select id="stage-filter" value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setPage(1); }}>
            <option value="all">Todas las etapas</option>
            {SYNTHETIC_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="owner-filter" className="sr-only">
            Filtrar por propietario
          </label>
          <Select id="owner-filter" value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setPage(1); }}>
            <option value="all">Todos los propietarios</option>
            {SYNTHETIC_MEMBERS.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="sort" className="sr-only">
            Ordenar
          </label>
          <Select id="sort" value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
            <option value="recientes">Más recientes</option>
            <option value="nombre">Nombre A-Z</option>
            <option value="seguimiento">Próximo seguimiento</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {preview === "carga" ? (
          <SkeletonRows rows={6} />
        ) : preview === "error" ? (
          <Banner tone="danger" title="No pudimos cargar los prospectos" action={<Button size="sm" variant="secondary">Reintentar</Button>}>
            Ocurrió un problema al obtener la información. Intenta de nuevo.
          </Banner>
        ) : preview === "vacio" ? (
          <EmptyState
            icon={<LeadsIcon className="size-8" />}
            title="Todavía no tienes prospectos"
            description="Crea tu primer prospecto o impórtalos desde una hoja de cálculo."
            action={<Button variant="primary">Nuevo prospecto</Button>}
          />
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={<LeadsIcon className="size-8" />}
            title="Sin resultados para estos filtros"
            description="Ajusta la búsqueda o limpia los filtros para ver más prospectos."
            action={<Button variant="secondary" onClick={resetFilters}>Limpiar filtros</Button>}
          />
        ) : (
          <>
            <div
              tabIndex={0}
              role="region"
              aria-label="Tabla de prospectos"
              className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] md:block"
            >
              <table className="w-full min-w-[760px] border-collapse text-left text-[0.8125rem]">
                <thead className="bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Nombre</th>
                    <th scope="col" className="px-4 py-3 font-medium">Etapa</th>
                    <th scope="col" className="px-4 py-3 font-medium">Propietario</th>
                    <th scope="col" className="px-4 py-3 font-medium">Origen</th>
                    <th scope="col" className="px-4 py-3 font-medium">Último contacto</th>
                    <th scope="col" className="px-4 py-3 font-medium">Próximo seguimiento</th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((lead) => {
                    const stage = stageById(lead.stageId);
                    const owner = memberById(lead.assignedMemberId);
                    const overdue = isOverdue(lead.nextFollowupAt);
                    return (
                      <tr key={lead.id} className="border-t border-[var(--border)]">
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{lead.name}</td>
                        <td className="px-4 py-3">{stage ? <StageBadge name={stage.name} kind={stage.kind} /> : "—"}</td>
                        <td className="px-4 py-3">
                          {owner ? (
                            <span className="flex items-center gap-2">
                              <Avatar name={owner.name} size="sm" />
                              <span className="text-[var(--text-secondary)]">{owner.name}</span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)] capitalize">{lead.source}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{formatDate(lead.lastInteractionAt)}</td>
                        <td className="px-4 py-3">
                          {lead.nextFollowupAt ? (
                            <Badge tone={overdue ? "danger" : "neutral"}>{overdue ? "Vencido · " : ""}{formatDate(lead.nextFollowupAt)}</Badge>
                          ) : (
                            <span className="text-[var(--text-tertiary)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/design/app/leads/${lead.id}`}
                            className="font-medium text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                          >
                            Ver ficha
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-3 md:hidden">
              {pageItems.map((lead) => {
                const stage = stageById(lead.stageId);
                const owner = memberById(lead.assignedMemberId);
                return (
                  <li key={lead.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-[var(--text-primary)]">{lead.name}</p>
                      {stage ? <StageBadge name={stage.name} kind={stage.kind} /> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
                      {owner ? (
                        <>
                          <Avatar name={owner.name} size="sm" />
                          {owner.name}
                        </>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[0.8125rem] capitalize text-[var(--text-secondary)]">Origen: {lead.source}</p>
                    <ButtonLink href={`/design/app/leads/${lead.id}`} size="sm" variant="secondary" className="mt-3 w-full">
                      Ver ficha
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>

            <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
        {filtersActive && preview === "normal" ? (
          <p className="sr-only" aria-live="polite">
            {filtered.length} resultados encontrados
          </p>
        ) : null}
      </div>
    </div>
  );
}
