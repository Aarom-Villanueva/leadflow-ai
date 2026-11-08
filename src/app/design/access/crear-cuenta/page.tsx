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

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  return (
    <Card>
      <StatePreviewSwitcher basePath="/design/access/crear-cuenta" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.5rem] font-semibold tracking-tight">Crea tu cuenta</h1>
      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">Empieza a organizar tus prospectos.</p>

      {vista === "error" ? (
        <div className="mt-5">
          <Banner tone="danger" title="No pudimos crear tu cuenta">
            Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.
          </Banner>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-4" aria-busy={vista === "carga"}>
        <Field id="name" label="Nombre" required>
          {(describedBy) => <Input id="name" type="text" autoComplete="name" required aria-describedby={describedBy} disabled={vista === "carga"} />}
        </Field>
        <Field id="email" label="Correo" required error={vista === "validacion" ? "Escribe un correo con formato válido." : undefined}>
          {(describedBy) => (
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={vista === "validacion" || undefined}
              aria-describedby={describedBy}
              disabled={vista === "carga"}
            />
          )}
        </Field>
        <Field
          id="password"
          label="Contraseña"
          required
          hint="Mínimo 8 caracteres."
          error={vista === "validacion" ? "La contraseña debe tener al menos 8 caracteres." : undefined}
        >
          {(describedBy) => (
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={vista === "validacion" || undefined}
              aria-describedby={describedBy}
              disabled={vista === "carga"}
            />
          )}
        </Field>
        {vista === "carga" ? (
          <Button variant="primary" disabled className="w-full">
            Creando cuenta…
          </Button>
        ) : (
          <ButtonLink href="/design/app/leads" variant="primary" className="w-full">
            Crear cuenta
          </ButtonLink>
        )}
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        ¿Ya tienes cuenta?{" "}
        <Link href="/design/access/iniciar-sesion" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
