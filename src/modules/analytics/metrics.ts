/** Funciones puras de las métricas R08 (docs/specs/LF-028.md): sin React, reloj ni zona ambiental. */
export const INTERVAL_DAYS = [30, 90, 180] as const;
export type IntervalDays = (typeof INTERVAL_DAYS)[number];
export const NO_DATA = "Sin datos";

/** Denominador cero no es 0 %: devuelve null y la pantalla lo presenta como «Sin datos». */
export function conversionRate(won: number, created: number): number | null {
  if (!Number.isInteger(won) || !Number.isInteger(created) || won < 0 || created < 0 || won > created) throw new RangeError("Invalid conversion counts");
  return created === 0 ? null : won / created;
}

/** Porcentaje con un decimal; nunca redondea un valor distinto de cero a «0 %» ni uno incompleto a «100 %». */
export function formatRate(rate: number | null): string {
  if (rate === null) return NO_DATA;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError("Invalid rate");
  const tenths = Math.round(rate * 1000);
  if (tenths === 0 && rate > 0) return "<0,1 %";
  if (tenths === 1000 && rate < 1) return ">99,9 %";
  return `${String(tenths / 10).replace(".", ",")} %`;
}

/** Ancho entero de barra (0..100) para una proporción; solo decorativo, el dato real va en texto. */
export function barPercent(count: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((count / total) * 100))) : 0;
}

/** «YYYY-MM» (mes local de la organización, calculado en PostgreSQL) → «noviembre de 2026», sin depender de la zona del navegador. */
export function cohortLabel(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new RangeError("Invalid cohort month");
  return new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
