/**
 * In-memory Budget Ledger, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1 and §7.
 * Offline simulation only: no real provider billing, no GitHub Actions usage, no network. This is
 * synthetic accounting over plain numbers in memory — it demonstrates the bookkeeping rules, never a
 * real payment, real invoice or real provider balance.
 *
 * Money moves through exactly three states: a *pending* reservation (uncommitted, `estimatedCostCents`
 * set aside by `reserve`), a *confirmed* permanent consumption (`recordObservedCost` with a real
 * number — never returned afterward, by `release` or anything else), and the *available* budget
 * (`hardLimitCents` minus everything pending and everything already confirmed consumed). `release`
 * only ever returns the unconsumed, still-pending portion; it is never how a confirmed consumption is
 * undone, and reconciling the same pending reservation twice with a real number is refused, so no
 * charge is ever doubled and no already-consumed budget is ever restored.
 */

function validCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export class BudgetLedger {
  #hardLimitCents;
  #reservations = new Map(); // taskId -> { fenceToken, reservedCents } — pending, not yet confirmed
  #consumedCents = 0; // permanent, confirmed; never decreases, never returned by release
  #costUnknown = new Set(); // taskId whose reconciliation is still unresolved: blocks every new
  // reservation (§7) and keeps that task's own pending reservation blocked from release.

  constructor({ hardLimitCents }) {
    // null/absent/<=0 is never "unlimited"; it denies every reservation (§7, §3 rule).
    this.#hardLimitCents = Number.isSafeInteger(hardLimitCents) && hardLimitCents > 0 ? hardLimitCents : null;
  }

  #pendingTotal() {
    let total = 0;
    for (const r of this.#reservations.values()) total += r.reservedCents;
    return total;
  }

  /** Read-only: would `reserve` for this cost be rejected right now? */
  canReserve(estimatedCostCents) {
    if (this.#hardLimitCents === null) return false;
    if (!validCents(estimatedCostCents)) return false;
    if (this.#costUnknown.size > 0) return false;
    return this.#consumedCents + this.#pendingTotal() + estimatedCostCents <= this.#hardLimitCents;
  }

  /** Step 2 of the durable admission operation (§5): atomic reserve, tagged with the fencing token. */
  reserve({ taskId, fenceToken, estimatedCostCents }) {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task_id');
    if (!this.canReserve(estimatedCostCents)) return { confirmed: true, ok: false, reason: 'budget_not_available' };
    if (this.#reservations.has(taskId)) return { confirmed: true, ok: false, reason: 'already_reserved' };
    this.#reservations.set(taskId, { fenceToken, reservedCents: estimatedCostCents });
    return { confirmed: true, ok: true };
  }

  /**
   * Releases the pending, unconsumed reservation. Refuses while the task's observed cost is
   * unresolved (`recordObservedCost('unknown')`): presenting the right fencing token is never, on its
   * own, enough — an uncertain spend stays blocked until reconciled to a real number, never released
   * by assumption. Once a reservation has been finalized with a real observed cost, it no longer
   * exists to release (see `recordObservedCost`): there is nothing left to free, by design.
   */
  release({ taskId, fenceToken }) {
    const r = this.#reservations.get(taskId);
    if (!r) return { confirmed: true, ok: false, reason: 'no_reservation' };
    if (r.fenceToken !== fenceToken) return { confirmed: true, ok: false, reason: 'fence_token_mismatch' };
    if (this.#costUnknown.has(taskId)) return { confirmed: true, ok: false, reason: 'cost_unreconciled' };
    this.#reservations.delete(taskId);
    return { confirmed: true, ok: true };
  }

  /**
   * Reconciliation. `'unknown'` leaves the pending reservation exactly as it is — not released, not
   * finalized — and blocks every new reservation across all tasks (§7); it may be reconciled again
   * later with a real number. A real `costCentsOrUnknown` permanently moves that amount into confirmed
   * consumption and removes the pending reservation, returning only the unconsumed difference (if any)
   * to availability; a reservation already finalized this way has nothing left to reconcile, so a
   * second call for the same task throws instead of silently doing nothing — this is what prevents a
   * charge from ever being recorded twice.
   */
  recordObservedCost({ taskId, fenceToken, costCentsOrUnknown }) {
    const r = this.#reservations.get(taskId);
    if (!r) throw new Error('No pending reservation to reconcile');
    if (r.fenceToken !== fenceToken) throw new Error('Fencing token mismatch');
    if (costCentsOrUnknown === 'unknown') {
      this.#costUnknown.add(taskId);
      return { confirmed: true, ok: true, unknown: true };
    }
    if (!validCents(costCentsOrUnknown)) throw new Error('Invalid observed cost');
    this.#consumedCents += costCentsOrUnknown;
    this.#reservations.delete(taskId);
    this.#costUnknown.delete(taskId);
    return { confirmed: true, ok: true, unknown: false, consumedCents: costCentsOrUnknown };
  }

  /** Read-only snapshot for reconciliation and tests; never mutates. */
  inspect(taskId) {
    const r = this.#reservations.get(taskId);
    return { reserved: r ? { ...r } : null, costUnknown: this.#costUnknown.has(taskId), totalConsumedCents: this.#consumedCents };
  }
}
