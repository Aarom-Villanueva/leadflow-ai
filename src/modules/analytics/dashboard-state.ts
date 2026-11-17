import type { DashboardMetrics, DashboardSnapshot } from "./contracts";

/**
 * Coordinación del estado de la pantalla del dashboard (docs/specs/LF-028.md, «Coordinación del estado»).
 * Módulo puro: sin React, red ni reloj. Cada respuesta llega como un evento con la identidad de su solicitud
 * y solo cambia el estado si esa solicitud sigue vigente. Lo que la pantalla afirma se deriva de este estado,
 * nunca de banderas independientes.
 */
export type IntervalChoice = "30" | "90" | "180";
/** Identidad de un intento de guardado: se conserva tal cual mientras su resultado sea desconocido. */
export interface SaveAttempt { key: string; interval: IntervalChoice }
export type SaveState =
  | { status: "idle" }
  /** `resolving`: es el reintento de un intento incierto; un rechazo suyo no aclara si el original se guardó. */
  | { status: "saving"; attempt: SaveAttempt; resolving: boolean }
  /** El servidor respondió que no: no se guardó nada con esta solicitud. */
  | { status: "rejected"; attempt: SaveAttempt; reason: "limit" | "refused" }
  /** No hubo respuesta utilizable: el corte puede existir o no. Solo se resuelve reintentando la misma identidad. */
  | { status: "uncertain"; attempt: SaveAttempt; retryRefused?: "limit" | "refused" };
type Progress = "loading" | "ready" | "error";

export interface DashboardState {
  /** Intervalo elegido en el selector; es el que piden las métricas y el que usaría «Guardar corte». */
  interval: IntervalChoice;
  metrics: { request: number; status: Progress };
  /** Cifras en pantalla y de dónde salen: `snapshotId` solo cuando son exactamente las de un corte guardado. */
  view?: { metrics: DashboardMetrics; snapshotId: string | null };
  list: { request: number; status: Progress; items: DashboardSnapshot[] };
  /** Cortes confirmados por el servidor en esta sesión: ninguna lista, vieja o nueva, puede quitarlos. */
  confirmed: DashboardSnapshot[];
  lastSaved?: DashboardSnapshot;
  save: SaveState;
}

export type DashboardEvent =
  | { type: "metricsRequested"; request: number; interval: IntervalChoice }
  | { type: "metricsLoaded"; request: number; metrics: DashboardMetrics }
  | { type: "metricsFailed"; request: number }
  | { type: "listRequested"; request: number }
  | { type: "listLoaded"; request: number; items: DashboardSnapshot[] }
  | { type: "listFailed"; request: number }
  | { type: "saveStarted"; attempt: SaveAttempt }
  | { type: "saveConfirmed"; attempt: SaveAttempt; snapshot: DashboardSnapshot }
  | { type: "saveRejected"; attempt: SaveAttempt; reason: "limit" | "refused" }
  | { type: "saveUncertain"; attempt: SaveAttempt };

export const LISTED = 10;
/** Las primeras solicitudes (identidad 1) las lanza el montaje del componente. */
export const initialState: DashboardState = { interval: "90", metrics: { request: 1, status: "loading" }, list: { request: 1, status: "loading", items: [] }, confirmed: [], save: { status: "idle" } };

const sameAttempt = (a: SaveAttempt, b: SaveAttempt) => a.key === b.key && a.interval === b.interval;
const newestFirst = (a: DashboardSnapshot, b: DashboardSnapshot) => a.metrics.asOf === b.metrics.asOf ? (a.id < b.id ? 1 : -1) : a.metrics.asOf < b.metrics.asOf ? 1 : -1;
function merged(first: DashboardSnapshot[], second: DashboardSnapshot[]) {
  const seen = new Set<string>();
  return [...first, ...second].filter(snapshot => !seen.has(snapshot.id) && seen.add(snapshot.id)).sort(newestFirst);
}

export function reduce(state: DashboardState, event: DashboardEvent): DashboardState {
  switch (event.type) {
    case "metricsRequested":
      // Una solicitud más nueva deja sin efecto a todas las anteriores, lleguen cuando lleguen.
      return event.request > state.metrics.request ? { ...state, interval: event.interval, metrics: { request: event.request, status: "loading" } } : state;
    case "metricsLoaded":
      if (event.request !== state.metrics.request) return state;
      // Una respuesta para otro intervalo que el pedido no se muestra bajo el selector actual.
      if (String(event.metrics.interval.days) !== state.interval) return { ...state, metrics: { ...state.metrics, status: "error" } };
      return { ...state, metrics: { ...state.metrics, status: "ready" }, view: { metrics: event.metrics, snapshotId: null } };
    case "metricsFailed":
      return event.request === state.metrics.request ? { ...state, metrics: { ...state.metrics, status: "error" } } : state;
    case "listRequested":
      return event.request > state.list.request ? { ...state, list: { ...state.list, request: event.request, status: "loading" } } : state;
    case "listLoaded":
      return event.request === state.list.request ? { ...state, list: { request: event.request, status: "ready", items: event.items } } : state;
    case "listFailed":
      return event.request === state.list.request ? { ...state, list: { ...state.list, status: "error" } } : state;
    case "saveStarted":
      // Un guardado en curso no admite otro (doble clic); uno incierto solo admite su mismo reintento.
      if (state.save.status === "saving") return state;
      if (state.save.status === "uncertain" && !sameAttempt(state.save.attempt, event.attempt)) return state;
      return { ...state, save: { status: "saving", attempt: event.attempt, resolving: state.save.status === "uncertain" }, lastSaved: undefined };
    case "saveConfirmed": {
      if (state.save.status !== "saving" || !sameAttempt(state.save.attempt, event.attempt)) return state;
      const next = { ...state, save: { status: "idle" } as SaveState, confirmed: merged([event.snapshot], state.confirmed), lastSaved: event.snapshot };
      // Las cifras guardadas solo pasan a la pantalla si corresponden al intervalo que el selector muestra ahora.
      return String(event.snapshot.metrics.interval.days) === state.interval ? { ...next, view: { metrics: event.snapshot.metrics, snapshotId: event.snapshot.id } } : next;
    }
    case "saveRejected":
      if (state.save.status !== "saving" || !sameAttempt(state.save.attempt, event.attempt)) return state;
      // Rechazar un reintento no dice nada sobre el intento original: sigue siendo incierto, con la misma identidad.
      return { ...state, save: state.save.resolving ? { status: "uncertain", attempt: event.attempt, retryRefused: event.reason } : { status: "rejected", attempt: event.attempt, reason: event.reason } };
    case "saveUncertain":
      return state.save.status === "saving" && sameAttempt(state.save.attempt, event.attempt) ? { ...state, save: { status: "uncertain", attempt: event.attempt } } : state;
  }
}

/** Lo que muestra «Cortes guardados»: los confirmados en esta sesión más la última lista vigente, sin duplicados. */
export function visibleSnapshots(state: DashboardState): DashboardSnapshot[] {
  return merged(state.confirmed, state.list.items).slice(0, LISTED);
}

/** Confirmación del último guardado, vinculada al corte concreto: `shown` solo si la pantalla muestra sus cifras. */
export function savedNotice(state: DashboardState): { snapshot: DashboardSnapshot; shown: boolean } | undefined {
  return state.lastSaved ? { snapshot: state.lastSaved, shown: state.view?.snapshotId === state.lastSaved.id } : undefined;
}

/**
 * Intento que enviaría cada control. «Guardar corte» crea una identidad nueva para el intervalo elegido, salvo que haya
 * un guardado en curso o uno incierto sin resolver. «Reintentar» devuelve el intento incierto sin tocarlo, aunque el
 * selector haya cambiado: reintentar nunca se convierte en una solicitud distinta.
 */
export function freshAttempt(state: DashboardState, key: string): SaveAttempt | undefined {
  return state.save.status === "saving" || state.save.status === "uncertain" ? undefined : { key, interval: state.interval };
}
export function retryAttempt(state: DashboardState): SaveAttempt | undefined {
  return state.save.status === "uncertain" ? state.save.attempt : undefined;
}

export type SaveOutcome = { outcome: "confirmed"; snapshot: DashboardSnapshot } | { outcome: "rejected"; reason: "limit" | "refused" } | { outcome: "uncertain" };
/**
 * Clasifica la respuesta a un guardado. Solo un 201 con el corte del intervalo pedido confirma. Un 4xx es una negativa
 * del servidor anterior a cualquier escritura. Todo lo demás (sin respuesta, cuerpo ilegible, 5xx) es desconocido:
 * la transacción pudo confirmarse aunque la respuesta no llegara.
 */
export function classifySave(attempt: SaveAttempt, status: number | undefined, body: unknown): SaveOutcome {
  if (status === 201) {
    const snapshot = (body as { snapshot?: DashboardSnapshot } | null)?.snapshot;
    return snapshot && typeof snapshot.id === "string" && String(snapshot.metrics?.interval?.days) === attempt.interval && typeof snapshot.metrics.asOf === "string" ? { outcome: "confirmed", snapshot } : { outcome: "uncertain" };
  }
  if (status !== undefined && status >= 400 && status < 500) return { outcome: "rejected", reason: status === 429 ? "limit" : "refused" };
  return { outcome: "uncertain" };
}
