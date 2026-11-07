"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { FollowupsIcon } from "@/components/ui/icons";
import { SYNTHETIC_INTERACTIONS, SYNTHETIC_FOLLOWUPS, SYNTHETIC_MEMBERS, leadById, memberById } from "@/app/design/_data/fixtures";

type PreviewState = "normal" | "carga" | "error" | "vacio";
type TypeFilter = "all" | "interaction" | "followup";
type StatusFilter = "all" | "pending" | "overdue" | "completed";

interface FeedItem {
  id: string;
  type: "interaction" | "followup";
  leadId: string;
  timestamp: string;
  memberId: string;
  title: string;
  statusTone: BadgeTone;
  statusLabel: string;
}

const interactionLabels: Record<string, string> = { nota: "Nota", llamada: "Llamada", reunión: "Reunión", conversación: "Conversación" };

function buildFeed(): FeedItem[] {
  const interactions: FeedItem[] = SYNTHETIC_INTERACTIONS.map((interaction) => ({
    id: `feed-int-${interaction.id}`,
    type: "interaction",
    leadId: interaction.leadId,
    timestamp: interaction.occurredAt,
    memberId: interaction.authorMemberId,
    title: `${interactionLabels[interaction.kind] ?? interaction.kind}: ${interaction.body}`,
    statusTone: "info",
    statusLabel: "Actividad",
  }));

  const followups: FeedItem[] = SYNTHETIC_FOLLOWUPS.map((followup) => {
    const overdue = followup.status === "pending" && new Date(followup.dueAt).getTime() < Date.now();
    return {
      id: `feed-fu-${followup.id}`,
      type: "followup",
      leadId: followup.leadId,
      timestamp: followup.dueAt,
      memberId: followup.assignedMemberId,
      title: followup.title,
      statusTone: overdue ? "danger" : followup.status === "completed" ? "success" : followup.status === "canceled" ? "neutral" : "warning",
      statusLabel: overdue ? "Vencido" : followup.status === "completed" ? "Completado" : followup.status === "canceled" ? "Cancelado" : "Pendiente",
    };
  });

  return [...interactions, ...followups].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityFeedClient() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [preview, setPreview] = useState<PreviewState>("normal");

  const feed = useMemo(() => buildFeed(), []);

  const filtered = useMemo(() => {
    return feed.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (memberFilter !== "all" && item.memberId !== memberFilter) return false;
      if (statusFilter !== "all") {
        if (item.type === "interaction") return false;
        if (statusFilter === "pending" && item.statusLabel !== "Pendiente") return false;
        if (statusFilter === "overdue" && item.statusLabel !== "Vencido") return false;
        if (statusFilter === "completed" && item.statusLabel !== "Completado") return false;
      }
      return true;
    });
  }, [feed, typeFilter, memberFilter, statusFilter]);

  return (
    <div>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Historial y seguimientos</h1>
      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">
        Actividad y seguimientos de todos los prospectos, en un solo lugar. {filtered.length} resultados.
      </p>

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
            {value === "normal" ? "Normal" : value === "carga" ? "Cargando" : value === "error" ? "Error" : "Vacío"}
          </button>
        ))}
      </nav>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="type-filter" className="sr-only">
            Filtrar por tipo
          </label>
          <Select id="type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
            <option value="all">Actividad y seguimientos</option>
            <option value="interaction">Solo actividad</option>
            <option value="followup">Solo seguimientos</option>
          </Select>
        </div>
        <div>
          <label htmlFor="member-filter" className="sr-only">
            Filtrar por responsable
          </label>
          <Select id="member-filter" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)}>
            <option value="all">Todos los responsables</option>
            {SYNTHETIC_MEMBERS.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="status-filter" className="sr-only">
            Filtrar por estado
          </label>
          <Select id="status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Cualquier estado</option>
            <option value="pending">Seguimientos pendientes</option>
            <option value="overdue">Seguimientos vencidos</option>
            <option value="completed">Seguimientos completados</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        {preview === "carga" ? (
          <SkeletonRows rows={6} />
        ) : preview === "error" ? (
          <Banner tone="danger" title="No pudimos cargar la actividad" action={<Button size="sm" variant="secondary">Reintentar</Button>}>
            Ocurrió un problema al obtener el historial. Inténtalo de nuevo.
          </Banner>
        ) : preview === "vacio" ? (
          <EmptyState icon={<FollowupsIcon className="size-8" />} title="Sin actividad todavía" description="La actividad y los seguimientos de tus prospectos aparecerán aquí." />
        ) : filtered.length === 0 ? (
          <EmptyState title="Sin resultados para estos filtros" description="Ajusta los filtros para ver más resultados." />
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((item) => {
              const lead = leadById(item.leadId);
              const member = memberById(item.memberId);
              return (
                <li key={item.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={item.statusTone}>{item.statusLabel}</Badge>
                    <span className="text-[0.75rem] text-[var(--text-tertiary)]">{formatDateTime(item.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-[0.875rem] text-[var(--text-primary)]">{item.title}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                    {lead ? (
                      <Link href={`/design/app/leads/${lead.id}`} className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
                        {lead.name}
                      </Link>
                    ) : null}
                    {member ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar name={member.name} size="sm" />
                        {member.name}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
