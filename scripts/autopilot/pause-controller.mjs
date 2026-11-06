import { admitTask } from './admission-validator.mjs';

/**
 * Simulated Pause controller, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §9 and §13.
 *
 * Offline simulation only: `cancel` and `confirmStopped` are always caller-supplied, local test
 * callbacks — never a real provider/Actions API call. This module never cancels a real process,
 * never revokes a real credential (no executor in this offline implementation holds one — design §9
 * step 4, "revocar credenciales del ejecutor si la arquitectura lo permite", has no operational
 * equivalent here, by design, not by oversight), and never confirms a real external stop.
 *
 * `confirmStopped` and `cancel` are both strictly synchronous, exactly like `send` in
 * provider-invocation.mjs: neither callback's result is ever coerced to a boolean, and a thenable
 * (a real promise or any object/function with a callable `.then`) never confirms anything by itself.
 * `confirmStopped` must return the literal boolean `true` to confirm a stop — `false`, `undefined`,
 * the string `"false"`, a truthy object, or a pending/thenable result are all treated as "not
 * confirmed", never as confirmed by type coercion. A rejected/thenable result from either callback is
 * still given a no-op rejection handler so it can never surface as an `unhandledRejection`, and a
 * synchronous throw from either one is swallowed the same conservative way: never retried, never
 * exposed, and never recorded as a false success.
 *
 * Deliberately additive: it never modifies `admission-validator.mjs`, `lease-store.mjs`,
 * `budget-ledger.mjs` or `authorization-ledger.mjs`. Instead it composes their existing, already
 * reviewed primitives — `AuthorizationLedger.revoke`, `LeaseStore.invalidate`/`release`,
 * `BudgetLedger.inspect`/`recordObservedCost` — exactly the way §9 describes PAUSA:
 *
 *   1. Disable the admission trigger — `blocksAdmission()` / `admitIfNotPaused` below.
 *   2. Invalidate pending `admitted`/`running` authorizations — `AuthorizationLedger.revoke` for any
 *      authorization not yet consumed. A consumed authorization is already irreversibly spent by
 *      `AuthorizationLedger` itself; revoking it here changes nothing and is not attempted as if it
 *      would undo a spend already produced (§9 recovery: "revocar una autorización no deshace un
 *      gasto ya producido").
 *   3. Cancel the executor process/run if active — the caller-supplied `cancel` callback, whose real
 *      error (if any) is never exposed by this controller, and whose async/uncertain result is never
 *      recorded as a confirmed cancellation.
 *   4. Revoke executor credentials — not applicable in this offline increment (see above).
 *   5. Confirm the stop externally before releasing the lease AND reconciling its budget reservation.
 *      Releasing only the lease while leaving its budget reservation pending was the exact gap this
 *      module previously had: a task paused before any provider attempt would free its lease but
 *      leave the budget it reserved permanently stuck, so a later, brand-new authorization for the
 *      same scope would be denied by `budget_not_available` even though nothing was ever spent. Both
 *      must now be resolved together, and only when it is actually safe:
 *        - A confirmed stop is only ever trusted to mean "no cost was incurred" when the Lease
 *          Store's own fencing shows no invocation attempt was ever registered for that exact
 *          fencing token (`!lease.attemptRegistered`) — never when a send was attempted, regardless
 *          of what the provider is believed to have done.
 *        - Only then does this controller reconcile that task's pending budget reservation to a
 *          confirmed zero cost via `BudgetLedger.recordObservedCost(0)` — the same, already-reviewed
 *          mechanism LF-019 uses for every other cost confirmation, never a bespoke "release" that
 *          bypasses it. The reservation's `fenceToken` is checked against the exact token being
 *          paused before that call, exactly like every other ledger operation in this codebase.
 *        - If there is nothing pending to reconcile (no reservation, or one already finalized with a
 *          real cost), that confirmed consumption is left completely untouched and the lease can
 *          still be safely released.
 *        - If the budget is already marked cost-unknown, if the reservation's fencing token does not
 *          match, or if the reconciliation call itself fails for any reason, nothing is released:
 *          this is "evidencia insuficiente" and the lease (and whatever budget it still holds) stays
 *          blocked, exactly as an `unknown_outcome` already would.
 *      The lease is invalidated and released only after that budget reconciliation has actually
 *      succeeded — never before, and never only partially.
 *
 * Each task in a `pause()` call is processed independently: a callback throwing for one task can
 * never prevent any other task in the same call from being cancelled, revoked, confirmed, reconciled
 * or released.
 */

function isThenable(value) {
  try { return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function'; }
  catch { return true; } // Any anomaly inspecting the result is treated conservatively, never as success.
}

/** Attaches a no-op rejection handler so an eventual rejection never becomes an unhandledRejection. */
function neverUnhandled(thenable) {
  try { Promise.resolve(thenable).then(() => {}, () => {}); } catch { /* ignored */ }
}

/**
 * Runs `cancel` at most once. A synchronous throw, or a thenable (async/uncertain) result, is never
 * recorded as a confirmed cancellation — only a value returned synchronously without throwing is.
 */
function callCancel(cancel, args) {
  if (typeof cancel !== 'function') return false;
  let result;
  try { result = cancel(args); }
  catch { return false; }
  if (isThenable(result)) {
    neverUnhandled(result);
    return false;
  }
  return true;
}

/**
 * Runs `confirmStopped` at most once. Only the literal boolean `true`, returned synchronously without
 * throwing, ever confirms a stop — never a coerced truthy value, and never a thenable, which is
 * treated exactly like an unconfirmed result (never awaited, never retried).
 */
function callConfirmStopped(confirmStopped, args) {
  if (typeof confirmStopped !== 'function') return false;
  let result;
  try { result = confirmStopped(args); }
  catch { return false; }
  if (isThenable(result)) {
    neverUnhandled(result);
    return false;
  }
  return result === true;
}

/**
 * Read-only: is it safe, right now, to treat `taskId`/`fenceToken`'s pending budget reservation (if
 * any) as having incurred zero cost? Only when there either is no such reservation at all (nothing to
 * reconcile — including a reservation already finalized for real, which this never revisits), or
 * there is one that is still exactly bound to this fencing token and not already marked cost-unknown.
 */
function budgetReservationSafeToZeroOut(budgetLedger, taskId, fenceToken) {
  let snapshot;
  try { snapshot = budgetLedger.inspect(taskId); } catch { return false; }
  if (!snapshot) return false;
  if (!snapshot.reserved) return 'none';
  if (snapshot.reserved.fenceToken !== fenceToken) return false;
  if (snapshot.costUnknown) return false;
  return 'pending';
}

/**
 * Confirms zero cost for `taskId`/`fenceToken`'s budget reservation if and only if that is safe (see
 * above), using the same `BudgetLedger.recordObservedCost` every other reconciliation in this codebase
 * uses — never a bespoke bypass. Returns `true` only once the ledger itself confirms there is nothing
 * left blocking that task's budget.
 */
function reconcileZeroCostIfSafe(budgetLedger, taskId, fenceToken) {
  const state = budgetReservationSafeToZeroOut(budgetLedger, taskId, fenceToken);
  if (state === 'none') return true;
  if (state !== 'pending') return false;
  try {
    budgetLedger.recordObservedCost({ taskId, fenceToken, costCentsOrUnknown: 0 });
    return true;
  } catch {
    return false;
  }
}

export class PauseController {
  #paused = false;
  #recoveryLog = [];

  /** Read-only: is a new admission currently blocked by an active pause? */
  get paused() {
    return this.#paused;
  }

  /** Read-only: would a new admission be refused right now, purely because of PAUSA? */
  blocksAdmission() {
    return this.#paused;
  }

  /**
   * PAUSA (§9, steps 1–3 and 5; step 4 is not applicable here). `tasks` is the explicit list of
   * `{ taskId, fenceToken, authorizationId }` entries this pause covers — this offline simulation has
   * no global registry of "every currently admitted task" to enumerate on its own, so the caller
   * (who does hold that registry in a real system) supplies it explicitly. Disabling new admissions
   * (step 1) is global and unconditional; the remaining steps are applied per task, and a failure,
   * throw, or unconfirmed/unreconciled result for one task never prevents the others from being
   * processed.
   *
   * `budgetLedger` is required: releasing a lease without reconciling the budget reservation it
   * protects is exactly the gap this module exists to close (see the module docstring), so there is
   * no code path here that can release a lease without going through that ledger.
   */
  pause({ authorizationLedger, leaseStore, budgetLedger, tasks, confirmStopped, cancel }) {
    if (!Array.isArray(tasks)) throw new Error('Invalid tasks list');
    if (!budgetLedger || typeof budgetLedger.inspect !== 'function' || typeof budgetLedger.recordObservedCost !== 'function') {
      throw new Error('Invalid budgetLedger');
    }
    this.#paused = true;

    const results = tasks.map(({ taskId, fenceToken, authorizationId }) => {
      const entry = {
        taskId, fenceToken, authorizationId,
        cancelled: false, revoked: false, confirmed: false, budgetReconciled: false, leaseReleased: false
      };

      entry.cancelled = callCancel(cancel, { taskId, fenceToken });

      if (authorizationId) {
        try {
          const revoked = authorizationLedger.revoke(authorizationId);
          entry.revoked = Boolean(revoked.ok);
        } catch {
          entry.revoked = false;
        }
      }

      entry.confirmed = callConfirmStopped(confirmStopped, { taskId, fenceToken });

      if (entry.confirmed) {
        let lease;
        try { lease = leaseStore.inspect(taskId); } catch { lease = null; }
        const leaseSafeToClose = Boolean(lease) && lease.fenceToken === fenceToken && !lease.invalidated && !lease.attemptRegistered;
        if (leaseSafeToClose) {
          entry.budgetReconciled = reconcileZeroCostIfSafe(budgetLedger, taskId, fenceToken);
          if (entry.budgetReconciled) {
            const invalidated = leaseStore.invalidate({ taskId, fenceToken });
            if (invalidated.ok) {
              const released = leaseStore.release({ taskId, fenceToken });
              entry.leaseReleased = released.ok;
            }
          }
        }
      }

      this.#recoveryLog.push({ ...entry, at: 'pause' });
      return entry;
    });

    return { paused: true, tasks: results };
  }

  /**
   * Recovery evidence (§9 recovery): a plain, caller-supplied record — SHA, provider/Actions
   * identifiers, state, commands run, known/unknown results, observed-or-unknown cost, reason — kept
   * without secrets. This controller never inspects or validates its shape beyond requiring a plain
   * object: it is a log, not a reconciliation authority.
   */
  recordRecoveryEvidence(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid recovery evidence');
    this.#recoveryLog.push({ ...entry, at: 'recovery' });
  }

  /** Read-only snapshot for tests and reconciliation; never mutates, and evidence is never deleted. */
  inspectRecoveryLog() {
    return this.#recoveryLog.map((entry) => ({ ...entry }));
  }

  /**
   * Lifts the admission block only. Per §9 recovery, resuming requires full reconciliation and a
   * brand-new authorization for any new attempt — this method never reactivates a revoked or consumed
   * authorization, never releases a lease or budget reservation still blocked for lack of safe
   * reconciliation, and never retries anything on its own; it only stops `blocksAdmission()` from
   * refusing a *future*, separately authorized `admitTask` call.
   */
  resume() {
    this.#paused = false;
  }
}

/**
 * Integration helper: composes `PauseController` with the existing `admitTask` from
 * `admission-validator.mjs` without modifying that module. While paused, no admission is evaluated at
 * all — not even to deny it with a reason — exactly as §9 step 1 describes ("ningún
 * authorization_pending nuevo se evalúa"). This is the only way admission and pause interact; nothing
 * here ever triggers a retry automatically.
 */
export function admitIfNotPaused({ pauseController, ...admitTaskArgs }) {
  if (pauseController.blocksAdmission()) {
    return { admitted: false, reasons: ['paused'] };
  }
  return admitTask(admitTaskArgs);
}
