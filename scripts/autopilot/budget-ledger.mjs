/**
 * In-memory Budget Ledger, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1 and §7.
 * Offline simulation only: no real provider billing, no GitHub Actions usage, no network.
 * This ledger's own state is always a confirmed, durable read; a caller that cannot observe one of
 * its results (a lost response) is simulated by the orchestration layer, never by this file —
 * see admission-validator.mjs.
 */

function validCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export class BudgetLedger {
  #hardLimitCents;
  #reservations = new Map(); // taskId -> { fenceToken, reservedCents }
  #costUnknown = new Set(); // taskId with unreconciled/unknown observed cost: blocks new reservations

  constructor({ hardLimitCents }) {
    // null/absent/<=0 is never "unlimited"; it denies every reservation (§7, §3 rule).
    this.#hardLimitCents = Number.isSafeInteger(hardLimitCents) && hardLimitCents > 0 ? hardLimitCents : null;
  }

  #reservedTotal() {
    let total = 0;
    for (const r of this.#reservations.values()) total += r.reservedCents;
    return total;
  }

  /** Read-only: would `reserve` for this cost be rejected right now? */
  canReserve(estimatedCostCents) {
    if (this.#hardLimitCents === null) return false;
    if (!validCents(estimatedCostCents)) return false;
    if (this.#costUnknown.size > 0) return false;
    return this.#reservedTotal() + estimatedCostCents <= this.#hardLimitCents;
  }

  /** Step 2 of the durable admission operation (§5): atomic reserve, tagged with the fencing token. */
  reserve({ taskId, fenceToken, estimatedCostCents }) {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task_id');
    if (!this.canReserve(estimatedCostCents)) return { confirmed: true, ok: false, reason: 'budget_not_available' };
    if (this.#reservations.has(taskId)) return { confirmed: true, ok: false, reason: 'already_reserved' };
    this.#reservations.set(taskId, { fenceToken, reservedCents: estimatedCostCents });
    return { confirmed: true, ok: true };
  }

  /** Releases a reservation. Fencing token must match what reserved it. */
  release({ taskId, fenceToken }) {
    const r = this.#reservations.get(taskId);
    if (!r) return { confirmed: true, ok: false, reason: 'no_reservation' };
    if (r.fenceToken !== fenceToken) return { confirmed: true, ok: false, reason: 'fence_token_mismatch' };
    this.#reservations.delete(taskId);
    return { confirmed: true, ok: true };
  }

  /**
   * Reconciliation: records the real observed cost, or an explicit unknown. An unknown or unreconciled
   * cost blocks every future reservation (§7) and is never reported as zero.
   */
  recordObservedCost({ taskId, costCentsOrUnknown }) {
    if (!this.#reservations.has(taskId) && !this.#costUnknown.has(taskId)) throw new Error('No reservation to reconcile');
    if (costCentsOrUnknown === 'unknown') { this.#costUnknown.add(taskId); return { confirmed: true, ok: true, unknown: true }; }
    if (!validCents(costCentsOrUnknown)) throw new Error('Invalid observed cost');
    this.#costUnknown.delete(taskId);
    return { confirmed: true, ok: true, unknown: false };
  }

  /** Read-only snapshot for reconciliation and tests; never mutates. */
  inspect(taskId) {
    const r = this.#reservations.get(taskId);
    return { reserved: r ? { ...r } : null, costUnknown: this.#costUnknown.has(taskId) };
  }
}
