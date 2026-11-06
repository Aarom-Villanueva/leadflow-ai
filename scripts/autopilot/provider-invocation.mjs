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
 * and never declared a success — see `handleSendResult` below. `send()` is called at most once per
 * call to `invokeProvider`, on every path (normal, `responseLost`, or otherwise): its result is
 * never inspected by calling it again. Real async invocation is out of scope for this offline
 * increment (see docs/specs/LF-019.md, Limitaciones) and is left for a future increment once a real,
 * asynchronous provider client exists to invoke for real.
 *
 * `budgetLedger` is required, not optional, and is validated — not merely assumed — before the Lease
 * Store is ever touched or `send` is ever called: there must be a pending reservation bound to this
 * exact `taskId` and `fenceToken`. Missing or mismatched, this denies with zero sends and leaves
 * every ledger untouched, rather than running `send()` and only discovering afterward that there was
 * nothing to block.
 *
 * Once `send()` has run, every `unknown_outcome` path (a lost response, a synchronous throw, or an
 * unsupported async result) automatically reconciles that task's pending reservation to `'unknown'`
 * (`BudgetLedger.recordObservedCost`) as part of the same call — never a separate step the caller
 * must remember afterward. If that reconciliation itself fails unexpectedly (never silently treated
 * as "nothing to block"), the result is the distinct `unknown_outcome_budget_unconfirmed`: the lease
 * stays blocked regardless (`registerAttempt` already succeeded), nothing is retried, and the budget
 * is never reported as confirmed-blocked when it could not be confirmed.
 */

function isThenable(value) {
  try { return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function'; }
  catch { return true; } // Any anomaly inspecting the result is treated conservatively, never as success.
}

/** Read-only: a valid ledger with a pending reservation bound to exactly this task_id/fenceToken. */
function hasValidPendingReservation(budgetLedger, taskId, fenceToken) {
  if (!budgetLedger || typeof budgetLedger.inspect !== 'function') return false;
  let snapshot;
  try { snapshot = budgetLedger.inspect(taskId); } catch { return false; }
  return Boolean(snapshot && snapshot.reserved && snapshot.reserved.fenceToken === fenceToken);
}

/**
 * Calls `send()` exactly once and classifies its outcome, the same way regardless of `responseLost`:
 * a synchronous throw, a thenable result (never awaited, but given a no-op rejection handler so it
 * can never surface as an unhandled rejection), or a plain synchronous value. Never re-invokes `send`.
 */
function callSendOnce(send) {
  let result;
  let threw = false;
  try {
    result = send();
  } catch {
    threw = true;
  }
  const thenable = !threw && isThenable(result);
  if (thenable) {
    try { Promise.resolve(result).then(() => {}, () => {}); } catch { /* ignored: see module docstring */ }
  }
  return { result, threw, thenable, uncertain: threw || thenable };
}

/**
 * Registers the one-time invocation attempt via the Lease Store's single atomic conditional write,
 * then — and only then — calls `send()` exactly once. If registration fails (an invalidated or stale
 * fencing token), `send` is never called: zero sends, and the budget is left untouched.
 *
 * `responseLost: true` simulates the confirmation of whether `send()` actually went out being lost
 * (e.g. network timeout) *after* the attempt was already durably registered — regardless of what
 * `send()` itself returns or throws, the outcome is unknown. A synchronous throw and an unsupported
 * async (thenable) result are always treated as uncertain too, with or without `responseLost`: the
 * real error or value is deliberately never exposed, and that thenable's eventual rejection (if any)
 * is given a no-op handler on every path, never only on the synchronous-success path.
 */
export function invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken, send, responseLost = false }) {
  if (!hasValidPendingReservation(budgetLedger, taskId, fenceToken)) {
    return { outcome: 'denied', reason: 'budget_precondition_failed', sent: false };
  }

  const registration = leaseStore.registerAttempt({ taskId, fenceToken });
  if (!registration.ok) {
    return { outcome: 'denied', reason: registration.reason, sent: false };
  }

  const { result, uncertain } = callSendOnce(send);

  if (!responseLost && !uncertain) {
    return { outcome: 'sent', sent: true, result };
  }

  // Uncertain (lost response, synchronous throw, or unsupported async result): the attempt is
  // already registered and blocked; now block the budget too, inside this same call.
  let budgetBlocked = true;
  try { budgetLedger.recordObservedCost({ taskId, fenceToken, costCentsOrUnknown: 'unknown' }); }
  catch { budgetBlocked = false; }

  if (!budgetBlocked) {
    return { outcome: 'unknown_outcome_budget_unconfirmed', sent: 'unknown' };
  }
  return { outcome: 'unknown_outcome', sent: 'unknown' };
}
