import { defineConfig } from "vitest/config";

// Configuración separada y exclusiva del laboratorio LF-002a/LF-023 — SOLO los casos no
// destructivos (P01-P14: isolation.test.ts, auth-boundary.test.ts). `npm test`/
// `npm run check` usan vitest.config.ts (tests/unit/**) y nunca recogen esta suite ni
// conectan una base de datos al importar la suite ordinaria.
//
// `lifecycle.test.ts` (P15-P16) tiene su PROPIA configuración separada
// (vitest.lf-002a.lifecycle.config.ts) y se invoca en un comando aparte, después de que
// esta suite haya terminado — revisión independiente del PR #19, hallazgo 6: P16 borra y
// recrea de verdad la base compartida; esta separación en dos archivos de configuración,
// cuyos `include` son mutuamente excluyentes, impide que ambos comandos puedan recoger el
// mismo archivo y por tanto que ambas suites corran sobre la misma base a la vez — una
// garantía de configuración, no solo un comentario.
//
// Invocar explícitamente: npx vitest run --config vitest.lf-002a.config.ts
// Exige LF002A_PROVISIONER_URL/LF002A_RUNTIME_URL (ver tests/integration/lf-002a/database.ts);
// sin ellas, la suite falla de inmediato (no se omite silenciosamente como verde).
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/integration/lf-002a/isolation.test.ts",
      "tests/integration/lf-002a/auth-boundary.test.ts",
    ],
    clearMocks: true,
    testTimeout: 30_000,
  },
});
