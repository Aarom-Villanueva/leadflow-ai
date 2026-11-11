"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { commercialApi } from "./client-api";
import { LeadForm } from "./lead-form";
import type { Lead, PipelineMetadata, StageEvent } from "./contracts";

export function DetailClient({ organizationId, leadId }: { organizationId: string; leadId: string }) {
  const base = `/api/organizations/${organizationId}`;
  const [lead, setLead] = useState<Lead>(), [metadata, setMetadata] = useState<PipelineMetadata>(), [events, setEvents] = useState<StageEvent[]>([]);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [saved, setSaved] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    return Promise.all([commercialApi<{ lead: Lead }>(`${base}/leads/${leadId}`, { signal }), commercialApi<PipelineMetadata>(`${base}/pipeline`, { signal }), commercialApi<{ events: StageEvent[] }>(`${base}/leads/${leadId}/history`, { signal })]);
  }, [base, leadId]);
  const apply = useCallback(([detail, meta, history]: Awaited<ReturnType<typeof load>>) => { setLead(detail.lead); setMetadata(meta); setEvents(history.events); }, []);
  useEffect(() => { const controller = new AbortController(); load(controller.signal).then(apply).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [load, apply]);
  async function save(body: unknown, archive = false) {
    setBusy(true); setError(""); setSaved(false);
    try { await commercialApi(`${base}/leads/${leadId}${archive ? "/archive" : ""}`, { method: archive ? "POST" : "PATCH", body: JSON.stringify(body) }); apply(await load()); setSaved(true); setConfirm(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">{error && <div role="alert"><p className="text-[var(--danger)]">{error}</p><Button className="mt-3" onClick={() => { setError(""); void load().then(apply).catch(reason => setError(reason.message)); }}>Recargar datos</Button></div>}
    {saved && <p role="status" className="text-[var(--accent)]">Cambios guardados.</p>}
    {!lead && !error && <p role="status">Cargando ficha…</p>}
    {lead && metadata && <div className="grid gap-6 lg:grid-cols-2"><Card><h2 className="mb-5 text-xl font-semibold">{lead.name}</h2>{lead.archivedAt ? <p role="status">Este prospecto está archivado. Su historial se conserva.</p> : <LeadForm key={lead.version} lead={lead} metadata={metadata} busy={busy} onSave={save} />}</Card><div className="space-y-6"><Card><h2 className="text-lg font-semibold">Historial de etapas</h2><ol className="mt-4 space-y-4">{events.map(event => <li key={event.id} className="border-l-2 border-[var(--accent)] pl-4"><p>{event.fromStage ? `${event.fromStage} → ${event.toStage}` : `Creado en ${event.toStage}`}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{event.actorName} · {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short", timeZone: metadata.timezone }).format(new Date(event.happenedAt))}</p></li>)}</ol><p className="mt-4 text-xs text-[var(--text-secondary)]">Zona horaria: {metadata.timezone}.</p></Card>{!lead.archivedAt && <Card><h2 className="font-semibold">Archivar prospecto</h2><p className="my-3 text-sm text-[var(--text-secondary)]">Se oculta del listado activo y se conserva la información. Este incremento no incluye restauración.</p><Button variant="danger" onClick={() => setConfirm(true)} disabled={busy}>Archivar prospecto</Button></Card>}</div></div>}
    <Dialog open={confirm} onClose={() => setConfirm(false)} title="¿Archivar este prospecto?" footer={<><Button onClick={() => setConfirm(false)}>Cancelar</Button><Button variant="danger" disabled={busy} onClick={() => void save({ version: lead?.version }, true)}>{busy ? "Archivando…" : "Confirmar archivo"}</Button></>}><p>La ficha y el historial se conservarán. No se podrá editar una vez archivado.</p>{error && <p role="alert" className="mt-3 text-[var(--danger)]">{error}</p>}</Dialog>
  </div>;
}
