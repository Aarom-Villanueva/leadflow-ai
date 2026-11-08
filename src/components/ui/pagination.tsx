import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Paginación de resultados" className="flex items-center justify-between gap-3 pt-4">
      <p className="text-[0.8125rem] text-[var(--text-secondary)]" aria-live="polite">
        Página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  );
}
