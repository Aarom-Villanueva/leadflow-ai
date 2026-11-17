import { describe, expect, test } from "vitest";
import type { DashboardMetrics, DashboardSnapshot } from "../../../src/modules/analytics/contracts";
import { classifySave, freshAttempt, initialState, reduce, retryAttempt, savedNotice, visibleSnapshots, type DashboardEvent, type DashboardState, type IntervalChoice, type SaveAttempt } from "../../../src/modules/analytics/dashboard-state";

const metrics = (days: 30 | 90 | 180, asOf = "2026-06-15T12:00:00.000Z", activeLeads = 1): DashboardMetrics => ({ asOf, timezone: "UTC", interval: { days, from: "2026-01-01T00:00:00.000Z", to: asOf }, activeLeads, stages: [], conversion: { created: 0, won: 0, archivedIncluded: 0, cohorts: [] }, followups: { pending: 0, overdue: 0, upcoming: 0, onArchivedLeads: 0 } });
const snapshot = (id: string, days: 30 | 90 | 180, asOf = "2026-06-15T12:00:00.000Z"): DashboardSnapshot => ({ id, createdAt: asOf, createdBy: "u", createdByName: "Persona", metrics: metrics(days, asOf, 7) });
const run = (events: DashboardEvent[], from: DashboardState = initialState) => events.reduce(reduce, from);
const attempt = (interval: IntervalChoice = "90", key = "k1"): SaveAttempt => ({ key, interval });
const ready = run([{ type: "metricsLoaded", request: 1, metrics: metrics(90) }, { type: "listLoaded", request: 1, items: [] }]);

describe("metrics requests", () => {
  test("only the latest request may change the figures, whatever the arrival order", () => {
    const requested = run([{ type: "metricsRequested", request: 2, interval: "30" }, { type: "metricsRequested", request: 3, interval: "180" }], ready);
    expect(requested.interval).toBe("180"); expect(requested.view?.metrics.interval.days).toBe(90); expect(requested.metrics.status).toBe("loading");
    const late = run([{ type: "metricsLoaded", request: 2, metrics: metrics(30) }, { type: "metricsFailed", request: 2 }, { type: "metricsLoaded", request: 1, metrics: metrics(90, "2020-01-01T00:00:00.000Z") }], requested);
    expect(late).toEqual(requested);
    const done = reduce(late, { type: "metricsLoaded", request: 3, metrics: metrics(180) });
    expect(done.view).toEqual({ metrics: metrics(180), snapshotId: null }); expect(done.metrics.status).toBe("ready");
    expect(reduce(done, { type: "metricsRequested", request: 2, interval: "30" })).toEqual(done);
  });
  test("a failure keeps the previous figures and a response for another interval is never shown under the current selector", () => {
    const failed = run([{ type: "metricsRequested", request: 2, interval: "30" }, { type: "metricsFailed", request: 2 }], ready);
    expect(failed.metrics.status).toBe("error"); expect(failed.view?.metrics.interval.days).toBe(90); expect(failed.interval).toBe("30");
    const wrong = run([{ type: "metricsRequested", request: 2, interval: "30" }, { type: "metricsLoaded", request: 2, metrics: metrics(180) }], ready);
    expect(wrong.metrics.status).toBe("error"); expect(wrong.view?.metrics.interval.days).toBe(90);
  });
});

describe("saving versus interval changes (reported defect 1)", () => {
  test("a confirmation for 90 days never labels 30-day figures as the saved ones, in either arrival order", () => {
    const pending = run([{ type: "saveStarted", attempt: attempt("90") }, { type: "metricsRequested", request: 2, interval: "30" }], ready);
    const confirmed: DashboardEvent = { type: "saveConfirmed", attempt: attempt("90"), snapshot: snapshot("s90", 90) }, loaded: DashboardEvent = { type: "metricsLoaded", request: 2, metrics: metrics(30) };
    for (const order of [[confirmed, loaded], [loaded, confirmed]]) {
      const state = run(order, pending);
      expect(state.view).toEqual({ metrics: metrics(30), snapshotId: null });
      expect(savedNotice(state)).toEqual({ snapshot: snapshot("s90", 90), shown: false });
      expect(visibleSnapshots(state).map(value => value.id)).toEqual(["s90"]); expect(state.save).toEqual({ status: "idle" });
    }
    // Between the confirmation and the 30-day figures the screen still shows the earlier live figures, not the saved ones.
    expect(savedNotice(reduce(pending, confirmed))?.shown).toBe(false);
  });
  test("with the same interval the saved figures are shown and the confirmation is bound to that cutoff", () => {
    const state = run([{ type: "saveStarted", attempt: attempt() }, { type: "saveConfirmed", attempt: attempt(), snapshot: snapshot("s1", 90) }], ready);
    expect(state.view).toEqual({ metrics: snapshot("s1", 90).metrics, snapshotId: "s1" }); expect(savedNotice(state)).toEqual({ snapshot: snapshot("s1", 90), shown: true });
    // Any later figures replace the view and the confirmation stops claiming to be shown.
    const refreshed = run([{ type: "metricsRequested", request: 2, interval: "90" }, { type: "metricsLoaded", request: 2, metrics: metrics(90, "2026-06-15T12:05:00.000Z") }], state);
    expect(savedNotice(refreshed)?.shown).toBe(false); expect(refreshed.view?.snapshotId).toBeNull();
    // A refresh that was already in flight when the save was confirmed behaves the same.
    const racing = run([{ type: "metricsRequested", request: 2, interval: "90" }, { type: "saveStarted", attempt: attempt() }, { type: "saveConfirmed", attempt: attempt(), snapshot: snapshot("s1", 90) }], ready);
    expect(savedNotice(racing)?.shown).toBe(true); expect(savedNotice(reduce(racing, { type: "metricsLoaded", request: 2, metrics: metrics(90) }))?.shown).toBe(false);
  });
});

describe("saved list (reported defect 2)", () => {
  test("a stale or late list cannot erase a confirmed cutoff, and lists merge without duplicates, newest first", () => {
    const saved = run([{ type: "saveStarted", attempt: attempt() }, { type: "saveConfirmed", attempt: attempt(), snapshot: snapshot("new", 90, "2026-06-15T12:00:00.000Z") }], reduce(initialState, { type: "metricsLoaded", request: 1, metrics: metrics(90) }));
    const stale = reduce(saved, { type: "listLoaded", request: 1, items: [] });
    expect(visibleSnapshots(stale).map(value => value.id)).toEqual(["new"]); expect(stale.list.status).toBe("ready");
    const full = run([{ type: "listRequested", request: 2 }, { type: "listLoaded", request: 2, items: [snapshot("new", 90), snapshot("old", 30, "2026-06-01T00:00:00.000Z"), snapshot("newer", 30, "2026-06-16T00:00:00.000Z")] }], stale);
    expect(visibleSnapshots(full).map(value => value.id)).toEqual(["newer", "new", "old"]);
    expect(reduce(full, { type: "listLoaded", request: 1, items: [] })).toEqual(full);
    const failed = run([{ type: "listRequested", request: 3 }, { type: "listFailed", request: 3 }], full);
    expect(failed.list.status).toBe("error"); expect(visibleSnapshots(failed).map(value => value.id)).toEqual(["newer", "new", "old"]);
    expect(visibleSnapshots({ ...full, list: { ...full.list, items: Array.from({ length: 30 }, (_, index) => snapshot("x" + index, 30, `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`)) } })).toHaveLength(10);
  });
});

describe("unknown outcome and idempotent retry (reported defect 3)", () => {
  const uncertain = run([{ type: "saveStarted", attempt: attempt("90", "lost") }, { type: "saveUncertain", attempt: attempt("90", "lost") }], ready);
  test("an unknown outcome keeps the attempt identity, blocks a different save and survives an interval change", () => {
    expect(uncertain.save).toEqual({ status: "uncertain", attempt: attempt("90", "lost") }); expect(savedNotice(uncertain)).toBeUndefined();
    const moved = run([{ type: "metricsRequested", request: 2, interval: "30" }, { type: "metricsLoaded", request: 2, metrics: metrics(30) }], uncertain);
    expect(freshAttempt(moved, "other")).toBeUndefined(); expect(retryAttempt(moved)).toEqual(attempt("90", "lost"));
    expect(reduce(moved, { type: "saveStarted", attempt: attempt("30", "other") })).toEqual(moved);
    const retried = run([{ type: "saveStarted", attempt: attempt("90", "lost") }, { type: "saveConfirmed", attempt: attempt("90", "lost"), snapshot: snapshot("s90", 90) }], moved);
    expect(retried.save).toEqual({ status: "idle" }); expect(savedNotice(retried)).toEqual({ snapshot: snapshot("s90", 90), shown: false }); expect(retried.view?.metrics.interval.days).toBe(30);
    expect(freshAttempt(retried, "next")).toEqual(attempt("30", "next"));
  });
  test("a refused or lost retry leaves the original attempt uncertain with the same identity", () => {
    const retrying = reduce(uncertain, { type: "saveStarted", attempt: attempt("90", "lost") });
    expect(retrying.save).toEqual({ status: "saving", attempt: attempt("90", "lost"), resolving: true });
    expect(reduce(retrying, { type: "saveRejected", attempt: attempt("90", "lost"), reason: "limit" }).save).toEqual({ status: "uncertain", attempt: attempt("90", "lost"), retryRefused: "limit" });
    expect(reduce(retrying, { type: "saveUncertain", attempt: attempt("90", "lost") }).save).toEqual({ status: "uncertain", attempt: attempt("90", "lost") });
  });
  test("a first-attempt refusal is a confirmed failure and a new save gets a new identity", () => {
    const refused = run([{ type: "saveStarted", attempt: attempt() }, { type: "saveRejected", attempt: attempt(), reason: "refused" }], ready);
    expect(refused.save).toEqual({ status: "rejected", attempt: attempt(), reason: "refused" }); expect(retryAttempt(refused)).toBeUndefined();
    expect(freshAttempt(refused, "k2")).toEqual(attempt("90", "k2")); expect(visibleSnapshots(refused)).toEqual([]);
  });
});

describe("duplicate and out-of-turn save events", () => {
  test("a second start while saving is ignored, and results for another attempt or without a save in progress change nothing", () => {
    const saving = reduce(ready, { type: "saveStarted", attempt: attempt("90", "a") });
    expect(reduce(saving, { type: "saveStarted", attempt: attempt("90", "b") })).toEqual(saving); expect(freshAttempt(saving, "b")).toBeUndefined();
    for (const event of [{ type: "saveConfirmed", attempt: attempt("90", "b"), snapshot: snapshot("x", 90) }, { type: "saveRejected", attempt: attempt("30", "a"), reason: "refused" }, { type: "saveUncertain", attempt: attempt("90", "b") }] as DashboardEvent[]) expect(reduce(saving, event)).toEqual(saving);
    for (const event of [{ type: "saveConfirmed", attempt: attempt(), snapshot: snapshot("x", 90) }, { type: "saveUncertain", attempt: attempt() }] as DashboardEvent[]) expect(reduce(ready, event)).toEqual(ready);
    const done = reduce(saving, { type: "saveConfirmed", attempt: attempt("90", "a"), snapshot: snapshot("x", 90) });
    expect(reduce(done, { type: "saveConfirmed", attempt: attempt("90", "a"), snapshot: snapshot("y", 90) })).toEqual(done);
  });
  test("starting a save clears the previous confirmation so it cannot be attributed to the new attempt", () => {
    const first = run([{ type: "saveStarted", attempt: attempt("90", "a") }, { type: "saveConfirmed", attempt: attempt("90", "a"), snapshot: snapshot("x", 90) }], ready);
    const second = reduce(first, { type: "saveStarted", attempt: attempt("90", "b") });
    expect(savedNotice(second)).toBeUndefined(); expect(visibleSnapshots(second).map(value => value.id)).toEqual(["x"]);
  });
});

describe("classifying the save response", () => {
  const body = { snapshot: snapshot("s", 90) };
  test("only a 201 carrying the cutoff for the requested interval confirms", () => {
    expect(classifySave(attempt("90"), 201, body)).toEqual({ outcome: "confirmed", snapshot: body.snapshot });
    for (const bad of [undefined, null, {}, { snapshot: null }, { snapshot: { id: 1 } }, { snapshot: snapshot("s", 30) }, "text"]) expect(classifySave(attempt("90"), 201, bad)).toEqual({ outcome: "uncertain" });
  });
  test("a 4xx is a refusal, and no response, a 5xx or an unexpected status is unknown", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) expect(classifySave(attempt(), status, { code: "X" })).toEqual({ outcome: "rejected", reason: "refused" });
    expect(classifySave(attempt(), 429, undefined)).toEqual({ outcome: "rejected", reason: "limit" });
    for (const status of [undefined, 500, 502, 503, 504, 200, 204, 302]) expect(classifySave(attempt(), status, body)).toEqual({ outcome: "uncertain" });
  });
});
