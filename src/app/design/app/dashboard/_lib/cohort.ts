/**
 * Agrupador de cohorte mensual para el dashboard (docs/specs/LF-003.md §2.1,
 * R08). Módulo puro, sin React ni dependencias de framework, para poder
 * probarlo directamente con instantes y zonas horarias deterministas
 * (tests/unit/design/cohort.test.ts).
 *
 * Corrección real (PR #20, candidato 9a146f7): la versión anterior llamaba a
 * `toLocaleDateString` sin `timeZone`, así que el mes de la cohorte dependía
 * de la zona horaria del navegador/sistema que ejecuta el código — mientras
 * la pantalla anuncia explícitamente la zona de la organización
 * (`SYNTHETIC_ORG.timezone`). Un mismo prospecto podía caer en cohortes
 * distintas según quién lo mirara. Esta función exige la zona como parámetro
 * explícito y la pasa siempre a `Intl`/`toLocaleDateString`, nunca confía en
 * el reloj/zona ambiental del proceso.
 */
export function monthCohort(iso: string, timeZone: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("es-CO", { month: "short", year: "numeric", timeZone });
}
