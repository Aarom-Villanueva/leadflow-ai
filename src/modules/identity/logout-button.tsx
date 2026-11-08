"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function logout() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/login"); router.refresh();
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <div><Button type="button" size="sm" onClick={logout} disabled={busy}>{busy ? "Cerrando…" : "Cerrar sesión"}</Button>{error && <p role="alert" className="text-sm text-[var(--danger)]">No se pudo cerrar la sesión. Reintenta.</p>}</div>;
}
