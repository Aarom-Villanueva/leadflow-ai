import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button, ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { StatePreviewSwitcher } from "@/app/design/_lib/state-preview";

const VIEW_OPTIONS = [
  { value: "default", label: "Normal" },
  { value: "carga", label: "Cargando" },
  { value: "enviado", label: "Enviado" },
];

export default async function RecoverPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  if (vista === "enviado") {
    return (
      <Card>
        <StatePreviewSwitcher basePath="/design/access/recuperar" current={vista} options={VIEW_OPTIONS} />
        <h1 className="text-[1.5rem] font-semibold tracking-tight">Revisa tu correo</h1>
        <div className="mt-4">
          <Banner tone="success" title="Si el correo existe en nuestro sistema, enviamos instrucciones">
            El mismo mensaje se muestra exista o no una cuenta con ese correo, para no revelar qué cuentas están
            registradas.
          </Banner>
        </div>
        <div className="mt-6">
          <ButtonLink href="/design/access/iniciar-sesion" variant="secondary" className="w-full">
            Volver a iniciar sesión
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <StatePreviewSwitcher basePath="/design/access/recuperar" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.5rem] font-semibold tracking-tight">Recupera tu acceso</h1>
      <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">Te enviaremos instrucciones a tu correo.</p>

      <div className="mt-5 flex flex-col gap-4" aria-busy={vista === "carga"}>
        <Field id="email" label="Correo" required>
          {(describedBy) => <Input id="email" type="email" autoComplete="email" required aria-describedby={describedBy} disabled={vista === "carga"} />}
        </Field>
        {vista === "carga" ? (
          <Button variant="primary" disabled className="w-full">
            Enviando…
          </Button>
        ) : (
          <ButtonLink href="/design/access/recuperar?vista=enviado" variant="primary" className="w-full">
            Enviar instrucciones
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
