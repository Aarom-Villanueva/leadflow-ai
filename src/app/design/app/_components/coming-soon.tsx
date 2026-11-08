import { EmptyState } from "@/components/ui/empty-state";
import { DashboardIcon } from "@/components/ui/icons";

export function ComingSoonScreen({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
      <div className="mt-6">
        <EmptyState
          icon={<DashboardIcon className="size-8" />}
          title="Disponible en la siguiente etapa"
          description={description}
        />
      </div>
    </div>
  );
}
