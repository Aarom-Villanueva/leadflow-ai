"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { commercialApi } from "@/modules/leads/client-api";
import { kinds, type ActivityPage, type Interaction } from "./contracts";
import { displayInstant, resolveWallTime, wallTime } from "./time";

function InteractionForm({ timezone, item, busy, save }: { timezone: string; item?: Interaction; busy: boolean; save: (body: unknown, id?: string) => Promise<void> }) {
  const [initial] = useState(() => item?.occurredAt ?? new Date().toISOString()), [key] = useState(() => crypto.randomUUID()), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const body = { kind: data.get("kind"), body: data.get("body"), occurredAt: resolveWallTime(String(data.get("occurredAt")), timezone, initial), ...(item ? { version: item.version } : { creationKey: key }) };
      setError(""); await save(body, item?.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Revisa la fecha."); }
  }
  return <form onSubmit={submit} className="space-y-4" aria-label={item ? "Editar interacción" : "Registrar interacción"}>{error && <p role="alert" className="text-[var(--danger)]">{error}</p>}<div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">Tipo de interacción<Select name="kind" defaultValue={item?.kind ?? "note"}>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label><label className="space-y-1 text-sm">Fecha de interacción · {timezone}<Input name="occurredAt" type="datetime-local" step="1" required defaultValue={wallTime(initial, timezone)} min="1999-12-30T00:00" max="2101-01-02T23:59:59" /></label></div><label className="block space-y-1 text-sm">Contenido de interacción<Textarea name="body" required minLength={1} maxLength={4000} defaultValue={item?.body ?? ""} /></label><Button type="submit" variant="primary" disabled={busy}>{busy ? "Guardando…" : item ? "Guardar interacción" : "Registrar interacción"}</Button></form>;
}
export function InteractionsClient({ organizationId, leadId, timezone, archived }: { organizationId: string; leadId: string; timezone: string; archived: boolean }) {
  const base = `/api/organizations/${organizationId}/interactions`;
  const [page, setPage] = useState<ActivityPage<Interaction>>(), [query, setQuery] = useState({ cursor: "", nonce: 0 });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [editing, setEditing] = useState<Interaction>(), [formKey, setFormKey] = useState(0);
  useEffect(() => { const controller = new AbortController(); commercialApi<ActivityPage<Interaction>>(`${base}?` + new URLSearchParams({ leadId, ...(query.cursor ? { cursor: query.cursor } : {}) }), { signal: controller.signal }).then(setPage).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }); return () => controller.abort(); }, [base, leadId, query]);
  async function save(body: unknown, id?: string) {
    setBusy(true); setError("");
    try { await commercialApi(base + (id ? "/" + id : ""), { method: id ? "PATCH" : "POST", body: JSON.stringify(id ? body : { ...body as object, leadId }) }); setEditing(undefined); setFormKey(value => value + 1); setQuery(previous => ({ cursor: "", nonce: previous.nonce + 1 })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5" aria-labelledby="interactions-title"><h2 id="interactions-title" className="text-2xl font-semibold">Interacciones</h2>{error && <div role="alert"><p className="text-[var(--danger)]">{error}</p><Button onClick={() => { setError(""); setQuery(previous => ({ cursor: "", nonce: previous.nonce + 1 })); }}>Recargar interacciones</Button></div>}
    {!archived && <Card><h3 className="mb-4 font-semibold">{editing ? "Editar interacción" : "Registrar actividad comercial"}</h3><InteractionForm key={editing ? editing.id + ":" + editing.version : formKey} timezone={timezone} item={editing} busy={busy} save={save} />{editing && <Button className="mt-3" onClick={() => setEditing(undefined)}>Cancelar edición</Button>}</Card>}
    {!page && !error && <p role="status">Cargando interacciones…</p>}{page?.items.length === 0 && <p>No hay interacciones registradas.</p>}
    {page?.items.map(item => <Card key={item.id}><article><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{kinds[item.kind]}</h3><span className="text-sm text-[var(--text-secondary)]">{displayInstant(item.occurredAt, timezone)}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm">{item.body}</p><p className="my-3 text-xs text-[var(--text-secondary)]">Autor: {item.authorName ?? "Miembro"} · Versión {item.version}</p>{!archived && <Button size="sm" disabled={busy} onClick={() => setEditing(item)}>Editar interacción</Button>}</article></Card>)}
    {page?.nextCursor && <Button onClick={() => setQuery(previous => ({ cursor: page.nextCursor!, nonce: previous.nonce + 1 }))}>Más interacciones</Button>}{query.cursor && <Button onClick={() => setQuery(previous => ({ cursor: "", nonce: previous.nonce + 1 }))}>Inicio de interacciones</Button>}
  </section>;
}
