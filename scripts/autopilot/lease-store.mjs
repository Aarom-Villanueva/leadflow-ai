import { matchesGlob } from 'node:path';

/**
 * In-memory Lease Store with fencing, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1 and §5.
 * Offline simulation only: no persistence, no network, no real agent or provider contacted.
 * This store is always the durable source of truth for its own state; "confirmed" below means a
 * definite read of that state, never an assumption. Modeling a caller that cannot observe a result
 * (a lost response) is the caller's concern, not this store's: see admission-validator.mjs and
 * provider-invocation.mjs for how `unknown_outcome` is produced without ever consulting this file.
 */

function samePathOrGlobOverlap(a, b) {
  return a === b || matchesGlob(a, b) || matchesGlob(b, a);
}

/** Reuses the same directory-glob overlap criterion as scripts/check-coordination.mjs. */
export function scopesOverlap(scopeA, scopeB) {
  if (!Array.isArray(scopeA) || !Array.isArray(scopeB)) throw new Error('Invalid scope_files');
  return scopeA.some((a) => scopeB.some((b) => samePathOrGlobOverlap(a, b)));
}

function validScope(scopeFiles) {
  return Array.isArray(scopeFiles) && scopeFiles.length > 0 &&
    scopeFiles.every((f) => typeof f === 'string' && f.length > 0) &&
    new Set(scopeFiles).size === scopeFiles.length;
}

export class LeaseStore {
  #leases = new Map(); // taskId -> { taskId, scopeFiles, fenceToken, invalidated, attemptRegistered }
  #nextToken = 1;

  /** Read-only: would `acquire` for this scope be rejected right now by an overlapping live lease? */
  hasOverlap(scopeFiles) {
    if (!validScope(scopeFiles)) throw new Error('Invalid scope_files');
    for (const lease of this.#leases.values()) {
      if (!lease.invalidated && scopesOverlap(lease.scopeFiles, scopeFiles)) return true;
    }
    return false;
  }

  /**
   * Step 1 of the durable admission operation (§5). Rejects on any live lease, of this task or any
   * other, whose scope_files overlaps — exclusion by task AND by overlapping paths, across tasks and
   * authorizations alike.
   */
  acquire({ taskId, scopeFiles }) {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task_id');
    if (!validScope(scopeFiles)) throw new Error('Invalid scope_files');
    if (this.hasOverlap(scopeFiles)) return { confirmed: true, ok: false, reason: 'lease_overlap' };
    const fenceToken = this.#nextToken++;
    this.#leases.set(taskId, { taskId, scopeFiles: [...scopeFiles], fenceToken, invalidated: false, attemptRegistered: false });
    return { confirmed: true, ok: true, fenceToken };
  }

  /**
   * Invalidates the current fencing token for `taskId` before a reconciliation sweep releases or
   * reassigns its lease. Fails closed if an invocation attempt was already registered for the live
   * token — an in-flight send is never silently invalidated underneath.
   */
  invalidate({ taskId, fenceToken }) {
    const lease = this.#leases.get(taskId);
    if (!lease || lease.invalidated || lease.fenceToken !== fenceToken) {
      return { confirmed: true, ok: false, reason: 'unknown_or_stale_lease' };
    }
    if (lease.attemptRegistered) return { confirmed: true, ok: false, reason: 'attempt_already_registered' };
    lease.invalidated = true;
    return { confirmed: true, ok: true };
  }

  /** Releases a lease. Only a fencing token that is still live, or already invalidated, may release it. */
  release({ taskId, fenceToken }) {
    const lease = this.#leases.get(taskId);
    if (!lease) return { confirmed: true, ok: false, reason: 'unknown_lease' };
    if (lease.fenceToken !== fenceToken) return { confirmed: true, ok: false, reason: 'fence_token_mismatch' };
    this.#leases.delete(taskId);
    return { confirmed: true, ok: true };
  }

  /**
   * The single atomic conditional write Provider invocation relies on (§5, "Aplicación del fencing al
   * inicio de la invocación al proveedor"): registers the one-time invocation attempt if and only if
   * `fenceToken` is still the live, non-invalidated token for `taskId`. `invalidate` and
   * `registerAttempt` compete for the same state, so at most one of the two can ever succeed for a
   * given token.
   */
  registerAttempt({ taskId, fenceToken }) {
    const lease = this.#leases.get(taskId);
    if (!lease || lease.invalidated || lease.fenceToken !== fenceToken) {
      return { confirmed: true, ok: false, reason: 'fence_token_invalid' };
    }
    if (lease.attemptRegistered) return { confirmed: true, ok: false, reason: 'attempt_already_registered' };
    lease.attemptRegistered = true;
    return { confirmed: true, ok: true };
  }

  /** Read-only snapshot for reconciliation and tests; never mutates. */
  inspect(taskId) {
    const lease = this.#leases.get(taskId);
    return lease ? { ...lease, scopeFiles: [...lease.scopeFiles] } : null;
  }
}
