import { execFileSync } from 'node:child_process';
import { readReservations } from '../check-coordination.mjs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ID = /^LF-\d{3}[a-z]?$/;

function parseBacklog(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || value.schema_version !== 1 || value.execution_enabled !== false || !Array.isArray(value.tasks)) {
    throw new Error('Invalid or enabled backlog: fail closed');
  }
  const ids = new Set();
  for (const task of value.tasks) {
    if (!task || !ID.test(task.id) || ids.has(task.id) || typeof task.status !== 'string') {
      throw new Error('Invalid or duplicate backlog task');
    }
    ids.add(task.id);
  }
  return value;
}

/**
 * Check all done flags against merged Git history reachable from the PR base.
 * The HEAD under review must not be used as proof of its own completion.
 * This is read-only, requires no tokens, and never dispatches agents.
 */
export function verifyBacklogDone({ previousBacklog, backlog, handoff, baseSha, git }) {
  if (!SHA.test(baseSha ?? '') || typeof git !== 'function') throw new Error('Missing trusted base/Git reader');
  const old = parseBacklog(previousBacklog);
  const current = parseBacklog(backlog);
  const registry = readReservations(handoff);
  const records = new Map(registry.map(task => [task.id, task]));
  const currentTasks = new Map(current.tasks.map(task => [task.id, task]));
  const errors = [];
  const verified = [];

  for (const previous of old.tasks) {
    const next = currentTasks.get(previous.id);
    if (!next) errors.push(previous.id + ': task removed from backlog');
    else if (previous.status === 'done' && next.status !== 'done') errors.push(previous.id + ': done status regressed');
  }

  for (const task of current.tasks) {
    if (task.status !== 'done') continue;
    const reservation = records.get(task.id);
    const proof = reservation?.completion;
    if (!reservation || reservation.state !== 'completed' || !proof ||
        !SHA.test(proof.head_sha ?? '') || !SHA.test(proof.merge_sha ?? '') ||
        reservation.owner !== task.owner || !reservation.branch) {
      errors.push(task.id + ': missing valid completed reservation');
      continue;
    }
    try {
      const parents = git('rev-list', '--parents', '-n', '1', proof.merge_sha).trim().split(/\s+/);
      if (parents[0] !== proof.merge_sha || parents.length < 3 || !parents.slice(2).includes(proof.head_sha)) {
        errors.push(task.id + ': merge parent proof rejected');
        continue;
      }
      // The merge MUST already exist on the trusted PR base, not just the proposed HEAD.
      git('merge-base', '--is-ancestor', proof.merge_sha, baseSha);
      if (!git('show', '-s', '--format=%s', proof.merge_sha).includes(task.id)) {
        errors.push(task.id + ': merge subject does not match task');
        continue;
      }
      verified.push(task.id);
    } catch {
      errors.push(task.id + ': merge not verifiable on base');
    }
  }
  if (errors.length) throw new Error('Backlog done proof rejected:\n' + [...new Set(errors)].sort().join('\n'));
  return { mode: 'read-only-backlog-proof', verified_done: verified.sort(), execution_enabled: false };
}

export function main(args) {
  const map = Object.fromEntries(Array.from({ length: Math.floor(args.length / 2) }, (_, i) => [args[2 * i], args[2 * i + 1]]));
  const base = map['--base'], head = map['--head'];
  if (!SHA.test(base ?? '') || !SHA.test(head ?? '')) throw new Error('Expected --base SHA --head SHA');
  const git = (...params) => execFileSync('git', params, { encoding: 'utf8' });
  const show = (sha, file) => git('show', sha + ':' + file);
  const result = verifyBacklogDone({
    previousBacklog: show(base, 'docs/autopilot/BACKLOG.json'),
    backlog: show(head, 'docs/autopilot/BACKLOG.json'),
    handoff: show(head, 'docs/HANDOFF.md'),
    baseSha: base,
    git
  });
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
