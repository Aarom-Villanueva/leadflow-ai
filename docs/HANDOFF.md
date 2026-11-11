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
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001d.md",
        "docs/specs/LF-020.md",
        "scripts/autopilot/publisher.mjs",
        "scripts/autopilot/reviewer-gate.mjs",
        "scripts/autopilot/pause-controller.mjs",
        "tests/coordination/lf-020-publisher-reviewer-pause.test.mjs"
      ],
      "completion": {
        "head_sha": "70c6db33099b917b6338986ccfe27d8c82706bbe",
        "merge_sha": "46c5b4b252dc28173aea95955d86b7c5e40f34db"
      }
    },
    {
      "id": "LF-021",
      "owner": "ChatGPT",
      "branch": "design/lf-021-executor-sandbox-proposal",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-001d.md",
        "docs/specs/LF-021.md",
        "docs/autopilot/LF-001d-EXECUTOR-SANDBOX-PROPOSAL.md"
      ],
      "completion": {
        "head_sha": "f20aec22377c74196e0fc12987c4be2d5e38ec64",
        "merge_sha": "0b0110969493a9e74b618f20540d280fc21d7993"
      }
    },
    {
      "id": "LF-022",
      "owner": "ChatGPT",
      "branch": "planning/lf-022-lf-002a-scope",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-002a.md",
        "docs/specs/LF-022.md",
        "docs/LF-002a-IMPLEMENTATION-PLAN.md"
      ],
      "completion": {
        "head_sha": "325ece94eec2493c7bb37ae3d6c484311265acf7",
        "merge_sha": "68f77930a35846a39cdbb490354abe0d3c25e53d"
      }
    },
    {
      "id": "LF-023",
      "owner": "Claude",
      "branch": "impl/lf-023-lf-002a-identity-spike",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-023.md",
        "tests/integration/lf-002a/schema.sql",
        "tests/integration/lf-002a/fixtures.ts",
        "tests/integration/lf-002a/database.ts",
        "tests/integration/lf-002a/auth.ts",
        "tests/integration/lf-002a/tenant-context.ts",
        "tests/integration/lf-002a/isolation.test.ts",
        "tests/integration/lf-002a/auth-boundary.test.ts",
        "tests/integration/lf-002a/lifecycle.test.ts",
        "vitest.lf-002a.config.ts",
        "tests/integration/lf-002a/connection-guard.ts",
        "tests/integration/lf-002a/lab-target.ts",
        "tests/integration/lf-002a/preflight-policy.ts",
        "tests/integration/lf-002a/query-classifier.ts",
        "tests/integration/lf-002a/seed.ts",
        "tests/unit/lf-002a/connection-guard.test.ts",
        "tests/unit/lf-002a/lab-target.test.ts",
        "tests/unit/lf-002a/preflight-policy.test.ts",
        "tests/unit/lf-002a/query-classifier.test.ts",
        "vitest.lf-002a.lifecycle.config.ts",
        "tests/integration/lf-002a/suite-lock.ts",
        "tests/unit/lf-002a/suite-lock.test.ts",
        ".gitignore",
        "tests/integration/lf-002a/transaction-instrumentation.ts",
        "tests/unit/lf-002a/transaction-instrumentation.test.ts",
        "package.json",
        "package-lock.json"
      ],
      "completion": {
        "head_sha": "c4611773e08a8e733cb3f04911d27e0ae4489e80",
        "merge_sha": "209b808e3053907fd431f4a17cbdccdbe97a02cb"
      }
    },
    {
      "id": "LF-024",
      "owner": "ChatGPT",
      "branch": "fix/lf-024-default-merge-release",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-024.md",
        "scripts/check-coordination.mjs",
        "tests/coordination/release.test.mjs"
      ],
      "completion": {
        "head_sha": "0f0bb22870501722dae1795ffe2b8e3d536aa5a6",
        "merge_sha": "46a9bb277ac63543982484e01e3515408d903b81"
      }
    },
    {
      "id": "LF-003",
      "owner": "Claude",
      "branch": "design/lf-003-ui-ux-proposal",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-003.md",
        "src/app/design/**",
        "src/components/ui/**",
        "tests/e2e/design-preview.spec.ts",
        "tests/unit/design/**"
      ],
      "completion": {
        "head_sha": "4f5e6ad6e5b68cb3dd3c25f00bd7eb1749d52cb8",
        "merge_sha": "796aa5930a93075bca6ee837e4e8b6b72d243711"
      }
    },
    {
      "id": "LF-025",
      "owner": "ChatGPT",
      "branch": "impl/lf-025-identity-organizations",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/DECISIONS.md",
        "docs/specs/LF-025.md",
        "docs/IDENTITY-LOCAL.md",
        ".env.example",
        "src/modules/identity/**",
        "src/modules/organizations/**",
        "src/shared/database/**",
        "src/app/(identity)/**",
        "src/app/app/**",
        "src/app/api/auth/**",
        "src/app/api/organizations/**",
        "scripts/identity/**",
        "tests/unit/identity/**",
        "tests/integration/identity/**",
        "vitest.identity.config.ts",
        ".github/workflows/ci.yml",
        "vitest.config.ts",
        "playwright.identity.config.ts",
        "tests/identity-e2e/**",
        "src/app/page.tsx"
      ],
      "completion": {
        "head_sha": "22287cd80a763ec295f516fcf87ab52e5d39d4e1",
        "merge_sha": "676946c93c2582dd6a033debf253bf1eb576c6e4"
      }
    },
    {
      "id": "LF-026",
      "owner": "ChatGPT",
      "branch": "impl/lf-026-leads-pipeline",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-026.md",
        "docs/LEADS-LOCAL.md",
        "src/modules/leads/**",
        "src/shared/database/migrations/0002_leads_pipeline.sql",
        "src/shared/database/runtime.ts",
        "src/app/app/[[]organizationId]/**",
        "src/app/api/organizations/[[]organizationId]/leads/**",
        "src/app/api/organizations/[[]organizationId]/pipeline/**",
        "src/app/api/organizations/[[]organizationId]/stages/**",
        "scripts/leads/**",
        "tests/unit/leads/**",
        "tests/integration/leads/**",
        "tests/leads-e2e/**",
        "vitest.leads.config.ts",
        "playwright.leads.config.ts",
        ".github/workflows/ci.yml"
      ],
      "completion": {
        "head_sha": "12bb310558219e43ef55f85926f438bd2b654429",
        "merge_sha": "5d577336998da47d5a01eede25195d53aecb3ecf"
      }
    },
    {
      "id": "LF-027",
      "owner": "ChatGPT",
      "branch": "impl/lf-027-interactions-followups",
      "state": "completed",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-027.md",
        "docs/ACTIVITY-LOCAL.md",
        "src/modules/activity/**",
        "src/modules/leads/detail-client.tsx",
        "src/modules/leads/workspace.tsx",
        "src/shared/database/migrations/0003_activity.sql",
        "src/shared/database/runtime.ts",
        "src/app/app/[[]organizationId]/**",
        "src/app/api/organizations/[[]organizationId]/interactions/**",
        "src/app/api/organizations/[[]organizationId]/followups/**",
        "scripts/activity/**",
        "tests/unit/activity/**",
        "tests/integration/activity/**",
        "tests/activity-e2e/**",
        "vitest.activity.config.ts",
        "playwright.activity.config.ts",
        ".github/workflows/ci.yml",
        "scripts/check-coordination.mjs",
        "tests/coordination/release.test.mjs",
        "src/components/ui/dialog.tsx"
      ],
      "completion": {
        "head_sha": "be6ed88f7625bec408f2f2b8c32d42d8be1dce25",
        "merge_sha": "26ca90b6d350436b9050033ab4c9c77f1079218e"
      }
    },
    {
      "id": "LF-028",
      "owner": "Claude",
      "branch": "claude/great-hopper-au1q2b",
      "state": "active",
      "files": [
        "docs/HANDOFF.md",
        "docs/ROADMAP.md",
        "docs/specs/LF-028.md",
        "src/modules/analytics/**",
        "src/modules/leads/workspace.tsx",
        "src/app/app/[[]organizationId]/page.tsx",
        "src/app/app/[[]organizationId]/dashboard/**",
        "src/app/api/organizations/[[]organizationId]/dashboard/**",
        "tests/unit/analytics/**",
        "tests/integration/analytics/**",
        "tests/analytics-e2e/**",
        "vitest.analytics.config.ts",
        "playwright.analytics.config.ts",
        ".github/workflows/ci.yml",
        "src/shared/database/migrations/0004_analytics.sql",
        "scripts/analytics/**",
        "src/shared/database/runtime.ts"
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
- **Corrección post-revisión (misma rama, mismo PR en borrador):** una revisión independiente del candidato `e34dc2968282b8fff102ff726bd5786f6dfb5f6d` señaló tres hallazgos, resueltos exclusivamente en `scripts/autopilot/pause-controller.mjs` y `scripts/autopilot/publisher.mjs`: (1) **confirmación de detención estricta** — `PauseController.pause()` convertía `confirmStopped(...)` con `Boolean(...)`, por lo que `Promise.resolve(false)`, `{stopped:true}` o la cadena `"false"` se consideraban confirmaciones y permitían liberar el lease; se eliminó toda coerción (solo el booleano literal `true`, síncrono, confirma; un thenable nunca confirma ni se espera, con manejador vacío para su eventual rechazo), y se aplicó el mismo tratamiento a `cancel` para evitar `unhandledRejection` y registros falsos de cancelación; (2) **validación estructural del diff** — `Publisher` contaba como cero bytes cualquier `content` no textual (dejando pasar un `Buffer` de 1 MB con `maxTotalBytes:1`) y nunca rechazaba un `isSymlink` ambiguo como `"true"`; se añadió validación estricta de tipo (`content` debe ser `string`, `isSymlink` debe ser `boolean`) antes de cualquier otra comprobación; (3) **reconciliación segura del presupuesto durante PAUSA** — liberar el lease tras una detención confirmada nunca tocaba la reserva de presupuesto pendiente, dejándola bloqueada indefinidamente (reproducido: reserva de 100, pausa con detención confirmada antes de invocar, lease liberado pero presupuesto aún reservado, nueva autorización tras `resume()` denegada por `budget_not_available`); `pause()` ahora exige `budgetLedger` y solo reconcilia esa reserva a un costo confirmado de cero (`BudgetLedger.recordObservedCost(0)`, verificando la vinculación `taskId`/`fenceToken`) cuando la detención está confirmada **y** el lease no tiene ningún intento de envío registrado, liberando el lease solo después de esa reconciliación exitosa; un intento registrado, un costo ya desconocido, una reserva no vinculada o un fallo de reconciliación dejan lease y presupuesto bloqueados. Se añadieron 23 pruebas nuevas en `tests/coordination/lf-020-publisher-reviewer-pause.test.mjs` (57 en total: 34 preexistentes + 23 nuevas), 19 de ellas (nuevas y preexistentes extendidas) verificadas explícitamente como regresión real: fallan contra el candidato `e34dc2968282b8fff102ff726bd5786f6dfb5f6d` en un árbol aislado (construido con `git show` sobre ese SHA para los módulos afectados y las dependencias de LF-019, sin tocar el resto del repositorio) y pasan contra la corrección — incluyendo una prueba de extremo a extremo que reproduce exactamente el escenario del hallazgo 3 y tres casos negativos aislados (intento registrado, costo directamente desconocido, fallo de reconciliación simulado). Las garantías de LF-019 (fencing, exclusividad de leases, liberación segura, consumo de presupuesto, bloqueo automático ante resultado desconocido) se mantienen intactas; no se modificó `lease-store.mjs`, `budget-ledger.mjs`, `authorization-ledger.mjs`, `admission-validator.mjs`, `provider-invocation.mjs` ni `reviewer-gate.mjs`. Sin workflows ni dependencias modificados; `BACKLOG.json` intacto. El candidato corregido sigue sin implementar Executor sandbox ni ningún aislamiento real; requiere otra revisión independiente antes de cualquier autorización o fusión.

## LF-020 — cierre verificado

- PR #16 fusionado en `main` el 2026-11-06 por el propietario (`merged_by: Aarom-Villanueva`). Head auditado: `70c6db33099b917b6338986ccfe27d8c82706bbe`; merge: `46c5b4b252dc28173aea95955d86b7c5e40f34db`. Padres del merge: `b47a72588ef48cb3a2805aad260726da1a16115e` (primero) y `70c6db33099b917b6338986ccfe27d8c82706bbe` (segundo); `70c6db33...` es ancestro de `main`; el subject del merge menciona LF-020 — las tres condiciones de `verifiedMergeReleases`, verificadas tanto contra Git real como contra la API de GitHub (`merged:true`, `merged_by:"Aarom-Villanueva"`). Reserva LF-020 pasa a `completed` con esta evidencia, no por una marca unilateral.
- LF-021 retoma el siguiente incremento de LF-001d sobre esta base: una propuesta exclusivamente documental de aislamiento local del ejecutor.

## LF-021 — propuesta técnica (solo documentación) de aislamiento local del ejecutor

- Autor inicial: Claude (Claude Code). Responsable actual: ChatGPT en Codex, por relevo autorizado expresamente por el propietario mientras Claude no está disponible. Revisión independiente del candidato corregido: pendiente; ni su autor inicial ni quien modifica esta corrección pueden presentarla como autorrevisada y aprobada.
- Reserva de la corrección antes de editar: misma tarea LF-021 y rama, base `46c5b4b252dc28173aea95955d86b7c5e40f34db`, candidato recibido `0bcf2036bd89132e1a37b1d8e2b66d60c11b57c4`; alcance limitado a este HANDOFF, `docs/specs/LF-021.md` y `docs/autopilot/LF-001d-EXECUTOR-SANDBOX-PROPOSAL.md`. Objetivo: barrera de arranque verificada antes de ejecutar código no confiable y plan de fallos, solo documentación. El manifiesto SHA-256 de los cinco documentos del PR se registrará en el mensaje del commit de entrega. Claude debe sincronizar el nuevo head antes de retomar, sin editar en paralelo.
- Continuidad tras revisión de Claude del candidato `05e092e9ff4b114e3fe41c6433279e4bbaede755`: ChatGPT conserva la responsabilidad y el mismo alcance de tres documentos para aclarar roles de supervisor/init/auxiliar, actualizar el diagrama, numerar el criterio de barrera y hacer explícito el timeout externo. Claude no se autoaprueba las partes de la propuesta que escribió. Las aclaraciones nuevas requieren revisión independiente; PR #17 permanece draft, sin autorización de merge ni implementación.
- Revisión de Claude del candidato `749cce6f9363bd8e2b4b350c96f5c150509aad6c`: tres aclaraciones resueltas, roles aún contradictorios en la secuencia operativa. ChatGPT corrige exclusivamente los mismos tres documentos: nueve pasos con creación explícita del init PID 1 y su auxiliar hijo, exec solo del auxiliar, init persistente y caso futuro que observa la topología/objetivo de cancelación. No se ejecuta aislamiento ni código nuevo. Se utiliza el Node 24.22.1 ya instalado para la validación local, sin equipararlo al 24.19.0 de CI. Manifiesto en el commit, resultados en PR; revisión independiente del nuevo head pendiente.
- Rama: `design/lf-021-executor-sandbox-proposal`. Base: `46c5b4b252dc28173aea95955d86b7c5e40f34db` (merge PR #16).
- Autorización expresa del propietario: inspección de solo lectura del entorno de esta sesión y preparación de documentación que concrete la fila "Tecnología de aislamiento del ejecutor" de la sección 11 de `docs/autopilot/LF-001d-IMPLEMENTATION-DESIGN.md`. Explícitamente NO autoriza instalar herramientas/dependencias, construir infraestructura (namespaces, cgroups, contenedores o VMs reales), ejecutar código no confiable, ni probar escapes.
- Alcance: `docs/autopilot/LF-001d-EXECUTOR-SANDBOX-PROPOSAL.md` (nuevo) — inspección de solo lectura de **una** sesión concreta de Claude Code Cloud (kernel tipo microVM, Ubuntu 24.04, privilegio/capacidades casi completas desde dentro del shell, sin LSM ni seccomp local detectado, `docker` presente pero sin daemon alcanzable, `runc`/`unshare`/`chroot`/`cgroup`fs v1-híbrido presentes y escribibles pero no construidos ni probados), explícitamente distinguida del equipo del propietario (Windows, no inspeccionado) y de cualquier entorno de producción candidato (sin decidir); propone, sin construirlas, las restricciones de escritura/filesystem/red/procesos/tiempo/memoria/credenciales, un mecanismo de cancelación y recogida de evidencias, los archivos previstos para una implementación futura, un plan de pruebas sintético, la integración con `admission-validator.mjs`/`provider-invocation.mjs` (LF-019) y `pause-controller.mjs` (LF-020), y las decisiones pendientes del propietario. Contrato de esta tarea en `docs/specs/LF-021.md`.
- Ninguna comprobación bloqueada se declaró superada: durante la inspección no se intentó ninguna conexión de red nueva (verificar red denegada por defecto exige construir primero el mecanismo, no autorizado en esta fase); el propietario reportó avisos de host bloqueado/secreto faltante/recursos agotados en su propio cliente, documentados en la sección 1.3 de la propuesta como observación suya, no reproducidos directamente por los comandos de solo lectura de esta inspección (todos locales: `/proc`, `/sys`, `/etc/os-release`, `command -v`, un socket de Docker local inexistente). Ningún aviso de secreto faltante se interpretó como necesidad de una credencial para el ejecutor.
- `docs/autopilot/BACKLOG.json` intacto: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`. Sin workflows ni dependencias modificados. Diff exclusivamente bajo `docs/`: `foundation=false`, `Foundation verification` se omite correctamente.
- Validación local, candidato y CI: se registrarán en el PR con comandos y resultados reales. No declarar CI ni revisión aprobadas antes de observarlas.
- Siguiente paso: verificar gates sobre el diff, publicar PR en borrador, revisión independiente (no por Claude) del SHA exacto, y autorización nueva y separada del propietario antes de decidir el entorno de producción real, instalar/construir cualquier mecanismo de aislamiento, o proponer una implementación.
- **Corrección post-revisión (misma rama, mismo PR en borrador):** una revisión independiente del candidato `b54ca52324147e3babc63a889c647e9917583019` señaló tres hallazgos, resueltos exclusivamente en `docs/autopilot/LF-001d-EXECUTOR-SANDBOX-PROPOSAL.md`: (1) **retirada de privilegios del ejecutor** — se añadió la sección 3.1 (UID/GID dedicado, vaciado de los cinco conjuntos de capacidades Linux citando el *runtime-spec* de OCI, `no_new_privs`, política seccomp propuesta, restricciones de `/proc`/dispositivos/descriptores heredados, orden de preparación en 9 pasos y fallo cerrado), dejando explícito que namespaces/`chroot` no retiran privilegio por sí solos; (2) **prueba de red sin falso positivo** — se retiró `curl http://example.invalid` (cae bajo el dominio reservado `.invalid`, que puede fallar con o sin red real) y se documentó, sin ejecutarlo, un plan de prueba controlada con destino IP numérico, controles positivo/negativo, observación externa y un resultado explícito "inconcluso"; (3) **semántica de PID namespaces y CPU** — se corrigió que los procesos internos son visibles desde cada namespace ancestro (no "invisibles"), y que exceder una cuota de CPU produce *throttling* (`cpu.stat`), nunca una terminación, distinguiéndolo de un presupuesto acumulado, del plazo de reloj y del OOM real de memoria. Referencias primarias: *runtime-spec* de OCI (obtenido directamente) y copias espejo verificadas de `pid_namespaces(7)`/documentación de ancho de banda CFS, servidas desde GitHub; los hosts canónicos `man7.org`, `docs.kernel.org`, `rfc-editor.org` y un espejo en `tex2e.github.io` resultaron bloqueados para esta sesión (`getaddrinfo ENOTFOUND`) — el contenido de RFC 6761 queda marcado explícitamente como conocimiento general no verificado contra su fuente primaria en esta ronda, documentado como comprobación bloqueada. Sin instalar herramientas, sin construir namespaces/cgroups/contenedores, sin ejecutar código no confiable ni probar escapes. Sin workflows ni dependencias modificados; `BACKLOG.json` intacto. El candidato corregido sigue siendo exclusivamente documental y requiere otra revisión independiente antes de cualquier autorización o fusión.


## LF-021 — cierre verificable

- PR #17 integrado mediante merge: head `f20aec22377c74196e0fc12987c4be2d5e38ec64`, merge `0b0110969493a9e74b618f20540d280fc21d7993`; evidencia de padres y ancestría verificable por el gate. Se cierra la reserva documental, sin autorizar construir aislamiento ni habilitar agentes.

## LF-022 — alcance preparatorio de LF-002a

- Responsable: ChatGPT en Codex. Revisor propuesto: Claude, no iniciado por esta tarea. Rama `planning/lf-022-lf-002a-scope`, base `0b0110969493a9e74b618f20540d280fc21d7993`.
- Autorización del propietario: preparar el alcance concreto de LF-002a en documentación; no ejecutar el spike, instalar herramientas, conectar servicios, introducir secretos ni desbloquear tareas.
- Reserva registrada antes de editar el alcance: las cinco rutas exactas del registro LF-022. Entregables: contrato LF-022, actualización de estado contextual de LF-002a, plan técnico de pruebas y roadmap.
- Contrato: docs/specs/LF-022.md. Plan de implementación futura: docs/LF-002a-IMPLEMENTATION-PLAN.md. LF-002a/002/003 y execution_enabled=false permanecen intactos en BACKLOG; D-002/D-003 siguen pendientes.
- Manifiesto SHA-256 de los cinco documentos en el mensaje del commit. Resultados locales, SHA y CI se registran en el PR al observarlos; revisión independiente y autorización de merge pendientes.
- Riesgo principal: aprobar RLS con mocks o con un rol que la omite; el spike futuro exige PostgreSQL real y evidencia de rol/transacción/conexión. Ninguna de esas pruebas se ejecuta en LF-022.

## LF-022 — cierre verificable

- PR #18 fusionado mediante `merge`: head `325ece94eec2493c7bb37ae3d6c484311265acf7`, merge `68f77930a35846a39cdbb490354abe0d3c25e53d`; padres, ancestría y subject verificados por quien ejecutó el merge antes de fusionar. Se cierra la reserva documental.

## LF-023 — implementación del spike de identidad LF-002a (fase 1: código y pruebas, sin instalar/conectar)

- Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto de Claude; esta entrega no puede autorrevisarse.
- Rama: `impl/lf-023-lf-002a-identity-spike`. Base: `68f77930a35846a39cdbb490354abe0d3c25e53d` (merge PR #18).
- Autorización expresa del propietario: implementar el spike LF-002a conforme al plan integrado por PR #18 (`docs/LF-002a-IMPLEMENTATION-PLAN.md`), en rama independiente y PR DRAFT. Explícitamente autoriza escribir código y pruebas ahora; explícitamente exige presentar la lista concreta de cambios para aprobación **antes** de instalar herramientas/paquetes, descargar imágenes, crear una base local o generar material de autenticación sintético. Sin bases remotas, credenciales productivas, correo real, proveedores IA ni servicios pagados; sin desplegar, ejecutar otros agentes, modificar workflows ni fusionar.
- Alcance de esta fase: `tests/integration/lf-002a/schema.sql` (DDL de identidad + `tenant_probe`/`probe_memberships`, revisado contra el esquema real de `@better-auth/core@1.7.18` obtenido del propio paquete publicado — ver evidencia abajo), `fixtures.ts` (tenants/usuarios sintéticos, sin secretos), `database.ts` (pool, preflight, instrumentación), `auth.ts` (configuración e instrumentación de Better Auth), `tenant-context.ts` (wrapper de sesión/membresía/transacción), `isolation.test.ts`/`auth-boundary.test.ts`/`lifecycle.test.ts` (la matriz P01–P16 del plan, escritos como pruebas reales que **no pueden ejecutarse todavía** — dependen de paquetes y de una base no instalados/creados en esta fase), `vitest.lf-002a.config.ts` (configuración separada, nunca recogida por `npm test`). Contrato de esta tarea en `docs/specs/LF-023.md`.
- **No se tocó `package.json`/`package-lock.json` en esta fase**: las versiones exactas investigadas (ver `docs/specs/LF-023.md` §4) se presentan como propuesta para aprobación del propietario, no como edición ya aplicada. No se ejecutó `npm install`, no se creó ni inició ninguna base de datos, no se descargó ninguna imagen de contenedor, no se generó ningún material de autenticación sintético (ni siquiera efímero).
- Entorno inspeccionado (esta sesión de Claude Code Cloud, Linux, distinta de la sesión Windows que usó ChatGPT en LF-022): PostgreSQL 16 completo ya instalado (`postgresql-16`, `postgresql-client-16`), con un clúster `main` ya inicializado en el puerto 5432 pero **detenido** (`pg_lsclusters`: `Status down`); ningún otro proceso escucha ese puerto. Docker CLI presente, daemon no alcanzable (mismo patrón que LF-021). Node v22.23.4 activo en esta sesión junto al v24 ya usado en rondas anteriores; `.nvmrc` sigue fijando 24.19.0 para CI.
- `docs/autopilot/BACKLOG.json` intacto: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`; D-002/D-003 sin aprobar. Sin workflows modificados.
- Dado que el diff de esta fase incluye código fuera de `docs/` (los archivos de prueba/esquema/TS), `foundation=true`: `Foundation verification` se ejecutará en CI y **se espera que falle** en `lint`/`typecheck` por imports no resolubles (`better-auth`, `drizzle-orm`, `pg`) mientras esas dependencias no estén aprobadas e instaladas — esto es un estado intermedio esperado de esta fase, no un defecto oculto; se documenta explícitamente, nunca se declara un resultado distinto del observado.
- Validación local real, ejecutada antes de este commit (no afirmada sin haberla corrido): `node --test tests/coordination/*.test.mjs` → **217/217 aprobadas**, sin regresión. `npm run lint` → **limpio** (0 problemas; se corrigió un import `PoolClient` sin usar detectado en ese mismo paso). `npm run typecheck` → **36 errores**, los 36 son consecuencia directa o en cascada de los tres paquetes no instalados: `TS2307 Cannot find module` para `pg`/`better-auth`/`drizzle-orm`/`drizzle-orm/node-postgres`/`drizzle-orm/pg-core`/`better-auth/adapters/drizzle` (7 ocurrencias), y el resto (`TS7006`/`TS18046`, parámetros/retornos inferidos como `any`/`unknown`) son el mismo efecto propagándose por `isolation.test.ts` porque los tipos de `pg` (`QueryResult`, etc.) tampoco resuelven — ninguno es un error de lógica independiente. No se ejecutaron (no pueden ejecutarse) `isolation.test.ts`/`auth-boundary.test.ts`/`lifecycle.test.ts` mismos: exigen `pg`/`better-auth`/`drizzle-orm` instalados y PostgreSQL real, ninguno disponible en esta fase.
- Corrección tras un primer intento de `node scripts/check-coordination.mjs`: faltaba la fila de `docs/ROADMAP.md` para `LF-023` (exigida por `readPlannedFiles`, igual que para toda tarea anterior). Se añadió esa fila y se agregó `docs/ROADMAP.md` a la lista de archivos reservados de esta misma tarea (arriba) — ambos archivos documentales de coordinación, dentro del alcance ya autorizado (código/pruebas/documentación de esta fase 1), sin tocar `BACKLOG.json` ni workflows.
- Siguiente paso: el propietario revisa la lista concreta de cambios (versiones exactas, elección de base de datos local ya instalada frente a contenedor, y el material de autenticación sintético propuesto) en `docs/specs/LF-023.md` §4 y autoriza expresamente la fase 2 (editar `package.json`, instalar, iniciar el clúster PostgreSQL ya presente, crear el rol/base descartables, generar el secreto sintético) antes de que algo de eso se ejecute. Revisión independiente del candidato de esta fase 1, pendiente.

## LF-023 — corrección de los 6 hallazgos de la revisión independiente del PR #19

Candidato revisado: `e373c89feced48009c4f87d6889bbe655753380c`. Corrección íntegramente en la misma rama `impl/lf-023-lf-002a-identity-spike`, sin instalar paquetes, iniciar PostgreSQL, crear/conectar bases ni generar secretos — fase 2 sigue sin autorizar. Detalle completo hallazgo por hallazgo en `docs/specs/LF-023.md` §7; resumen:

1. **Validación efectiva de conexión** (hallazgo 1): `assertLocalOnly` extraído a `connection-guard.ts` (puro); rechaza cualquier parámetro de consulta (incluido el `?host=` que sustituía el destino real), listas de hosts múltiples y esquemas no-postgres; trata IPv4/IPv6/`localhost` explícitamente, sockets Unix explícitamente no soportados. 11 pruebas puras ejecutadas y aprobadas.
2. **Protección del destino/operaciones destructivas** (hallazgo 2): se eliminó el parámetro "nombre esperado" de `dropSpikeDatabaseIfMatching`/`createSpikeDatabaseIfMatching` (el bypass exacto reportado por un doble local: dos cadenas iguales a `"postgres"` se aceptaban). `lab-target.ts` (puro) exige nombre único más una fila marcadora de procedencia (`lf002a_lab_marker`) antes de cualquier operación destructiva; bases de sistema rechazadas siempre. 8 pruebas puras con dobles, incluida la reproducción exacta del bypass, ejecutadas y aprobadas.
3. **Preflight del rol conectado y políticas** (hallazgo 3): `runPreflight` consulta `current_user`/`session_user` reales, identifica el objeto por esquema+nombre exactos, inspecciona cada política (roles/comando/USING/WITH CHECK, detecta políticas permisivas vacías), grants en exceso y roles heredados privilegiados; decisión pura en `preflight-policy.ts`, 15 pruebas ejecutadas y aprobadas. El preflight es ahora precondición obligatoria en `beforeAll` (lanza y bloquea todo el archivo) en los tres archivos de prueba.
4. **Sesiones reales P10-P12** (hallazgo 4): `tenant-context.ts` exige un `SessionVerificationOutcome` derivado de `auth.api.getSession` real, nunca un `status` declarado a mano; `auth-boundary.test.ts` reescrito con alta/login/expiración/revocación reales y verificación por `vi.spyOn` de que ninguna sesión no válida consulta la conexión del runtime.
5. **Frontera transaccional P13/P14** (hallazgo 5): clasificación por tabla realmente referenciada (`query-classifier.ts`, 10 pruebas puras ejecutadas y aprobadas) más backend/transactionId reales de BEGIN/COMMIT/ROLLBACK; dos escenarios (pool compartido sin cliente común vs. cliente compartido deliberadamente vía `createClientScopedAuth`, sin riesgo de deadlock); P14 conecta `databaseHooks.user.create.after` a una escritura vía `withTenantContext`, confirmada positivamente, no solo por ausencia de consultas.
6. **Aislamiento y orden de la suite** (hallazgo 6): `seedFixtures`/`assertSeedSanity` extraídos a `seed.ts` (ningún `.test.ts` importa a otro); `lifecycle.test.ts` tiene configuración propia (`vitest.lf-002a.lifecycle.config.ts`, `include` mutuamente excluyente) para que nunca corra junto a isolation/auth-boundary; `schema.sql` re-otorga GRANT/REVOKE del rol runtime (idempotente, necesario tras recrear la base) y crea la fila marcadora; P04/P05 exigen el mensaje exacto de violación de RLS; `assertSeedSanity` impide pases vacuos por tabla vacía.

Validación real ejecutada en esta ronda: `npx vitest run` (config por defecto) → **54/54** pruebas puras en 6 archivos (45 nuevas de esta ronda + 9 previas). `node --test tests/coordination/*.test.mjs` → **217/217**, sin regresión. `npm run lint` → limpio. `npm run typecheck` → 36 errores, todos en cascada desde los tres paquetes no instalados (se encontraron y corrigieron además dos bugs reales de tipos ajenos a `pg`, detectados por este mismo typecheck: un array de solo lectura al que se le llamaba `.push()`, y una inferencia de tupla de `Map` que colapsaba a `{}`). Pendiente, como el resto de esta fase: las 16 pruebas P01-P16 contra PostgreSQL/Better Auth reales — las pruebas con dobles de esta ronda demuestran la lógica, nunca sustituyen esa ejecución. Revisión independiente del candidato corregido, pendiente.

## LF-023 — corrección de los hallazgos pendientes de la segunda ronda de revisión (candidato `212e201`)

Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto; Claude no puede autorrevisarse. Misma rama `impl/lf-023-lf-002a-identity-spike`. Autorización del propietario explícita para esta ronda: corregir código/pruebas/documentación dentro de la reserva vigente; sin instalar dependencias, iniciar PostgreSQL, crear bases/roles, generar secretos, conectar proveedores, desplegar ni generar gastos. `docs/autopilot/BACKLOG.json` intacto, `execution_enabled=false`, tareas bloqueadas sin cambios. Detalle completo en `docs/specs/LF-023.md` §8; resumen:

1. **Protección del destino completo**: `lab-target.ts` añade `verifySameServer` (compara `system_identifier` real de `pg_control_system()` entre la conexión administrativa y la candidata antes de confiar en cualquier operación que combine ambas — compartir solo el nombre de la base nunca basta) y `markLabTargetAsCreated`, la única función que escribe la fila marcadora, invocada exclusivamente justo después de un `CREATE DATABASE` real y exitoso. Como Postgres no tiene `CREATE DATABASE IF NOT EXISTS`, una base preexistente ajena hace que esa llamada lance y el marcador nunca se escriba — ya no existe ninguna excepción "de solo nombre" (ni siquiera para `applySchemaSql`, que ahora exige siempre la verificación completa). `seedFixtures` verifica procedencia por sí misma antes de insertar.
2. **Preflight RLS "OR true"**: la comprobación de política pasó de "contiene la subcadena correcta" a un patrón anclado de principio a fin que exige la expresión EXACTA (con paréntesis/`::text` opcionales) — una política con `tenant_id = current_setting(...) OR true` ya se rechaza.
3. **P10-P14**: el hook de membresía automática de P14 se aisló a su propia instancia de Better Auth, ya no contamina las altas de P10-P13 (lo que invalidaba el "sin membresía" de P11 y causaba un conflicto de clave única en P12). Se añadió la revocación real de sesión (`signOut`, resultado comprobado) y se dejó de convertir cualquier excepción de `getSession` en "sesión inválida". Los mensajes de error ya nunca incluyen el objeto de resultado completo (riesgo de imprimir un token).
4. **Instrumentación P13 y clasificación por tabla**: la etiqueta local `backendPid:secuencia` ya no se llama "transactionId" (se renombra a `observedTransactionSpanId`, documentada como agrupador local, no evidencia real); se añade `realTransactionId` vía `pg_current_xact_id()` real tras cada BEGIN, y `outcome` de cierre de transacción. La clasificación de tablas ahora reconoce referencias calificadas por esquema (`"public"."user"`, antes mal clasificada).
5. **Exclusión real entre suites**: nuevo `suite-lock.ts`, candado de archivo atómico (`fs.open(..., 'wx')`, solo `node:fs`) adquirido en `beforeAll`/liberado en `afterAll` de los tres archivos de prueba — las configuraciones de Vitest separadas por sí solas no impedían dos procesos concurrentes.

Validación real ejecutada en esta ronda: `npx vitest run` → **67/67** pruebas puras, 7 archivos. `node --test tests/coordination/*.test.mjs` → **217/217**, sin regresión. `npm run lint` → limpio. `npm run typecheck` → 36 errores, mismo patrón exacto de cascada que la ronda anterior, confirmado línea por línea. Pendiente: las 16 pruebas P01-P16 contra PostgreSQL/Better Auth reales. Revisión independiente del candidato corregido, pendiente, antes de solicitar autorización de fase 2.

## LF-023 — corrección de los 2 hallazgos pendientes de la tercera ronda de revisión (candidato `bde090b`)

Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto; Claude no puede autorrevisarse. Misma rama. Autorización del propietario explícita para esta ronda, con el mismo alcance que las anteriores: corregir código/pruebas/documentación dentro de la reserva vigente; sin instalar dependencias, iniciar PostgreSQL, crear bases/roles, generar secretos, conectar proveedores, desplegar ni generar gastos. `docs/autopilot/BACKLOG.json` intacto, `execution_enabled=false`, tareas bloqueadas sin cambios. Detalle completo en `docs/specs/LF-023.md` §9; resumen:

1. **Destino del marcador de procedencia**: `createSpikeDatabaseIfMatching` comprobaba el mismo servidor pero nunca el nombre real de la base que recibía la conexión nueva antes de marcarla — dos bases distintas del mismo servidor comparten `system_identifier`. Se reinstauró `checkDatabaseNameOnly` y se movió la secuencia completa de creación a una función pura nueva, `lab-target.ts#createSpikeTarget`, que valida toda la configuración disponible (nombre y servidor de ambas conexiones) antes de la única escritura. `database.ts#createSpikeDatabaseIfMatching` es ahora un envoltorio de pocas líneas que delega en esa función real — las pruebas nuevas la ejercitan con conexiones inyectadas, sin ninguna función `simulateGuardedCreate` aparte que copiara su secuencia.
2. **Instrumentación y P13b**: P13b instrumentaba el cliente DESPUÉS de emitir BEGIN/set_config, así que esas consultas nunca quedaban registradas — se corrigió el orden. `realTransactionId` solo se asignaba a la propia traza de BEGIN (las consultas posteriores quedaban con `null` para siempre, rompiendo cualquier comparación por xid real); ahora se mantiene un estado activo por conexión que propaga el xid a toda consulta dentro de la transacción y se limpia al cerrar. El cierre se decidía por el texto enviado, nunca por lo que el servidor confirmó; ahora se decide por `result.command` real (un COMMIT tras un error se convierte en ROLLBACK server-side, y así debe quedar registrado). Los errores de cada consulta se registran y siempre se re-lanzan. Toda esta lógica se extrajo a un módulo puro nuevo, `transaction-instrumentation.ts`.

Validación real ejecutada en esta ronda: `npx vitest run` → **80/80** pruebas puras en 8 archivos (13 netas más que la ronda anterior). `node --test tests/coordination/*.test.mjs` → **217/217**, sin regresión. `npm run lint` → limpio. `npm run typecheck` → 36 errores, mismo patrón exacto de cascada, confirmado línea por línea, ningún error nuevo. Pendiente: las 16 pruebas P01-P16 contra PostgreSQL/Better Auth reales — las pruebas offline con dobles de esta ronda nunca sustituyen esa ejecución real, y así se declara explícitamente. Revisión independiente del candidato corregido, pendiente, antes de solicitar autorización de fase 2.

## LF-023 — corrección del hallazgo único de la cuarta ronda de revisión (candidato `d5e7b2c`)

Responsable: Claude (Claude Code). Revisor: el propietario o un agente distinto; Claude no puede autorrevisarse. Misma rama. Autorización del propietario explícita para esta ronda, con el mismo alcance que las anteriores: corregir código/pruebas/documentación dentro de la reserva vigente, sin ampliar alcance; sin instalar dependencias, iniciar PostgreSQL, crear bases/roles, generar secretos, conectar proveedores, desplegar ni generar gastos. `docs/autopilot/BACKLOG.json` intacto, `execution_enabled=false`, tareas bloqueadas sin cambios. Detalle completo en `docs/specs/LF-023.md` §10.

**Resultado incierto del cierre transaccional**: `transaction-instrumentation.ts` registraba incondicionalmente `'rolledback'` cuando COMMIT/ROLLBACK lanzaba una excepción al enviarse — una confirmación inventada, porque la conexión pudo perderse DESPUÉS de que el servidor aplicara el commit. Se añadió un cuarto estado, `'unknown'`, a `TransactionOutcome`: solo `result.command === 'COMMIT'`/`'ROLLBACK'` deciden `'committed'`/`'rolledback'`; cualquier excepción al cerrar o cualquier tag de cierre no reconocido queda como `'unknown'`, conservando el error disponible y limpiando igual el estado de transacción activa (ninguna consulta posterior hereda el identificador de una transacción cuyo cierre quedó incierto). Se corrigió la prueba que exigía `'rolledback'` ante un COMMIT que lanza (ahora exige `'unknown'`) y se añadieron dos regresiones: ROLLBACK con la respuesta perdida, y un tag de cierre inesperado.

Validación real ejecutada en esta ronda: `npx vitest run` → **82/82** pruebas puras en 8 archivos (2 netas más que la ronda anterior; sin archivos nuevos, solo `transaction-instrumentation.ts` y su prueba, ambos ya reservados). `node --test tests/coordination/*.test.mjs` → **217/217**, sin regresión. `npm run lint` → limpio. `npm run typecheck` → 36 errores, mismo patrón exacto de cascada, confirmado línea por línea, ningún error nuevo. Pendiente: las 16 pruebas P01-P16 contra PostgreSQL/Better Auth reales. Revisión independiente del candidato corregido, pendiente, antes de solicitar autorización de fase 2.

## LF-023 — fase 2 autorizada expresamente por el propietario (sobre el candidato `3b4f3cb`)

El propietario autorizó expresamente, sobre `3b4f3cb7db57e363f22898961cd48cedd07acd92`, el alcance completo de fase 2: instalar las dependencias exactas de `docs/specs/LF-023.md` §4.1 y actualizar `package.json`/`package-lock.json` (ambos se añaden ahora a la reserva — antes intactos); verificar e iniciar PostgreSQL 16 local, inventariando y conservando intactas las bases preexistentes; crear exclusivamente `lf002a_spike` y los roles `lf002a_provisioner`/`lf002a_runtime` con separación real entre aprovisionamiento y runtime, deteniéndose sin borrar ni apropiarse de nada si el nombre ya existiera sin procedencia verificable; generar `LF002A_AUTH_SECRET` sintético y efímero en un archivo local ignorado por Git, nunca impreso ni publicado; ejecutar la matriz P01-P16 real contra PostgreSQL/Better Auth y corregir la integración dentro del alcance del spike sin debilitar pruebas; ejecutar las verificaciones generales y comprobar CI sobre el SHA final.

Exclusiones vigentes sin cambios: sin desplegar, sin contratar servicios, sin datos reales, sin proveedores externos; `docs/autopilot/BACKLOG.json` intacto, sin desbloquear tareas; AUTOPILOT y el ejecutor de agentes en pausa; PR #19 permanece en DRAFT, sin fusión ni auto-merge. Detalle completo y resultados reales (aprobado/fallido/omitido, nunca un resultado distinto del observado) en `docs/specs/LF-023.md` §11, actualizado una vez ejecutada la fase 2.

**Resultados reales de la ejecución** (detalle completo en `docs/specs/LF-023.md` §11.1): dependencias instaladas y confirmadas (`better-auth@1.7.18`, `drizzle-orm@0.45.4`, `pg@8.23.1`, `drizzle-kit@0.31.11`, `@types/pg@8.23.1`); PostgreSQL 16 iniciado, inventario previo con solo `postgres` preexistente, conservada intacta; creados exclusivamente `lf002a_spike` y los roles `lf002a_provisioner`/`lf002a_runtime` (sin `CREATEDB`/`CREATEROLE`/superusuario); `LF002A_AUTH_SECRET` y las tres contraseñas de rol generados y guardados únicamente en `.env.test.local` (gitignored, `0o600`), nunca impresos. Matriz P01-P16 ejecutada de verdad contra PostgreSQL/Better Auth reales: **17/17 casos pasaron** (P01 como precondición obligatoria de cada `beforeAll`; P02-P09; P10-P14; P15/P15b/P16), ejecutados en dos invocaciones separadas y nunca concurrentes (`vitest.lf-002a.config.ts` y `vitest.lf-002a.lifecycle.config.ts`), vía `suite-lock.ts`. Se encontraron y corrigieron cuatro errores reales, ninguno conocido antes de ejecutar: (1) error de tipos real en `buildAuth` (`ReturnType<typeof drizzle>` fija el overload `Pool`, incompatible con el `PoolClient` de P13b) — corregido retipando a `Parameters<typeof drizzleAdapter>[0]`; (2) `CREATE DATABASE` sin `OWNER` explícito dejaba a `lf002a_provisioner` sin permiso para crear la fila marcadora bajo las revocaciones por defecto de PostgreSQL 15+ sobre `public` — corregido añadiendo `owner "lf002a_provisioner"`, con regresión nueva en `lab-target.test.ts`; (3) `tenant_probe` activa `FORCE ROW LEVEL SECURITY`, así que las lecturas de verificación SIN contexto de tenant del provisionador (en `seed.ts`, y en P04/P05/P08 de `isolation.test.ts`, y en P16 de `lifecycle.test.ts`) pasaban vacuamente — corregidas envolviendo cada una en `withTenantContext` con el tenant real de la fila; (4) Better Auth lee el token de sesión exclusivamente de una cookie firmada (confirmado leyendo `node_modules/better-auth/dist/api/routes/session.mjs` directamente), por lo que el header `Authorization: Bearer` de `auth-boundary.test.ts` no tenía efecto sin el plugin `bearer` — corregido añadiendo `plugins: [bearer()]` a `buildAuth`. Verificaciones generales, todas reales: `npm run lint` limpio; `npm run typecheck` limpio (a diferencia de todas las rondas anteriores, que tenían la cascada disclosed de módulos no instalados — ahora instalados, el error desapareció porque era real y esperado, no una regresión); `node --test tests/coordination/*.test.mjs` → 217/217; `npx vitest run tests/unit/` → 82/82, sin cambios por la fase 2. Ningún pendiente dentro del alcance autorizado.

**Cierre**: PR #19 fue fusionado por el propietario directamente en GitHub (acción suya, no de Claude) en `209b808e3053907fd431f4a17cbdccdbe97a02cb` (`head_sha` `c4611773e08a8e733cb3f04911d27e0ae4489e80`). El registro de esta tarea arriba se marca `completed` con esa evidencia, correspondiendo a la realidad — ver advertencia sobre `verifiedMergeReleases` en la siguiente sección.

## LF-003 — propuesta de diseño visual y experiencia de uso del CRM (etapa 1)

Responsable: Claude. Revisor: el propietario u otro agente; Claude no se autoaprueba. Rama `design/lf-003-ui-ux-proposal`, base `main` en `209b808e3053907fd431f4a17cbdccdbe97a02cb`. El propietario asignó esta tarea explícitamente tras la integración de LF-023, pidiendo diseño visual y de experiencia de uso para el CRM, navegable, con datos sintéticos, por etapas (ver `docs/specs/LF-003.md`). Alcance de esta entrega (etapa 1): acceso, estructura principal del CRM y prospectos (listado, filtros y ficha); el resto (organización, pipeline, historial agregado, dashboard, contenido del asistente de IA) queda explícitamente para la etapa 2, pendiente de validar primero la dirección visual de esta entrega.

Archivos reservados: `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/specs/LF-003.md`, `src/app/design/**`, `src/components/ui/**`, `tests/e2e/design-preview.spec.ts`. Ningún archivo de `src/modules/**`, `tests/integration/lf-002a/**`, `tests/unit/lf-002a/**` ni ninguna otra reserva activa. Exclusiones: sin instalar dependencias nuevas, sin desplegar, sin proveedores externos, sin secretos, sin datos reales, sin recopilar credenciales en los formularios de la propuesta, sin tocar `docs/autopilot/BACKLOG.json` ni `execution_enabled`; AUTOPILOT y el ejecutor de agentes permanecen en pausa.

**Riesgo de coordinación detectado (no de esta tarea, documentado en `docs/specs/LF-003.md` §10)**: al registrar esta reserva se verificó, ejecutando las funciones reales de `scripts/check-coordination.mjs` contra el historial real del repositorio, que `verifiedMergeReleases` no puede reconocer la liberación de LF-023 para este `main` base: exige que el *subject* del commit de fusión contenga literalmente `LF-023`, y el commit `209b808` usa el mensaje por defecto de GitHub ("Merge pull request #19 from ..."), que solo contiene `lf-023` en minúscula como parte del nombre de rama. Todas las demás comprobaciones (ancestría de `merge_sha`, `head_sha` entre los padres, `--is-ancestor`) pasan; solo falla esa coincidencia literal de texto. Consecuencia: aunque LF-023 se marca `completed` arriba (con evidencia real), el "Coordination gate" de este PR —y de cualquier PR futuro que toque `docs/HANDOFF.md`/`docs/ROADMAP.md`, es decir toda tarea futura— probablemente seguirá en rojo por este motivo, ajeno al contenido de cada PR, hasta que el propietario autorice una corrección a `verifiedMergeReleases`. Se registró como sugerencia de tarea independiente; no se modifica el script desde este PR.

## LF-024 — liberación verificable con el mensaje predeterminado de GitHub

- Responsable: ChatGPT. Revisor independiente: Claude/propietario, pendiente. Rama `fix/lf-024-default-merge-release`, base `209b808e3053907fd431f4a17cbdccdbe97a02cb`.
- Reserva registrada antes de editar código: `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/specs/LF-024.md`, `scripts/check-coordination.mjs`, `tests/coordination/release.test.mjs`.
- LF-023 se cierra con head `c4611773e08a8e733cb3f04911d27e0ae4489e80` y merge `209b808e3053907fd431f4a17cbdccdbe97a02cb`, padres y ancestría comprobados. El identificador está en el título del PR incluido en el cuerpo del merge; su subject predeterminado solo contiene la rama en minúsculas.
- Objetivo: reconocer de forma acotada ese formato sin suprimir la prueba Git ni aceptar menciones arbitrarias del identificador en el cuerpo. No se reescribe el historial ni se modifica el PR #20 de Claude.
- Alcance interno de corrección del gate que bloquea el trabajo de producto; no reanuda AUTOPILOT. BACKLOG, workflows, dependencias y src intactos.
- Validación y manifiesto SHA-256: se registran en el commit y el PR tras ejecutarlos. Sin autoaprobación ni autorización de merge.

### Validación local LF-024

- Node 24.22.1 ya disponible, sin instalar dependencias. Suite de coordinación: 227/227. Regresión ejecutada con el verificador original: las dos afirmaciones positivas del formato predeterminado fallan; con la corrección pasan. Todos los controles negativos pasan con ambos verificadores.
- Sobre base `209b808e3053907fd431f4a17cbdccdbe97a02cb` y candidato real de PR #20 `e20294b622e694ea4558d580ab9805eb814c9d85`, el CLI corregido produce `taskId: LF-003`, `count: 46`, `foundation: true`, `verified_releases: [LF-023]`. Es una reproducción local, no un check remoto de PR #20.
- Los resultados de los gates de LF-024 y CI se adjuntan al PR. No se ejecutó localmente la suite de aplicación (dependencias no instaladas en este checkout); se comprobará el job remoto completo.

**Reconciliación real tras la fusión de PR #21**: el propietario fusionó PR #21 en `46a9bb277ac63543982484e01e3515408d903b81` (padres: `209b808e3053907fd431f4a17cbdccdbe97a02cb` y `0f0bb22870501722dae1795ffe2b8e3d536aa5a6`, el candidato auditado de forma independiente por Claude antes de la fusión). El registro de LF-024 arriba se actualiza a `completed` con esa evidencia real. Claude sincronizó esta rama (`design/lf-003-ui-ux-proposal`, PR #20) con `main` mediante un merge real (nunca rebase/squash), conservando su propia reserva LF-003 intacta. Nótese que el commit de fusión de PR #21 usa un *subject* personalizado ("Merge PR #21: LF-024 default GitHub merge release verification") que ya contiene `LF-024` literalmente — la ruta nueva de reconocimiento de mensaje predeterminado de LF-024 no fue necesaria para liberar la propia reserva de LF-024, solo para la de LF-023.

**Etapa 1 aprobada; etapa 2 autorizada expresamente**: el propietario aprobó la dirección visual de la etapa 1 sobre el candidato `3953bdbc48e91e576d38db3c5132aaec4dce7cb8` (CI real en verde: `Coordination gate` y `Foundation verification`, ambos `success`) y autorizó continuar con la etapa 2 completa — organizaciones, pipeline, dashboard, historial agregado y contenido real del asistente de IA, mismo sistema de diseño y datos sintéticos, sin backend ni proveedores. Misma reserva de archivos (sin cambios: todo vive bajo los mismos globs ya reservados). PR #20 permanece en DRAFT, sin fusión; AUTOPILOT y `docs/autopilot/BACKLOG.json` sin tocar.

## LF-003 — corrección: inconsistencia de zona horaria en el dashboard (candidato `9a146f7`)

El propietario reportó, sobre el candidato `9a146f7426e8cd7075db102b15e8ccb1cdfd34c5` de PR #20, que `monthCohort()` llamaba a `toLocaleDateString` sin `timeZone` explícita, pese a que el dashboard anuncia `SYNTHETIC_ORG.timezone` en pantalla — el mismo prospecto podía caer en una cohorte distinta según la zona del navegador. Caso reproducido exactamente: instante `2026-11-01T02:00:00Z` → sin zona explícita, `nov de 2026` (dependiente de la zona ambiental); con `America/Bogota` explícita, `oct de 2026` (correcto). Detalle completo, corrección y regresión en `docs/specs/LF-003.md` §11.

Reserva ampliada antes de escribir código: se añadió `tests/unit/design/**` a los archivos de esta tarea (abajo) y a "Archivos previstos" de LF-003 en `docs/ROADMAP.md`. No se amplió ningún otro alcance; no se tocaron reglas de R08 ni ninguna otra pantalla.

**Resultados reales**: `npx vitest run tests/unit/` → **88/88** (6 nuevas en `tests/unit/design/cohort.test.ts`, que ejercitan la función real `monthCohort` exportada de `src/app/design/app/dashboard/_lib/cohort.ts`, con el instante exacto del reporte y un segundo instante cercano a otro cambio de mes, variando `process.env.TZ` para probar independencia real de la zona ambiental — confirmado también que la regresión falla de verdad contra la implementación anterior sin `timeZone`, 4/6 casos). `npm run lint`/`typecheck`/`build` limpios. `node --test tests/coordination/*.test.mjs` → **227/227**, sin cambios. `npx playwright test` → **44/44**, sin cambios. Ambos verificadores de coordinación (`check-coordination.mjs`, `check-done-proof.mjs`) ejecutados sobre el SHA final.


## LF-025 — identidad y organizaciones funcionales

- Responsable: ChatGPT. Revisión independiente de Claude pendiente. Rama `impl/lf-025-identity-organizations`; base `796aa5930a93075bca6ee837e4e8b6b72d243711`.
- El propietario autorizó conectar registro/login/organizaciones/permisos reales después de aprobar e integrar LF-003. Desarrollo local, sin despliegue ni proveedores externos. Se adopta la recomendación ya propuesta de D-002 y correo sin proveedor externo; no se afirma completado el correo ni aprobado el uso con datos reales.
- Reserva registrada antes de código: `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/specs/LF-025.md`, `docs/IDENTITY-LOCAL.md`, `.env.example`, `src/modules/identity/**`, `src/modules/organizations/**`, `src/shared/database/**`, `src/app/(identity)/**`, `src/app/app/**`, `src/app/api/auth/**`, `src/app/api/organizations/**`, `scripts/identity/**`, `tests/unit/identity/**`, `tests/integration/identity/**`, `tests/e2e/identity.spec.ts`, `vitest.identity.config.ts`, `.github/workflows/ci.yml`.
- LF-003 completed con la evidencia Git del merge PR #20. BACKLOG intacto, ejecución automática deshabilitada. El trabajo es manual bajo la autorización del propietario.
- El servidor PostgreSQL 18 preexistente en Windows no se modifica. Se preparan pruebas con clúster descartable separado y PostgreSQL 16 en el job de verificación existente, sin secretos productivos.
- Manifiesto, pruebas y limitaciones se registrarán en el commit/PR; no hay autorización de merge.

### LF-025 — resultados locales y límites

- Dependencias instaladas desde el lockfile existente con Node 24.22.1 y npm 11.9.0; sin cambios de versiones ni paquetes.
- PostgreSQL 18 instalado se utilizó en un clúster nuevo bajo work/lf025-postgres, loopback puerto 55425, base exclusiva lf025_identity_test y roles separados. No se modificó el servicio PostgreSQL 18 preexistente. El clúster de prueba se detiene tras validar. CI usará PostgreSQL 16 efímero.
- 93/93 unitarias; 227/227 coordinación; 16/16 integración PostgreSQL/Better Auth reales. La integración invoca el runner de migración real y cubre RLS/contexto ausente/COMMIT/ROLLBACK, identidad y sesiones, origen, límite persistido entre pools, membresía revocada, sales, actor/rol falsificados, slug duplicado, auditoría fallida con rollback total y cuerpo demasiado grande.
- Recorrido de navegador real (Edge instalado): 1/1, registro desde portada, organización, recarga, cookie HttpOnly/SameSite, acceso anónimo, logout, login. Suite visual existente: 44/44; tras añadir únicamente enlace de login en portada, smoke 6/6. Lint, tipos y build limpios.
- El formulario de acceso real está en /login y /register. /design sigue siendo el prototipo sintético. Recuperación/verificación/invitaciones/gestión de miembros y backend comercial quedan expresamente pendientes. Sin despliegue, proveedores IA ni correo real.
- Candidato, manifiesto SHA-256 y CI se registran en el commit/PR. Revisión independiente pendiente; no hay autorización de merge.


## LF-026 — prospectos y pipeline persistentes

- Responsable: ChatGPT. Revisor independiente: Claude, pendiente. Rama `impl/lf-026-leads-pipeline`, base `676946c93c2582dd6a033debf253bf1eb576c6e4`. El propietario autorizó continuar con prospectos/pipeline tras integrar LF-025.
- LF-025 completed con head/merge reales. La prosa antigua que mencionaba tests/e2e/identity.spec.ts queda aclarada: el recorrido real está en tests/identity-e2e/access.spec.ts; el registro JSON ya era correcto.
- Reserva registrada antes de código: `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/specs/LF-026.md`, `docs/LEADS-LOCAL.md`, `src/modules/leads/**`, `src/shared/database/migrations/0002_leads_pipeline.sql`, `src/shared/database/runtime.ts`, `src/app/app/[[]organizationId]/**`, `src/app/api/organizations/[[]organizationId]/leads/**`, `src/app/api/organizations/[[]organizationId]/pipeline/**`, `src/app/api/organizations/[[]organizationId]/stages/**`, `scripts/leads/**`, `tests/unit/leads/**`, `tests/integration/leads/**`, `tests/leads-e2e/**`, `vitest.leads.config.ts`, `playwright.leads.config.ts`, `.github/workflows/ci.yml`.
- Alcance: datos comerciales propios por organización, asignación a miembro vigente, edición/versiones, archivo, pipeline configurable owner/admin, eventos y auditoría atómicos. Contrato versionado en spec LF-026 y modelo ya propuesto en DATA_MODEL/R03/R04; revisión independiente antes de integrar el esquema nuevo.
- Pruebas en clúster descartable propio y PostgreSQL 16 de CI; no tocar el servicio existente ni datos reales. Sin nuevas dependencias, proveedores, secretos productivos o despliegue. BACKLOG intacto y AUTOPILOT en pausa. Manifiesto y resultados en commit/PR.

### LF-026 — candidato local verificado

- Node 24.22.1, paquetes del lockfile vigente, sin cambios de package.json/package-lock. PostgreSQL 18 en clúster nuevo exclusivo work/lf026-postgres, loopback 55426, sin modificar el servicio Windows preexistente. Base lf026_leads_test, provisionador/runtime separados; la regresión de identidad usa otra base lf025_identity_test dentro de este mismo clúster descartable.
- Lint sin advertencias, tipos y build limpios; 105/105 unitarias (12 nuevas), 227/227 coordinación, 13/13 integración comercial real y 16/16 integración de identidad anterior. Migración real con fallo DDL parcial y rollback, repetición/checksum, backfill y bootstrap, límites de tenant/permisos, revocación concurrente, versiones concurrentes, historial/archivo, auditoría fallida y cursores literales ejecutados, no simulados.
- Navegador Edge instalado: 44/44 E2E existentes; 1/1 identidad real y 1/1 ciclo comercial real. Este último verifica recargas, persistencia, archivo/filtro, nueva etapa y axe sin violaciones en las pantallas examinadas, escritorio y móvil. Se corrigió un selector de la prueba; no se atribuye accesibilidad manual completa a axe.
- Patrones `[[]organizationId]` del registro escapan el corchete literal de Next para matchesGlob; no amplían el alcance ni cambian rutas. Verificadores contra el commit real y CI del SHA final se reportarán en el PR. La verificación de CI incluye integración comercial y su recorrido real sobre PostgreSQL 16 efímero; no agrega agentes ni servicios externos.
- No se conectan seguimiento/interacciones/importación/dashboard/IA/correo/miembros. Archivo sin restauración; cursores sin instantánea durante cambios; COMMIT con respuesta perdida no ofrece exactamente una vez. Ver docs/LEADS-LOCAL.md. No hay autorización de merge ni despliegue. Revisión independiente de Claude pendiente.

### LF-026 — corrección tras auditoría independiente de e2531cb

- Claude encontró una organización sin pipeline al entrar en la función antigua durante 0002. Corregido con trigger AFTER INSERT de organizations, sin reemplazar lf_create_organization de 0001. La reproducción determinista usa runner y PostgreSQL reales, locks y pg_blocking_pids: con el SQL anterior falla exactamente el caso nuevo (18/19, MIGRATION_REQUIRED), con el corregido pasa. No se relaja el checksum ni se reparan silenciosamente instalaciones de borradores previos.
- Ficha/historial dejan de bloquear la fila del prospecto; mutaciones conservan FOR UPDATE. Contador comercial ahora global por identidad (120/min), UUID inválido rechazado antes de crear contador; ventana fija y hardening/limpieza histórica de identidad pendientes. Mover tarjeta conserva páginas cargadas y versión confirmada.
- Pruebas propias ampliadas: 20/20 integración comercial real, 105/105 unitarias, 227/227 coordinación, 2/2 navegador comercial (ciclo/axe más 51 tarjetas y segunda página), lint/tipos/build limpios. Incluye revocación del responsable en ambos sentidos, configuración concurrente, etapas usadas por archivados, fallos de auditoría/evento/bootstrap y los ocho SECURITY DEFINER con PUBLIC restringido. PostgreSQL 18 descartable de LF-026, sin tocar el servicio Windows. CI del SHA nuevo se verifica tras publicar; no se reutiliza el resultado remoto del candidato anterior.
- Se mantienen misma rama y 34 rutas reservadas. Ningún cambio a 0001, paquetes, BACKLOG, design o automatización de agentes. PR #23 sigue DRAFT, sin autorización de merge; corrección requiere nueva revisión independiente. Manifiesto final en commit/PR.


## LF-027 — interacciones y seguimientos reales

Responsable ChatGPT; revisión independiente Claude pendiente. El propietario autorizó este incremento con su dale tras LF-026. Base 5d577336998da47d5a01eede25195d53aecb3ecf, rama impl/lf-027-interactions-followups. Merge PR #23 verificado mediante API y padres Git; LF-026 completed con evidencia real. Reserva registrada antes de código. Contrato y límites en docs/specs/LF-027.md. Sin correo, proveedores IA, agentes, dependencias nuevas, datos reales ni despliegue. BACKLOG permanece intacto. Manifiesto SHA-256 final en commit/PR.

### LF-027 — resultados y entrega

- 0003 aditiva; 0001/0002 intactas. Interacciones editables/versionadas, autor real y texto escapado; seguimientos con miembro vigente, vencimiento UTC y cierre terminal idempotente. Creación con clave/payload, auditoría atómica, FORCE RLS/FKs por tenant. Archivo preserva lectura y permite cerrar pendientes, sin crear/editar actividad nueva. Componentes visuales aprobados reutilizados, design intacto.
- Node 24.22.1, PostgreSQL 18 en laboratorio nuevo work/lf027-postgres loopback 55427, sin tocar el servicio preexistente. Runners reales y roles separados; AUTH_SECRET sintético solo en memoria. Local: 118/118 unitarias; 230/230 coordinación; PostgreSQL identidad 16/16, comercial 20/20 y actividad 15/15; lint/tipos/build limpios. Se corrigió un alias SQL de la nueva prueba de contador; no se presenta aquel intento fallido como exitoso.
- Edge: 44/44 E2E existentes, identidad 1/1, comercial 2/2, actividad 1/1 (48/48). Actividad cubre creación/edición/recarga/filtros/cierre/archivo, texto hostil como dato y axe escritorio/móvil/diálogo. La revisión final comprobó pérdida de foco al desmontar el diálogo. Se corrige con useId en el componente compartido y cierre normal sin desmontaje; sin cambios visuales.
- CI existente amplía verificación PostgreSQL 16/Chromium. El navegador comercial anterior ahora usa la base completa de LF-027; sus 20 pruebas de integración siguen en su base separada 0001/0002. Resultado del SHA remoto se observará después de publicar, sin reutilizar el CI de LF-026.
- Sin correo, cron/notificación externa, importación, métricas reales, IA/proveedores o despliegue. Sin cambios de paquetes/BACKLOG/automatización de agentes. Próximo paso: revisión independiente de Claude al candidato exacto; no autorización de merge. Limitaciones operativas/productivas en ACTIVITY-LOCAL.md. Manifiesto final de blobs LF en commit/PR.

- Alcance ampliado antes de corregir el gate: scripts/check-coordination.mjs y tests/coordination/release.test.mjs. El merge real de PR #23 usa el título feat(LF-026): ...; el reconocimiento anterior solo admitía LF-026: ... y bloqueó el verificador local, sin publicar ni saltarlo. Corrección mínima de formatos feat/fix con ID exacto y pruebas negativas; se conservan todas las comprobaciones Git/owner/rama. Revisión independiente obligatoria de este delta adicional.

- Coordinación corregida: 230/230 casos; regresión ejecutada contra script anterior con fallos en los dos títulos feat/fix. Entrega final de 32 archivos; no se omitió ni relajó el gate.

- Reserva ampliada antes de editar src/components/ui/dialog.tsx: corrección de IDs únicos y retorno de foco. Una sonda real comprobó BODY como foco al pulsar Volver; la regresión de navegador exige retorno al botón original tanto al pulsar Volver como Escape. Se conserva apariencia/estilos y el cierre nativo. Entrega final 33 archivos; revisión independiente también de este ajuste.
- Ajuste de diálogo verificado: ambos retornos de foco pasan y se repitieron 44/44 E2E existentes, comercial 2/2 y actividad 1/1 en verde; lint/tipos/build limpios. El primer SHA publicado se sustituye por un commit adicional, sin reescribirlo. Se verifica CI del nuevo SHA por separado; laboratorio detenido.

### LF-027 — corrección del delta auditado cf698798

- Revisión independiente sin hallazgos bloqueantes/medios/altos; dos bajos corregidos: NUL/sustitutos UTF-16 sueltos ahora 422 sin cambios de actividad/auditoría ni pérdida silenciosa (el intento consume límite), y foco en encabezado estable después de confirmar completar/cancelar y retirar la tarjeta. Volver/Escape siguen devolviendo foco al disparador. No cambios de esquema/migraciones, RLS, permisos, idempotencia o gate.
- Local: 122/122 unitarias, integración de actividad 16/16 PostgreSQL 18, navegador actividad 1/1 Edge con confirmaciones/retorno de foco y axe, lint/tipos/build limpios. Las tres regresiones de texto fallan contra los contratos del SHA auditado y pasan con los nuevos. Laboratorio LF-027 separado, detenido después de validar, sin tocar el servicio Windows. CI del nuevo SHA se observa tras publicar, sin reutilizar el del anterior.
- Informativos documentados: cursor asOf modificable sin autenticidad temporal (no afecta RLS); detalle vacío/null distintos para hashes existentes. El nombre de prospecto legado queda fuera de esta corrección. Sin cambios de paquetes/BACKLOG, design, agentes, proveedores o despliegue. Misma reserva LF-027 y PR #24 DRAFT; revisión independiente del delta pendiente, no autorización de merge.

## LF-028 — dashboard real completo

- Responsable: Claude. Revisor independiente: Codex, pendiente. Rama `claude/great-hopper-au1q2b` (la rama designada de la sesión, reiniciada desde main porque solo contenía historia ya integrada), base `26ca90b6d350436b9050033ab4c9c77f1079218e`. El propietario autorizó implementar el dashboard real completo tras integrar LF-027; no autoriza merge ni despliegue.
- LF-027 completed con evidencia Git real del merge de PR #24: head `be6ed88f7625bec408f2f2b8c32d42d8be1dce25`, merge `26ca90b6d350436b9050033ab4c9c77f1079218e` (padres `5d577336…` y `be6ed88f…`), comprobado en el main real antes de registrar.
- Reserva registrada antes de código: `docs/HANDOFF.md`, `docs/ROADMAP.md`, `docs/specs/LF-028.md`, `src/modules/analytics/**`, `src/modules/leads/workspace.tsx`, `src/app/app/[[]organizationId]/page.tsx`, `src/app/app/[[]organizationId]/dashboard/**`, `src/app/api/organizations/[[]organizationId]/dashboard/**`, `tests/unit/analytics/**`, `tests/integration/analytics/**`, `tests/analytics-e2e/**`, `vitest.analytics.config.ts`, `playwright.analytics.config.ts`, `.github/workflows/ci.yml`.
- Alcance: métricas R08 calculadas con consultas PostgreSQL reales por organización (prospectos por etapa, conversión a ganado por cohorte, seguimientos pendientes/vencidos), endpoint de lectura con sesión/membresía/RLS, pantalla real `/app/:org/dashboard` con los componentes aprobados y pruebas unitarias, PostgreSQL real y navegador. Contrato y decisiones explícitas en docs/specs/LF-028.md.
- Sin migración ni cambio de esquema, permisos o dependencias: solo lectura sobre 0001–0003 con los grants existentes. `/design`, BACKLOG y AUTOPILOT sin cambios. La fila LF-006 del roadmap original (dashboard real) queda cubierta por esta tarea; no se edita esa fila ni BACKLOG.json.
- Pruebas en clúster PostgreSQL descartable propio y PostgreSQL 16 de CI, con datos sintéticos. Sin proveedores, credenciales productivas, IA, correo ni gastos.

### LF-028 — candidato local verificado

- Entregado: módulo `src/modules/analytics` (funciones puras, contrato, consulta única y endpoint de lectura), ruta `GET /api/organizations/:org/dashboard`, pantalla `/app/:org/dashboard` enlazada desde la navegación del espacio de trabajo y el inicio de la organización, pruebas unitarias, de integración y de navegador, y dos pasos nuevos en el workflow de verificación existente. Sin migración, grants, funciones SQL ni dependencias nuevas; `/design`, BACKLOG y AUTOPILOT intactos.
- Local (Node 24.22.2, PostgreSQL 16.15 descartable en loopback 55428, Chromium del entorno): lint, tipos y build limpios; 151/151 unitarias (29 nuevas); 230/230 coordinación; integración identidad 16/16, comercial 20/20, actividad 16/16 y analítica 9/9; navegador 44/44, identidad 1/1, comercial 2/2, actividad 1/1 y dashboard 1/1. Laboratorio detenido y borrado; ningún servicio existente tocado.
- Fallos intermedios solo en pruebas propias (dos expectativas y tres ajustes del recorrido de navegador), corregidos y detallados en docs/specs/LF-028.md.
- Decisiones explícitas que requieren confirmación (spec LF-028): archivados incluidos en la conversión, «llegó a ganado» por eventos, seguimientos de archivados contados, días de calendario locales, corte no persistido, intervalo sin altas que no oculta el resto y lectura para los tres roles.
- Pendiente: CI del SHA publicado y revisión independiente de Codex. Sin autoaprobación, merge ni auto-merge. Manifiesto SHA-256 de los blobs finales en el commit y en el PR.

### LF-028 — ampliación tras la revisión independiente de 1739eaf

- La revisión independiente del candidato `1739eaf2b84a60ffc6745c14bac65128cf3ac51c` encontró tres defectos. El propietario confirmó la conversión histórica por eventos (archivados incluidos, cada prospecto una vez) y pidió mantener el corte persistido. Se corrigen en el mismo PR #25, que sigue en DRAFT.
- Reserva ampliada antes de editar: `src/shared/database/migrations/0004_analytics.sql`, `scripts/analytics/**` y `src/shared/database/runtime.ts`, añadidos al registro JSON y a la fila LF-028 del roadmap. Contrato v2 y migración definidos en docs/specs/LF-028.md antes del código.
- Alcance de la ampliación: (1) cada evento de etapa guarda el tipo de su etapa destino en el momento del evento, de modo que reconfigurar una etapa no reinterpreta la historia; (2) el inicio del intervalo es el primer instante real del día local, también con medianoches repetidas o inexistentes; (3) guardado real de cortes mediante una operación explícita, atómica e idempotente, con GET sin efectos secundarios.
- 0004 es aditiva sobre 0001–0003, con runner local explícito, checksum y rollback como las anteriores. Sin dependencias nuevas, servicios externos, credenciales productivas, despliegue ni agentes; BACKLOG y AUTOPILOT intactos.
- Candidato v2 verificado en local (Node 24.22.2, PostgreSQL 16.15 descartable en loopback 55428, Chromium del entorno): lint, tipos y build limpios; 162/162 unitarias; 230/230 coordinación; integración identidad 16/16, comercial 20/20, actividad 16/16 y analítica 16/16; navegador 44/44, identidad 1/1, comercial 2/2, actividad 1/1 y dashboard 1/1. Laboratorio detenido y borrado.
- Entregado en la ampliación: migración `0004_analytics.sql` y runner `scripts/analytics/migrate.mjs`; consulta con tipo histórico e inicio real del día local; `GET` y `POST /api/organizations/:org/dashboard/snapshots`; botón «Guardar corte» y lista «Cortes guardados». Los GET siguen sin efectos secundarios.
- Límites: los eventos anteriores a 0004 toman el tipo vigente al migrar; cortes sin borrado, edición, retención ni paginación; una transición de zona fuera de la rejilla de 15 minutos alrededor de la medianoche usaría el respaldo documentado.
- Pendiente: CI del SHA publicado y nueva revisión independiente. PR #25 en DRAFT, sin autoaprobación, merge ni auto-merge.
