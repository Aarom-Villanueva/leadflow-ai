import { expect, test } from "vitest";
import { classifyAttempt } from "../../../src/modules/organizations/admin-attempt";
const id = "12345678-1234-4234-8234-123456789abc", receipt = { requestId: id, operation: "revoke", result: { id, version: 2 } };
test("a 2xx with the receipt of that same request confirms; a foreign or malformed receipt does not", () => {
  expect(classifyAttempt(id, false, 200, receipt)).toBe("confirmed"); expect(classifyAttempt(id, true, 200, receipt)).toBe("confirmed");
  for (const body of [{ ...receipt, requestId: "other" }, { ...receipt, operation: 1 }, { requestId: id, operation: "x" }, { ...receipt, result: null }, null, undefined, [], "ok"]) expect(classifyAttempt(id, true, 200, body)).toBe("uncertain");
});
test("without a usable response the result is unknown, never a confirmed failure", () => {
  expect(classifyAttempt(id, false, undefined, undefined)).toBe("uncertain");
  for (const status of [500, 502, 503, 504, 301]) expect(classifyAttempt(id, false, status, { code: "X" })).toBe("uncertain");
  expect(classifyAttempt(id, false, 409, undefined)).toBe("uncertain"); expect(classifyAttempt(id, false, 404, "<html>")).toBe("uncertain");
});
test("a readable 4xx on the first send is a confirmed rejection", () => {
  for (const [status, code] of [[403, "FORBIDDEN"], [404, "NOT_FOUND"], [409, "VERSION_CONFLICT"], [422, "INVALID_INPUT"], [429, "RATE_LIMITED"]] as const) expect(classifyAttempt(id, false, status, { code })).toBe("rejected");
});
test("only a version conflict resolves a retry; every other rejection of a retry stays uncertain", () => {
  expect(classifyAttempt(id, true, 409, { code: "VERSION_CONFLICT" })).toBe("rejected");
  for (const [status, code] of [[409, "INVALID_STATE"], [409, "SELF_CHANGE"], [409, "LAST_OWNER"], [409, "IDEMPOTENCY_CONFLICT"], [409, "CONFLICT"], [403, "FORBIDDEN"], [404, "NOT_FOUND"], [422, "INVALID_INPUT"], [429, "RATE_LIMITED"], [500, "VERSION_CONFLICT"]] as const) expect(classifyAttempt(id, true, status, { code })).toBe("uncertain");
  expect(classifyAttempt(id, true, 409, {})).toBe("uncertain"); expect(classifyAttempt(id, true, 409, undefined)).toBe("uncertain");
});
