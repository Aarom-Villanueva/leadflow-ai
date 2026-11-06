/**
 * Simulated Reviewer gate, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §4 and §13.
 *
 * Offline simulation only: every field is a caller-supplied synthetic value — never a real GitHub
 * review, a real identity, or a real Git operation. This module never contacts GitHub, never reads a
 * real PR, and its `ok: true` result is never, by itself, an authorization to merge — it only gates
 * the one check the design assigns to this component: reviewer identity distinct from the executor,
 * and approval bound to the exact delivered SHA.
 *
 * Mirrors the same checks `fake-agent.mjs` already applies to its synthetic `review` object
 * (`review.agent !== lease.reviewer`, the `simulated` flag, and the SHA binding between `review` and
 * `evidence`), generalized here as a standalone, reusable gate.
 */

const SHA = /^[a-f0-9]{40}$/;

function validSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

function validId(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Collects every violation independently — never short-circuits — so a caller can see all the
 * reasons a delivery was rejected, not just the first one checked.
 *
 * Returns `{ ok: true }` or `{ ok: false, reasons: string[] }`.
 */
export function reviewDelivery({ executorId, reviewerId, deliveredSha, approvedSha, approved, simulated }) {
  const reasons = [];

  if (!validId(executorId)) reasons.push('invalid_executor');
  if (!validId(reviewerId)) reasons.push('invalid_reviewer');
  if (validId(executorId) && validId(reviewerId) && executorId === reviewerId) reasons.push('self_review');

  if (!validSha(deliveredSha)) reasons.push('invalid_delivered_sha');
  if (!validSha(approvedSha)) reasons.push('invalid_approved_sha');
  if (validSha(deliveredSha) && validSha(approvedSha) && deliveredSha !== approvedSha) {
    reasons.push('approval_sha_mismatch');
  }

  if (approved !== true) reasons.push('not_approved');
  if (simulated !== true) reasons.push('missing_simulated_flag');

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}
