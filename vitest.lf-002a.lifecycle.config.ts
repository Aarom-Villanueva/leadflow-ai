import { defineConfig } from "vitest/config";

// Configuración separada EXCLUSIVAMENTE para tests/integration/lf-002a/lifecycle.test.ts
// (P15-P16) — revisión independiente del PR #19, hallazgo 6. P16 borra y recrea de verdad
// la base compartida `lf002a_spike`: debe invocarse siempre en un comando APARTE, después
// de que `vitest.lf-002a.config.ts` (isolation.test.ts/auth-boundary.test.ts) haya
// terminado por completo — nunca en la misma invocación ni en paralelo con ella. Los
// `include` de ambos archivos de configuración son mutuamente excluyentes por diseño: este
// solo recoge lifecycle.test.ts, el otro lo excluye explícitamente.
//
// Orden obligatorio de invocación (fase 2, pendiente de autorización y ejecución):
//   npx vitest run --config vitest.lf-002a.config.ts
//   npx vitest run --config vitest.lf-002a.lifecycle.config.ts
//
// Exige LF002A_PROVISIONER_URL/LF002A_RUNTIME_URL/LF002A_MAINTENANCE_URL; sin ellas, la
// suite falla de inmediato (no se omite silenciosamente como verde).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/lf-002a/lifecycle.test.ts"],
    clearMocks: true,
    testTimeout: 30_000,
    // Nunca paraleliza archivos (aunque aquí solo hay uno): defensa en profundidad para
    // que P15/P16, dentro de este único archivo, nunca se reordenen o se emparalelicen por
    // una configuración futura que añadiera un segundo archivo a este `include` sin pensarlo.
    fileParallelism: false,
  },
});
