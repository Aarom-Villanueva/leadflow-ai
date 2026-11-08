import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { StatePreviewSwitcher } from "@/app/design/_lib/state-preview";

const VIEW_OPTIONS = [
  { value: "default", label: "Normal" },
  { value: "validacion", label: "Validación" },
  { value: "error", label: "Error" },
  { value: "carga", label: "Cargando" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  return (
    <Card>
      <StatePreviewSwitcher basePath="/design/access/iniciar-sesion" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.5rem] font-semibold tracking-tight">Inicia sesión</h1>
      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">Entra con tu correo y contraseña.</p>

      {vista === "error" ? (
        <div className="mt-5">
          <Banner tone="danger" title="No pudimos iniciar tu sesión">
            Revisa tu correo y contraseña e inténtalo de nuevo.
          </Banner>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-4" aria-busy={vista === "carga"}>
        <Field id="email" label="Correo" required error={vista === "validacion" ? "Escribe un correo con formato válido." : undefined}>
          {(describedBy) => (
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={vista === "validacion" || undefined}
              aria-describedby={describedBy}
              defaultValue={vista === "validacion" ? "correo-sin-formato" : undefined}
              disabled={vista === "carga"}
            />
          )}
        </Field>
        <Field id="password" label="Contraseña" required>
          {(describedBy) => (
            <Input id="password" type="password" autoComplete="current-password" required aria-describedby={describedBy} disabled={vista === "carga"} />
          )}
        </Field>
        <div className="flex justify-end">
          <Link
            href="/design/access/recuperar"
            className="text-[0.8125rem] text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        {vista === "carga" ? (
          <Button variant="primary" disabled className="w-full">
            Iniciando sesión…
          </Button>
        ) : (
          <ButtonLink href="/design/app/leads" variant="primary" className="w-full">
            Iniciar sesión
          </ButtonLink>
        )}
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        ¿No tienes cuenta?{" "}
        <Link href="/design/access/crear-cuenta" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
          Crear cuenta
        </Link>
      </p>
    </Card>
  );
}
