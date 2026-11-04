import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { simulateAdmission, simulateTransition } from './simulate.mjs';

const SHA = /^[a-f0-9]{40}$/;
const ACTORS = new Set(['Codex', 'Claude']);
const TASK = /^LF-\d{3}[a-z]?$/;
const PATH = /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function invalid(reason) {
  return { mode: 'simulation-only', result: 'denied', reason, trace: [], execution_enabled: false };
}
function validFile(file) {
  return typeof file === 'string' && PATH.test(file) && !file.split('/').some(p => p === '.' || p === '..');
}

/**
 * Inert adapter that returns preprogrammed, synthetic reports.
 * It has no network, shell, filesystem writes, tokens, GitHub access, or provider SDKs.
 * A successful trace is NOT a real code change, review, merge or authorization.
 */
export function runFakeAgent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('invalid_input');
  const { scenario, review, evidence } = input;
  if (!scenario || !review || !evidence) return invalid('missing_inputs');
  if (scenario.backlog?.execution_enabled !== false || scenario.contract?.execution_enabled !== false) {
    return invalid('execution_must_remain_disabled');
  }
  // A real payment permission, GitHub identity or token is never accepted as part of a fake run.
  if (Object.hasOwn(input, 'credentials') || Object.hasOwn(input, 'token') ||
      Object.hasOwn(input, 'api_key') || Object.hasOwn(input, 'dispatch') ||
      Object.hasOwn(input, 'provider') || Object.hasOwn(input, 'workflow')) {
    return invalid('unsupported_operational_input');
  }
  let candidate;
  try { candidate = simulateAdmission(scenario); }
  catch { return invalid('malformed_admission_scenario'); }
  if (candidate.result !== 'would_admit' || candidate.mode !== 'simulation-only' ||
      candidate.lease?.simulated !== true) {
    return { ...invalid('admission_denied'), admission_reasons: candidate.reasons || [] };
  }
  const lease = candidate.lease;
  const contract = scenario.contract;
  if (!TASK.test(lease.task_id) || !ACTORS.has(lease.implementer) ||
      !ACTORS.has(lease.reviewer) || lease.implementer === lease.reviewer ||
      !Array.isArray(contract.files) || contract.files.length === 0 ||
      !contract.files.every(validFile)) {
    return invalid('invalid_simulated_contract');
  }
  // No text supplied by an agent or external reviewer can self-authorize a transition.
  if (review.agent !== lease.reviewer || review.approved !== true ||
      review.simulated !== true || review.task_id !== lease.task_id) {
    return invalid('independent_fake_review_required');
  }
  if (evidence.simulated !== true || evidence.task_id !== lease.task_id ||
      !SHA.test(evidence.synthetic_head_sha ?? '') ||
      evidence.synthetic_head_sha === contract.base_sha ||
      evidence.changed_files?.length !== contract.files.length ||
      !Array.isArray(evidence.changed_files) ||
      new Set(evidence.changed_files).size !== evidence.changed_files.length ||
      evidence.changed_files.some(file => !contract.files.includes(file))) {
    return invalid('invalid_synthetic_delivery');
  }
  if (review.synthetic_head_sha !== evidence.synthetic_head_sha) {
    return invalid('reviewed_sha_mismatch');
  }
  const running = simulateTransition(lease, 'running');
  const reviewing = simulateTransition(running, 'review');
  const ready = simulateTransition(reviewing, 'ready_for_owner', { reviewer: review.agent });
  const id = digest([lease.idempotency_key, evidence.synthetic_head_sha, review.agent, 'fake-v1']);
  return {
    mode: 'simulation-only', result: 'fake_ready_for_owner', execution_enabled: false,
    simulated: true, idempotency_key: id,
    task_id: ready.task_id, implementer: ready.implementer, reviewer: ready.reviewer,
    synthetic_head_sha: evidence.synthetic_head_sha,
    changed_files: [...evidence.changed_files],
    cost_observed_cents: 0,
    trace: ['synthetic_admission', 'synthetic_implementation', 'synthetic_review', 'fake_ready_for_owner'],
    note: 'No agent was contacted; no code, PR, Git merge, real review or owner approval exists.'
  };
}

/**
 * Pure replay simulator: detects duplicates without persistent leases or external actions.
 */
export function replayFakeAgent(input, seenKeys = []) {
  if (!Array.isArray(seenKeys) || !seenKeys.every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key))) {
    return invalid('invalid_replay_state');
  }
  const output = runFakeAgent(input);
  if (output.result !== 'fake_ready_for_owner') return output;
  if (seenKeys.includes(output.idempotency_key)) return invalid('duplicate_replay');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1) throw new Error('Expected one local JSON fixture path');
    const scenario = JSON.parse(readFileSync(args[0], 'utf8'));
    console.log(JSON.stringify(runFakeAgent(scenario), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
