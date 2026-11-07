/**
 * Validación estricta de cadenas de conexión del laboratorio LF-002a/LF-023 — hallazgo 1
 * de la revisión independiente del PR #19: `assertLocalOnly` comprobaba únicamente
 * `URL.hostname`, pero `pg` no usa `URL` para parsear cadenas de conexión: usa su propio
 * parser (`pg-connection-string`), cuyo comportamiento exacto en la versión pinneada
 * (§4.1 de docs/specs/LF-023.md) no se puede verificar en esta fase porque `pg` no está
 * instalado. Ese parser admite un parámetro de consulta `host` que **sustituye** el host
 * de la propia URL (soporte de socket Unix vía `?host=/ruta`), así que
 * `postgres://127.0.0.1/db?host=remote.example.invalid` pasaba el chequeo anterior
 * (`url.hostname === "127.0.0.1"`) mientras `pg` se conectaría de verdad a
 * `remote.example.invalid`.
 *
 * En vez de intentar replicar ese parser sin poder ejecutarlo contra la versión real
 * (arriesgando una réplica incorrecta), este módulo es deliberadamente más estricto que
 * cualquier parser real: define un subconjunto mínimo, inequívoco, de sintaxis aceptada, y
 * rechaza (lanza) cualquier cosa fuera de ese subconjunto — incluida CUALQUIER cadena de
 * consulta, que es precisamente el vector de sustitución de host. Nunca delega en `pg`;
 * no depende de `pg` ni de ningún paquete externo, así que es ejecutable y probable ahora
 * mismo, sin instalar nada (ver tests/unit/lf-002a/connection-guard.test.ts).
 *
 * Tratamiento explícito por tipo de destino (hallazgo 1: "define explícitamente"):
 * - IPv4 loopback (`127.0.0.1`): aceptado, por igualdad de cadena exacta.
 * - IPv6 loopback (`::1`): aceptado. `URL.hostname` devuelve la forma con corchetes
 *   (`"[::1]"`) para hosts IPv6 — verificado localmente con `new URL(...)`, no supuesto —
 *   así que ambas formas se aceptan explícitamente.
 * - `localhost`: aceptado literalmente (sin resolución DNS: no se intenta resolver ni
 *   comparar contra ninguna otra forma).
 * - Socket de dominio Unix (`?host=/ruta/al/socket`, o autoridad vacía): **NO soportado**
 *   deliberadamente en esta fase — se rechaza, no se intenta validar su forma. El clúster
 *   ya detectado en este entorno (docs/specs/LF-023.md §4.2) escucha por TCP en loopback;
 *   no hay necesidad de admitir sockets, y admitirlos reintroduciría exactamente el vector
 *   de parámetro de consulta que este módulo existe para cerrar.
 * - Cualquier otro host, host múltiple (`host1,host2`), o cualquier parámetro de consulta
 *   presente (`host`, `options`, `sslmode`, o cualquier otro): rechazado. Ninguna cadena de
 *   conexión de este laboratorio necesita parámetros de consulta.
 */

export const ALLOWED_LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function assertLocalOnly(connectionString: string): void {
  if (typeof connectionString !== 'string' || connectionString.length === 0) {
    throw new Error('Refusing empty or non-string connection string');
  }
  // Espacios o backslashes no tienen cabida en una cadena de conexión bien formada de
  // este laboratorio y pueden confundir parsers distintos de maneras distintas.
  if (/[\s\\]/.test(connectionString)) {
    throw new Error('Refusing connection string containing whitespace or backslashes');
  }
  // Una lista de hosts al estilo libpq (failover) permitiría apuntar a un host remoto
  // como alternativa. `new URL` ya falla en la mayoría de estos casos, pero se rechaza
  // explícitamente también por si una forma rara llegara a parsear.
  if (connectionString.includes(',')) {
    throw new Error('Refusing multi-host connection string (comma-separated host list)');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Refusing unparsable connection string');
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`Refusing non-postgres connection string scheme: "${url.protocol}"`);
  }

  // Ningún parámetro de consulta está autorizado: `host` sustituye la autoridad de la
  // propia URL en el parser real de `pg` (el vector exacto de este hallazgo); otros como
  // `options`/`sslmode` podrían introducir configuración no revisada. Se rechaza la
  // cadena completa en vez de intentar una lista blanca de claves "seguras".
  const queryKeys = [...url.searchParams.keys()];
  if (queryKeys.length > 0) {
    throw new Error(
      `Refusing connection string with query parameters (none are authorized for this lab): ${queryKeys.join(', ')}`,
    );
  }

  const host = url.hostname;
  if (!ALLOWED_LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing non-local database host for the LF-002a spike: "${host || '(empty)'}"`);
  }
}
