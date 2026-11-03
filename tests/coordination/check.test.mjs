import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkCoordination, readReservations } from '../../scripts/check-coordination.mjs';

const own = { id: 'LF-001', state: 'active', branch: 'integration/lf-001-foundation', owner: 'Codex', files: ['src/**', 'docs/**', 'README.md'] };
const other = { id: 'LF-003', state: 'active', branch: 'claude/ui', owner: 'Claude', files: ['src/components/**'] };
const registry = (tasks) => '## Registro automático de coordinación\n```json\n' + JSON.stringify({ version: 1, tasks }) + '\n```';
const roadmap = '| ID / responsable | Archivos previstos |\n|---|---|\n| LF-001 Codex | src/**, docs/**, README.md |';
const input = (files = ['src/app/page.tsx']) => ({ files, branch: own.branch, roadmap, handoff: registry([own, other]), baseHandoff: registry([own, other]) });

test('allows planned files reserved by the current task', () => {
  assert.deepEqual(checkCoordination(input()), { taskId: 'LF-001', count: 1, foundation: true });
});
test('rejects another active task reservation', () => {
  assert.throws(() => checkCoordination(input(['src/components/button.tsx'])), /reserved by active task LF-003/);
});
test('HEAD cannot release a reservation still active on base', () => {
  const value = input(['src/components/button.tsx']);
  value.handoff = registry([own, { ...other, state: 'completed' }]);
  assert.throws(() => checkCoordination(value), /LF-003/);
});
test('completed base reservations do not block work', () => {
  const value = input(['src/components/button.tsx']);
  value.baseHandoff = value.handoff = registry([own, { ...other, state: 'completed' }]);
  assert.equal(checkCoordination(value).foundation, true);
});
test('rejects files outside roadmap even if own reservation allows them', () => {
  const value = input(); value.roadmap = roadmap.replace('src/**, ', '');
  assert.throws(() => checkCoordination(value), /outside LF-001 roadmap scope/);
});
test('rejects missing own reservation, unregistered branch, duplicate IDs and invalid paths', () => {
  assert.throws(() => checkCoordination({ ...input(), handoff: registry([{ ...own, files: ['docs/**'] }]) }), /missing own reservation/);
  assert.throws(() => checkCoordination({ ...input(), branch: 'unregistered' }), /exactly one/);
  assert.throws(() => readReservations(registry([own, own])), /duplicate/);
  assert.throws(() => readReservations(registry([{ ...own, files: ['../outside'] }])), /pattern/);
});
test('docs-only changes keep the coordination check but skip foundation', () => {
  assert.equal(checkCoordination(input(['README.md', 'docs/HANDOFF.md'])).foundation, false);
  assert.equal(checkCoordination(input(['src/app/page.tsx', 'README.md'])).foundation, true);
});
test('fails closed on missing or malformed registry; accepts legacy only on base', () => {
  assert.throws(() => readReservations('old document'), /Missing/);
  assert.deepEqual(readReservations('old document', { legacy: true }), []);
  assert.throws(() => readReservations('## Registro automático de coordinación\n```json\n{}\n```', { legacy: true }), /Invalid/);
});
test('CLI positive and negative exit codes against actual git diffs', () => {
  const root = mkdtempSync(join(tmpdir(), 'lf-coordination-'));
  const cli = resolve('scripts/check-coordination.mjs');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
    mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'src/components'), { recursive: true });
    writeFileSync(join(root, 'docs/ROADMAP.md'), roadmap); writeFileSync(join(root, 'docs/HANDOFF.md'), registry([own, other]));
    git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'README.md'), 'allowed'); git('add', '.'); git('commit', '-qm', 'positive');
    const run = () => spawnSync(process.execPath, [cli, '--base', base, '--head', git('rev-parse', 'HEAD'), '--branch', own.branch], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
    const positive = run(); assert.equal(positive.status, 0, positive.stderr);
    writeFileSync(join(root, 'src/components/button.tsx'), 'reserved'); git('add', '.'); git('commit', '-qm', 'negative');
    const negative = run(); assert.equal(negative.status, 1); assert.match(negative.stderr, /reserved by active task LF-003/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
