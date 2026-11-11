import { requireSession } from "@/modules/identity/current-session";
import { CreateOrganizationForm } from "@/modules/organizations/create-form";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function CreateOrganizationPage() {
  await requireSession();
  return <Card><h1 className="text-2xl font-semibold">Crea tu organización</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">Tendrás el rol de propietario. El servidor registra tu membresía al crearla.</p><CreateOrganizationForm /></Card>;
}
