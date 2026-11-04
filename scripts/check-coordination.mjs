import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';

function pattern(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('..') || value.includes('\\') || /\s/.test(value)) {
    throw new Error('Invalid repository-relative reservation pattern');
  }
  return value;
}

export function readReservations(markdown, { legacy = false } = {}) {
  const marker = '## Registro automático de coordinación';
  const section = markdown.split(marker)[1];
  if (!section && legacy) return [];
  if (!section) throw new Error('Missing coordination registry');
  const block = section.match(/```json\s*([\s\S]*?)```/);
  if (!block) throw new Error('Missing JSON coordination registry');
  const registry = JSON.parse(block[1]);
  if (registry.version !== 1 || !Array.isArray(registry.tasks)) throw new Error('Invalid registry version/tasks');
  const ids = new Set();
  return registry.tasks.map((task) => {
    if (!/^LF-\d+[a-z]?$/.test(task.id) || ids.has(task.id) || !['active', 'completed'].includes(task.state) || typeof task.branch !== 'string' || !task.branch || typeof task.owner !== 'string' || !task.owner || !Array.isArray(task.files) || task.files.length === 0) {
      throw new Error('Invalid or duplicate coordination task');
    }
    ids.add(task.id);
    if (task.completion) {
      if (task.state !== 'completed' || !/^[0-9a-f]{40}$/.test(task.completion.head_sha) || !/^[0-9a-f]{40}$/.test(task.completion.merge_sha)) throw new Error('Invalid completion evidence');
    }
    return { ...task, files: task.files.map(pattern) };
  });
}

export function readPlannedFiles(markdown, taskId) {
  const rows = markdown.split('\n').filter((line) => line.startsWith('|'));
  const header = rows.find((line) => line.includes('Archivos previstos'));
  if (!header) throw new Error('Missing roadmap file column');
  const column = header.split('|').map((cell) => cell.trim()).indexOf('Archivos previstos');
  const row = rows.find((line) => line.split('|')[1]?.trim().split(' ')[0] === taskId);
  if (!row) throw new Error(`Missing roadmap task ${taskId}`);
  return row.split('|')[column].trim().split(',').map((entry) => pattern(entry.trim()));
}

/** Only release a previously active reservation after the owning branch was actually merged into the PR base.
 * This is a narrow, reviewable exception; simply editing state to completed cannot release a live task. */
export function verifiedMergeReleases({ previous, current, base, git }) {
  const result = [];
  for (const old of previous) {
    if (old.state !== 'active') continue;
    const now = current.find(task => task.id === old.id);
    if (!now || now.state !== 'completed' || now.branch !== old.branch || now.owner !== old.owner || !now.completion) continue;
    const { head_sha, merge_sha } = now.completion;
    try {
      const parents = git('rev-list', '--parents', '-n', '1', merge_sha).trim().split(/\s+/);
      if (parents[0] !== merge_sha || parents.length < 3 || !parents.slice(2).includes(head_sha)) continue;
      if (git('merge-base', '--is-ancestor', merge_sha, base) !== '') continue;
      if (!git('show', '-s', '--format=%s', merge_sha).includes(old.id)) continue;
      result.push(old.id);
    } catch { /* Missing proof fails closed. */ }
  }
  return result;
}

export function checkCoordination({ files, branch, roadmap, handoff, baseHandoff, releasedTaskIds = [] }) {
  const current = readReservations(handoff);
  const previous = readReservations(baseHandoff, { legacy: true });
  const own = current.filter((task) => task.branch === branch && task.state === 'active');
  if (own.length !== 1) throw new Error('Branch must identify exactly one active task');
  const task = own[0];
  const planned = readPlannedFiles(roadmap, task.id);
  const errors = [];
  const verifiedReleases = new Set(releasedTaskIds);
  // A task can be retired only with cryptographic merge-parent evidence, never by editing HEAD alone.
  const foreign = [...previous, ...current].filter((item) => item.id !== task.id && item.state === 'active' && !verifiedReleases.has(item.id));
  for (const file of files) {
    pattern(file);
    if (!planned.some((glob) => matchesGlob(file, glob))) errors.push(`${file}: outside ${task.id} roadmap scope`);
    if (!task.files.some((glob) => matchesGlob(file, glob))) errors.push(`${file}: missing own reservation`);
    for (const other of foreign) {
      if (other.files.some((glob) => matchesGlob(file, glob))) errors.push(`${file}: reserved by active task ${other.id}`);
    }
  }
  if (errors.length) throw new Error([...new Set(errors)].join('\n'));
  const foundation = files.some((file) => !/^(docs\/.*|.*\.md|LICENSE)$/.test(file));
  return { taskId: task.id, count: files.length, foundation };
}

export function main(args) {
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  const base = options['--base']; const head = options['--head']; const branch = options['--branch'];
  if (!base || !head || !branch || !/^[0-9a-f]{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head)) throw new Error('Expected --base SHA --head SHA --branch NAME');
  const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' });
  const show = (ref, file) => git('show', `${ref}:${file}`);
  const files = git('diff', '--name-only', '--no-renames', '-z', `${base}...${head}`).split('\0').filter(Boolean);
  const old = show(base, 'docs/HANDOFF.md');
  const now = show(head, 'docs/HANDOFF.md');
  const releasedTaskIds = verifiedMergeReleases({ previous: readReservations(old), current: readReservations(now), base, git });
  const result = checkCoordination({ files, branch, roadmap: show(head, 'docs/ROADMAP.md'), handoff: now, baseHandoff: old, releasedTaskIds });
  console.log(JSON.stringify({ ...result, verified_releases: releasedTaskIds }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `foundation=${result.foundation}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}