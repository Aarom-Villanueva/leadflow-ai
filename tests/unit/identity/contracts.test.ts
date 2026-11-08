import { describe, expect, test } from "vitest";
import { hasTrustedOrigin, identityConfig } from "../../../src/modules/identity/config";
import { capabilities, organizationInput } from "../../../src/modules/organizations/service";

describe("identity configuration and origin boundary", () => {
  test("missing configuration fails without disclosing supplied values", () => {
    expect(() => identityConfig({ AUTH_SECRET: "private-value" })).toThrow("Identity is not configured");
  });
  test("accepts a local origin and rejects remote insecure HTTP or origin paths", () => {
    const input = { DATABASE_URL: "postgres://127.0.0.1/example", AUTH_SECRET: "x".repeat(32), APP_ORIGIN: "http://127.0.0.1:3000" };
    expect(identityConfig(input).origin).toBe(input.APP_ORIGIN);
    for (const APP_ORIGIN of ["http://example.invalid", "https://example.invalid/path", "https://user:pass@example.invalid"]) expect(() => identityConfig({ ...input, APP_ORIGIN })).toThrow();
  });
  test("mutation origin cannot be spoofed with a suffix or a trusted Referer alongside a hostile Origin", () => {
    const origin = "http://127.0.0.1:3000";
    expect(hasTrustedOrigin(new Headers({ origin }), origin)).toBe(true);
    expect(hasTrustedOrigin(new Headers({ referer: origin + "/organizations" }), origin)).toBe(true);
    expect(hasTrustedOrigin(new Headers(), origin)).toBe(false);
    expect(hasTrustedOrigin(new Headers({ origin: origin + ".evil.invalid", referer: origin }), origin)).toBe(false);
    expect(hasTrustedOrigin(new Headers({ origin: "null" }), origin)).toBe(false);
  });
});

describe("organization contracts", () => {
  const valid = { name: "Equipo de prueba", slug: "equipo-prueba", timezone: "America/Lima" };
  test("accepts the known contract and rejects actor/role injection or malformed input", () => {
    expect(organizationInput.safeParse(valid).success).toBe(true);
    for (const input of [{ ...valid, role: "owner" }, { ...valid, userId: "other" }, { ...valid, slug: "../other" }, { ...valid, timezone: "Unknown/Invalid" }, { ...valid, name: " " }]) expect(organizationInput.safeParse(input).success).toBe(false);
  });
  test("sales never receives administration or ownership capabilities", () => {
    expect(capabilities("sales")).toEqual({ manageMembers: false, importLeads: false, transferOwnership: false });
    expect(capabilities("admin")).toEqual({ manageMembers: true, importLeads: true, transferOwnership: false });
    expect(capabilities("owner").transferOwnership).toBe(true);
  });
});
