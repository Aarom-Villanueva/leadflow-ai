import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
test("a malformed migration URL never prints its synthetic credential-like input", () => {
  const marker = "SYNTHETIC-REDACTION-PROBE";
  const result = spawnSync(process.execPath, ["scripts/activity/migrate.mjs"], { env: { ...process.env, IDENTITY_RUNTIME_ROLE: "lf027_test_runtime", IDENTITY_MIGRATION_URL: "postgres://user:" + marker + "@[invalid" }, encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain("Invalid local migration target");
  expect(result.stdout + result.stderr).not.toContain(marker);
});
