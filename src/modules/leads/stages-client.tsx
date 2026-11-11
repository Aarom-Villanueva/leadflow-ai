"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { commercialApi } from "./client-api";
import type { PipelineMetadata, Stage } from "./contracts";

export function StagesClient({ organizationId }: { organizationId: string }) {
  const base = `/api/organizations/${organizationId}`;
  const [metadata, setMetadata] = useState<PipelineMetadata>(), [error, setError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  useEffect(() => { const controller = new AbortController(); commercialApi<PipelineMetadata>(base + "/pipeline", { signal: controller.signal }).then(setMetadata).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [base]);
  async function save(event: FormEvent<HTMLFormElement>, stage?: Stage) {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form);
    const body = { name: data.get("name"), kind: data.get("kind"), ...(stage ? { version: stage.version, position: Number(data.get("position")), active: data.get("active") === "on" } : {}) };
    setBusy(true); setError(""); setNotice("");
    try { await commercialApi(base + "/stages" + (stage ? "/" + stage.id : ""), { method: stage ? "PATCH" : "POST", body: JSON.stringify(body) }); setMetadata(await commercialApi(base + "/pipeline")); if (!stage) form.reset(); setNotice("Etapas actualizadas."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  const kinds = <><option value="open">Abierta</option><option value="won">Ganada</option><option value="lost">Perdida</option></>;
  return <div className="space-y-5"><p className="text-[var(--text-secondary)]">Los cambios se comparten con tu equipo. Las etapas en uso conservan su tipo y no se desactivan.</p>{error && <div role="alert"><p className="text-[var(--danger)]">{error}</p><Button className="mt-2" onClick={() => { setError(""); void commercialApi<PipelineMetadata>(base + "/pipeline").then(setMetadata).catch(reason => setError(reason.message)); }}>Recargar etapas</Button></div>}{notice && <p role="status">{notice}</p>}{!metadata && !error && <p role="status">Cargando etapas…</p>}
    {metadata?.role === "sales" ? <p role="alert">Solo propietarios y administradores pueden configurar etapas.</p> : metadata && <>{metadata.stages.map(stage => <Card key={stage.id + ":" + stage.version}><form onSubmit={event => void save(event, stage)} className="flex flex-wrap items-end gap-4" aria-label={`Editar etapa ${stage.name}`}><label className="grow space-y-1 text-sm">Nombre de etapa<Input name="name" required maxLength={60} defaultValue={stage.name} /></label><label className="space-y-1 text-sm">Tipo<Select name="kind" defaultValue={stage.kind}>{kinds}</Select></label><label className="w-24 space-y-1 text-sm">Posición<Input name="position" type="number" min={1} max={metadata.stages.length} defaultValue={stage.position} required /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={stage.active} />Activa</label><Button type="submit" disabled={busy}>Guardar etapa</Button></form></Card>)}<Card><h2 className="mb-4 text-lg font-semibold">Nueva etapa</h2><form onSubmit={event => void save(event)} className="flex flex-wrap items-end gap-4"><label className="grow space-y-1 text-sm">Nombre de nueva etapa<Input name="name" required maxLength={60} /></label><label className="space-y-1 text-sm">Tipo de nueva etapa<Select name="kind">{kinds}</Select></label><Button type="submit" variant="primary" disabled={busy || metadata.stages.length >= 50}>Crear etapa</Button></form></Card></>}
  </div>;
}
