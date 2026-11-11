"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { commercialApi } from "@/modules/leads/client-api";
import type { PipelineMetadata } from "@/modules/leads/contracts";
import type { ActivityPage, Followup } from "./contracts";
import { displayInstant, resolveWallTime, wallTime } from "./time";

function FollowupForm({ metadata, item, busy, save }: { metadata: PipelineMetadata; item?: Followup; busy: boolean; save: (body: unknown, id?: string) => Promise<void> }) {
  const [initial] = useState(() => item?.dueAt ?? new Date(Date.now() + 86400000).toISOString()), [key] = useState(() => crypto.randomUUID()), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const body = { title: data.get("title"), detail: data.get("detail") || null, assignedUserId: data.get("assignedUserId"), dueAt: resolveWallTime(String(data.get("dueAt")), metadata.timezone, initial), ...(item ? { version: item.version } : { creationKey: key }) };
      setError(""); await save(body, item?.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Revisa la fecha."); }
  }
  return <form onSubmit={submit} className="space-y-4" aria-label={item ? "Editar seguimiento" : "Crear seguimiento"}>{error && <p role="alert" className="text-[var(--danger)]">{error}</p>}<label className="block space-y-1 text-sm">Título del seguimiento<Input name="title" required maxLength={200} defaultValue={item?.title ?? ""} /></label><label className="block space-y-1 text-sm">Detalle del seguimiento<Textarea name="detail" maxLength={2000} defaultValue={item?.detail ?? ""} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">Responsable del seguimiento<Select name="assignedUserId" required defaultValue={item?.assignedUserId ?? ""}><option value="">Selecciona un responsable</option>{item && !metadata.members.some(member => member.userId === item.assignedUserId) && <option value={item.assignedUserId}>Miembro anterior</option>}{metadata.members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select></label><label className="space-y-1 text-sm">Vencimiento · {metadata.timezone}<Input name="dueAt" type="datetime-local" step="1" required defaultValue={wallTime(initial, metadata.timezone)} min="1999-12-30T00:00" max="2101-01-02T23:59:59" /></label></div><Button type="submit" variant="primary" disabled={busy}>{busy ? "Guardando…" : item ? "Guardar seguimiento" : "Crear seguimiento"}</Button></form>;
}
export function FollowupsClient({ organizationId, leadId, metadata: provided, archived = false }: { organizationId: string; leadId?: string; metadata?: PipelineMetadata; archived?: boolean }) {
  const base = `/api/organizations/${organizationId}`;
  const [metadata, setMetadata] = useState(provided), [page, setPage] = useState<ActivityPage<Followup>>();
  const [query, setQuery] = useState<Record<string, string>>({ status: "pending", window: "all" }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState("pending");
  const [editing, setEditing] = useState<Followup>(), [formKey, setFormKey] = useState(0), [confirm, setConfirm] = useState<{ item: Followup; action: "complete" | "cancel" }>();
  const headingRef = useRef<HTMLHeadingElement>(null), closedItemForFocus = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(); const params: Record<string, string> = { ...query, ...(leadId ? { leadId } : {}) }; delete params.refresh;
    Promise.all([provided ? Promise.resolve(provided) : commercialApi<PipelineMetadata>(base + "/pipeline", { signal: controller.signal }), commercialApi<ActivityPage<Followup>>(base + "/followups?" + new URLSearchParams(params), { signal: controller.signal })])
      .then(([meta, result]) => { setMetadata(meta); setPage(result); }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [base, leadId, provided, query]);
  useEffect(() => {
    // Wait for the refreshed list to commit: its removed trigger cannot receive focus.
    if (page && closedItemForFocus.current && !page.items.some(item => item.id === closedItemForFocus.current)) {
      closedItemForFocus.current = null;
      headingRef.current?.focus();
    }
  }, [page]);
  function reload() { setQuery(previous => ({ ...previous, cursor: "", refresh: String(Number(previous.refresh ?? 0) + 1) })); }
  async function save(body: unknown, id?: string) {
    setBusy(true); setError("");
    try { await commercialApi(base + "/followups" + (id ? "/" + id : ""), { method: id ? "PATCH" : "POST", body: JSON.stringify(id ? body : { ...body as object, leadId }) }); setEditing(undefined); setFormKey(value => value + 1); reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function close() {
    if (!confirm) return; setBusy(true); setError("");
    try { await commercialApi(`${base}/followups/${confirm.item.id}/${confirm.action}`, { method: "POST", body: JSON.stringify({ version: confirm.item.version }) }); closedItemForFocus.current = confirm.item.id; setConfirm(undefined); reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo cerrar."); }
    finally { setBusy(false); }
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget), status = String(data.get("status")); setError("");
    setQuery(Object.fromEntries(Object.entries({ status, window: status === "pending" ? String(data.get("window")) : "all", assignedUserId: String(data.get("assignedUserId") ?? "") }).filter(([, value]) => value !== "")));
  }
  return <section className="space-y-5" aria-labelledby="followups-title"><h2 id="followups-title" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">Seguimientos</h2><p className="text-sm text-[var(--text-secondary)]">Recordatorios dentro de LeadFlow. No se envían correos ni mensajes.</p>
    {error && <div role="alert"><p className="text-[var(--danger)]">{error}</p><Button onClick={() => { setError(""); reload(); }}>Recargar seguimientos</Button></div>}
    {metadata && !archived && (leadId || editing) && <Card><h3 className="mb-4 font-semibold">{editing ? "Editar seguimiento" : "Preparar próxima acción"}</h3><FollowupForm key={editing ? editing.id + ":" + editing.version : formKey} metadata={metadata} item={editing} busy={busy} save={save} />{editing && <Button className="mt-3" onClick={() => setEditing(undefined)}>Cancelar edición</Button>}</Card>}
    <Card><form onSubmit={filter} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">Estado del seguimiento<Select name="status" value={filterStatus} onChange={event => setFilterStatus(event.target.value)}><option value="pending">Pendientes</option><option value="completed">Completados</option><option value="canceled">Cancelados</option></Select></label><label className="text-sm">Vencimiento del seguimiento<Select key={filterStatus} name="window" defaultValue="all" disabled={filterStatus !== "pending"}><option value="all">Todos</option><option value="overdue">Vencidos</option><option value="upcoming">Próximos</option></Select></label><label className="text-sm">Filtrar responsable<Select name="assignedUserId"><option value="">Todos</option>{metadata?.members.map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select></label><Button type="submit">Filtrar seguimientos</Button></form></Card>
    {!page && !error && <p role="status">Cargando seguimientos…</p>}{page?.items.length === 0 && <p>No hay seguimientos con estos filtros.</p>}
    {metadata && page?.items.map(item => <Card key={item.id}><article><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-semibold">{item.title}</h3><span className={item.status === "pending" && item.dueAt < page.asOf ? "text-sm text-[var(--danger)]" : "text-sm text-[var(--text-secondary)]"}>{item.status === "pending" ? item.dueAt < page.asOf ? "Vencido" : "Próximo" : item.status === "completed" ? "Completado" : "Cancelado"}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.detail}</p><p className="mt-3 text-sm text-[var(--text-secondary)]">{displayInstant(item.dueAt, metadata.timezone)} · {item.assignedName ?? "Miembro anterior"}</p><Link className="mt-2 inline-block text-sm text-[var(--accent)] underline" href={`/app/${organizationId}/leads/${item.leadId}`}>{item.leadName ?? "Ver prospecto"}{item.archivedAt ? " · Archivado" : ""}</Link>{item.status === "pending" && <div className="mt-4 flex flex-wrap gap-3">{!item.archivedAt && <Button size="sm" disabled={busy} onClick={() => setEditing(item)}>Editar seguimiento</Button>}<Button size="sm" disabled={busy} onClick={() => setConfirm({ item, action: "complete" })}>Completar seguimiento</Button><Button size="sm" disabled={busy} onClick={() => setConfirm({ item, action: "cancel" })}>Cancelar seguimiento</Button></div>}</article></Card>)}
    {page && metadata && <p className="text-xs text-[var(--text-secondary)]">{page.items.length} resultados en esta página. Corte: {displayInstant(page.asOf, metadata.timezone)} · {metadata.timezone}.</p>}{page?.nextCursor && <Button onClick={() => setQuery(previous => ({ ...previous, cursor: page.nextCursor! }))}>Más seguimientos</Button>}{query.cursor && <Button onClick={() => setQuery(previous => ({ ...previous, cursor: "" }))}>Inicio de seguimientos</Button>}
    <Dialog open={!!confirm} onClose={() => setConfirm(undefined)} title={confirm?.action === "complete" ? "¿Completar seguimiento?" : "¿Cancelar seguimiento?"} footer={<><Button onClick={() => setConfirm(undefined)}>Volver</Button><Button variant="primary" disabled={busy} onClick={() => void close()}>Confirmar cierre</Button></>}><p>{confirm?.item.title}. Este cierre conserva el historial y no se puede deshacer.</p>{error && <p role="alert" className="mt-3 text-[var(--danger)]">{error}</p>}</Dialog>
  </section>;
}
