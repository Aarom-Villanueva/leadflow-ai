import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, simulateAdmission, simulateTransition } from '../../scripts/autopilot/simulate.mjs';

// Fixtures use synthetic values only. SIM-* is not an actual owner approval.
const sha = 'a'.repeat(40);
const spec = '# LF-002a\nSynthetic test contract\n';
function sample() {
  return {
    backlog: {
      schema_version: 1, execution_enabled: false, tasks: [
        { id: 'LF-001b', owner: 'ChatGPT', reviewer: 'Claude', status: 'done', depends_on: [], required_decisions: [], spec: 'docs/specs/LF-001b.md' },
        { id: 'LF-002a', owner: 'Codex', reviewer: 'Claude', status: 'queued', depends_on: ['LF-001b'], required_decisions: ['D-001'], spec: 'docs/specs/LF-002a.md' }
      ]
    },
    specText: spec,
    contract: {
      schema_version: 2, execution_enabled: false, task_id: 'LF-002a', implementer: 'Codex',
      reviewer: 'Claude', spec_path: 'docs/specs/LF-002a.md',
      base_sha: sha, contract_sha: digest(spec), files: ['docs/specs/LF-002a.md'],
      estimated_cost_cents: 1, approval_id: 'SIM-fixture', attempt: 0, max_attempts: 1
    },
    policy: {
      base_sha: sha, reservedFiles: ['docs/specs/**'], otherReservations: [],
      approvedDecisions: ['D-001'], approval_id: 'SIM-fixture', hard_limit_cents: 100, max_parallel: 2
    },
    existingLeases: []
  };
}
function mustDeny(input, code) {
  const result = simulateAdmission(input);
  assert.equal(result.result, 'denied', JSON.stringify(result));
  assert.equal(result.admissible, false);
  assert.equal(result.mode, 'simulation-only');
  assert.equal(result.lease, null);
  assert.ok(result.reasons.includes(code), JSON.stringify(result.reasons));
}
test('baseline fixture is a simulation, not a real permission', () => {
  const result = simulateAdmission(sample());
  assert.equal(result.result, 'would_admit');
  assert.equal(result.lease.simulated, true);
});
test('M1: invalid task ID is independently rejected', () => {
  const s = sample(); s.contract.task_id = 'LF-../../evil'; mustDeny(s, 'invalid_task_id');
});
test('M1: invalid spec path including traversal is independently rejected', () => {
  const s = sample(); s.contract.spec_path = 'docs/specs/../../.env'; mustDeny(s, 'invalid_spec_path');
});
test('M1: absent or malformed backlog is rejected without a TypeError', () => {
  const s = sample(); s.backlog.tasks = null; mustDeny(s, 'invalid_backlog');
  const t = sample(); t.backlog.tasks = [null]; mustDeny(t, 'invalid_backlog');
  const u = sample(); u.backlog.tasks.push({...u.backlog.tasks[0]}); mustDeny(u, 'invalid_backlog');
});
test('M1: malformed foreign reservations fail closed without a TypeError', () => {
  const s = sample(); s.policy.otherReservations = [{task_id:'LF-003',files:[null]}]; mustDeny(s, 'invalid_other_reservations');
  const t = sample(); t.policy.otherReservations = [{task_id:'LF-003',files:null}]; mustDeny(t, 'invalid_other_reservations');
});
test('M1: malformed lease record is rejected', () => {
  const s = sample(); s.existingLeases = [{task_id:42, implementer:'Claude'}]; mustDeny(s, 'invalid_lease_state');
  const t = sample(); t.existingLeases = [null]; mustDeny(t, 'invalid_lease_state');
});
test('M1: invalid parallelism setting rejects', () => {
  const s = sample(); s.policy.max_parallel = 0; mustDeny(s, 'invalid_parallel_limit');
  const t = sample(); t.policy.max_parallel = 3; mustDeny(t, 'invalid_parallel_limit');
});
test('M1: invalid own file reservation rejects without an exception', () => {
  const s = sample(); s.policy.reservedFiles = [null]; mustDeny(s, 'invalid_reservation');
  const t = sample(); t.policy.reservedFiles = ['../secret/**']; mustDeny(t, 'invalid_reservation');
});
test('foreign directory glob reservation blocks individual file (no wildcard files)', () => {
  const s = sample(); s.policy.otherReservations = [{task_id:'LF-003',files:['docs/**']}];
  mustDeny(s, 'reservation_conflict');
});
test('invalid reservation types cannot crash the admission decision', () => {
  const s = sample(); s.policy.otherReservations = [{task_id:'LF-003',files:[123]}];
  mustDeny(s, 'invalid_other_reservations');
});
test('a zero-cost estimate still requires simulation authorization', () => {
  const s = sample(); s.contract.estimated_cost_cents = 0;
  s.policy.approval_id = null; s.contract.approval_id = null;
  mustDeny(s, 'missing_simulation_approval');
});
test('attempt 1 is deliberately forbidden in simulator (B2)', () => {
  const s = sample(); s.contract.attempt = 1; s.contract.max_attempts = 2;
  mustDeny(s, 'invalid_attempt');
});
test('a caller declaration is NOT real Git verification (B3)', () => {
  const lease = simulateAdmission(sample()).lease;
  const running = simulateTransition(lease, 'running');
  const review = simulateTransition(running, 'review');
  const ready = simulateTransition(review, 'ready_for_owner', {reviewer:'Claude'});
  const done = simulateTransition(ready, 'done', {
    owner_approved:true, git_verified:true, merge_sha:sha
  });
  assert.equal(done.simulated, true);
  assert.equal(done.state, 'done');
  // This deliberately tests a caller assertion, not a real git merge. No other system can rely on this result.
});
