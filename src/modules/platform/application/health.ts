/** Liveness only. This does not claim database/provider readiness. */
export function getHealth() {
  return { status: "ok", service: "leadflow-ai" } as const;
}
