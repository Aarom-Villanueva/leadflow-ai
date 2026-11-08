import { afterEach, describe, expect, test } from "vitest";
import { monthCohort } from "../../../src/app/design/app/dashboard/_lib/cohort";

/**
 * Regresión del hallazgo real reportado sobre el candidato 9a146f7 (PR #20):
 * monthCohort() llamaba a toLocaleDateString sin `timeZone`, así que el mes
 * de la cohorte dependía de la zona horaria ambiental del proceso/navegador,
 * aunque el dashboard anuncia explícitamente SYNTHETIC_ORG.timezone. Estas
 * pruebas ejercitan la función real exportada (no una copia), con el
 * instante exacto reportado y variando la zona ambiental del propio proceso
 * (`process.env.TZ`) para demostrar que, con la corrección, el resultado
 * depende únicamente del parámetro `timeZone` explícito, nunca del entorno.
 */
const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

// Instante exacto del reporte: 2026-11-01T02:00:00Z.
const REPORTED_INSTANT = "2026-11-01T02:00:00Z";

describe("monthCohort — caso reproducido del reporte", () => {
  test("America/Bogota (UTC-5) ubica el instante en octubre de 2026, nunca noviembre", () => {
    const result = monthCohort(REPORTED_INSTANT, "America/Bogota");
    expect(result).toContain("oct");
    expect(result).toContain("2026");
    expect(result).not.toContain("nov");
  });

  test("UTC ubica el mismo instante en noviembre de 2026 — confirma que la zona sí importa", () => {
    const result = monthCohort(REPORTED_INSTANT, "UTC");
    expect(result).toContain("nov");
    expect(result).toContain("2026");
  });
});

describe("monthCohort — independencia real de la zona horaria ambiental del proceso", () => {
  const AMBIENT_ZONES = ["UTC", "America/Bogota", "Asia/Tokyo"];

  test("con America/Bogota explícita, el resultado es idéntico sin importar process.env.TZ", () => {
    const results = AMBIENT_ZONES.map((ambientZone) => {
      process.env.TZ = ambientZone;
      return monthCohort(REPORTED_INSTANT, "America/Bogota");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toContain("oct");
  });

  test("con UTC explícita, el resultado es idéntico sin importar process.env.TZ", () => {
    const results = AMBIENT_ZONES.map((ambientZone) => {
      process.env.TZ = ambientZone;
      return monthCohort(REPORTED_INSTANT, "UTC");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toContain("nov");
  });

  test("control: sin zona explícita, toLocaleDateString sí cambia con process.env.TZ — por eso la función nunca debe omitir timeZone", () => {
    const date = new Date(REPORTED_INSTANT);
    const results = AMBIENT_ZONES.map((ambientZone) => {
      process.env.TZ = ambientZone;
      return date.toLocaleDateString("es-CO", { month: "short", year: "numeric" });
    });
    expect(new Set(results).size).toBeGreaterThan(1);
  });
});

describe("monthCohort — otro instante cercano a un cambio de mes, mismo patrón", () => {
  // 2026-03-01T03:30:00Z: en America/Bogota (UTC-5) sigue siendo 28/29 de
  // febrero; en UTC ya es marzo.
  const INSTANT_NEAR_MARCH = "2026-03-01T03:30:00Z";

  test("America/Bogota mantiene el instante en febrero; UTC ya lo ubica en marzo", () => {
    const bogota = monthCohort(INSTANT_NEAR_MARCH, "America/Bogota");
    const utc = monthCohort(INSTANT_NEAR_MARCH, "UTC");
    expect(bogota).toContain("feb");
    expect(utc).toContain("mar");
    expect(bogota).not.toBe(utc);
  });
});
