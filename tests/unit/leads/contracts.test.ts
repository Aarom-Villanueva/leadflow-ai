import { describe, expect, test } from "vitest";
import { createLeadInput, updateLeadInput, createStageInput, listInput } from "../../../src/modules/leads/contracts";
const lead = { name: "Persona sintética", email: null, phoneE164: null, source: null, stageId: "11111111-1111-4111-8111-111111111111", assignedUserId: null };
describe("commercial HTTP contracts", () => {
  test("normalizes surrounding name whitespace without inventing contact information", () => {
    expect(createLeadInput.parse({ ...lead, name: "  Prospecto  " })).toEqual({ ...lead, name: "Prospecto" });
  });
  test.each(["role", "organizationId", "actor", "version", "archivedAt"])("rejects client-controlled authority: %s", field => {
    expect(createLeadInput.safeParse({ ...lead, [field]: "forged" }).success).toBe(false);
  });
  test.each(["912345678", "+012345678", "+51 912345678", "abc"])("never guesses a country or accepts malformed phone %s", phoneE164 => {
    expect(createLeadInput.safeParse({ ...lead, phoneE164 }).success).toBe(false);
  });
  test("partial edits need a version and at least one editable field", () => {
    for (const input of [{ name: "Missing version" }, { version: 0, name: "Zero" }, { version: 1 }, { version: 1, stageId: "not-a-uuid" }]) expect(updateLeadInput.safeParse(input).success).toBe(false);
    expect(updateLeadInput.parse({ version: 2, email: null })).toEqual({ version: 2, email: null });
  });
  test("bounded filtering and stage kinds reject unknown values", () => {
    for (const input of [{ limit: 51 }, { limit: -1 }, { sort: "sql" }, { archived: "anything" }, { q: "x".repeat(101) }, { cursor: "x".repeat(2049) }]) expect(listInput.safeParse(input).success).toBe(false);
    expect(createStageInput.safeParse({ name: "", kind: "open" }).success).toBe(false);
    expect(createStageInput.safeParse({ name: "Name", kind: "anything" }).success).toBe(false);
  });
});
