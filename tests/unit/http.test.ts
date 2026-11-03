import { expect, it } from "vitest";
import { internalErrorResponse } from "../../src/shared/errors/http-error";
import { getHealth } from "../../src/modules/platform/application/health";

it("returns only the public liveness contract", () => {
  expect(getHealth()).toEqual({ status: "ok", service: "leadflow-ai" });
});
it("returns a safe correlated error with no caching", async () => {
  const response = internalErrorResponse("test-request");
  expect(response.status).toBe(500);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Request-Id")).toBe("test-request");
  expect(await response.json()).toEqual({ code: "INTERNAL_ERROR", message: "No pudimos completar la solicitud.", requestId: "test-request" });
});
