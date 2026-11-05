# Handoff versionado

## LF-000
- Responsable: Codex. Siguiente revisor: Claude Code (revisión independiente aún no ejecutada).
- Rama: codex/lf-000-architecture. Base local: 305e86463bc206e870c56c34435d3156673015db (Initial commit, solo LICENSE).
- Alcance reservado: AGENTS.md, CLAUDE.md, README.md y docs/** para propuesta LF-000. Sin aplicación, dependencias ni migraciones.
- Estado: documentos preparados para revisión; todas las decisiones D-001…D-007 pendientes del propietario.
- Acceso: git ls-remote origin refs/heads/main falló al conectar al proxy:8080. La coincidencia con main remoto no se pudo verificar. No se alteró main.
- Evidencia: consultar el commit LF-000 y el resultado de validación reportado en la entrega; pruebas de aplicación no aplican porque no existe código. No hay revisión de Claude ni despliegue realizado.
- Siguiente acción: Claude revisa consistencia, amenazas, datos, límites operativos y LF-001; registra hallazgos por severidad y archivo. Propietario resuelve decisiones; corregir documentación mediante PR antes de autorizar implementación.

## LF-000a (corrección documental tras revisión independiente)
- Responsable: Claude Code. Base: rama `codex/lf-000-architecture` (PR #1), commit `6a63227`. Rama de esta corrección: `claude/lf-000a-correcciones-documentales`.
- Alcance reservado: AGENTS.md, README.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/DECISIONS.md, docs/HANDOFF.md, docs/PRD.md, docs/PRODUCT.md, docs/QUALITY.md, docs/ROADMAP.md, docs/SECURITY.md, docs/specs/LF-001.md y el nuevo docs/specs/LF-002a.md. Sin aplicación, dependencias ni migraciones; no se tocó ningún archivo de alcance de LF-001 (package.json, src/**, CI).
- Corrige: C1 (spike LF-002a obligatorio antes de esquema de negocio), A1 (D-008 monetización diferida), A2 (purga de importaciones en dos capas, independiente de D-005), A3 (check de CI de coordinación como criterio de LF-001, manifiesto de hashes), A4 (seudonimización de auditoría sin declarar irreversibilidad ni suficiencia legal). Precisa M1 (regla CSRF concreta), M2 (propiedad de tablas transversales), M3 (evaluación de escaneo de archivos), M4 (axe-core para accesibilidad) y M5 (moderación mínima de salida de IA).
- Decisiones nuevas o actualizadas: D-002 (recomendación por defecto sujeta a LF-002a), D-005 (alcance acotado a jobs de negocio), D-005bis (nueva, purga por retención), D-006 (seudonimización como mitigación, no garantía legal), D-008 (nueva, monetización diferida).
- Pendiente de aprobación del propietario: ejecutar LF-002a antes de continuar LF-002; frecuencia del workflow de purga y umbral de alerta de D-005bis; recomendación por defecto de D-002; apertura futura de fase de facturación (D-008); validación legal de la seudonimización (D-006).
- Estado de publicación: commit creado en `claude/lf-000a-correcciones-documentales`; intento de push/PR documentado en el propio PR o en la respuesta de esta sesión. No se modificó `main` ni se fusionó el PR #1.
- Manifiesto de verificación: ver hashes SHA-256 de los archivos modificados en el mensaje de commit de esta corrección.

## Cómo continuar
Leer AGENTS.md y verificar git status y base SHA antes de editar. Registrar aquí nuevos responsables y reservas; para cada revisión indicar SHA exacto, hallazgos, pruebas ejecutadas/no ejecutadas, riesgos y siguiente paso. Incluir manifiesto de hashes SHA-256 de los archivos entregados y, cuando exista el check de CI de LF-001, si detectó o no conflicto. No interpretar este documento como lock automático ni como aprobación del diseño.

## Registro automático de coordinación

Este registro versionado es la fuente operativa de reservas, no las notas históricas anteriores. `active` reserva archivos hasta integración; `completed` no bloquea. Rutas glob relativas a la raíz, separadas por comas en ROADMAP y como arrays aquí. No iniciar trabajo sobre reservas ajenas. LF-000/LF-000a ya integradas según main 9c6971b; sus reservas históricas se consideran cerradas.

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "LF-000",
      "owner": "Codex",
      "branch": "codex/lf-000-architecture",
      "state": "completed",
      "files": [
        "AGENTS.md",
        "CLAUDE.md",
        "README.md",
        "docs/**"
      ]
    },
    {
      "id": "LF-000a",
      "owner": "Claude Code",
      "branch": "claude/lf-000a-correcciones-documentales",
      "state": "completed",
      "files": [
        "AGENTS.md",
        "README.md",
        "docs/**"
      ]
    },
    {
      "id": "LF-001",
      "owner": "Codex",
      "branch": "integration/lf-001-foundation",
      "state": "completed",
      "files": [
        "package.json",
        "package-lock.json",
        ".nvmrc",
        ".npmrc",
        ".gitignore",
        ".env.example",
        "tsconfig.json",
        "next-env.d.ts",
        "next.config.ts",
        "postcss.config.mjs",
        "eslint.config.mjs",
        "vitest.config.ts",
        "playwright.config.ts",
        "src/**",
        "tests/**",
        "scripts/**",
        ".github/workflows/**",
        "README.md",
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001.md",
        "docs/LF-001-REVIEW.md"
      ],
      "completion": {
        "head_sha": "72603faa5a1eb8336f2be5f1145ea64a931ce7c9",
        "merge_sha": "cb75bccea97867cee19a9f6204e242b1c51ba192"
      }
    },
    {
      "id": "LF-001a",
      "owner": "ChatGPT",
      "branch": "automation/lf-001a-autopilot",
      "state": "completed",
      "files": [
        "AGENTS.md",
        "AUTOPILOT.md",
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001a.md",
        "docs/autopilot/**",
        ".github/workflows/autopilot-preview.yml",
        "scripts/autopilot/**",
        "scripts/check-coordination.mjs",
        "tests/coordination/**"
      ],
      "completion": {
        "head_sha": "79761f337fa9bef1bdc64e4e6e0ab985d0f686b7",
        "merge_sha": "44e1a2309736d84b9befa3054abf8851819dde02"
      }
    },
    {
      "id": "LF-001b",
      "owner": "ChatGPT",
      "branch": "design/lf-001b-autopilot-dispatch",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001b.md",
        "docs/autopilot/PHASE-2-DESIGN.md"
      ],
      "completion": {
        "head_sha": "df71648844009867bd32463b96ce7059ecaf63eb",
        "merge_sha": "3d8a4bf0931aca31fffc8105bd753a8bd78783d1"
      }
    },
    {
      "id": "LF-001c",
      "owner": "ChatGPT",
      "branch": "automation/lf-001c-admission-simulator",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001c.md",
        "docs/autopilot/fixtures/**",
        "scripts/autopilot/simulate.mjs",
        "tests/coordination/simulator.test.mjs",
        ".github/workflows/autopilot-admission-simulation.yml"
      ],
      "completion": {
        "head_sha": "e83c659e1d7df5d0be6f1d765fd11390a8d70a15",
        "merge_sha": "3c88393995e4a62700fba0eefe24d6b059a104c6"
      }
    },
    {
      "id": "LF-011",
      "owner": "ChatGPT",
      "branch": "test/lf-011-autopilot-hardening",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-011.md",
        "scripts/autopilot/simulate.mjs",
        "tests/coordination/simulator-hardening.test.mjs"
      ],
      "completion": {
        "head_sha": "b59e3777b6bb7822ba7a6d23951d01cd054ad4ee",
        "merge_sha": "047e6d27396564ebdd57d68d859fe30b81de62ea"
      }
    },
    {
      "id": "LF-012",
      "owner": "ChatGPT",
      "branch": "planning/lf-012-autopilot-activation-readiness",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-012.md",
        "docs/autopilot/ACTIVATION-READINESS.md"
      ],
      "completion": {
        "head_sha": "5234ea2d0a13fdd856314c72a3d81630b1af55a8",
        "merge_sha": "d7f9243e52fe9dd13c11645e613a32d4e6dd2e93"
      }
    },
    {
      "id": "LF-013",
      "owner": "ChatGPT",
      "branch": "fix/lf-013-autopilot-backlog-reconciliation",
      "state": "completed",
      "files": [
        "docs/autopilot/BACKLOG.json",
        "tests/coordination/autopilot.test.mjs",
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-013.md"
      ],
      "completion": {
        "head_sha": "dc95925161f8cb705840904fd1da0c7eb9f74f9a",
        "merge_sha": "c160de9c9424918381d3bb67d64f729a0907e8db"
      }
    },
    {
      "id": "LF-014",
      "owner": "ChatGPT",
      "branch": "security/lf-014-autopilot-done-proof",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-014.md",
        "scripts/autopilot/check-done-proof.mjs",
        "tests/coordination/backlog-done-proof.test.mjs",
        ".github/workflows/ci.yml"
      ],
      "completion": {
        "head_sha": "fa6d3b1005a7eaab0be6bd670754aae95de36f55",
        "merge_sha": "ea23fb8cec82b377d3b76035d66d75e867473398"
      }
    },
    {
      "id": "LF-015",
      "owner": "ChatGPT",
      "branch": "simulation/lf-015-fake-agent-adapter",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-015.md",
        "scripts/autopilot/fake-agent.mjs",
        "tests/coordination/fake-agent.test.mjs"
      ],
      "completion": {
        "head_sha": "0d542b81693299525fdbff86855ffe1dd1cd1205",
        "merge_sha": "eed7f8c21550094965fe7b191a1194216dbce01a"
      }
    },
    {
      "id": "LF-016",
      "owner": "ChatGPT",
      "branch": "security/lf-016-fake-adapter-boundaries",
      "state": "active",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-016.md",
        "docs/autopilot/LF-001d-SAFETY-GATES.md",
        "scripts/autopilot/fake-agent.mjs",
        "tests/coordination/fake-agent.test.mjs"
      ]
    }
  ]
}
```

## LF-001 — correcciones finales en PR #3

- Responsable: Codex; revisión independiente: Claude Code. Rama `integration/lf-001-foundation`; head inicial del PR `754fa06448ec93ab30323d5a8e36bc5b1d88e0dc`.
- Base actual incorporada sin conflictos: `origin/main` en `9c6971b`; merge local `e1c3a5b`. Se preservó la arquitectura aprobada y sus correcciones. La autorización del propietario cubre estas correcciones LF-001, no LF-002 ni producción.
- Reserva activa: registro automático anterior; objetivo y pruebas en docs/specs/LF-001.md. Evidencia y riesgo residual se registran en docs/LF-001-REVIEW.md.
- Manifiesto SHA-256: mensaje del commit de entrega documental (hashes de los archivos cambiados en LF-001 respecto de main); evita un hash autorreferente de HANDOFF. El diff y SHA del candidato son las unidades de revisión.
- Próxima acción: revisar candidato y checks del PR #3; configurar `Coordination gate` como requerido en protección de main si aún no lo está. No fusionar ni empezar otro módulo hasta configurar el orquestador y recibir autorización.

### Evidencia del candidato LF-001

- Candidato de código: `850486b` (fix(LF-001): enforce coordination and complete foundation review), sobre merge `e1c3a5b`. Commit de entrega documental: el que contiene esta sección; su mensaje incluye el manifiesto SHA-256 de todos los archivos entregados respecto de main.
- Comandos ejecutados: npm ci, npm run lint, npm run typecheck, npm test, npm run build, npm run test, npm run test:coordination, npm run test:e2e y npm ls --all; todos exit 0. Unidad: 9 Vitest + 9 coordinación, repetidas después del build. E2E: 6, incluidas axe-core desktop/móvil y cabeceras. Sin llamadas de IA ni DB.
- Gate real contra main: LF-001, 35 archivos previstos, foundation=true, sin conflictos; CLI negativo en fixture detecta reserva LF-003 y retorna exit 1.
- GitHub: candidato 850486b publicado en PR #3. Ejecución observada: https://github.com/Aarom-Villanueva/leadflow-ai/actions/runs/41734771182 **Success**, 1m 56s; Coordination gate 10s y Foundation verification 1m 40s). La API GraphQL devuelve Forbidden; se verificó la conclusión por la página pública del run. La entrega final identifica también la ejecución del commit documental de cierre.
- Pendientes: 16 avisos moderados derivados de minimatch en tooling dev-only; ESLint 9 sin soporte hasta que sus plugins admitan 10; navegador estándar Playwright bloqueado en este Cloud (se probó Chromium del sistema); confirmar reglas de protección de main y revisión del candidato por Claude/propietario. Detalles en LF-001-REVIEW.md.
- Ningún merge, despliegue ni LF-002. Detenerse al terminar estas verificaciones; no iniciar otro módulo antes de configurar el orquestador.

## LF-001 — cierre verificado
- PR #3 fusionado en `main` el 2026-11-03. Head revisado `72603faa5a1eb8336f2be5f1145ea64a931ce7c9`; merge commit `cb75bccea97867cee19a9f6204e242b1c51ba192`.
- Ambos checks obligatorios `Coordination gate` y `Foundation verification` exitosos. Ruleset de `main` activo y verificado, sin despliegues.
- LF-001 ahora `completed`. La evidencia de merge se verifica contra la historia de Git antes de liberar la reserva en PRs posteriores.

## LF-001a — preparación AUTOPILOT
- Responsable: ChatGPT; revisor propuesto: Claude Code. Rama `automation/lf-001a-autopilot`, base `cb75bccea97867cee19a9f6204e242b1c51ba192`.
- Alcance definido en `docs/specs/LF-001a.md`. No hay credenciales, gastos, despliegues, ni ejecución automática.
- Pruebas locales preliminares: 10 del planificador y 3 del control de reservas ejecutadas con Node 22; pendiente CI con Node 24 y revisión independiente.

## LF-001a — cierre verificado
- PR #4 fusionado en `main` el 2026-11-03; head `79761f337fa9bef1bdc64e4e6e0ab985d0f686b7`, merge `44e1a2309736d84b9befa3054abf8851819dde02`.
- Ambos controles obligatorios de CI completados exitosamente; se conservaron las protecciones de `main`. LF-001a deja reserva `completed` con evidencia contrastable en Git.

## LF-001b — diseño de AUTOPILOT fase 2
- Responsable ChatGPT, revisor propuesto Claude Code. Rama `design/lf-001b-autopilot-dispatch`, base merge PR #4 `44e1a2309736d84b9befa3054abf8851819dde02`.
- Alcance exclusivamente documental en `docs/specs/LF-001b.md`; diseño detallado en `docs/autopilot/PHASE-2-DESIGN.md`.
- No se han activado agentes, API keys, secrets, nuevas acciones de ejecución, gastos, despliegues ni auto-merge. Requiere revisión y autorización antes de integración.

## LF-001b — cierre verificado
- PR #5 fusionado en `main` el 2026-11-03; head `df71648844009867bd32463b96ce7059ecaf63eb`, merge `3d8a4bf0931aca31fffc8105bd753a8bd78783d1`.
- `Coordination gate` satisfactorio; `Foundation verification` fue omitido correctamente por ser documentación. La regla de protección de main siguió activa; no hubo gastos o ejecuciones de agentes.
- La reserva LF-001b pasa a `completed` con evidencia de padres del merge contrastable por CI.

## LF-001c — simulador offline de admisión
- Responsable: ChatGPT; revisor propuesto: Claude Code. Rama `automation/lf-001c-admission-simulator`; base `3d8a4bf0931aca31fffc8105bd753a8bd78783d1`.
- Alcance: `docs/specs/LF-001c.md`, script determinista y pruebas sin red, escenario denegado y workflow manual solo lectura. Reserva activa en el registro anterior.
- Las suites de GitHub Actions, revisión independiente y autorización de merge quedan pendientes. `execution_enabled=false` permanece sin cambios; no hay ningún despachador ni credenciales.

## LF-001c — cierre verificado
- PR #6 fusionado a `main` el 2026-11-03: head `e83c659e1d7df5d0be6f1d765fd11390a8d70a15`, merge commit `3c88393995e4a62700fba0eefe24d6b059a104c6`.
- Ambos checks obligatorios confirmados exitosos en el head previo al merge. Sin despliegue, secretos ni ejecución de agentes. Su reserva se cierra solamente con prueba Git.

## LF-011 — endurecimiento de simulador pre-LF-001d
- Responsable: ChatGPT; revisor propuesto: Claude Code. Rama `test/lf-011-autopilot-hardening`, base merge PR #6 `3c88393995e4a62700fba0eefe24d6b059a104c6`.
- Alcance en `docs/specs/LF-011.md` y reservas exactas en registro. Revisión y CI remotos pendientes; ningún nuevo despacho ni autorización de gasto.

## LF-011 — cierre verificado
- PR #7 fusionado en `main` el 2026-11-03; head auditado `b59e3777b6bb7822ba7a6d23951d01cd054ad4ee`, merge `047e6d27396564ebdd57d68d859fe30b81de62ea`.
- Ambos checks obligatorios estaban aprobados para el head; 55/55 pruebas de coordinación, revisión independiente aprobada. Fallo inicial de `null` lease y corrección documentados en el PR #7; sin desplegar ni usar APIs IA.
- LF-011 se cierra mediante evidencia Git verificable contra la base, no por una marca unilateral.

## LF-012 — preparación no operativa de LF-001d
- Responsable ChatGPT; revisor propuesto Claude Code. Rama `planning/lf-012-autopilot-activation-readiness`; base `047e6d27396564ebdd57d68d859fe30b81de62ea`.
- Solo documentación: `docs/autopilot/ACTIVATION-READINESS.md`, `docs/specs/LF-012.md` y registro de coordinación. No se han activado servicios, cambiado `BACKLOG.json`, ejecutado agentes, desplegado ni generado gastos.
- CI y revisión independiente pendientes; integración requiere autorización del propietario.

## LF-012 — cierre verificado
- PR #8 fusionado en `main` el 2026-11-03: head `5234ea2d0a13fdd856314c72a3d81630b1af55a8`, merge `d7f9243e52fe9dd13c11645e613a32d4e6dd2e93`.
- `Coordination gate` aprobado y `Foundation verification` omitido correctamente por ser solo docs. La reserva pasa a `completed` con prueba Git verificable por CI.

## LF-013 — reconciliación B5 sin ejecución
- Responsable: ChatGPT; revisor propuesto: Claude Code. Rama `fix/lf-013-autopilot-backlog-reconciliation`, base merge PR #8 `d7f9243e52fe9dd13c11645e613a32d4e6dd2e93`.
- BACKLOG: LF-001a pasa a `done` solamente por PR #4 verificado (head `79761f337fa9bef1bdc64e4e6e0ab985d0f686b7`, merge `44e1a2309736d84b9befa3054abf8851819dde02`). LF-002a pasa a `blocked` para no quedar elegible automáticamente. Otras tareas futuras siguen bloqueadas.
- `execution_enabled=false`, decisiones D-001 y límite de paralelismo sin cambios; ninguna tarea nueva autorizada. Alcance y criterios `docs/specs/LF-013.md`.
- Pruebas CI y revisión independiente pendientes; merge requiere autorización del propietario.

## LF-013 — cierre verificado
- PR #9 fusionado en `main` el 2026-11-03: head `dc95925161f8cb705840904fd1da0c7eb9f74f9a`, merge `c160de9c9424918381d3bb67d64f729a0907e8db`. Dos checks obligatorios aprobados antes del merge; evidencia verificable por CI.
- LF-001a figura `done` en BACKLOG, mientras LF-002a/002/003 siguen bloqueadas y `execution_enabled=false`.

## LF-014 — prueba de merge para estados done (B6)
- Responsable ChatGPT, revisor propuesto Claude Code. Rama `security/lf-014-autopilot-done-proof`, base `c160de9c9424918381d3bb67d64f729a0907e8db`.
- Alcance y pruebas en `docs/specs/LF-014.md`; registro de reserva activo. Gate read-only de Git; ningún agente, facturación ni despliegue autorizado.
- CI del PR, verificación independiente y autorización de merge pendientes.

## LF-014 — cierre verificable
- PR #10 integrado en `main` el 2026-11-03. Head `fa6d3b1005a7eaab0be6bd670754aae95de36f55`, merge `ea23fb8cec82b377d3b76035d66d75e867473398`. GitHub confirmó ambos checks obligatorios antes de integrar; mecanismo `check-done-proof.mjs` incorporado en Coordination gate.
- Reserva LF-014 `completed` solo con evidencia de merge verificable contra base Git, no por edición unilateral.

## LF-015 — adaptador falso de agentes (sin proveedores)
- Responsable ChatGPT; revisor propuesto Claude Code. Rama `simulation/lf-015-fake-agent-adapter`, base `ea23fb8cec82b377d3b76035d66d75e867473398`.
- Alcance en `docs/specs/LF-015.md`, script y suite de prueba de simulación. Conserva `execution_enabled=false` y todas las tareas operativas bloqueadas; sin credenciales, agentes, gastos ni despliegues.
- CI, revisión independiente y autorización de merge pendientes.

## LF-015 — cierre verificable
- PR #11 fusionado en `main` el 2026-11-03: head `0d542b81693299525fdbff86855ffe1dd1cd1205`, merge `eed7f8c21550094965fe7b191a1194216dbce01a`.
- Ambos checks obligatorios en `success` para ese head; 80/80 pruebas. LF-015 se libera solo mediante padres de merge y ancestría verificables por CI; sin ejecutar agentes ni usar servicios.

## LF-016 — B8 y puertas pre-LF-001d
- Responsable ChatGPT; revisor propuesto Claude Code. Rama `security/lf-016-fake-adapter-boundaries`; base `eed7f8c21550094965fe7b191a1194216dbce01a`.
- Alcance en `docs/specs/LF-016.md` y puertas futuras en `docs/autopilot/LF-001d-SAFETY-GATES.md`. Refuerzo de validación de entrada únicamente en adaptador falso, pruebas negativas y documentos.
- `docs/autopilot/BACKLOG.json` intacto y `execution_enabled=false`. Sin nuevas credenciales, costes, despliegues, conexión de proveedores ni autorizaciones de LF-001d. CI y revisión independiente pendientes.
