/**
 * Resultado de un intento administrativo según lo que respondió el servidor (docs/specs/LF-030.md, «Intento incierto»).
 * Módulo puro: la pantalla decide con esto si una respuesta resuelve el intento o lo deja incierto.
 *
 * - `confirmed`: 2xx con el recibo de esa misma solicitud.
 * - `rejected`: el servidor demostró que el cambio no se aplicó y no se aplicará:
 *   un primer envío con 4xx legible, o un reintento con 409 `VERSION_CONFLICT`. El servidor consulta el recibo antes de
 *   comparar versiones y las versiones solo crecen, así que ese rechazo no puede ser de un original ya confirmado ni
 *   convertirse después en un éxito.
 * - `uncertain`: todo lo demás. Un 403/404 al reintentar no basta (el actor puede recuperar acceso y un original aún
 *   en vuelo podría confirmarse); tampoco un 5xx, la falta de respuesta ni una respuesta ilegible.
 */
export type AttemptOutcome = "confirmed" | "rejected" | "uncertain";
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function classifyAttempt(requestId: string, retry: boolean, status: number | undefined, body: unknown): AttemptOutcome {
  if (status === undefined) return "uncertain";
  if (status >= 200 && status < 300) return object(body) && body.requestId === requestId && typeof body.operation === "string" && object(body.result) ? "confirmed" : "uncertain";
  if (status < 400 || status >= 500 || !object(body)) return "uncertain";
  if (!retry) return "rejected";
  return status === 409 && body.code === "VERSION_CONFLICT" ? "rejected" : "uncertain";
}
