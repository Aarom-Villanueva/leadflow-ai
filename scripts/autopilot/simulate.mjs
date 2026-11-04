import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const TASK = /^LF-\d{3}[a-z]?$/;
const ACTORS = new Set(['Codex', 'Claude']);
const STATES = new Set(['queued', 'admitted', 'running', 'review', 'ready_for_owner', 'done', 'failed', 'paused']);
const NEXT = Object.freeze({
  queued: ['admitted'], admitted: ['running', 'paused'], running: ['review', 'failed', 'paused'],
  review: ['ready_for_owner', 'failed', 'paused'], ready_for_owner: ['done', 'paused'],
  failed: ['queued', 'paused'], paused: ['queued'], done: []
});

export function digest(text) {
  if (typeof text !== 'string') throw new Error('Specification must be UTF-8 text');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function uniqueStrings(list, pattern) {
  return Array.isArray(list) && list.every(x => typeof x === 'string' && pattern.test(x)) &&
    new Set(list).size === list.length;
}

function validPath(path) {
  return typeof path === 'string' && /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/.test(path) &&
    !path.split('/').some(s => s === '.' || s === '..');
}

function covers(pattern, file) {
  if (typeof pattern !== 'string' || !validPath(file)) return false;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return validPath(prefix) && file.startsWith(prefix + '/');
  }
  return validPath(pattern) && pattern === file;
}

function validReservation(pattern) {
  return validPath(pattern) || (typeof pattern === 'string' && pattern.endsWith('/**') &&
    validPath(pattern.slice(0, -3)));
}

function deny(reasons) {
  return { mode: 'simulation-only', admissible: false, result: 'denied', reasons: [...new Set(reasons)].sort(), lease: null };
}

/**
 * A fail-closed *simulation*. No GitHub client, shell runner, secrets, or agent invocation.
 * "admissible" means a synthetic scenario clears the preflight checks; never authority to execute.
 */
export function simulateAdmission(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid simulator scenario');
  const { backlog, contract, policy, specText, existingLeases = [] } = input;
  if (!backlog || !contract || !policy || !Array.isArray(existingLeases)) throw new Error('Missing scenario contract');
  const reasons = [];
  if (backlog.schema_version !== 1 || backlog.execution_enabled !== false) reasons.push('backlog_not_disabled');
  if (contract.schema_version !== 2 || contract.execution_enabled !== false) reasons.push('contract_not_disabled');
  if (!TASK.test(contract.task_id ?? '')) reasons.push('invalid_task_id');
  if (!ACTORS.has(contract.implementer) || !ACTORS.has(contract.reviewer) || contract.implementer === contract.reviewer) reasons.push('invalid_agents');
  if (typeof contract.spec_path !== 'string' || !validPath(contract.spec_path) || !contract.spec_path.startsWith('docs/specs/')) reasons.push('invalid_spec_path');
  if (typeof specText !== 'string' || specText.trim().length === 0) reasons.push('missing_specification');
  if (!SHA.test(contract.base_sha ?? '') || !SHA.test(policy.base_sha ?? '') || contract.base_sha !== policy.base_sha) reasons.push('stale_base_sha');
  if (!/^[a-f0-9]{64}$/.test(contract.contract_sha ?? '') || typeof specText !== 'string' || contract.contract_sha !== digest(specText ?? '')) reasons.push('contract_hash_mismatch');
  if (!uniqueStrings(contract.files, /^(?!.*\.\.)[a-zA-Z0-9._/-]+$/) || !contract.files?.every(validPath) || contract.files?.length === 0) reasons.push('invalid_files');
  if (!Array.isArray(policy.reservedFiles) || policy.reservedFiles.length === 0 || !policy.reservedFiles.every(validReservation)) reasons.push('invalid_reservation');
  if (Array.isArray(contract.files) && Array.isArray(policy.reservedFiles) &&
      contract.files.some(file => !policy.reservedFiles.some(pattern => covers(pattern, file)))) reasons.push('out_of_scope');
  if (!Array.isArray(policy.otherReservations) || policy.otherReservations.some(item => !item || !Array.isArray(item.files) || item.files.some(x => !validReservation(x)))) reasons.push('invalid_other_reservations');
  if (Array.isArray(contract.files) && Array.isArray(policy.otherReservations) &&
      contract.files.some(file => policy.otherReservations.some(item => Array.isArray(item?.files) && item.files.some(p => covers(p, file))))) reasons.push('reservation_conflict');

  const tasks = Array.isArray(backlog.tasks) ? backlog.tasks : [];
  if (!Array.isArray(backlog.tasks) || tasks.some(t => !t || typeof t.id !== 'string') ||
      new Set(tasks.map(t => t?.id)).size !== tasks.length) reasons.push('invalid_backlog');
  const task = tasks.find(t => t && t.id === contract.task_id);
  if (!task || task.status !== 'queued') reasons.push('task_not_queued');
  if (task && (task.owner !== contract.implementer || task.reviewer !== contract.reviewer || task.spec !== contract.spec_path)) reasons.push('task_contract_mismatch');
  if (task && (!Array.isArray(task.depends_on) || task.depends_on.some(id => tasks.filter(t => t && t.id === id && t.status === 'done').length !== 1))) reasons.push('unmet_dependencies');
  if (task && (!Array.isArray(task.required_decisions) || !Array.isArray(policy.approvedDecisions) ||
      task.required_decisions.some(id => !policy.approvedDecisions.includes(id)))) reasons.push('unapproved_decisions');
  if (!Array.isArray(backlog.tasks) || tasks.some(t => t && t.status === 'in_progress' && t.owner === contract.implementer)) reasons.push('implementer_busy');

  // All limits are scenario-only, not real payment authorization.
  if (typeof policy.approval_id !== 'string' || !policy.approval_id.startsWith('SIM-') || contract.approval_id !== policy.approval_id) reasons.push('missing_simulation_approval');
  if (!Number.isSafeInteger(policy.hard_limit_cents) || policy.hard_limit_cents <= 0 ||
      !Number.isSafeInteger(contract.estimated_cost_cents) || contract.estimated_cost_cents < 0 ||
      contract.estimated_cost_cents > policy.hard_limit_cents) reasons.push('budget_not_authorized');
  if (!Number.isInteger(policy.max_parallel) || policy.max_parallel < 1 || policy.max_parallel > 2) reasons.push('invalid_parallel_limit');
  if (!Number.isInteger(contract.attempt) || !Number.isInteger(contract.max_attempts) || contract.max_attempts < 1 ||
      contract.max_attempts > 2 || contract.attempt !== 0) reasons.push('invalid_attempt');
  if (!Array.isArray(existingLeases) || existingLeases.some(l => !l || typeof l.task_id !== 'string' || !ACTORS.has(l.implementer))) reasons.push('invalid_lease_state');
  if (existingLeases.some(l => l.task_id === contract.task_id || l.implementer === contract.implementer)) reasons.push('duplicate_or_busy_lease');
  if (Number.isInteger(policy.max_parallel) && existingLeases.length >= policy.max_parallel) reasons.push('parallel_limit');

  if (reasons.length) return deny(reasons);
  const key = digest(JSON.stringify([contract.task_id, contract.base_sha, contract.contract_sha, contract.attempt]));
  return {
    mode: 'simulation-only', admissible: true, result: 'would_admit', reasons: [],
    lease: { idempotency_key: key, task_id: contract.task_id, implementer: contract.implementer,
      reviewer: contract.reviewer, state: 'admitted', attempt: contract.attempt, simulated: true }
  };
}

/** Deterministic, in-memory transition test. Does not mutate its input. */
export function simulateTransition(lease, nextState, evidence = {}) {
  if (!lease || lease.simulated !== true || !STATES.has(lease.state) || !STATES.has(nextState) ||
      !NEXT[lease.state].includes(nextState)) throw new Error('Invalid simulated transition');
  if (nextState === 'ready_for_owner' && evidence.reviewer !== lease.reviewer) throw new Error('Independent reviewer required');
  if (nextState === 'done' && (!evidence.owner_approved || !SHA.test(evidence.merge_sha ?? '') || evidence.git_verified !== true)) {
    throw new Error('Owner approval and Git-verified merge required');
  }
  return { ...lease, state: nextState, simulated: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const path = process.argv[2] || 'docs/autopilot/fixtures/denied.json';
    const scenario = JSON.parse(readFileSync(path, 'utf8'));
    console.log(JSON.stringify(simulateAdmission(scenario), null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
