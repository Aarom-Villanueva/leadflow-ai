/**
 * Pruebas reales y ejecutables ahora (sin `pg`, con el sistema de archivos real en un
 * directorio temporal) de tests/integration/lf-002a/suite-lock.ts — hallazgo 5 de la
 * revisión independiente del PR #19 (segunda ronda). Ejercitan la primitiva de exclusión
 * (`fs.open` con `wx`) con llamadas concurrentes dentro de este mismo proceso: una
 * comprobación honesta de que adquirir/esperar/liberar funciona, no una simulación de
 * procesos del sistema operativo separados — ver la advertencia en el módulo fuente.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { acquireSuiteLock } from '../../integration/lf-002a/suite-lock.js';

let dir: string;
let lockFilePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lf002a-suite-lock-test-'));
  lockFilePath = join(dir, 'nested', 'suite.lock');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('suite-lock: acquireSuiteLock', () => {
  test('adquiere de inmediato cuando el candado está libre, y crea el directorio contenedor si falta', async () => {
    expect(existsSync(lockFilePath)).toBe(false);
    const handle = await acquireSuiteLock({ lockFilePath, timeoutMs: 1000 });
    expect(existsSync(lockFilePath)).toBe(true);
    handle.release();
    expect(existsSync(lockFilePath)).toBe(false);
  });

  test('una segunda adquisición concurrente espera hasta que la primera libera, nunca las dos a la vez', async () => {
    const order: string[] = [];
    const first = await acquireSuiteLock({ lockFilePath, pollIntervalMs: 20, timeoutMs: 5000 });
    order.push('first-acquired');

    const secondPromise = acquireSuiteLock({ lockFilePath, pollIntervalMs: 20, timeoutMs: 5000 }).then((handle) => {
      order.push('second-acquired');
      return handle;
    });

    // Deja pasar varios ciclos de sondeo mientras el primero sigue tomado — la segunda
    // adquisición no debe completarse todavía.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(order).toEqual(['first-acquired']);

    order.push('releasing-first');
    first.release();

    const second = await secondPromise;
    expect(order).toEqual(['first-acquired', 'releasing-first', 'second-acquired']);
    second.release();
  });

  test('lanza al agotar el tiempo de espera si el candado sigue tomado', async () => {
    const holder = await acquireSuiteLock({ lockFilePath, timeoutMs: 1000 });
    await expect(acquireSuiteLock({ lockFilePath, pollIntervalMs: 20, timeoutMs: 100 })).rejects.toThrow(
      /Timed out.*waiting for the lab suite lock/,
    );
    holder.release();
  });

  test('tres adquisiciones concurrentes nunca se superponen: como mucho una a la vez', async () => {
    let active = 0;
    let maxActive = 0;
    const run = async () => {
      const handle = await acquireSuiteLock({ lockFilePath, pollIntervalMs: 10, timeoutMs: 5000 });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active -= 1;
      handle.release();
    };
    await Promise.all([run(), run(), run()]);
    expect(maxActive).toBe(1);
    expect(existsSync(lockFilePath)).toBe(false);
  });

  test('release() es seguro de llamar más de una vez (ya no está, nada que liberar)', async () => {
    const handle = await acquireSuiteLock({ lockFilePath, timeoutMs: 1000 });
    handle.release();
    expect(() => handle.release()).not.toThrow();
  });
});
