"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { StageBadge } from "@/components/ui/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { ArchiveIcon, ArrowLeftIcon, FollowupsIcon } from "@/components/ui/icons";
import {
  SYNTHETIC_STAGES,
  SYNTHETIC_INTERACTIONS,
  SYNTHETIC_FOLLOWUPS,
  memberById,
  stageById,
  type SyntheticLead,
} from "@/app/design/_data/fixtures";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const interactionLabels: Record<string, string> = { nota: "Nota", llamada: "Llamada", reunión: "Reunión", conversación: "Conversación" };
const followupStatusTone = { pending: "warning", completed: "success", canceled: "neutral" } as const;
const followupStatusLabel = { pending: "Pendiente", completed: "Completado", canceled: "Cancelado" } as const;

function ResumenTab({ lead }: { lead: SyntheticLead }) {
  const [editing, setEditing] = useState(false);
  const [stageId, setStageId] = useState(lead.stageId);

  return (
    <div className="flex flex-col gap-5">
      <Banner tone="prototype" title="Los cambios aquí no se guardan">
        Esta ficha es solo de diseño: editar o cambiar la etapa no persiste al recargar la página.
      </Banner>
      <div className="flex items-center justify-between">
        <h3 className="text-[1rem] font-semibold">Datos de contacto</h3>
        <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>
          {editing ? "Listo" : "Editar"}
        </Button>
      </div>
      {editing ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="edit-email" label="Correo">
            {(describedBy) => <Input id="edit-email" type="email" defaultValue={lead.email} aria-describedby={describedBy} />}
          </Field>
          <Field id="edit-phone" label="Teléfono">
            {(describedBy) => <Input id="edit-phone" type="tel" defaultValue={lead.phone} aria-describedby={describedBy} />}
          </Field>
        </div>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[0.75rem] text-[var(--text-tertiary)]">Correo</dt>
            <dd className="text-[0.9375rem] text-[var(--text-primary)]">{lead.email ?? "Sin registrar"}</dd>
          </div>
          <div>
            <dt className="text-[0.75rem] text-[var(--text-tertiary)]">Teléfono</dt>
            <dd className="text-[0.9375rem] text-[var(--text-primary)]">{lead.phone ?? "Sin registrar"}</dd>
          </div>
        </dl>
      )}

      <div>
        <label htmlFor="stage-select" className="text-[0.75rem] text-[var(--text-tertiary)]">
          Etapa
        </label>
        <div className="mt-1.5 max-w-xs">
          <Select id="stage-select" value={stageId} onChange={(event) => setStageId(event.target.value)}>
            {SYNTHETIC_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

function ActividadTab({ leadId }: { leadId: string }) {
  const interactions = SYNTHETIC_INTERACTIONS.filter((interaction) => interaction.leadId === leadId);
  if (interactions.length === 0) {
    return <EmptyState title="Sin actividad todavía" description="Las notas, llamadas y reuniones registradas aparecerán aquí." />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {interactions.map((interaction) => {
        const author = memberById(interaction.authorMemberId);
        return (
          <li key={interaction.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-2">
              <Badge>{interactionLabels[interaction.kind] ?? interaction.kind}</Badge>
              <span className="text-[0.75rem] text-[var(--text-tertiary)]">{formatDateTime(interaction.occurredAt)}</span>
            </div>
            <p className="mt-2 text-[0.875rem] text-[var(--text-secondary)]">{interaction.body}</p>
            {author ? <p className="mt-2 text-[0.75rem] text-[var(--text-tertiary)]">Registrado por {author.name}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function SeguimientosTab({ leadId }: { leadId: string }) {
  const followups = SYNTHETIC_FOLLOWUPS.filter((followup) => followup.leadId === leadId);
  if (followups.length === 0) {
    return (
      <EmptyState
        icon={<FollowupsIcon className="size-7" />}
        title="Sin seguimientos programados"
        description="Programa un seguimiento para no perder el próximo contacto con este prospecto."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {followups.map((followup) => {
        const assignee = memberById(followup.assignedMemberId);
        return (
          <li key={followup.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4">
            <div>
              <p className="text-[0.9375rem] font-medium text-[var(--text-primary)]">{followup.title}</p>
              <p className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">
                Vence {formatDateTime(followup.dueAt)} · {assignee?.name ?? "Sin asignar"}
              </p>
            </div>
            <Badge tone={followupStatusTone[followup.status]}>{followupStatusLabel[followup.status]}</Badge>
          </li>
        );
      })}
      <li>
        <Field id="new-followup" label="Nuevo seguimiento" hint="Solo demostración; no se guarda.">
          {(describedBy) => <Textarea id="new-followup" placeholder="Ej. llamar para confirmar la propuesta" aria-describedby={describedBy} />}
        </Field>
      </li>
    </ul>
  );
}

export function LeadDetailClient({ lead }: { lead: SyntheticLead }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  const stage = stageById(lead.stageId);
  const owner = memberById(lead.assignedMemberId);

  return (
    <div>
      <Link
        href="/design/app/leads"
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <ArrowLeftIcon className="size-4" />
        Volver a prospectos
      </Link>

      {archived ? (
        <div className="mt-4">
          <Banner tone="success" title="Prospecto archivado">
            Su historial sigue disponible; ya no aparece en el listado principal.
          </Banner>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[1.75rem] font-semibold tracking-tight">{lead.name}</h1>
            {stage ? <StageBadge name={stage.name} kind={stage.kind} /> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-[0.8125rem] text-[var(--text-secondary)]">
            {owner ? (
              <span className="flex items-center gap-2">
                <Avatar name={owner.name} size="sm" />
                {owner.name}
              </span>
            ) : null}
            <span className="capitalize">Origen: {lead.source}</span>
          </div>
        </div>
        <Button variant="danger" onClick={() => setArchiveOpen(true)} disabled={archived}>
          <ArchiveIcon className="size-4" />
          Archivar
        </Button>
      </div>

      <div className="mt-8">
        <Card>
          <Tabs
            items={[
              { id: "resumen", label: "Resumen", content: <ResumenTab lead={lead} /> },
              { id: "actividad", label: "Actividad", content: <ActividadTab leadId={lead.id} /> },
              { id: "seguimientos", label: "Seguimientos", content: <SeguimientosTab leadId={lead.id} /> },
            ]}
          />
        </Card>
      </div>

      <Dialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="¿Archivar este prospecto?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiveOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setArchived(true);
                setArchiveOpen(false);
              }}
            >
              Archivar
            </Button>
          </>
        }
      >
        Su historial de actividad y seguimientos se conserva; dejará de aparecer en el listado principal.
      </Dialog>
    </div>
  );
}

export function LeadNotFound() {
  return (
    <div>
      <Link
        href="/design/app/leads"
        className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <ArrowLeftIcon className="size-4" />
        Volver a prospectos
      </Link>
      <div className="mt-6">
        <EmptyState
          title="No encontramos este prospecto"
          description="Puede que el enlace sea incorrecto o que ya no esté disponible para tu organización."
          action={
            <ButtonLink href="/design/app/leads" variant="secondary">
              Volver al listado
            </ButtonLink>
          }
        />
      </div>
    </div>
  );
}
