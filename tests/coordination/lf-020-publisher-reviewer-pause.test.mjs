import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LeaseStore } from '../../scripts/autopilot/lease-store.mjs';
import { BudgetLedger } from '../../scripts/autopilot/budget-ledger.mjs';
import { AuthorizationLedger } from '../../scripts/autopilot/authorization-ledger.mjs';
import { admitTask } from '../../scripts/autopilot/admission-validator.mjs';
import { invokeProvider } from '../../scripts/autopilot/provider-invocation.mjs';
import { validatePublication } from '../../scripts/autopilot/publisher.mjs';
import { reviewDelivery } from '../../scripts/autopilot/reviewer-gate.mjs';
import { PauseController, admitIfNotPaused } from '../../scripts/autopilot/pause-controller.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('../../docs/autopilot/fixtures/lf-001d/baseline.json', import.meta.url), 'utf8'));

function clone(value) { return JSON.parse(JSON.stringify(value)); }

/** A fresh, valid baseline admission scenario and a fresh set of ledgers to admit it into. */
function freshScenario() {
  const f = clone(FIXTURE);
  const authorizationLedger = new AuthorizationLedger();
  authorizationLedger.register(f.authorization);
  const leaseStore = new LeaseStore();
  const budgetLedger = new BudgetLedger({ hardLimitCents: 1000 });
  return { request: f.request, sources: f.sources, now: f.now, authorizationLedger, leaseStore, budgetLedger };
}

const VALID_LIMITS = { maxFiles: 10, maxTotalBytes: 1000 };

// ---------------------------------------------------------------------------
// Publisher: diff validation (design §13 "Publisher mock")
// ---------------------------------------------------------------------------

test('Publisher: a valid diff within scope_files is accepted', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/specs/LF-020.md', content: 'hello', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('Publisher: rejects path traversal', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: '../etc/passwd', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['invalid_path']);
});

test('Publisher: rejects a traversal segment embedded mid-path', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/../secrets.env', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['invalid_path']);
});

test('Publisher: rejects a symlink even if the path is otherwise in scope', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/specs/LF-020.md', content: 'x', isSymlink: true }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['symlink_rejected']);
});

test('Publisher: rejects a file outside scope_files', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/specs/LF-999.md', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['outside_scope']);
});

test('Publisher: rejects a touch on .github/workflows/ regardless of scope_files', () => {
  const result = validatePublication({
    scopeFiles: ['.github/workflows/ci.yml'],
    diff: [{ path: '.github/workflows/ci.yml', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['forbidden_path']);
});

test('Publisher: rejects a touch on docs/DECISIONS.md regardless of scope_files', () => {
  const result = validatePublication({
    scopeFiles: ['docs/DECISIONS.md'],
    diff: [{ path: 'docs/DECISIONS.md', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['forbidden_path']);
});

test('Publisher: rejects a touch on docs/autopilot/BACKLOG.json regardless of scope_files', () => {
  const result = validatePublication({
    scopeFiles: ['docs/autopilot/BACKLOG.json'],
    diff: [{ path: 'docs/autopilot/BACKLOG.json', content: 'x', isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['forbidden_path']);
});

test('Publisher: rejects a disproportionately large diff by total bytes', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/specs/LF-020.md', content: 'x'.repeat(2000), isSymlink: false }],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['diff_too_large']);
});

test('Publisher: rejects a diff touching more files than the configured limit', () => {
  const scopeFiles = Array.from({ length: 12 }, (_, i) => `docs/specs/LF-${i}.md`);
  const diff = scopeFiles.map((path) => ({ path, content: 'x', isSymlink: false }));
  const result = validatePublication({ scopeFiles, diff, limits: VALID_LIMITS });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['too_many_files']);
});

test('Publisher: rejects a duplicate path within the same diff', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [
      { path: 'docs/specs/LF-020.md', content: 'a', isSymlink: false },
      { path: 'docs/specs/LF-020.md', content: 'b', isSymlink: false }
    ],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['duplicate_path']);
});

test('Publisher: rejects an empty diff', () => {
  const result = validatePublication({ scopeFiles: ['docs/specs/LF-020.md'], diff: [], limits: VALID_LIMITS });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['empty_diff']);
});

test('Publisher: collects multiple independent violations across distinct entries in one call', () => {
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [
      { path: '../etc/passwd', content: 'x', isSymlink: false },
      { path: 'docs/specs/LF-020.md', content: 'x', isSymlink: true }
    ],
    limits: VALID_LIMITS
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['invalid_path', 'symlink_rejected']);
});

test('Publisher: throws (caller programming error) on missing/invalid limits rather than silently allowing anything', () => {
  assert.throws(() => validatePublication({ scopeFiles: ['docs/specs/LF-020.md'], diff: [], limits: undefined }));
  assert.throws(() => validatePublication({ scopeFiles: ['docs/specs/LF-020.md'], diff: [], limits: { maxFiles: 0, maxTotalBytes: 10 } }));
});

test('Publisher: never executes or imports diff content — a hostile "content" string is never run', () => {
  let executed = false;
  const hostileContent = { toString() { executed = true; return 'x'; } };
  const result = validatePublication({
    scopeFiles: ['docs/specs/LF-020.md'],
    diff: [{ path: 'docs/specs/LF-020.md', content: hostileContent, isSymlink: false }],
    limits: VALID_LIMITS
  });
  // content is not a string, so byte length counts as 0; the point is that .toString()/execution never happens.
  assert.equal(executed, false);
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------------------
// Reviewer gate: self-review, SHA binding, simulated flag (design §13 "Reviewer gate mock")
// ---------------------------------------------------------------------------

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

test('Reviewer gate: accepts a distinct reviewer approving the exact delivered SHA', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha: SHA_A, approvedSha: SHA_A, approved: true, simulated: true });
  assert.deepEqual(result, { ok: true, reasons: [] });
});

test('Reviewer gate: rejects self-review even with a correct SHA and approved+simulated flags', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Claude', deliveredSha: SHA_A, approvedSha: SHA_A, approved: true, simulated: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['self_review']);
});

test('Reviewer gate: rejects an approval bound to a different SHA than the one actually delivered', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha: SHA_A, approvedSha: SHA_B, approved: true, simulated: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['approval_sha_mismatch']);
});

test('Reviewer gate: rejects an approval missing the explicit simulated flag', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha: SHA_A, approvedSha: SHA_A, approved: true, simulated: false });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['missing_simulated_flag']);
});

test('Reviewer gate: rejects when approved is not literally true', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha: SHA_A, approvedSha: SHA_A, approved: 'yes', simulated: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['not_approved']);
});

test('Reviewer gate: rejects malformed SHAs instead of comparing them loosely', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha: 'not-a-sha', approvedSha: 'also-not-a-sha', approved: true, simulated: true });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('invalid_delivered_sha'));
  assert.ok(result.reasons.includes('invalid_approved_sha'));
  // A mismatch is not reported on top of two already-invalid SHAs.
  assert.ok(!result.reasons.includes('approval_sha_mismatch'));
});

test('Reviewer gate: collects every independent violation in a single call', () => {
  const result = reviewDelivery({ executorId: 'Claude', reviewerId: 'Claude', deliveredSha: SHA_A, approvedSha: SHA_B, approved: false, simulated: false });
  assert.deepEqual(result.reasons, ['approval_sha_mismatch', 'missing_simulated_flag', 'not_approved', 'self_review']);
});

// ---------------------------------------------------------------------------
// Pause controller: PAUSA and recovery (design §9, §13 "Pause controller mock")
// ---------------------------------------------------------------------------

test('Pause controller: starts unpaused and does not block admission before pause() is called', () => {
  const controller = new PauseController();
  assert.equal(controller.paused, false);
  assert.equal(controller.blocksAdmission(), false);
});

test('Pause controller: no new admission is evaluated at all once paused', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const controller = new PauseController();
  controller.pause({ authorizationLedger, leaseStore, tasks: [] });

  const result = admitIfNotPaused({ pauseController: controller, sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.deepEqual(result, { admitted: false, reasons: ['paused'] });
  // Not merely denied: nothing was touched to reach that denial.
  assert.equal(leaseStore.inspect(request.taskId), null);
  assert.equal(budgetLedger.inspect(request.taskId).reserved, null);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, false);
});

test('Pause controller: admission proceeds normally through admitIfNotPaused while not paused', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const controller = new PauseController();
  const result = admitIfNotPaused({ pauseController: controller, sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(result.admitted, true);
});

test('Pause controller: resuming lifts the admission block but a pending authorization revoked during pause cannot be reused — recovery requires a brand-new authorization', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const controller = new PauseController();

  // Pause before the task is ever admitted: its authorization is still pending (not yet consumed).
  controller.pause({ authorizationLedger, leaseStore, tasks: [{ taskId: request.taskId, fenceToken: undefined, authorizationId: request.authorizationId }] });
  assert.equal(authorizationLedger.inspect(request.authorizationId).revoked, true);

  controller.resume();
  assert.equal(controller.blocksAdmission(), false);

  // Resuming only lifted the global admission block; the SAME authorization is still revoked.
  const retry = admitIfNotPaused({ pauseController: controller, sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(retry.admitted, false);
  assert.ok(retry.reasons.includes('authorization_revoked'));
});

test('Pause controller: a confirmed external stop invalidates and releases a lease with no in-flight attempt', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(admitted.admitted, true);

  const controller = new PauseController();
  const result = controller.pause({
    authorizationLedger, leaseStore,
    tasks: [{ taskId: admitted.taskId, fenceToken: admitted.fenceToken, authorizationId: request.authorizationId }],
    confirmStopped: () => true
  });

  assert.deepEqual(result.tasks[0], {
    taskId: admitted.taskId, fenceToken: admitted.fenceToken, authorizationId: request.authorizationId,
    cancelled: false, revoked: true, confirmed: true, leaseReleased: true
  });
  assert.equal(leaseStore.inspect(admitted.taskId), null);
});

test('Pause controller: without confirmation of an external stop, the lease stays blocked, not released', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });

  const controller = new PauseController();
  const result = controller.pause({
    authorizationLedger, leaseStore,
    tasks: [{ taskId: admitted.taskId, fenceToken: admitted.fenceToken, authorizationId: request.authorizationId }]
    // confirmStopped omitted: never assume a stop that was never confirmed.
  });

  assert.equal(result.tasks[0].confirmed, false);
  assert.equal(result.tasks[0].leaseReleased, false);
  assert.notEqual(leaseStore.inspect(admitted.taskId), null);
});

test('Pause controller: regression — preserves the unknown_outcome block even when confirmStopped wrongly returns true, because the registered attempt makes invalidate() itself refuse', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  const { taskId, fenceToken } = admitted;

  // Simulate a lost response: this registers the one-time attempt and blocks the budget as 'unknown'.
  const invocation = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken, send: () => 'sent', responseLost: true });
  assert.equal(invocation.outcome, 'unknown_outcome');

  const controller = new PauseController();
  const result = controller.pause({
    authorizationLedger, leaseStore,
    tasks: [{ taskId, fenceToken, authorizationId: request.authorizationId }],
    confirmStopped: () => true, // even an (incorrectly) confirmed stop must not override the fencing rule.
    cancel: () => {}
  });

  assert.equal(result.tasks[0].confirmed, true);
  assert.equal(result.tasks[0].leaseReleased, false);
  const lease = leaseStore.inspect(taskId);
  assert.notEqual(lease, null);
  assert.equal(lease.attemptRegistered, true);
  // The budget stays unreconciled too — neither this controller nor anything else frees it by assumption.
  assert.equal(budgetLedger.inspect(taskId).costUnknown, true);
});

test('Pause controller: a throwing cancel callback never escapes pause() and is recorded as not cancelled', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });

  const controller = new PauseController();
  assert.doesNotThrow(() => controller.pause({
    authorizationLedger, leaseStore,
    tasks: [{ taskId: admitted.taskId, fenceToken: admitted.fenceToken, authorizationId: request.authorizationId }],
    cancel: () => { throw new Error('simulated external cancellation failure'); }
  }));
  const log = controller.inspectRecoveryLog();
  assert.equal(log[log.length - 1].cancelled, false);
});

test('Pause controller: recovery evidence is appended, never overwritten or deleted, even after resume()', () => {
  const controller = new PauseController();
  controller.pause({ authorizationLedger: new AuthorizationLedger(), leaseStore: new LeaseStore(), tasks: [{ taskId: 'LF-099' }] });
  controller.recordRecoveryEvidence({ taskId: 'LF-099', providerRunId: 'run-123', state: 'terminal', costObservedOrUnknown: 'unknown', reason: 'lost_response' });
  controller.resume();
  const log = controller.inspectRecoveryLog();
  assert.equal(log.length, 2);
  assert.equal(log[0].at, 'pause');
  assert.deepEqual(log[1], { taskId: 'LF-099', providerRunId: 'run-123', state: 'terminal', costObservedOrUnknown: 'unknown', reason: 'lost_response', at: 'recovery' });
});

test('Pause controller: recordRecoveryEvidence rejects a non-object entry rather than logging a meaningless row', () => {
  const controller = new PauseController();
  assert.throws(() => controller.recordRecoveryEvidence(null));
  assert.throws(() => controller.recordRecoveryEvidence('a string is not an evidence record'));
});

// ---------------------------------------------------------------------------
// Integration: admission -> provider invocation -> pause/recovery, with the LF-019 controls
// ---------------------------------------------------------------------------

test('Integration: full chain — admit, invoke with a lost response, pause (blocked, no release), resume requires a new authorization', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();

  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(admitted.admitted, true);
  const { taskId, fenceToken } = admitted;

  const invocation = invokeProvider({ leaseStore, budgetLedger, taskId, fenceToken, send: () => { throw new Error('network blip'); } });
  assert.equal(invocation.outcome, 'unknown_outcome');

  const controller = new PauseController();
  controller.pause({
    authorizationLedger, leaseStore,
    tasks: [{ taskId, fenceToken, authorizationId: request.authorizationId }],
    confirmStopped: () => false, // no external confirmation obtained yet
    cancel: () => {}
  });
  assert.equal(controller.blocksAdmission(), true);

  // The lease, the budget block, and the consumed/now-revoked authorization are all still in place.
  assert.notEqual(leaseStore.inspect(taskId), null);
  assert.equal(budgetLedger.inspect(taskId).costUnknown, true);
  assert.equal(authorizationLedger.inspect(request.authorizationId).revoked, true);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, true);

  controller.resume();
  // The same authorization (already consumed, now also revoked) can never admit again — not because
  // PauseController retried anything, but because a brand-new authorization is required, per §9.
  const retry = admitIfNotPaused({ pauseController: controller, sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(retry.admitted, false);
  assert.ok(retry.reasons.includes('authorization_reused') || retry.reasons.includes('authorization_revoked'));
});

test('Integration: a successfully delivered-and-approved task would still require Publisher + Reviewer gate before any merge, independent of the admission/budget/lease controls', () => {
  const { request, sources, now, authorizationLedger, leaseStore, budgetLedger } = freshScenario();
  const admitted = admitTask({ sources, authorizationLedger, budgetLedger, leaseStore, request, now });
  assert.equal(admitted.admitted, true);

  const invocation = invokeProvider({ leaseStore, budgetLedger, taskId: admitted.taskId, fenceToken: admitted.fenceToken, send: () => 'sent' });
  assert.equal(invocation.outcome, 'sent');

  const deliveredSha = SHA_A;
  const publication = validatePublication({
    scopeFiles: request.scopeFiles,
    diff: request.scopeFiles.map((path) => ({ path, content: 'synthetic change', isSymlink: false })),
    limits: VALID_LIMITS
  });
  assert.equal(publication.ok, true);

  const review = reviewDelivery({ executorId: 'Claude', reviewerId: 'Codex', deliveredSha, approvedSha: deliveredSha, approved: true, simulated: true });
  assert.equal(review.ok, true);

  // Neither validatePublication nor reviewDelivery ever touches the ledgers: the lease/budget/
  // authorization state admitTask/invokeProvider already produced is unaffected by either check.
  assert.notEqual(leaseStore.inspect(admitted.taskId), null);
  assert.equal(authorizationLedger.inspect(request.authorizationId).consumed, true);
});
