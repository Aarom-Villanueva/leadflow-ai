"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";
import { Dialog } from "@/components/ui/dialog";
import { classifyAttempt } from "./admin-attempt";
import type { AdminAudit, AdminInfo, AdminMember, AdminPage } from "./admin-contracts";
type Attempt = { path: string; method: string; body: Record<string, unknown>; label: string };
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw Error(response.status === 403 ? "No tienes permiso para administrar esta organización." : response.status === 404 ? "Ya no tienes acceso a esta organización." : "No pudimos cargar los datos. Recarga para continuar.");
  return response.json();
}
export function AdministrationClient({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const root = `/api/organizations/${organizationId}`, generation = useRef(0), sending = useRef(false), trigger = useRef<HTMLElement | null>(null);
  const [info, setInfo] = useState<AdminInfo>(), [members, setMembers] = useState<AdminPage<AdminMember>>(), [audit, setAudit] = useState<AdminPage<AdminAudit>>();
  const [name, setName] = useState(""), [timezone, setTimezone] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState<Attempt>(), [pending, setPending] = useState<Attempt>(), [mode, setMode] = useState<"idle" | "sending" | "uncertain">("idle");
  const focusStatus = () => requestAnimationFrame(() => document.getElementById("administration-status")?.focus());
  const load = useCallback(async () => {
    const token = ++generation.current; setLoading(true);
    try {
      const [i, m, a] = await Promise.all([read<AdminInfo>(root + "/administration"), read<AdminPage<AdminMember>>(root + "/members"), read<AdminPage<AdminAudit>>(root + "/administration/audit")]);
      if (token !== generation.current) return;
      setInfo(i); setMembers(m); setAudit(a); setName(i.organization.name); setTimezone(i.organization.timezone); setError("");
    } catch (e) { if (token === generation.current) setError((e as Error).message); }
    finally { if (token === generation.current) setLoading(false); }
  }, [root]);
  useEffect(() => { let active = true; const counter = generation; queueMicrotask(() => { if (active) void load(); }); return () => { active = false; counter.current++; }; }, [load]);
  async function more(kind: "members" | "audit") {
    const page = kind === "members" ? members : audit; if (!page?.nextCursor) return;
    const token = ++generation.current; setLoading(true);
    try {
      if (kind === "members") { const next = await read<AdminPage<AdminMember>>(root + "/members?cursor=" + encodeURIComponent(page.nextCursor)); if (token === generation.current) setMembers(current => ({ items: [...(current?.items ?? []), ...next.items], nextCursor: next.nextCursor })); }
      else { const next = await read<AdminPage<AdminAudit>>(root + "/administration/audit?cursor=" + encodeURIComponent(page.nextCursor)); if (token === generation.current) setAudit(current => ({ items: [...(current?.items ?? []), ...next.items], nextCursor: next.nextCursor })); }
    } catch (e) { if (token === generation.current) setError((e as Error).message); }
    finally { if (token === generation.current) setLoading(false); }
  }
  async function execute(attempt: Attempt, retry = false) {
    if (sending.current) return; sending.current = true;
    ++generation.current; setLoading(false); setConfirmation(undefined); setPending(attempt); setMode("sending"); setNotice("");
    try {
    let status: number | undefined, body: unknown;
    try { const response = await fetch(attempt.path, { method: attempt.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.body) }); status = response.status; body = await response.json().catch(() => undefined); } catch { status = undefined; }
    const outcome = classifyAttempt(String(attempt.body.requestId), retry, status, body);
    if (outcome === "confirmed") { setMode("idle"); setPending(undefined); setNotice(`${attempt.label}: cambio confirmado.`); await load(); router.refresh(); }
    else if (outcome === "rejected") { setMode("idle"); setPending(undefined); setError(retry ? "El cambio pendiente no se aplicó porque los datos cambiaron. Recarga los datos antes de volver a intentarlo." : (body as { message?: string }).message ?? "Cambio rechazado. Recarga los datos antes de volver a intentarlo."); }
    else { setMode("uncertain"); setNotice("Resultado no confirmado. El cambio puede haberse guardado. Reintenta el mismo intento para comprobarlo; no inicies otro cambio."); }
    } finally { sending.current = false; focusStatus(); }
  }
  const disabled = loading || !!error || mode !== "idle";
  const prepare = (path: string, body: Record<string, unknown>, label: string, method = "PATCH") => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setConfirmation({ path: root + path, method, body: { ...body, requestId: crypto.randomUUID() }, label }); };
  const closeConfirmation = () => { setConfirmation(undefined); requestAnimationFrame(() => trigger.current?.focus()); };
  return <div className="space-y-8"><p className="text-sm text-[var(--text-secondary)]">Los intentos sin confirmar se conservan solo mientras esta pantalla permanezca abierta. Antes de cerrar o recargar el navegador, comprueba el equipo y la auditoría.</p>
    <div id="administration-status" tabIndex={-1} className="space-y-3 outline-none">
      {error && <Banner tone="danger" title={error}>Los datos anteriores pueden estar desactualizados. Las acciones quedan bloqueadas hasta recargar.</Banner>}
      {notice && <Banner tone={mode === "uncertain" ? "warning" : "success"} title={notice} />}
      {mode === "sending" && <p role="status">Confirmando cambio…</p>}
      {mode === "uncertain" && pending && <Button onClick={() => void execute(pending, true)}>Reintentar el mismo intento</Button>}
      <Button disabled={loading || mode === "sending"} onClick={() => void load()}>Recargar datos</Button>
      {loading && <p role="status">Cargando administración…</p>}
    </div>
    {info && <>
      <section aria-labelledby="profile-title" className="space-y-4 rounded-xl border border-[var(--border)] p-5">
        <h2 id="profile-title" className="text-lg font-semibold">Perfil de la organización</h2>
        <p className="break-words text-sm">Identificador: {info.organization.slug} · Versión {info.organization.version}</p>
        <form className="max-w-xl space-y-4" onSubmit={event => { event.preventDefault(); prepare("/administration", { name, timezone, version: info.organization.version }, "Perfil actualizado"); }}>
          <label className="block">Nombre<Input required minLength={2} maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={disabled} /></label>
          <label className="block">Zona horaria<Input required maxLength={80} value={timezone} onChange={e => setTimezone(e.target.value)} disabled={disabled} /></label>
          <Button type="submit" disabled={disabled}>Guardar perfil</Button>
        </form>
      </section>
      <section aria-labelledby="members-title" className="space-y-4">
        <h2 id="members-title" className="text-lg font-semibold">Miembros del equipo</h2>
        <p className="text-sm text-[var(--text-secondary)]">Gestiona miembros existentes. Las invitaciones y el alta de nuevos miembros quedan pendientes.</p>
        <ul className="grid gap-4 lg:grid-cols-2">{members?.items.map(member => {
          const self = member.id === info.actorMembershipId, owner = info.organization.role === "owner", editable = !self && (owner || member.role !== "owner");
          return <li key={member.id} className="min-w-0 space-y-3 rounded-xl border border-[var(--border)] p-5" aria-label={`Miembro ${member.name}`}>
            <h3 className="font-semibold break-words">{member.name}{self ? " (tú)" : ""}</h3><p className="break-all text-sm">{member.email}</p>
            <p>{member.role} · {member.revokedAt ? "Acceso revocado" : "Activo"} · Versión {member.version}</p>
            {editable && <div className="flex flex-wrap gap-2">
              {!member.revokedAt && <form className="flex min-w-0 flex-wrap gap-2" onSubmit={event => { event.preventDefault(); const role = new FormData(event.currentTarget).get("role"); prepare(`/members/${member.id}`, { action: "set-role", role, version: member.version }, `Cambiar rol de ${member.name}`); }}>
                <Select key={`${member.id}:${member.version}`} name="role" aria-label={`Rol de ${member.name}`} defaultValue={member.role} disabled={disabled} className="!w-auto"><option value="sales">sales</option><option value="admin">admin</option>{owner && <option value="owner">owner</option>}</Select>
                <Button type="submit" disabled={disabled}>Cambiar rol</Button>
              </form>}
              <Button disabled={disabled} variant={member.revokedAt ? "secondary" : "danger"} onClick={() => prepare(`/members/${member.id}`, { action: member.revokedAt ? "restore" : "revoke", version: member.version }, `${member.revokedAt ? "Restaurar" : "Revocar"} acceso de ${member.name}`)}>{member.revokedAt ? "Restaurar acceso" : "Revocar acceso"}</Button>
              {owner && !member.revokedAt && <Button disabled={disabled} onClick={() => prepare("/ownership", { actorVersion: info.actorVersion, targetMembershipId: member.id, targetVersion: member.version }, `Transferir propiedad a ${member.name}`, "POST")}>Transferir propiedad</Button>}
            </div>}
          </li>;
        })}</ul>
        {members?.nextCursor && <Button disabled={loading || mode === "sending"} onClick={() => void more("members")}>Cargar más miembros</Button>}
      </section>
      <section aria-labelledby="audit-title" className="space-y-4"><h2 id="audit-title" className="text-lg font-semibold">Auditoría de la organización</h2>
        <ul className="space-y-3">{audit?.items.map(row => <li key={row.id} className="break-words rounded-xl border border-[var(--border)] p-4"><p>{({ "organization.created": "Organización creada", "organization.profile_updated": "Perfil actualizado", "membership.role_updated": "Rol de miembro actualizado", "membership.revoked": "Acceso de miembro revocado", "membership.restored": "Acceso de miembro restaurado", "ownership.transferred": "Propiedad transferida" } as Record<string, string>)[row.action] ?? "Actividad registrada"}</p><p className="text-sm">{row.actorName ?? "Miembro"} · {new Date(row.createdAt).toLocaleString("es", { timeZone: info.organization.timezone })}</p></li>)}</ul>
        {audit?.nextCursor && <Button disabled={loading || mode === "sending"} onClick={() => void more("audit")}>Cargar más auditoría</Button>}
      </section>
    </>}
    <Dialog key={String(confirmation?.body.requestId ?? "closed")} open={!!confirmation} onClose={closeConfirmation} title="Confirmar cambio" footer={<><Button onClick={closeConfirmation}>Volver</Button><Button variant="primary" onClick={() => confirmation && void execute(confirmation)}>Confirmar cambio</Button></>}>
      {confirmation?.label}. {confirmation?.path.endsWith("/ownership") ? "Tu rol pasará a admin y el destinatario tendrá propiedad. Los demás propietarios se conservan." : "El cambio afecta solo a esta organización; el historial se conserva."}
    </Dialog>
  </div>;
}
