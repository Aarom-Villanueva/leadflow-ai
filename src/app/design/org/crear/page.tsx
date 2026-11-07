import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { StatePreviewSwitcher } from "@/app/design/_lib/state-preview";
import { CreateOrgForm } from "@/app/design/org/crear/_components/create-org-form";

const VIEW_OPTIONS = [
  { value: "default", label: "Normal" },
  { value: "validacion", label: "Validación" },
  { value: "error", label: "Error" },
  { value: "carga", label: "Cargando" },
];

export default async function CreateOrgPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  return (
    <div>
      <StatePreviewSwitcher basePath="/design/org/crear" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Crea una organización</h1>
      <p className="mt-2 max-w-md text-[0.9375rem] text-[var(--text-secondary)]">
        Se te asigna como propietario automáticamente. Puedes invitar a tu equipo después.
      </p>

      {vista === "error" ? (
        <div className="mt-5">
          <Banner tone="danger" title="No pudimos crear la organización">
            Ocurrió un problema inesperado. Inténtalo de nuevo en unos minutos.
          </Banner>
        </div>
      ) : null}

      <Card className="mt-6 max-w-md">
        <CreateOrgForm vista={vista} />
      </Card>
    </div>
  );
}
