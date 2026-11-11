import { expect, test } from "vitest";
import { followupCreate, followupEdit, instant, interactionCreate, transitionInput } from "../../../src/modules/activity/contracts";
import { resolveWallTime, wallTime } from "../../../src/modules/activity/time";
const id = "11111111-1111-4111-8111-111111111111";
const followup = { leadId: id, creationKey: id, title: "Recordatorio", detail: null, assignedUserId: "synthetic", dueAt: "2026-11-01T10:30:00-05:00" };
test("normalizes offset instants and retains mandatory assignee and creation key", () => {
  expect(followupCreate.parse(followup).dueAt).toBe("2026-11-01T15:30:00.000Z");
  for (const input of [{ ...followup, assignedUserId: "" }, { ...followup, creationKey: undefined }, { ...followup, role: "owner" }]) expect(followupCreate.safeParse(input).success).toBe(false);
});
test.each(["2026-02-30T12:00:00Z", "2026-11-01T12:00:00", "2026-11-01T12:00:00+99:99", "1999-01-01T00:00:00Z", "2101-01-01T00:00:00Z"])("rejects invalid, ambiguous-offset-free or out-of-range instant %s", value => expect(instant.safeParse(value).success).toBe(false));
test("rejects server identity, HTML is data, text length and terminal payload are bounded", () => {
  const note = { leadId: id, creationKey: id, kind: "note", body: "<script>synthetic</script>", occurredAt: "2026-01-01T00:00:00Z" };
  expect(interactionCreate.parse(note).body).toBe(note.body);
  for (const input of [{ ...note, authorUserId: "forged" }, { ...note, body: " " }, { ...note, body: "x".repeat(4001) }]) expect(interactionCreate.safeParse(input).success).toBe(false);
  expect(followupEdit.safeParse({ version: 1 }).success).toBe(false);
  expect(transitionInput.safeParse({ version: 1, status: "completed", completedAt: "forged" }).success).toBe(false);
});
test("converts organization wall time independently of process timezone and preserves known instants", () => {
  const original = process.env.TZ;
  try { for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) { process.env.TZ = tz; expect(resolveWallTime("2026-11-01T10:30", "America/Lima")).toBe("2026-11-01T15:30:00.000Z"); } }
  finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  expect(wallTime("2026-11-01T02:00:00Z", "America/Lima")).toBe("2026-10-31T21:00:00");
});
test.each(["2026-03-08T02:30", "2026-11-01T01:30"])("rejects nonexistent or repeated DST wall time %s", value => expect(() => resolveWallTime(value, "America/New_York")).toThrow());
test("an unchanged known DST instant keeps its explicit offset, without reinterpreting it", () => {
  expect(resolveWallTime("2026-11-01T01:30", "America/New_York", "2026-11-01T06:30:00Z")).toBe("2026-11-01T06:30:00.000Z");
  expect(() => resolveWallTime("2026-02-30T12:00", "America/Lima")).toThrow();
});
test("valid UTC boundary dates remain editable when the organization's local year differs", () => {
  expect(resolveWallTime("1999-12-31T19:30", "America/Lima", "2000-01-01T00:30:00Z")).toBe("2000-01-01T00:30:00.000Z");
  expect(resolveWallTime("2101-01-01T13:30", "Pacific/Kiritimati", "2100-12-31T23:30:00Z")).toBe("2100-12-31T23:30:00.000Z");
});
