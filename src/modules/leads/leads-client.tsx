"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { commercialApi } from "./client-api";
import { LeadForm } from "./lead-form";
import { sources, type Lead, type LeadPage, type PipelineMetadata } from "./contracts";

export function LeadsClient({ organizationId, board = false }: { organizationId: string; board?: boolean }) {
  const router = useRouter(); const base = `/api/organizations/${organizationId}`;
  const [metadata, setMetadata] = useState<PipelineMetadata>();
  const [leads, setLeads] = useState<Lead[]>([]), [next, setNext] = useState<string | null>(null);
  const [query, setQuery] = useState<Record<string, string>>({ limit: board ? "50" : "20" });
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([commercialApi<PipelineMetadata>(base + "/pipeline", { signal: controller.signal }), commercialApi<LeadPage>(base + "/leads?" + new URLSearchParams(query), { signal: controller.signal })])
      .then(([meta, page]) => { setMetadata(meta); setLeads(previous => board && query.cursor ? [...previous, ...page.leads] : page.leads); setNext(page.nextCursor); setLoading(false); })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [base, board, query]);
  function reload(nextQuery: Record<string, string> = { ...query, cursor: "" }) { setLoading(true); setError(""); setQuery(nextQuery); }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const entries = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    reload(Object.fromEntries(Object.entries({ ...entries, limit: board ? "50" : "20" }).filter(([, value]) => value !== "")));
  }
  async function create(body: unknown) {
    setBusy(true); setError("");
    try { const result = await commercialApi<{ lead: Lead }>(base + "/leads", { method: "POST", body: JSON.stringify(body) }); router.push(`/app/${organizationId}/leads/${result.lead.id}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  async function move(lead: Lead, stageId: string) {
    setBusy(true); setError("");
    try { await commercialApi(base + `/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ version: lead.version, stageId }) }); reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo mover."); }
    finally { setBusy(false); }
  }
  const member = (id: string | null) => metadata?.members.find(value => value.userId === id)?.name ?? (id ? "Miembro anterior" : "Sin asignar");
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-[var(--text-secondary)]">{board ? "Mueve cada prospecto a su siguiente etapa." : "Organiza tus relaciones comerciales."}</p><Button variant="primary" disabled={!metadata || loading} onClick={() => setOpen(true)}>Nuevo prospecto</Button></div>
    <Card><form onSubmit={filter} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-sm">Buscar<Input name="q" placeholder="Nombre o correo" maxLength={100} /></label>
      <label className="space-y-1 text-sm">Etapa<Select name="stageId"><option value="">Todas las etapas</option>{metadata?.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Responsable<Select name="assignedUserId"><option value="">Todos</option>{metadata?.members.map(value => <option key={value.userId} value={value.userId}>{value.name}</option>)}</Select></label>
      <label className="space-y-1 text-sm">Origen<Select name="source"><option value="">Todos los orígenes</option>{sources.map(source => <option key={source}>{source}</option>)}</Select></label>
      {!board && <label className="space-y-1 text-sm">Estado<Select name="archived"><option value="false">Activos</option><option value="true">Archivados</option></Select></label>}
      <label className="space-y-1 text-sm">Orden<Select name="sort"><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="name">Nombre A–Z</option></Select></label><Button type="submit" disabled={loading}>Aplicar filtros</Button>
    </form></Card>
    {error && <div role="alert" className="rounded-lg border border-[var(--danger)] p-4"><p>{error}</p><Button className="mt-2" onClick={() => reload()} disabled={loading}>Recargar datos</Button></div>}
    {loading && <p role="status">Cargando prospectos…</p>}
    {!loading && !error && leads.length === 0 && <Card><h2 className="font-semibold">No hay prospectos con estos filtros</h2><p className="mt-2 text-[var(--text-secondary)]">Crea el primero o ajusta tu búsqueda.</p></Card>}
    {board ? <section aria-label="Tablero de pipeline" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{metadata?.stages.filter(stage => stage.active).map(stage => <Card key={stage.id}><h2 className="mb-4 font-semibold">{stage.name} <span className="text-sm text-[var(--text-secondary)]">({leads.filter(lead => lead.stageId === stage.id).length} cargados)</span></h2><div className="space-y-3">{leads.filter(lead => lead.stageId === stage.id).map(lead => <article key={lead.id} className="rounded-lg border border-[var(--border)] p-4"><Link href={`/app/${organizationId}/leads/${lead.id}`} className="font-semibold text-[var(--accent)] underline">{lead.name}</Link><p className="my-2 text-sm text-[var(--text-secondary)]">{member(lead.assignedUserId)}</p><label className="text-sm">Mover {lead.name}<Select value={lead.stageId} disabled={busy || loading} onChange={event => void move(lead, event.target.value)}>{metadata.stages.filter(value => value.active).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</Select></label></article>)}</div></Card>)}</section>
      : leads.length > 0 && <Card><div className="overflow-x-auto" role="region" aria-label="Lista de prospectos" tabIndex={0}><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">Prospectos de la organización</caption><thead className="border-b border-[var(--border)] text-[var(--text-secondary)]"><tr>{["Prospecto", "Etapa", "Responsable", "Origen"].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{leads.map(lead => <tr key={lead.id} className="border-b border-[var(--border)]"><td className="px-3 py-4"><Link href={`/app/${organizationId}/leads/${lead.id}`} className="font-semibold text-[var(--accent)] underline">{lead.name}</Link><p className="mt-1 text-[var(--text-secondary)]">{lead.email ?? "Sin correo"}</p></td><td className="px-3 py-4">{metadata?.stages.find(stage => stage.id === lead.stageId)?.name}</td><td className="px-3 py-4">{member(lead.assignedUserId)}</td><td className="px-3 py-4">{lead.source ?? "Sin especificar"}</td></tr>)}</tbody></table></div></Card>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--text-secondary)]">{leads.length} prospectos cargados{next ? "; hay más resultados" : ""}.</p>{next && <Button disabled={loading} onClick={() => reload({ ...query, cursor: next })}>{board ? "Cargar más" : "Siguiente página"}</Button>}{!board && query.cursor && <Button disabled={loading} onClick={() => reload()}>Volver al inicio</Button>}</div>
    <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} title="Nuevo prospecto" footer={null}>{error && <p role="alert" className="mb-3 text-[var(--danger)]">{error}</p>}{metadata && <LeadForm metadata={metadata} busy={busy} onSave={create} />}</Dialog>
  </div>;
}
