import { scopesOverlap } from './lease-store.mjs';

/**
 * Admission Validator, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §5 and §8.
 * Offline simulation only: `sources` stands in for real reads of docs/HANDOFF.md, docs/ROADMAP.md,
 * the decisions registry and Git dependency proof — never the real repository. No network, no agent,
 * no provider, no credential.
 */

function sameSet(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && new Set(a).size === a.length &&
    a.every((x) => b.includes(x));
}

function subsetOf(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.every((x) => b.includes(x));
}

/**
 * Checks 1–10 of §5. Read-only: never reserves, acquires or consumes anything. Checks 3–7 are
 * deliberately evaluated independently, never short-circuited, so each can be exercised in isolation
 * with the rest of a request valid (§5, §12, §13).
 */
export function evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now }) {
  const reasons = [];

  // 1–2: authorization exists, unexpired, unrevoked, unused, and its (synthetic) owner proof verifies.
  const auth = authorizationLedger.validate({ authorizationId: request.authorizationId, now });
  if (!auth.ok) reasons.push(auth.reason);

  // 3: base_sha is still the task's live base — independent of whether the spec hash still matches.
  if (request.baseSha !== sources.currentBaseSha) reasons.push('stale_base');

  // 4: spec_sha256 matches the real spec content at base_sha — independent of base freshness.
  if (request.specSha256 !== sources.specShaAtBase) reasons.push('spec_modified');

  // 5: every decision the task requires is approved in an independent registry.
  if (!subsetOf(sources.requiredDecisions, sources.approvedDecisions)) reasons.push('decision_pending');

  // 6: every dependency has real Git proof of `done`.
  if (sources.dependencies.some((d) => d.doneProofOk !== true)) reasons.push('dependency_incomplete');

  // 7: scope_files matches ROADMAP + this task's own HANDOFF reservation, and does not overlap any
  // other active task's HANDOFF reservation (reserva ajena — static, independent of the Lease Store).
  if (!sameSet(request.scopeFiles, sources.roadmapPlannedFiles) || !sameSet(request.scopeFiles, sources.ownHandoffFiles)) {
    reasons.push('scope_files_mismatch');
  }
  if (sources.foreignHandoffReservations.some((r) => scopesOverlap(r.files, request.scopeFiles))) {
    reasons.push('foreign_reservation_conflict');
  }

  // 8: a dry-run check that a budget reservation would succeed — does not reserve anything yet.
  if (!budgetLedger.canReserve(request.estimatedCostCents)) reasons.push('budget_not_available');

  // 9: a dry-run check that no live lease overlaps — operational, distinct from the static check 7.
  if (leaseStore.hasOverlap(request.scopeFiles)) reasons.push('lease_overlap');

  // 10: effective permissions of the trusted components involved never exceed the documented minimum.
  if (!subsetOf(sources.effectivePermissions, sources.minimumRequiredPermissions)) {
    reasons.push('permissions_exceed_minimum');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * The durable admission operation (§5): acquire lease → reserve budget → consume authorization,
 * each step compensating only what it itself acquired on failure. `simulate.budgetReserve` /
 * `simulate.authorizationConsume` set to `'lost'` model a confirmation lost *after* the real,
 * underlying step executed — the step still really happens; only the caller's ability to observe its
 * result is withheld, exactly as a real network timeout would behave. Use `reconcilePendingAdmission`
 * to resolve the resulting `unknown_outcome`.
 */
export function admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now, simulate = {} }) {
  const checks = evaluateAdmissionChecks({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  if (!checks.ok) return { admitted: false, reasons: checks.reasons };

  const taskId = request.taskId;
  const lease = leaseStore.acquire({ taskId, scopeFiles: request.scopeFiles });
  if (!lease.ok) return { admitted: false, reasons: [lease.reason] };
  const fenceToken = lease.fenceToken;

  const budget = budgetLedger.reserve({ taskId, fenceToken, estimatedCostCents: request.estimatedCostCents });
  if (simulate.budgetReserve === 'lost') {
    return { outcome: 'unknown_outcome', pendingStep: 'reserveBudget', taskId, fenceToken, authorizationId: request.authorizationId };
  }
  if (!budget.ok) {
    leaseStore.invalidate({ taskId, fenceToken });
    leaseStore.release({ taskId, fenceToken });
    return { admitted: false, reasons: [budget.reason] };
  }

  const consumed = authorizationLedger.consume({ authorizationId: request.authorizationId, now });
  if (simulate.authorizationConsume === 'lost') {
    return { outcome: 'unknown_outcome', pendingStep: 'consumeAuthorization', taskId, fenceToken, authorizationId: request.authorizationId };
  }
  if (!consumed.ok) {
    budgetLedger.release({ taskId, fenceToken });
    leaseStore.invalidate({ taskId, fenceToken });
    leaseStore.release({ taskId, fenceToken });
    return { admitted: false, reasons: [consumed.reason] };
  }

  return { admitted: true, taskId, fenceToken };
}

/**
 * Resolves an `unknown_outcome` from `admitTask` by re-reading the real, durable state of the step
 * that was pending — never by assuming, and never by releasing on the strength of elapsed time alone.
 * A pending step whose underlying operation is confirmed to have failed is released (compensated,
 * invalidating the fencing token first); a step confirmed to have actually succeeded is kept.
 */
export function reconcilePendingAdmission({ pending, leaseStore, budgetLedger, authorizationLedger }) {
  const { taskId, fenceToken, pendingStep, authorizationId } = pending;
  const lease = leaseStore.inspect(taskId);
  if (!lease || lease.fenceToken !== fenceToken || lease.invalidated) {
    return { reconciled: true, outcome: 'lease_no_longer_live', confirmed: false };
  }

  if (pendingStep === 'reserveBudget') {
    const budget = budgetLedger.inspect(taskId);
    if (!budget.reserved || budget.reserved.fenceToken !== fenceToken) {
      leaseStore.invalidate({ taskId, fenceToken });
      leaseStore.release({ taskId, fenceToken });
      return { reconciled: true, outcome: 'released', confirmedStep: 'reserveBudget', confirmed: false };
    }
    return { reconciled: true, outcome: 'kept', confirmedStep: 'reserveBudget', confirmed: true };
  }

  if (pendingStep === 'consumeAuthorization') {
    const auth = authorizationLedger.inspect(authorizationId);
    if (!auth?.consumed) {
      budgetLedger.release({ taskId, fenceToken });
      leaseStore.invalidate({ taskId, fenceToken });
      leaseStore.release({ taskId, fenceToken });
      return { reconciled: true, outcome: 'released', confirmedStep: 'consumeAuthorization', confirmed: false };
    }
    return { reconciled: true, outcome: 'kept', confirmedStep: 'consumeAuthorization', confirmed: true };
  }

  throw new Error('Unknown pending step');
}
