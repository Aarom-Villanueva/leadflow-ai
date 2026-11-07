import Link from "next/link";
import { Card } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Banner } from "@/components/ui/banner";
import { StatePreviewSwitcher } from "@/app/design/_lib/state-preview";
import { SYNTHETIC_ORGANIZATIONS } from "@/app/design/_data/fixtures";

const VIEW_OPTIONS = [
  { value: "default", label: "Normal" },
  { value: "carga", label: "Cargando" },
  { value: "error", label: "Error" },
  { value: "vacio", label: "Vacío (sin organizaciones)" },
];

export default async function SelectOrgPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista = "default" } = await searchParams;

  return (
    <div>
      <StatePreviewSwitcher basePath="/design/org/seleccionar" current={vista} options={VIEW_OPTIONS} />
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Elige una organización</h1>
      <p className="mt-2 text-[0.9375rem] text-[var(--text-secondary)]">
        Perteneces a {SYNTHETIC_ORGANIZATIONS.length} organizaciones sintéticas de ejemplo.
      </p>

      <div className="mt-6">
        {vista === "carga" ? (
          <SkeletonRows rows={3} />
        ) : vista === "error" ? (
          <Banner tone="danger" title="No pudimos cargar tus organizaciones" action={<Button size="sm" variant="secondary">Reintentar</Button>}>
            Ocurrió un problema al obtener la lista. Inténtalo de nuevo.
          </Banner>
        ) : vista === "vacio" ? (
          <EmptyState
            title="Aún no perteneces a ninguna organización"
            description="Crea tu primera organización para empezar a registrar prospectos."
            action={
              <ButtonLink href="/design/org/crear" variant="primary">
                Crear organización
              </ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {SYNTHETIC_ORGANIZATIONS.map((org) => (
              <Card key={org.id} className="flex flex-col gap-3">
                <div>
                  <h2 className="font-semibold text-[var(--text-primary)]">{org.name}</h2>
                  <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{org.timezone}</p>
                </div>
                <div>
                  <RoleBadge role={org.currentMemberRole} />
                </div>
                <ButtonLink href="/design/app/leads" variant="secondary" className="mt-1">
                  Entrar
                </ButtonLink>
              </Card>
            ))}
          </div>
        )}
      </div>

      {vista === "default" ? (
        <p className="mt-6 text-[0.8125rem] text-[var(--text-secondary)]">
          <Link href="/design/org/crear" className="font-medium text-[var(--accent)] underline-offset-4 hover:underline">
            Crear una organización nueva
          </Link>
        </p>
      ) : null}
    </div>
  );
}
