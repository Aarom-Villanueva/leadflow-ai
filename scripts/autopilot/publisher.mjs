/**
 * Simulated Publisher, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §2 and §13.
 *
 * Offline simulation only: `diff` is always a caller-supplied, synthetic list of
 * `{ path, content, isSymlink }` entries — never a real filesystem read, a real Git diff, or a real
 * GitHub write. This module performs no I/O: it never writes to GitHub, never opens a branch, and
 * never executes, imports or evaluates `content` — it only inspects path strings, the `isSymlink`
 * flag and content length, exactly as a Publisher's own path/size validation would, before any real
 * write credential (which this module never holds) would be used.
 *
 * Reuses the same path-validation pattern as `validFile` in fake-agent.mjs: a relative path made of
 * `/`-separated segments of `[a-zA-Z0-9._-]`, with no `.`/`..` segment (no traversal).
 */

const PATH = /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/;

const FORBIDDEN_EXACT = new Set(['docs/DECISIONS.md', 'docs/autopilot/BACKLOG.json']);
const FORBIDDEN_PREFIX = '.github/workflows/';

function validPath(path) {
  return typeof path === 'string' && PATH.test(path) && !path.split('/').some((segment) => segment === '.' || segment === '..');
}

function isForbidden(path) {
  return FORBIDDEN_EXACT.has(path) || path.startsWith(FORBIDDEN_PREFIX);
}

function validScopeFiles(scopeFiles) {
  return Array.isArray(scopeFiles) && scopeFiles.length > 0 && scopeFiles.every(validPath);
}

function validLimits(limits) {
  return limits && typeof limits === 'object' &&
    Number.isInteger(limits.maxFiles) && limits.maxFiles > 0 &&
    Number.isSafeInteger(limits.maxTotalBytes) && limits.maxTotalBytes > 0;
}

/**
 * Validates a synthetic diff before a publication that this function never actually performs.
 * `limits` is required and caller-supplied — never a hidden default — so every test and caller is
 * explicit about what "disproportionate" means for its own scenario (§13: "diff de tamaño
 * desproporcionado"). Every reason is collected independently: an entry already rejected for one
 * reason (invalid path, duplicate, symlink) is not also checked against scope/forbidden-list/size, so
 * one malformed entry never masks or inflates another's reasons.
 *
 * Returns `{ ok: true }` or `{ ok: false, reasons: string[] }`; never throws for a bad diff entry —
 * only for a caller-programming error in `scopeFiles`/`limits` themselves.
 */
export function validatePublication({ scopeFiles, diff, limits }) {
  if (!validScopeFiles(scopeFiles)) throw new Error('Invalid scope_files');
  if (!validLimits(limits)) throw new Error('Invalid publication limits');
  if (!Array.isArray(diff)) throw new Error('Invalid diff');

  const reasons = [];
  if (diff.length === 0) reasons.push('empty_diff');
  if (diff.length > limits.maxFiles) reasons.push('too_many_files');

  const seenPaths = new Set();
  let totalBytes = 0;

  for (const entry of diff) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      reasons.push('invalid_diff_entry');
      continue;
    }
    const { path, content, isSymlink } = entry;
    if (!validPath(path)) {
      reasons.push('invalid_path');
      continue;
    }
    if (seenPaths.has(path)) {
      reasons.push('duplicate_path');
      continue;
    }
    seenPaths.add(path);
    if (isSymlink === true) {
      reasons.push('symlink_rejected');
      continue;
    }
    if (isForbidden(path)) {
      reasons.push('forbidden_path');
      continue;
    }
    if (!scopeFiles.includes(path)) {
      reasons.push('outside_scope');
      continue;
    }
    totalBytes += typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0;
  }

  if (totalBytes > limits.maxTotalBytes) reasons.push('diff_too_large');

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)].sort() };
}
