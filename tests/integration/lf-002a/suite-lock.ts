/**
 * Exclusión mutua real entre procesos para el laboratorio LF-002a/LF-023 — hallazgo 5 de
 * la revisión independiente del PR #19 (segunda ronda, candidato `212e201`): tener
 * `vitest.lf-002a.config.ts` y `vitest.lf-002a.lifecycle.config.ts` con `include`
 * mutuamente excluyentes impide que UNA SOLA invocación de Vitest recoja archivos de
 * ambos — pero no impide que alguien ejecute los dos comandos en DOS PROCESOS distintos al
 * mismo tiempo, lo que dejaría a P16 borrando la base compartida mientras isolation/
 * auth-boundary siguen leyéndola y escribiéndola.
 *
 * Este módulo añade un candado real de archivo, basado únicamente en `node:fs` (nada que
 * instalar): `fs.open(path, 'wx')` crea el archivo solo si no existe, de forma atómica a
 * nivel de sistema operativo — la comprobación-y-creación no puede partirse en dos pasos
 * separables entre procesos distintos, a diferencia de comprobar `existsSync` y luego
 * crear por separado. Deliberadamente SIMPLE: un único candado EXCLUSIVO, usado por los
 * TRES archivos de prueba (isolation/auth-boundary/lifecycle) — no un candado de
 * lectura/escritura con lectores concurrentes. Eso sacrifica algo de paralelismo entre
 * isolation.test.ts y auth-boundary.test.ts (que en teoría podrían coexistir sin
 * problema), a cambio de un mecanismo simple, cuya corrección se puede probar de verdad
 * ahora mismo (ver tests/unit/lf-002a/suite-lock.test.ts) en vez de un diseño más fino con
 * lectores/escritores que esta fase no puede ejecutar ni validar contra PostgreSQL real de
 * todos modos. "No lo presentes como demostrado antes de probarlo": las pruebas de este
 * módulo ejercitan la primitiva de exclusión real (`fs.open` con `wx`) mediante llamadas
 * concurrentes dentro del mismo proceso — una comprobación honesta de la lógica de
 * adquisición/espera/liberación, no una simulación de procesos del sistema operativo
 * separados, que esta fase no puede montar.
 *
 * No depende de `pg`/`better-auth`/`drizzle-orm`: usa solo `node:fs`/`node:path`, ya
 * disponibles sin instalar nada.
 */
import { closeSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ruta real, única y fija que los tres archivos de prueba (isolation/auth-boundary/
 * lifecycle) usan en ejecución real — las pruebas de este módulo usan sus propias rutas
 * en un directorio temporal, nunca ésta. */
export const DEFAULT_LOCK_FILE_PATH = join(dirname(fileURLToPath(import.meta.url)), '.lab-lock', 'suite.lock');

export interface AcquireSuiteLockOptions {
  /** Ruta del archivo de candado. Inyectable para pruebas; en uso real, cada uno de los
   * tres archivos de prueba usa la MISMA ruta fija bajo tests/integration/lf-002a/. */
  readonly lockFilePath: string;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

export interface SuiteLockHandle {
  release(): void;
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'EEXIST';
}

/**
 * Adquiere el candado exclusivo, esperando con reintentos si ya está tomado. Lanza si se
 * agota `timeoutMs` sin conseguirlo — nunca espera indefinidamente, y nunca asume que un
 * candado existente está "abandonado" (ninguna heurística de antigüedad: un candado de una
 * ejecución anterior que terminó mal debe retirarse a mano, después de confirmar que
 * ningún proceso lo sigue usando de verdad — asumirlo automáticamente podría enmascarar
 * una ejecución concurrente real).
 */
export async function acquireSuiteLock(options: AcquireSuiteLockOptions): Promise<SuiteLockHandle> {
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;
  mkdirSync(dirname(options.lockFilePath), { recursive: true });

  for (;;) {
    try {
      const fd = openSync(options.lockFilePath, 'wx');
      closeSync(fd);
      return {
        release: () => {
          try {
            unlinkSync(options.lockFilePath);
          } catch {
            // Ya no está — nada que liberar.
          }
        },
      };
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for the lab suite lock at "${options.lockFilePath}" ` +
            '(held by another concurrent isolation/auth-boundary/lifecycle run). If no such run is actually ' +
            'active, a previous run likely crashed without releasing it — confirm that before removing the file by hand.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}
