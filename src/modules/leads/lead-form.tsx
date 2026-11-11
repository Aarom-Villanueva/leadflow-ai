"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { leadFields, sources, type Lead, type PipelineMetadata } from "./contracts";

export function LeadForm({ metadata, lead, onSave, busy }: { metadata: PipelineMetadata; lead?: Lead; onSave: (body: unknown) => Promise<void>; busy: boolean }) {
  const [validation, setValidation] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body = { name: data.get("name"), email: data.get("email") || null, phoneE164: data.get("phoneE164") || null, source: data.get("source") || null, stageId: data.get("stageId"), assignedUserId: data.get("assignedUserId") || null };
    if (!leadFields.safeParse(body).success) { setValidation("Revisa el correo y el teléfono. Usa formato internacional, por ejemplo +51912345678."); return; }
    setValidation(""); await onSave(lead ? { ...body, version: lead.version } : body);
  }
  return <form onSubmit={submit} className="space-y-4">
    {validation && <p role="alert" className="text-[var(--danger)]">{validation}</p>}
    <Field id="lead-name" label="Nombre del prospecto" required>{description => <Input id="lead-name" name="name" required maxLength={200} defaultValue={lead?.name} aria-describedby={description} />}</Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field id="lead-email" label="Correo">{description => <Input id="lead-email" name="email" type="email" maxLength={254} defaultValue={lead?.email ?? ""} aria-describedby={description} />}</Field>
      <Field id="lead-phone" label="Teléfono" hint="Incluye código de país: +51912345678">{description => <Input id="lead-phone" name="phoneE164" type="tel" maxLength={16} defaultValue={lead?.phoneE164 ?? ""} aria-describedby={description} />}</Field></div>
    <Field id="lead-stage" label="Etapa" required>{description => <Select id="lead-stage" name="stageId" defaultValue={lead?.stageId ?? metadata.stages.find(stage => stage.active)?.id} aria-describedby={description}>{metadata.stages.filter(stage => stage.active || stage.id === lead?.stageId).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</Select>}</Field>
    <Field id="lead-owner" label="Responsable">{description => <Select id="lead-owner" name="assignedUserId" defaultValue={lead?.assignedUserId ?? ""} aria-describedby={description}><option value="">Sin asignar</option>{lead?.assignedUserId && !metadata.members.some(member => member.userId === lead.assignedUserId) && <option value={lead.assignedUserId}>Miembro anterior</option>}{metadata.members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select>}</Field>
    <Field id="lead-source" label="Origen">{description => <Select id="lead-source" name="source" defaultValue={lead?.source ?? ""} aria-describedby={description}><option value="">Sin especificar</option>{sources.map(source => <option key={source}>{source}</option>)}</Select>}</Field>
    <Button type="submit" variant="primary" disabled={busy}>{busy ? "Guardando…" : lead ? "Guardar cambios" : "Crear prospecto"}</Button>
  </form>;
}
