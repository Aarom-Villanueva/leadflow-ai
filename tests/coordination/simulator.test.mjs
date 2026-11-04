import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, simulateAdmission, simulateTransition } from '../../scripts/autopilot/simulate.mjs';

const SHA = 'a'.repeat(40);
const specText = '# LF-002a\nApproved synthetic specification for offline tests.\n';
function scenario() {
  return {
    backlog: { schema_version: 1, execution_enabled: false, tasks: [
      {id: 'LF-001b', owner: 'ChatGPT', reviewer: 'Claude', status: 'done', spec: 'docs/specs/LF-001b.md', depends_on: [], required_decisions: []},
      {id: 'LF-002a', owner: 'Codex', reviewer: 'Claude', status: 'queued',
        spec: 'docs/specs/LF-002a.md', depends_on: ['LF-001b'], required_decisions: ['D-001']}
    ] },
    specText,
    contract: { schema_version: 2, execution_enabled: false, task_id: 'LF-002a', implementer: 'Codex',
      reviewer: 'Claude', spec_path: 'docs/specs/LF-002a.md', contract_sha: digest(specText),
      base_sha: SHA, files: ['docs/specs/LF-002a.md'], estimated_cost_cents: 5,
      approval_id: 'SIM-test-only', attempt: 0, max_attempts: 1 },
    policy: { base_sha: SHA, reservedFiles: ['docs/specs/LF-002a.md'], otherReservations: [],
      approvedDecisions: ['D-001'], approval_id: 'SIM-test-only', hard_limit_cents: 50,
      max_parallel: 2 },
    existingLeases: []
  };
}
const denied = (s, reason) => {
  const r = simulateAdmission(s);
  assert.equal(r.admissible, false);
  assert.equal(r.mode, 'simulation-only');
  assert.equal(r.lease, null);
  assert.ok(r.reasons.includes(reason), JSON.stringify(r.reasons));
};
test('synthetic authorized path is only would_admit, never a real dispatch', () => {
  const r = simulateAdmission(scenario());
  assert.equal(r.result, 'would_admit'); assert.equal(r.mode, 'simulation-only');
  assert.equal(r.lease.simulated, true); assert.equal(r.lease.state, 'admitted');
  assert.match(r.lease.idempotency_key, /^[a-f0-9]{64}$/);
});
test('a replay generates the same deterministic idempotency key', () => {
  assert.equal(simulateAdmission(scenario()).lease.idempotency_key, simulateAdmission(scenario()).lease.idempotency_key);
});
test('fails closed when backlog is enabled', () => { const s=scenario(); s.backlog.execution_enabled=true; denied(s,'backlog_not_disabled'); });
test('fails closed when contract is enabled', () => { const s=scenario(); s.contract.execution_enabled=true; denied(s,'contract_not_disabled'); });
test('missing specification or wrong hash blocks', () => {
  const s=scenario(); s.specText=''; denied(s,'missing_specification');
  const t=scenario(); t.contract.contract_sha='b'.repeat(64); denied(t,'contract_hash_mismatch');
});
test('base SHA mismatch blocks stale branch', () => { const s=scenario(); s.policy.base_sha='b'.repeat(40); denied(s,'stale_base_sha'); });
test('unmet dependencies block', () => { const s=scenario(); s.backlog.tasks[0].status='in_progress'; denied(s,'unmet_dependencies'); });
test('decisions require independent approval record, not backlog claims', () => { const s=scenario(); s.policy.approvedDecisions=[]; denied(s,'unapproved_decisions'); });
test('invalid agent or self-review blocks', () => { const s=scenario(); s.contract.reviewer='Codex'; denied(s,'invalid_agents'); });
test('missing explicit mock approval blocks, null never implies unlimited permission', () => {
  const s=scenario(); s.contract.approval_id=null; denied(s,'missing_simulation_approval');
  const t=scenario(); t.policy.hard_limit_cents=null; denied(t,'budget_not_authorized');
});
test('budget exceeded blocks even simulation', () => { const s=scenario(); s.contract.estimated_cost_cents=51; denied(s,'budget_not_authorized'); });
test('outside of reservation and traversal path blocked', () => {
  const s=scenario(); s.contract.files=['src/app/page.tsx']; denied(s,'out_of_scope');
  const t=scenario(); t.contract.files=['../.env']; denied(t,'invalid_files');
});
test('foreign active reservation is respected', () => {
  const s=scenario(); s.policy.otherReservations=[{task_id:'LF-003',files:['docs/**']}];
  denied(s,'reservation_conflict');
});
test('same task or actor lease cannot run twice', () => {
  const s=scenario(); s.existingLeases=[{task_id:'LF-002a',implementer:'Codex'}];
  denied(s,'duplicate_or_busy_lease');
  const t=scenario(); t.existingLeases=[{task_id:'LF-999',implementer:'Codex'}];
  denied(t,'duplicate_or_busy_lease');
});
test('maximum parallel limit enforced', () => {
  const s=scenario(); s.policy.max_parallel=1;
  s.existingLeases=[{task_id:'LF-003',implementer:'Claude'}];
  denied(s,'parallel_limit');
});
test('invalid attempts and missing task block', () => {
  const s=scenario();s.contract.attempt=2;denied(s,'invalid_attempt');
  const t=scenario();t.contract.task_id='LF-099';denied(t,'task_not_queued');
});
test('in-progress agent cannot be selected again', () => {
  const s=scenario();s.backlog.tasks[0].owner='Codex';s.backlog.tasks[0].status='in_progress';
  denied(s,'implementer_busy');
});
test('simulated state transitions cannot skip stages or self-approve', () => {
  const lease=simulateAdmission(scenario()).lease;
  assert.throws(()=>simulateTransition(lease,'done',{owner_approved:true,git_verified:true,merge_sha:SHA}),/Invalid/);
  const running=simulateTransition(lease,'running');
  const review=simulateTransition(running,'review');
  assert.throws(()=>simulateTransition(review,'ready_for_owner',{reviewer:'Codex'}),/Independent/);
  const ready=simulateTransition(review,'ready_for_owner',{reviewer:'Claude'});
  assert.throws(()=>simulateTransition(ready,'done',{owner_approved:true}),/Git-verified/);
  const done=simulateTransition(ready,'done',{owner_approved:true,git_verified:true,merge_sha:SHA});
  assert.equal(done.state,'done');assert.equal(lease.state,'admitted');
});
test('explicitly paused scenario requires restarting admission, not continuing execution', () => {
  const lease=simulateAdmission(scenario()).lease;
  const paused=simulateTransition(lease,'paused');
  assert.equal(paused.state,'paused');
  assert.throws(()=>simulateTransition(paused,'running'),/Invalid/);
});
