/**
 * In-memory Authorization Ledger, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1 and §5.
 * Offline simulation only: no real owner identity provider, no network.
 *
 * `verifyOwnerIdentityFake` is an explicit, synthetic stand-in for the real identity/trust-root
 * mechanism, which docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §11 leaves as an open decision.
 * It proves nothing about a real owner and must never be read as satisfying that decision.
 */

const FAKE_PROOF = /^OWNER-PROOF-FAKE:/;

/** Synthetic, offline-only check. Never a real identity or trust-root verification (§11). */
export function verifyOwnerIdentityFake(authorizationId, proof) {
  return typeof proof === 'string' && FAKE_PROOF.test(proof) && proof === `OWNER-PROOF-FAKE:${authorizationId}`;
}

function validEntry(entry) {
  return entry && typeof entry === 'object' &&
    typeof entry.authorizationId === 'string' && entry.authorizationId &&
    typeof entry.taskId === 'string' && entry.taskId &&
    /^[a-f0-9]{64}$/.test(entry.specSha256 ?? '') &&
    Array.isArray(entry.scopeFiles) && entry.scopeFiles.length > 0 &&
    Number.isInteger(entry.expiresAt) &&
    Number.isInteger(entry.maxAttempts) && entry.maxAttempts === 1 &&
    typeof entry.ownerIdentityProofFake === 'string' &&
    typeof entry.revoked === 'boolean';
}

export class AuthorizationLedger {
  #entries = new Map(); // authorizationId -> { ...entry, consumed }

  /** Registers a one-time authorization. Never called by the executor; owner-side only. */
  register(entry) {
    if (!validEntry(entry)) throw new Error('Invalid authorization entry');
    if (this.#entries.has(entry.authorizationId)) throw new Error('Duplicate authorization_id');
    this.#entries.set(entry.authorizationId, { ...entry, scopeFiles: [...entry.scopeFiles], consumed: false });
  }

  revoke(authorizationId) {
    const e = this.#entries.get(authorizationId);
    if (!e) return { confirmed: true, ok: false, reason: 'unknown_authorization' };
    e.revoked = true;
    return { confirmed: true, ok: true };
  }

  /**
   * Read-only check 1–2 of §5: exists, not expired, not revoked, not reused, and the owner identity
   * proof (synthetic) verifies. Never mutates; never consumes.
   */
  validate({ authorizationId, now }) {
    const e = this.#entries.get(authorizationId);
    if (!e) return { ok: false, reason: 'unknown_authorization' };
    if (e.consumed) return { ok: false, reason: 'authorization_reused' };
    if (e.revoked) return { ok: false, reason: 'authorization_revoked' };
    if (!Number.isInteger(now) || now >= e.expiresAt) return { ok: false, reason: 'authorization_expired' };
    if (!verifyOwnerIdentityFake(authorizationId, e.ownerIdentityProofFake)) return { ok: false, reason: 'owner_identity_unverified' };
    return { ok: true, entry: { ...e, scopeFiles: [...e.scopeFiles] } };
  }

  /**
   * Step 3 of the durable admission operation (§5): irreversibly marks the authorization consumed.
   * A consumed authorization never admits again, regardless of what happens afterward.
   */
  consume({ authorizationId, now }) {
    const check = this.validate({ authorizationId, now });
    if (!check.ok) return { confirmed: true, ok: false, reason: check.reason };
    const e = this.#entries.get(authorizationId);
    e.consumed = true;
    return { confirmed: true, ok: true };
  }

  /** Read-only snapshot for reconciliation and tests; never mutates. */
  inspect(authorizationId) {
    const e = this.#entries.get(authorizationId);
    return e ? { ...e, scopeFiles: [...e.scopeFiles] } : null;
  }
}
