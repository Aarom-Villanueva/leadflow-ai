"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";

export function CreateOrganizationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), slug: form.get("slug"), timezone: form.get("timezone") }) });
      if (!response.ok) { setError(response.status === 409 ? "Ese identificador ya está en uso. Elige otro." : response.status === 401 ? "Tu sesión terminó. Vuelve a iniciar sesión." : "No pudimos crear la organización. Revisa los datos e inténtalo de nuevo."); return; }
      const result: { id: string } = await response.json();
      router.replace(`/app/${result.id}`); router.refresh();
    } catch { setError("No pudimos conectar. Inténtalo de nuevo."); } finally { setBusy(false); }
  }
  return <form className="mt-6 flex flex-col gap-4" onSubmit={submit} aria-busy={busy}>
    <Field id="org-name" label="Nombre de la organización" required>{id => <Input id="org-name" name="name" required minLength={2} maxLength={100} aria-describedby={id} disabled={busy} />}</Field>
    <Field id="org-slug" label="Identificador" required hint="De 3 a 60 caracteres: minúsculas, números y guiones entre palabras.">{id => <Input id="org-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} aria-describedby={id} disabled={busy} />}</Field>
    <Field id="org-timezone" label="Zona horaria" required>{id => <Select id="org-timezone" name="timezone" defaultValue="America/Lima" aria-describedby={id} disabled={busy}><option value="America/Lima">Lima</option><option value="America/Bogota">Bogotá</option><option value="America/Mexico_City">Ciudad de México</option><option value="Europe/Madrid">Madrid</option><option value="UTC">UTC</option></Select>}</Field>
    {error && <Banner tone="danger" title={error} />}<Button variant="primary" type="submit" disabled={busy}>{busy ? "Creando…" : "Crear organización"}</Button>
  </form>;
}
