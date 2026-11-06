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
 * Deliberately additive: it never modifies `admission-validator.mjs`, `lease-store.mjs`,
 * `budget-ledger.mjs` or `authorization-ledger.mjs`. Instead it composes their existing, already
 * reviewed primitives — `AuthorizationLedger.revoke`, `LeaseStore.invalidate`/`release`,
 * `BudgetLedger`'s existing blocked/unreconciled states — exactly the way §9 describes PAUSA:
 *
 *   1. Disable the admission trigger — `blocksAdmission()` / `admitIfNotPaused` below.
 *   2. Invalidate pending `admitted`/`running` authorizations — `AuthorizationLedger.revoke` for any
 *      authorization not yet consumed. A consumed authorization is already irreversibly spent by
 *      `AuthorizationLedger` itself; revoking it here changes nothing and is not attempted as if it
 *      would undo a spend already produced (§9 recovery: "revocar una autorización no deshace un
 *      gasto ya producido").
 *   3. Cancel the executor process/run if active — the caller-supplied `cancel` callback, whose real
 *      error (if any) is never exposed by this controller.
 *   4. Revoke executor credentials — not applicable in this offline increment (see above).
 *   5. Confirm the stop externally before releasing the lease — only if the caller-supplied
 *      `confirmStopped` callback confirms it does this controller call `LeaseStore.invalidate` then
 *      `LeaseStore.release`; otherwise the lease (and whatever budget reservation it protects) stays
 *      exactly as blocked as `LeaseStore`/`BudgetLedger` already leave an `unknown_outcome`, and the
 *      attempt to confirm is recorded as evidence, never silently dropped.
 */
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
   * (step 1) is global and unconditional; the remaining steps are applied per task, and a failure or
   * unconfirmed stop for one task never prevents the others from being processed.
   */
  pause({ authorizationLedger, leaseStore, tasks, confirmStopped, cancel }) {
    if (!Array.isArray(tasks)) throw new Error('Invalid tasks list');
    this.#paused = true;

    const results = tasks.map(({ taskId, fenceToken, authorizationId }) => {
      const entry = { taskId, fenceToken, authorizationId, cancelled: false, revoked: false, confirmed: false, leaseReleased: false };

      if (typeof cancel === 'function') {
        try {
          cancel({ taskId, fenceToken });
          entry.cancelled = true;
        } catch {
          // The real cancellation error is never exposed; the attempt itself is still recorded below.
          entry.cancelled = false;
        }
      }

      if (authorizationId) {
        try {
          const revoked = authorizationLedger.revoke(authorizationId);
          entry.revoked = Boolean(revoked.ok);
        } catch {
          entry.revoked = false;
        }
      }

      let confirmed = false;
      try {
        confirmed = typeof confirmStopped === 'function' ? Boolean(confirmStopped({ taskId, fenceToken })) : false;
      } catch {
        confirmed = false;
      }
      entry.confirmed = confirmed;

      if (confirmed) {
        const invalidated = leaseStore.invalidate({ taskId, fenceToken });
        if (invalidated.ok) {
          const released = leaseStore.release({ taskId, fenceToken });
          entry.leaseReleased = released.ok;
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
   * authorization, never releases a lease still blocked for lack of confirmation, and never retries
   * anything on its own; it only stops `blocksAdmission()` from refusing a *future*, separately
   * authorized `admitTask` call.
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
