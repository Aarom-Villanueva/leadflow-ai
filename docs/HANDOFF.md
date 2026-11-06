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
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-016.md",
        "docs/autopilot/LF-001d-SAFETY-GATES.md",
        "scripts/autopilot/fake-agent.mjs",
        "tests/coordination/fake-agent.test.mjs"
      ],
      "completion": {
        "head_sha": "069b1aa668058ea0bb097e6a48f3ea8a60ba5b86",
        "merge_sha": "c1726a7ae29cea2132e2f4e6379bd9b8f04d9fbb"
      }
    },
    {
      "id": "LF-017",
      "owner": "ChatGPT",
      "branch": "planning/lf-017-lf-001d-spec",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-016.md",
        "docs/specs/LF-017.md",
        "docs/specs/LF-001d.md",
        "docs/autopilot/LF-001d-SAFETY-GATES.md"
      ],
      "completion": {
        "head_sha": "f9ebf7fb1b2a6cbb2f656e068bb5de6c681affa7",
        "merge_sha": "7498c1849c76f2e661a266ec87fcb7eead70c905"
      }
    },
    {
      "id": "LF-018",
      "owner": "Claude",
      "branch": "design/lf-018-lf-001d-offline-design",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001d.md",
        "docs/specs/LF-017.md",
        "docs/specs/LF-018.md",
        "docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md"
      ],
      "completion": {
        "head_sha": "4c2459a9a1891ab696398d02d0e9890527371489",
        "merge_sha": "28ad9735d7d7d0fa439d69c1a14fb0ab95eebf28"
      }
    },
    {
      "id": "LF-019",
      "owner": "Claude",
      "branch": "impl/lf-019-lf-001d-offline-controls",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001d.md",
        "docs/specs/LF-019.md",
        "docs/autopilot/fixtures/lf-001d/baseline.json",
        "scripts/autopilot/authorization-ledger.mjs",
        "scripts/autopilot/budget-ledger.mjs",
        "scripts/autopilot/lease-store.mjs",
        "scripts/autopilot/admission-validator.mjs",
        "scripts/autopilot/provider-invocation.mjs",
        "tests/coordination/lf-001d-design.test.mjs"
      ],
      "completion": {
        "head_sha": "4578fa02410fe22937ddccdfdf3a148656b05314",
        "merge_sha": "b47a72588ef48cb3a2805aad260726da1a16115e"
      }
    },
    {
      "id": "LF-020",
      "owner": "Claude",
      "branch": "impl/lf-020-publisher-reviewer-pause",
      "state": "active",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001d.md",
        "docs/specs/LF-020.md",
        "scripts/autopilot/publisher.mjs",
        "scripts/autopilot/reviewer-gate.mjs",
        "scripts/autopilot/pause-controller.mjs",
        "tests/coordination/lf-020-publisher-reviewer-pause.test.mjs"
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

## LF-016 — cierre verificado tras corrección M2

- PR #12 fusionado el 2026-11-05, con autorización expresa del propietario. Head auditado: `069b1aa668058ea0bb097e6a48f3ea8a60ba5b86`; merge: `c1726a7ae29cea2132e2f4e6379bd9b8f04d9fbb`.
- Segunda auditoría independiente aportada por el propietario: APROBADO PARA MERGE y 90/90 pruebas. Se atribuye a esa auditoría; no es una revisión independiente realizada por LF-017.
- Verificación final previa al merge: ambos checks obligatorios success en el head exacto, sin conflictos y ruleset activo de main sin bypass. Padres del merge: `eed7f8c21550094965fe7b191a1194216dbce01a` y el head auditado.
- Constancias: https://github.com/Aarom-Villanueva/leadflow-ai/pull/12#issuecomment-6660612884 y https://github.com/Aarom-Villanueva/leadflow-ai/pull/12#issuecomment-6660699220.
- Reserva completed con prueba Git comprobable por el gate, sin habilitar LF-001d.

## LF-017 — especificación preparatoria de LF-001d

- Responsable: ChatGPT. Revisor propuesto: Claude Code; revisión independiente pendiente, no se inicia ningún agente por esta reserva.
- Autorización del propietario: preparación documental del cierre LF-016 y especificación LF-001d en rama y PR; no implementación, ejecución, credenciales, gasto ni despliegue.
- Base: `c1726a7ae29cea2132e2f4e6379bd9b8f04d9fbb`. Rama: `planning/lf-017-lf-001d-spec`. Archivos reservados: registro automático anterior, seis rutas exactas.
- Contrato de tarea: docs/specs/LF-017.md. Propuesta futura: docs/specs/LF-001d.md. BACKLOG intacto, execution_enabled=false; LF-002a/LF-002/LF-003 siguen bloqueadas.
- Manifiesto SHA-256 de los seis archivos entregados: mensaje del commit de entrega, calculado después de escribirlos para evitar un hash autorreferente de HANDOFF. El SHA del commit identifica el candidato completo.
- Validación local, candidato y CI: se registrarán en el PR con comandos y resultados reales. No declarar CI ni revisión aprobadas antes de observarlas.
- Riesgos: diseño no implementado, identidad/custodia/presupuesto/aislamiento pendientes. No seleccionar proveedor ni convertir una simulación en evidencia operativa.
- Siguiente paso: verificar gates sobre el diff, publicar PR en borrador, revisión independiente del SHA exacto y autorización nueva de merge. La reserva LF-017 permanece active hasta integración comprobada.

## LF-017 — cierre verificado

- PR #13 fusionado en `main` el 2026-11-06, con autorización expresa del propietario (método `merge`, `expectedHeadSha` fijado al candidato auditado, sin auto-merge). Head auditado: `f9ebf7fb1b2a6cbb2f656e068bb5de6c681affa7`; merge: `7498c1849c76f2e661a266ec87fcb7eead70c905`.
- Ambos checks obligatorios en el estado correcto (`Coordination gate` success, `Foundation verification` skipped por `foundation=false`) en el head exacto, verificado antes del merge contra la API de GitHub; `main` sin atraso respecto a la base del PR, sin conflictos.
- Reserva LF-017 pasa a `completed` con evidencia de padres y ancestría del merge, verificable por `Coordination gate`, no por una marca unilateral.

## LF-018 — diseño técnico offline de implementación de LF-001d

- Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto de Claude; esta entrega no puede autorrevisarse.
- Rama: `design/lf-018-lf-001d-offline-design`. Base: `7498c1849c76f2e661a266ec87fcb7eead70c905` (merge PR #13).
- Alcance: resolver el paso 2 de la sección 2 de `docs/specs/LF-001d.md` con `docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md` — componentes, fronteras de confianza, contrato `schema_version:3` propuesto (no instalado), estados, autorización, presupuesto, idempotencia, pausa/recuperación, archivos previstos (no creados), decisiones pendientes, criterios de aceptación futuros y plan de pruebas offline con mocks/fixtures, incluyendo qué controles no pueden demostrarse sin un entorno real. Contrato de esta tarea en `docs/specs/LF-018.md`.
- Sin código, scripts, tests, workflows ni dependencias nuevas. `docs/autopilot/BACKLOG.json` intacto: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`. Sin credenciales, proveedores, presupuesto distinto de cero, agentes reales ni despliegues.
- Validación local, candidato y CI: se registrarán en el PR con comandos y resultados reales. No declarar CI ni revisión aprobadas antes de observarlas.
- Siguiente paso: verificar gates sobre el diff, publicar PR en borrador, revisión independiente (no por Claude) del SHA exacto, y autorización nueva y separada del propietario antes de cualquier propuesta de implementación real.
- **Corrección post-revisión (misma rama, mismo PR en borrador):** una revisión independiente del candidato `aeaec590d24cbd90df9a4132c21d99c7b8acd801` señaló tres hallazgos documentales sobre `docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md`: (1) la admisión necesitaba una operación durable concreta que encadenara lease, presupuesto y consumo de autorización con comportamiento explícito ante fallos entre pasos, concurrencia y reinicio, y exclusión por tarea y por rutas solapadas entre tareas/autorizaciones distintas; (2) persistía una ambigüedad entre "ejecutor sin secretos" y "credencial del ejecutor"; (3) la sección 12 afirmaba reemplazar la matriz de `docs/specs/LF-001d.md` §6 en vez de complementarla. Los tres se resolvieron exclusivamente en documentación, sin tocar código, tests, scripts, workflows ni dependencias, y sin alterar `docs/autopilot/BACKLOG.json`. El candidato corregido (`3f6f4379a734afd9e0452dbfb29eebbf13fa87be`) requirió otra revisión independiente antes de cualquier autorización o fusión.
- **Segunda corrección post-revisión (misma rama, mismo PR en borrador):** una nueva revisión independiente de ese candidato señaló dos hallazgos adicionales: (1) **recuperación segura** — el diseño liberaba leases solo por el transcurso de un plazo, sin invalidar al proceso anterior ni distinguir un rechazo confirmado de un resultado desconocido por respuesta perdida; se añadió un mecanismo de fencing (token de epoch que se invalida antes de liberar o reasignar), la distinción explícita entre rechazo confirmado y `unknown_outcome`, la regla de conservar lease y presupuesto cuando el consumo de la autorización pudo haberse guardado, y los casos de proceso demorado y de respuesta perdida tras guardar el consumo; (2) **pruebas independientes** — la matriz y el plan de pruebas combinaban en una sola fila "base obsoleta", "spec modificada", "decisión pendiente", "dependencia no completada" y "reserva ajena"; se separaron en cinco casos negativos independientes (nuevo componente `Admission Validator` en la sección 13 y cinco pasos distintos 3–7 en la secuencia de validación de la sección 5), cada uno con el resto de condiciones válidas, dejando explícito que una base obsoleta deniega aunque el hash de la spec siga coincidiendo. Ambos hallazgos se resolvieron exclusivamente en documentación, sin tocar código, tests, scripts, workflows ni dependencias, y sin alterar `docs/autopilot/BACKLOG.json`. El candidato corregido (`cfa7fe84b5d0fd76e9c6fded739b0ba14b7c4865`) requirió otra revisión independiente antes de cualquier autorización o fusión.
- **Tercera corrección post-revisión (misma rama, mismo PR en borrador):** una nueva revisión independiente de ese candidato señaló que el fencing protegía las escrituras en los registros y en el `Publisher`, pero no el inicio de la invocación real al proveedor. Se añadió el componente confiable `Provider invocation` (secciones 1 y 2) y una subsección dedicada en la sección 5 que exige: rechazar tokens de fencing invalidados antes de enviar; coordinar el inicio con la invalidación/recuperación mediante una única escritura condicional contra el `Lease Store` (sin ventana entre comprobar y enviar); registrar durablemente el intento único como parte de esa misma escritura, antes del envío real; y, ante incertidumbre sobre si el envío llegó a salir, conservar lease/presupuesto/autorización como `unknown_outcome`, sin reintento automático, exigiendo reconciliación. Se añadieron al plan de pruebas offline (sección 13, nuevo mock `Provider invocation`) los tres escenarios exigidos —proceso demorado con token invalidado (cero envíos), invalidación e inicio concurrentes (resultado definido, sin doble envío ni liberación insegura), y respuesta perdida tras el envío (`unknown_outcome` con reservas conservadas)— sin implementarlos. Se revisaron y actualizaron las afirmaciones de "sin doble ejecución" de la sección 5 para que cubran explícitamente el envío real, no solo las escrituras de los registros. Resuelto exclusivamente en documentación, sin tocar código, tests, scripts, workflows ni dependencias, y sin alterar `docs/autopilot/BACKLOG.json`. El candidato corregido (`4c2459a9a1891ab696398d02d0e9890527371489`) requirió otra revisión independiente antes de cualquier autorización o fusión.
- **Cierre verificado:** PR #14 fusionado en `main` el 2026-11-06 por el propietario (`merged_by: Aarom-Villanueva`). Head auditado: `4c2459a9a1891ab696398d02d0e9890527371489`; merge: `28ad9735d7d7d0fa439d69c1a14fb0ab95eebf28`. Padres del merge: `7498c1849c76f2e661a266ec87fcb7eead70c905` (primero) y `4c2459a9a1891ab696398d02d0e9890527371489` (segundo); `4c2459a9...` es ancestro de `main`; el subject del merge menciona LF-018 — las tres condiciones de `verifiedMergeReleases`. Reserva LF-018 pasa a `completed` con esta evidencia, no por una marca unilateral. LF-019 retoma la implementación offline sobre esta base.

## LF-019 — implementación offline (mocks/fixtures) de admisión, autorización, presupuesto, leases e invocación simulada

- Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto de Claude; esta entrega no puede autorrevisarse.
- Rama: `impl/lf-019-lf-001d-offline-controls`. Base: `28ad9735d7d7d0fa439d69c1a14fb0ab95eebf28` (merge PR #14).
- Autorización expresa del propietario: comenzar la implementación offline de LF-001d conforme al diseño integrado en PR #14, limitada a código y pruebas locales con mocks; sin ejecutar otros agentes, conectar APIs/proveedores reales, introducir credenciales, generar gastos, activar servicios, desplegar, ni modificar workflows o dependencias.
- Alcance: `scripts/autopilot/lease-store.mjs` (fencing, escritura condicional atómica de registro de intento), `scripts/autopilot/budget-ledger.mjs`, `scripts/autopilot/authorization-ledger.mjs` (consumo irreversible; identidad del propietario verificada por `verifyOwnerIdentityFake`, explícitamente sintética), `scripts/autopilot/admission-validator.mjs` (las diez comprobaciones de solo lectura de la sección 5, la operación durable con compensación, y la reconciliación de `unknown_outcome`) y `scripts/autopilot/provider-invocation.mjs` (invocación simulada con `send` siempre local). Pruebas offline en `tests/coordination/lf-001d-design.test.mjs`. Contrato de esta tarea en `docs/specs/LF-019.md`.
- No implementa Executor sandbox, Publisher, Reviewer gate ni Pause controller. `docs/autopilot/BACKLOG.json` intacto: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`. Sin credenciales, proveedores reales, presupuesto distinto de cero, agentes reales ni despliegues.
- Validación local real (candidato inicial): `node --test tests/coordination/*.test.mjs` 129/129 (90 preexistentes + 39 nuevas), `npm run lint`, `npm run typecheck`, `npm test` (vitest 9 + coordinación 129) y `npm run build` limpios; `npm run test:e2e` 6/6 con Chromium preinstalado. Tras la primera corrección: 145/145 (90 + 55). Tras la segunda corrección: 151/151 (90 + 61). Tras la tercera corrección (ver notas más abajo): 160/160 (90 + 70).
- Como el diff incluye código fuera de `docs/`, `foundation=true`: `Foundation verification` (lint/typecheck/test/build/e2e) se ejecuta, no se omite.
- Siguiente paso: verificar gates sobre el diff, publicar PR en borrador, revisión independiente (no por Claude) del SHA exacto, y autorización nueva y separada del propietario antes de extender a Executor sandbox/Publisher/Reviewer gate/Pause controller o de cualquier ensayo con un proveedor real.
- **Corrección post-revisión (misma rama, mismo PR en borrador):** una revisión independiente del candidato `bcf8ebb0b93c8c3367ff1ddafe1cb419017f7199` señaló cinco hallazgos: (1) la autorización válida no se vinculaba a `taskId`/`specSha256`/`scopeFiles`/`baseSha` de la solicitud; (2) `LeaseStore.acquire` permitía sobrescribir silenciosamente un lease con una segunda adquisición de rutas distintas para la misma tarea; (3) `LeaseStore.release` permitía liberar un lease tras un intento de envío de resultado desconocido, habilitando un segundo envío; (4) `BudgetLedger.recordObservedCost` no persistía el consumo, permitiendo recuperar presupuesto ya gastado; (5) una excepción de `send()` tras registrar el intento escapaba sin producir `unknown_outcome`. Los cinco se corrigieron en `scripts/autopilot/lease-store.mjs`, `budget-ledger.mjs`, `authorization-ledger.mjs`, `admission-validator.mjs` y `provider-invocation.mjs`, con 16 pruebas nuevas en `tests/coordination/lf-001d-design.test.mjs` (145 en total), 14 de ellas verificadas como regresión real (fallan contra el candidato anterior, pasan contra la corrección). Se revisaron los caminos de compensación y reconciliación existentes sin necesidad de cambiarlos. Se decidió explícitamente que esta entrega no admite callbacks asíncronos en `send`. Sin workflows ni dependencias modificadas; `BACKLOG.json` intacto. El candidato corregido (`cbe1eb1f1c13e6b16239368868b7bde75df36bbe`) requirió otra revisión independiente antes de cualquier autorización o fusión.
- **Segunda corrección post-revisión (misma rama, mismo PR en borrador):** una nueva revisión independiente señaló dos hallazgos adicionales: (1) un envío incierto (excepción síncrona, `responseLost`, o ahora también un resultado asíncrono incompatible) no bloqueaba automáticamente el presupuesto reservado, permitiendo `release` seguido de una nueva reserva del mismo saldo; (2) `invokeProvider` declaraba `outcome:"sent"` de inmediato aunque `send()` devolviera una promesa, sin manejar un eventual rechazo. Se corrigieron en `provider-invocation.mjs`: `budgetLedger` pasa a ser parámetro obligatorio y cualquier camino hacia `unknown_outcome` reconcilia automáticamente la reserva a `'unknown'` dentro de la misma llamada; además se detecta cualquier resultado thenable tras `send()` y se trata igual que un resultado incierto, con un manejador vacío para evitar un `unhandledRejection`. 10 pruebas nuevas en `tests/coordination/lf-001d-design.test.mjs` (151 en total), 5 de ellas verificadas como regresión real (fallan contra el candidato anterior —una de ellas reproduciendo el `unhandledRejection` sin controlar— y pasan contra la corrección). Se revisaron los caminos de compensación/reconciliación existentes sin necesidad de cambiarlos; las garantías de la corrección anterior se mantienen. Sin workflows ni dependencias modificadas; `BACKLOG.json` intacto. El candidato corregido (`b774c3b48331d3f7d7b35cd1406bcacdd349f499`) requirió otra revisión independiente antes de cualquier autorización o fusión.
- **Tercera corrección post-revisión (misma rama, mismo PR en borrador):** una nueva revisión independiente señaló dos hallazgos adicionales en `provider-invocation.mjs`: (1) la rama `responseLost` llamaba a `send()` descartando su resultado, sin aplicar la detección de thenables de la rama normal — una promesa rechazada ahí nunca recibía manejador y se propagaba como `unhandledRejection`; (2) `budgetLedger` se documentaba como obligatorio pero no se validaba antes de registrar el intento o llamar a `send()`, por lo que una llamada sin ledger, sin reserva o con `fenceToken` incorrecto ejecutaba el envío igualmente y solo fallaba en silencio al bloquear el presupuesto después. Se unificó el manejo de resultado/errores entre ambas ramas (`send()` se llama como máximo una vez, clasificado igual en todos los caminos) y se añadió una precondición explícita (`hasValidPendingReservation`) que deniega con cero envíos, sin registrar el intento ni modificar ningún ledger, si falta el ledger, la reserva o la vinculación exacta a `taskId`/`fenceToken`. Un fallo inesperado al bloquear el presupuesto después del envío produce ahora el resultado distinto `unknown_outcome_budget_unconfirmed`, nunca el `unknown_outcome` confirmado, con el lease igualmente bloqueado y sin reintento. 10 pruebas nuevas en `tests/coordination/lf-001d-design.test.mjs` (160 en total), 6 de ellas verificadas como regresión real (fallan contra el candidato anterior —incluyendo la reproducción exacta de `responseLost` con promesa rechazada— y pasan contra la corrección). Se revisaron juntos todos los caminos de `invokeProvider`; las garantías de las dos correcciones anteriores se mantienen intactas sin cambios en los demás módulos. Sin workflows ni dependencias modificadas; `BACKLOG.json` intacto. El candidato corregido requiere otra revisión independiente antes de cualquier autorización o fusión.

## LF-019 — cierre verificado

- PR #15 fusionado en `main` por el propietario (`merged_by: Aarom-Villanueva`). Head auditado: `4578fa02410fe22937ddccdfdf3a148656b05314`; merge: `b47a72588ef48cb3a2805aad260726da1a16115e`. Padres del merge: `28ad9735d7d7d0fa439d69c1a14fb0ab95eebf28` (primero) y `4578fa02410fe22937ddccdfdf3a148656b05314` (segundo); `4578fa02...` es ancestro de `main`; el subject del merge menciona LF-019 — las tres condiciones de `verifiedMergeReleases`. Reserva LF-019 pasa a `completed` con esta evidencia, no por una marca unilateral.
- LF-020 retoma el siguiente incremento de implementación offline de LF-001d sobre esta base.

## LF-020 — Publisher, Reviewer gate y Pause controller simulados

- Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto de Claude; esta entrega no puede autorrevisarse.
- Rama: `impl/lf-020-publisher-reviewer-pause`. Base: `b47a72588ef48cb3a2805aad260726da1a16115e` (merge PR #15).
- Autorización expresa del propietario: continuar la implementación offline de LF-001d con el siguiente incremento del diseño integrado — Publisher simulado, Reviewer gate y Pause controller —, conforme a `docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md` §1, §2, §4, §9, §13 y §14, limitada a código y pruebas locales con mocks/fixtures sintéticos; sin ejecutar otros agentes, conectar APIs/proveedores reales, introducir credenciales, generar gastos, activar servicios ni desplegar.
- Alcance: `scripts/autopilot/publisher.mjs` (validación de diff sintético: rutas, lista blanca de `scope_files`, archivos prohibidos, symlinks y límites de tamaño, sin escribir en GitHub), `scripts/autopilot/reviewer-gate.mjs` (revisor distinto del ejecutor, aprobación vinculada al SHA exacto entregado, bandera `simulated` explícita) y `scripts/autopilot/pause-controller.mjs` (PAUSA y recuperación simuladas per §9, integradas con `AuthorizationLedger.revoke`, `LeaseStore.invalidate`/`release` y `BudgetLedger` existentes mediante fencing, sin liberar jamás por el mero transcurso de un plazo y sin reintento automático). Pruebas offline en `tests/coordination/lf-020-publisher-reviewer-pause.test.mjs`, incluyendo integración con los controles de LF-019 (admisión, invocación simulada, ledgers). Contrato de esta tarea en `docs/specs/LF-020.md`.
- No implementa Executor sandbox ni ningún aislamiento real: Publisher/ReviewerGate/PauseController son validadores y coordinadores puros sobre datos sintéticos/en memoria, nunca sobre un diff, una credencial, un proceso o un proveedor reales. `docs/autopilot/BACKLOG.json` intacto: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`. Sin credenciales, proveedores reales, presupuesto distinto de cero, agentes reales ni despliegues.
- Validación local, candidato y CI: se registrarán en el PR con comandos y resultados reales. No declarar CI ni revisión aprobadas antes de observarlas.
- Siguiente paso: verificar gates sobre el diff, publicar PR en borrador, revisión independiente (no por Claude) del SHA exacto, y autorización nueva y separada del propietario antes de implementar Executor sandbox o de cualquier ensayo con un proveedor real.
