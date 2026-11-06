/**
 * Simulated Provider invocation, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §5
 * ("Aplicación del fencing al inicio de la invocación al proveedor") and §6.
 *
 * Offline simulation only: `send` is always a caller-supplied, local callback. This module never
 * contacts a real provider, never holds a real credential, and never opens a network connection.
 * It exists to exercise the fencing protocol at the one moment the design treats as most sensitive:
 * the instant before a real send would happen.
 *
 * `send` must be a plain synchronous function for this increment. Asynchronous callbacks are
 * explicitly NOT supported: if `send` returns a promise or any other thenable, it is never awaited
 * and never declared a success — see the "incompatible async result" branch below. Real async
 * invocation is out of scope for this offline increment (see docs/specs/LF-019.md, Limitaciones) and
 * is left for a future increment once a real, asynchronous provider client exists to invoke for real.
 *
 * `budgetLedger` is required, not optional: every `unknown_outcome` this function can produce
 * automatically reconciles that task's pending reservation to `'unknown'` (`BudgetLedger
 * .recordObservedCost`) as part of the same call — never a separate step the caller must remember
 * afterward. This is what makes "§5: ante incertidumbre, el lease, el presupuesto y la autorización
 * consumida se conservan" hold regardless of what the caller does next: the lease is already blocked
 * by `registerAttempt` (§5), the authorization is already irreversibly consumed by the time this runs,
 * and now the budget is blocked here too, inside this one call.
 */

function isThenable(value) {
  try { return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function'; }
  catch { return true; } // Any anomaly inspecting the result is treated conservatively, never as success.
}

/**
 * Registers the one-time invocation attempt via the Lease Store's single atomic conditional write,
 * then — and only then — calls `send()`. If that registration fails (an invalidated or stale fencing
 * token), `send` is never called: zero sends, and the budget is left untouched (nothing uncertain
 * happened).
 *
 * `responseLost: true` simulates the confirmation of whether `send()` actually went out being lost
 * (e.g. network timeout) *after* the attempt was already durably registered. The real result of
 * `send()` is irrelevant to the caller in that case: this function reports `unknown_outcome` without
 * revealing it, because a real caller in that situation could not have observed it either, and
 * automatically blocks the budget reservation before returning.
 *
 * If `send()` throws — synchronously — after the attempt was already registered, that is treated
 * exactly like a lost response: `unknown_outcome`, the budget automatically blocked, never a thrown
 * error escaping this function, never a second send (the registered attempt blocks any retry for
 * this token), and the real error's message/stack is deliberately never included in the result or
 * passed to the budget ledger, since a real provider error could contain sensitive details.
 *
 * If `send()` returns a thenable (a real promise or anything else with a callable `.then`), that is
 * never declared a success: the callback may already have produced real effects asynchronously that
 * this synchronous increment cannot observe or await. The result is `unknown_outcome`, the budget is
 * automatically blocked, and any eventual rejection of that thenable is deliberately given a no-op
 * handler so it can never surface as an unhandled rejection — it is not retried and not re-thrown.
 */
export function invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken, send, responseLost = false }) {
  const registration = leaseStore.registerAttempt({ taskId, fenceToken });
  if (!registration.ok) {
    return { outcome: 'denied', reason: registration.reason, sent: false };
  }

  const blockBudget = () => {
    try { budgetLedger.recordObservedCost({ taskId, fenceToken, costCentsOrUnknown: 'unknown' }); }
    catch { /* No matching pending reservation: nothing to block. Does not happen in the integrated
               admission flow, where the budget is always reserved before this is ever reached. */ }
  };

  if (responseLost) {
    // The attempt is already registered; the call may or may not have reached the provider. Any
    // exception from send() changes nothing here: the outcome is unknown either way.
    try { send(); } catch { /* deliberately ignored: see the function-level comment above */ }
    blockBudget();
    return { outcome: 'unknown_outcome', sent: 'unknown' };
  }

  let result;
  try {
    result = send();
  } catch {
    blockBudget();
    return { outcome: 'unknown_outcome', sent: 'unknown' };
  }

  if (isThenable(result)) {
    try { Promise.resolve(result).then(() => {}, () => {}); } catch { /* ignored: see above */ }
    blockBudget();
    return { outcome: 'unknown_outcome', sent: 'unknown' };
  }

  return { outcome: 'sent', sent: true, result };
}
