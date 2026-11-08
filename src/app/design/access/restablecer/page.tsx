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
  { value: "invalido", label: "Enlace vencido" },
  { value: "carga", label: "Cargando" },
];

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  if (vista === "invalido") {
    return (
      <Card>
        <StatePreviewSwitcher basePath="/design/access/restablecer" current={vista} options={VIEW_OPTIONS} />
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Enlace vencido</h1>
        <div className="mt-4">
          <Banner tone="danger" title="Este enlace ya no es válido">
            Los enlaces de restablecimiento expiran por seguridad. Solicita uno nuevo.
          </Banner>
        </div>
        <div className="mt-6">
          <ButtonLink href="/design/access/recuperar" variant="primary" className="w-full">
            Solicitar un enlace nuevo
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <StatePreviewSwitcher basePath="/design/access/restablecer" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.5rem] font-semibold tracking-tight">Elige una nueva contraseña</h1>

      <div className="mt-5 flex flex-col gap-4" aria-busy={vista === "carga"}>
        <Field
          id="password"
          label="Nueva contraseña"
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
        <Field
          id="password-confirm"
          label="Confirma la contraseña"
          required
          error={vista === "validacion" ? "Las contraseñas no coinciden." : undefined}
        >
          {(describedBy) => (
            <Input
              id="password-confirm"
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
            Guardando…
          </Button>
        ) : (
          <ButtonLink href="/design/access/iniciar-sesion" variant="primary" className="w-full">
            Guardar contraseña
          </ButtonLink>
        )}
      </div>

      <p className="mt-6 text-center text-[0.8125rem] text-[var(--text-secondary)]">
        <Link href="/design/access/iniciar-sesion" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </Card>
  );
}
