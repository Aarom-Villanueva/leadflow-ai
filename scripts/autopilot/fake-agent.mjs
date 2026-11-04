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

const FORBIDDEN_OPERATIONAL_KEYS = new Set([
  'credentials', 'credential', 'token', 'api_key', 'apikey', 'dispatch',
  'provider', 'workflow', 'secret', 'authorization', 'access_token', 'api_token'
]);

/**
 * Accept JSON-shaped synthetic fixtures only. Inspect every own key, including
 * non-enumerable keys, before reading any scenario data. Do not invoke getters.
 * Fail closed for recursive references, unusual prototypes, or oversized input.
 */
function inspectSyntheticFixture(root) {
  const seen = new WeakSet();
  let nodes = 0;
  function visit(value, depth) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return null;
    if (!value || typeof value !== 'object' || depth > 24 || ++nodes > 10000 || seen.has(value)) {
      return 'invalid_fixture_structure';
    }
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? proto !== Array.prototype :
      proto !== Object.prototype && proto !== null) return 'invalid_fixture_structure';
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return 'invalid_fixture_structure';
      const normalized = key.toLowerCase().replace(/[-\s]/g, '_');
      if (FORBIDDEN_OPERATIONAL_KEYS.has(normalized)) return 'unsupported_operational_input';
      const field = Object.getOwnPropertyDescriptor(value, key);
      if (!field || !Object.hasOwn(field, 'value')) return 'invalid_fixture_structure';
      const reason = visit(field.value, depth + 1);
      if (reason) return reason;
    }
    return null;
  }
  try { return visit(root, 0); }
  catch { return 'invalid_fixture_structure'; }
}

/**
 * Inert adapter that returns preprogrammed, synthetic reports.
 * It has no network, shell, filesystem writes, tokens, GitHub access, or provider SDKs.
 * A successful trace is NOT a real code change, review, merge or authorization.
 */
export function runFakeAgent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('invalid_input');
  const fixtureProblem = inspectSyntheticFixture(input);
  if (fixtureProblem) return invalid(fixtureProblem);
  const { scenario, review, evidence } = input;
  if (!scenario || !review || !evidence) return invalid('missing_inputs');
  if (scenario.backlog?.execution_enabled !== false || scenario.contract?.execution_enabled !== false) {
    return invalid('execution_must_remain_disabled');
  }
  // Operational input is rejected recursively before any admission decision.
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
