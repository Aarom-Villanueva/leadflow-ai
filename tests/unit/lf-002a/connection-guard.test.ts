/**
 * Pruebas puras y ejecutables ahora (sin `pg`, sin conexión real) de
 * tests/integration/lf-002a/connection-guard.ts — hallazgo 1 de la revisión
 * independiente del PR #19. Corren con `npm test` (vitest.config.ts recoge
 * tests/unit/**), no con la suite de integración del laboratorio.
 */
import { describe, expect, test } from 'vitest';
import { ALLOWED_LOOPBACK_HOSTS, assertLocalOnly } from '../../integration/lf-002a/connection-guard.js';

describe('connection-guard: assertLocalOnly', () => {
  test('acepta IPv4 loopback, localhost e IPv6 loopback', () => {
    expect(() => assertLocalOnly('postgres://user@127.0.0.1:5432/lf002a_spike')).not.toThrow();
    expect(() => assertLocalOnly('postgres://user@localhost:5432/lf002a_spike')).not.toThrow();
    expect(() => assertLocalOnly('postgres://user@[::1]:5432/lf002a_spike')).not.toThrow();
  });

  test('rechaza el override de host vía parámetro de consulta ?host=... (el hallazgo exacto)', () => {
    expect(() =>
      assertLocalOnly('postgres://user@127.0.0.1:5432/lf002a_spike?host=remote.example.invalid'),
    ).toThrow(/query parameters/i);
  });

  test('rechaza cualquier parámetro de consulta, incluso uno aparentemente inocuo', () => {
    expect(() => assertLocalOnly('postgres://user@127.0.0.1:5432/lf002a_spike?sslmode=disable')).toThrow(
      /query parameters/i,
    );
    expect(() => assertLocalOnly('postgres://user@127.0.0.1:5432/lf002a_spike?options=-c%20foo')).toThrow(
      /query parameters/i,
    );
  });

  test('rechaza un host remoto directo', () => {
    expect(() => assertLocalOnly('postgres://user@remote.example.invalid:5432/lf002a_spike')).toThrow(
      /non-local database host/i,
    );
  });

  test('rechaza una lista de hosts estilo libpq (failover)', () => {
    expect(() => assertLocalOnly('postgres://user@127.0.0.1:5432,remote.example.invalid:5432/db')).toThrow();
  });

  test('rechaza un socket Unix vía ?host=/ruta (no soportado deliberadamente en esta fase)', () => {
    expect(() => assertLocalOnly('postgres:///lf002a_spike?host=%2Fvar%2Frun%2Fpostgresql')).toThrow(
      /query parameters/i,
    );
  });

  test('rechaza una autoridad vacía sin parámetro de host', () => {
    expect(() => assertLocalOnly('postgres:///lf002a_spike')).toThrow(/non-local database host/i);
  });

  test('rechaza un esquema distinto de postgres/postgresql', () => {
    expect(() => assertLocalOnly('mysql://user@127.0.0.1:5432/lf002a_spike')).toThrow(/scheme/i);
  });

  test('rechaza cadenas no parseables, vacías, con espacios o backslashes', () => {
    expect(() => assertLocalOnly('')).toThrow();
    expect(() => assertLocalOnly('not a url at all')).toThrow();
    expect(() => assertLocalOnly('postgres://user@127.0.0.1:5432/db\\x')).toThrow();
  });

  test('entradas ambiguas: mayúsculas/minúsculas y host con punto final se rechazan, nunca se normalizan', () => {
    // Verificado con `new URL(...)` directamente (no supuesto): a diferencia de http(s),
    // "postgres:" no es un esquema "especial" para el estándar WHATWG URL, así que su host
    // NO se normaliza a minúsculas — "LOCALHOST" permanece "LOCALHOST" literalmente. La
    // comparación aquí es por igualdad estricta de cadena contra literales en minúsculas:
    // "LOCALHOST" y "localhost." (con punto final) se rechazan ambos, un comportamiento
    // deliberadamente cerrado en vez de intentar normalizar formas ambiguas.
    expect(() => assertLocalOnly('postgres://user@LOCALHOST:5432/db')).toThrow(/non-local database host/i);
    expect(() => assertLocalOnly('postgres://user@localhost.:5432/db')).toThrow(/non-local database host/i);
  });

  test('ALLOWED_LOOPBACK_HOSTS no contiene ningún host no-loopback', () => {
    for (const host of ALLOWED_LOOPBACK_HOSTS) {
      expect(['127.0.0.1', 'localhost', '[::1]', '::1']).toContain(host);
    }
  });
});
