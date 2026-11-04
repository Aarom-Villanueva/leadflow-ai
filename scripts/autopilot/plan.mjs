import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ID = /^LF-\d{3}[a-z]?$/;
const OWNERS = new Set(['Codex', 'Claude', 'ChatGPT']);
const STATUSES = new Set(['done', 'in_progress', 'queued', 'blocked']);

export function planAutopilot(input) {
  if (!input || input.schema_version !== 1 || typeof input.execution_enabled !== 'boolean' || !Array.isArray(input.tasks) || !Number.isInteger(input.max_parallel) || input.max_parallel < 1 || input.max_parallel > 2) {
    throw new Error('Invalid backlog configuration');
  }
  const approvals = new Set(input.approved_decisions || []);
  if (!Array.isArray(input.approved_decisions) || [...approvals].some((x) => !/^D-\d{3}(?:bis)?$/.test(x))) throw new Error('Invalid approvals');
  const tasks = new Map();
  for (const t of input.tasks) {
    if (!t || !ID.test(t.id) || tasks.has(t.id) || !OWNERS.has(t.owner) || !OWNERS.has(t.reviewer) || t.owner === t.reviewer || !STATUSES.has(t.status) || !Array.isArray(t.depends_on) || !Array.isArray(t.required_decisions) || typeof t.spec !== 'string' || !t.spec.startsWith('docs/')) throw new Error('Invalid task');
    if (t.status === 'queued' && t.owner === 'ChatGPT') throw new Error('Only Codex or Claude may execute queued tasks');
    if (t.depends_on.some(x => !ID.test(x)) || t.required_decisions.some(x => !/^D-\d{3}(?:bis)?$/.test(x))) throw new Error('Invalid task dependency');
    tasks.set(t.id, t);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Cyclic dependency');
    if (visited.has(id)) return;
    const t = tasks.get(id);
    if (!t) throw new Error(`Missing dependency ${id}`);
    visiting.add(id);
    for (const dep of t.depends_on) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  const eligible = [];
  const blocked = [];
  for (const t of tasks.values()) {
    if (t.status !== 'queued') continue;
    const missing = t.depends_on.filter(id => tasks.get(id).status !== 'done');
    const decisions = t.required_decisions.filter(x => !approvals.has(x));
    if (missing.length || decisions.length) blocked.push({id: t.id, dependencies: missing, decisions});
    else eligible.push({id: t.id, owner: t.owner, reviewer: t.reviewer, spec: t.spec});
  }
  const selected = [];
  const owners = new Set();
  for (const task of eligible) {
    if (selected.length >= input.max_parallel) break;
    if (!owners.has(task.owner)) { selected.push(task); owners.add(task.owner); }
  }
  return {
    mode: input.execution_enabled ? 'configured-not-dispatched' : 'dry-run',
    execution_enabled: input.execution_enabled,
    selected,
    blocked,
    in_progress: [...tasks.values()].filter(t => t.status === 'in_progress').map(t=>t.id),
    note: 'Read-only planner: never starts agents, writes to GitHub, merges, spends, or deploys.'
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const file = process.argv[2] || 'docs/autopilot/BACKLOG.json';
    const input = JSON.parse(readFileSync(file, 'utf8'));
    console.log(JSON.stringify(planAutopilot(input), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}