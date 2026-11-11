"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";

export function AccessForm({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch(register ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email")).trim().toLowerCase(), password: form.get("password"), ...(register ? { name: String(form.get("name")).trim() } : {}) }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Demasiados intentos. Espera un minuto." : response.status === 503 ? "El acceso no está disponible temporalmente. Revisa la configuración local." : register ? "No pudimos crear la cuenta. Revisa los datos o inicia sesión si ya tienes una." : "No pudimos iniciar tu sesión. Revisa tu correo y contraseña.");
        return;
      }
      router.replace("/organizations"); router.refresh();
    } catch { setError("No pudimos conectar. Inténtalo de nuevo."); }
    finally { setBusy(false); }
  }
  return <Card>
    <h1 className="text-2xl font-semibold">{register ? "Crea tu cuenta" : "Inicia sesión"}</h1>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">{register ? "Tu equipo empieza contigo." : "Entra a tu espacio de trabajo."}</p>
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4" aria-busy={busy}>
      {register && <Field id="name" label="Nombre completo" required>{id => <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} aria-describedby={id} disabled={busy} />}</Field>}
      <Field id="email" label="Correo" required>{id => <Input id="email" name="email" type="email" autoComplete="email" required maxLength={254} aria-describedby={id} disabled={busy} />}</Field>
      <Field id="password" label="Contraseña" required hint={register ? "Entre 12 y 128 caracteres." : undefined}>{id => <Input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : undefined} maxLength={128} aria-describedby={id} disabled={busy} />}</Field>
      {error && <Banner tone="danger" title={error} />}
      <Button type="submit" variant="primary" disabled={busy}>{busy ? "Procesando…" : register ? "Crear cuenta" : "Iniciar sesión"}</Button>
    </form>
    <p className="mt-5 text-center text-sm"><Link className="text-[var(--accent)] underline" href={register ? "/login" : "/register"}>{register ? "Ya tengo una cuenta" : "Crear una cuenta"}</Link></p>
    <p className="mt-5 text-xs text-[var(--text-tertiary)]">Acceso en desarrollo local. La verificación y recuperación por correo todavía no están habilitadas.</p>
  </Card>;
}
