import { defineConfig } from "vitest/config";

// Configuración separada y exclusiva del laboratorio LF-002a/LF-023. `npm test`/
// `npm run check` usan vitest.config.ts (tests/unit/**) y nunca recogen esta suite ni
// conectan una base de datos al importar la suite ordinaria.
//
// Invocar explícitamente: npx vitest run --config vitest.lf-002a.config.ts
// Exige LF002A_DATABASE_URL (ver tests/integration/lf-002a/database.ts); sin ella, la
// suite falla de inmediato (no se omite silenciosamente como verde).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/lf-002a/**/*.test.ts"],
    clearMocks: true,
    testTimeout: 30_000,
  },
});
