import { describe, expect, it } from "vitest";
import { loadEnvironment } from "../../src/shared/config/environment";

describe("server configuration", () => {
  it("uses the documented non-secret default", () => {
    expect(loadEnvironment({})).toEqual({ LOG_LEVEL: "info" });
  });
  it.each(["info", "warn", "error"])("accepts supported log level %s", (LOG_LEVEL) => {
    expect(loadEnvironment({ LOG_LEVEL })).toEqual({ LOG_LEVEL });
  });
  it("ignores unrelated process variables instead of returning secrets", () => {
    expect(loadEnvironment({ PRIVATE_TOKEN: "sensitive-fixture" })).toEqual({ LOG_LEVEL: "info" });
  });
  it("rejects invalid values without disclosing their contents", () => {
    expect(() => loadEnvironment({ LOG_LEVEL: "sensitive-fixture" })).toThrow("Invalid environment configuration: LOG_LEVEL");
    try { loadEnvironment({ LOG_LEVEL: "sensitive-fixture" }); } catch (error) {
      expect(String(error)).not.toContain("sensitive-fixture");
    }
  });
  it("rejects an explicitly empty value", () => {
    expect(() => loadEnvironment({ LOG_LEVEL: "" })).toThrow(/LOG_LEVEL/);
  });
});
