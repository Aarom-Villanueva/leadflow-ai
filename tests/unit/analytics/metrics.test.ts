import { describe, expect, test } from "vitest";
import { dashboardQuery } from "../../../src/modules/analytics/contracts";
import { NO_DATA, barPercent, cohortLabel, conversionRate, formatRate } from "../../../src/modules/analytics/metrics";

describe("R08 conversion rate", () => {
  test("a zero denominator is no data, never 0%", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(formatRate(conversionRate(0, 0))).toBe(NO_DATA);
    expect(conversionRate(0, 4)).toBe(0);
    expect(formatRate(conversionRate(0, 4))).toBe("0 %");
    expect(formatRate(conversionRate(0, 4))).not.toBe(formatRate(conversionRate(0, 0)));
  });
  test.each([[1, 1, "100 %"], [1, 2, "50 %"], [1, 3, "33,3 %"], [2, 3, "66,7 %"], [3, 8, "37,5 %"], [1, 2000, "0,1 %"], [1, 2001, "<0,1 %"], [1999, 2000, ">99,9 %"], [1, 1000, "0,1 %"], [999, 1000, "99,9 %"]])("%i of %i is shown as %s", (won, created, text) => {
    expect(formatRate(conversionRate(won, created))).toBe(text);
  });
  test.each([[2, 1], [-1, 3], [1, -3], [0.5, 2], [1, 2.5], [Number.NaN, 1]])("impossible counts %s/%s are rejected instead of producing a figure", (won, created) => {
    expect(() => conversionRate(won, created)).toThrow(RangeError);
  });
  test("formatting rejects values outside 0..1", () => {
    for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => formatRate(value)).toThrow(RangeError);
  });
  test("bar width is decorative, bounded and zero without a total", () => {
    expect(barPercent(0, 0)).toBe(0); expect(barPercent(1, 3)).toBe(33); expect(barPercent(3, 3)).toBe(100); expect(barPercent(5, 3)).toBe(100);
  });
});

describe("cohort labels", () => {
  test("the organization-local month computed by PostgreSQL is labelled without the ambient timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Pacific/Kiritimati", "America/Los_Angeles", "Asia/Tokyo"]) {
        process.env.TZ = tz;
        expect(cohortLabel("2026-11")).toBe("noviembre de 2026");
        expect(cohortLabel("2026-01")).toBe("enero de 2026");
        expect(cohortLabel("2025-12")).toBe("diciembre de 2025");
      }
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });
  test.each(["2026-13", "2026-00", "2026-1", "26-11", "2026-11-01", "", "noviembre"])("rejects malformed month %j", value => expect(() => cohortLabel(value)).toThrow(RangeError));
});

describe("dashboard query contract", () => {
  test("defaults to 90 days and accepts only the three documented intervals", () => {
    expect(dashboardQuery.parse({})).toEqual({ interval: "90" });
    for (const interval of ["30", "90", "180"]) expect(dashboardQuery.parse({ interval }).interval).toBe(interval);
    for (const interval of ["7", "0", "-30", "30.0", "030", " 30", "365", "all", "", "30;drop"]) expect(dashboardQuery.safeParse({ interval }).success).toBe(false);
  });
  test("the client cannot supply a cutoff, timezone, organization or any other field", () => {
    for (const extra of ["asOf", "from", "to", "timezone", "organizationId", "actor", "role"]) expect(dashboardQuery.safeParse({ interval: "30", [extra]: "x" }).success).toBe(false);
  });
});
