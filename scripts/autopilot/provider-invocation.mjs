/**
 * Simulated Provider invocation, per docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md §1, §5
 * ("Aplicación del fencing al inicio de la invocación al proveedor") and §6.
 *
 * Offline simulation only: `send` is always a caller-supplied, local callback. This module never
 * contacts a real provider, never holds a real credential, and never opens a network connection.
 * It exists to exercise the fencing protocol at the one moment the design treats as most sensitive:
 * the instant before a real send would happen.
 */

/**
 * Registers the one-time invocation attempt via the Lease Store's single atomic conditional write,
 * then — and only then — calls `send()`. If that registration fails (an invalidated or stale fencing
 * token), `send` is never called: zero sends.
 *
 * `responseLost: true` simulates the confirmation of whether `send()` actually went out being lost
 * (e.g. network timeout) *after* the attempt was already durably registered. The real result of
 * `send()` is irrelevant to the caller in that case: this function reports `unknown_outcome` without
 * revealing it, because a real caller in that situation could not have observed it either.
 */
export function invokeProvider({ leaseStore, taskId, fenceToken, send, responseLost = false }) {
  const registration = leaseStore.registerAttempt({ taskId, fenceToken });
  if (!registration.ok) {
    return { outcome: 'denied', reason: registration.reason, sent: false };
  }
  if (responseLost) {
    send(); // The attempt is already registered; the call may or may not have reached the provider.
    return { outcome: 'unknown_outcome', sent: 'unknown' };
  }
  const result = send();
  return { outcome: 'sent', sent: true, result };
}
