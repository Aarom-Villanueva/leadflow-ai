# Roadmap y tareas

Todas las fases de implementación están **bloqueadas por aprobación de LF-000**. Responsables son asignaciones propuestas, no trabajo iniciado por Claude. Cada tarea se materializa en una especificación antes de código; los archivos son rutas previstas, no existentes.

| ID / responsable propuesto | Objetivo, dependencias | Aceptación / pruebas obligatorias | Archivos previstos | Riesgo / evidencia de cierre |
|---|---|---|---|---|
| LF-000 Codex; revisión Claude | Documentar diseño; sin dependencias | Documentos consistentes, enlaces locales válidos y revisión independiente pendiente | AGENTS.md, CLAUDE.md, README.md, docs/** | Diseño no aprobado; SHA, diff, verificación documental y PR si accesible |
| LF-001 Codex | Base técnica y CI; LF-000 aprobado, D-001 | Ver spec; instalación congelada, build/tipos/tests y CI reproducibles | package.json, lockfile, tsconfig, src/app/**, CI, configs tests | Compatibilidad; logs y SHA de candidato |
| LF-002 Codex; revisión Claude | Identidad, tenants, roles y aislamiento; LF-001, D-002/D-003 | Login/revocación, último owner, FKs/RLS con tenants A/B, contexto ausente y pool reutilizado | identity/**, organizations/**, db/schema/auth*, db migrations | Acceso transversal; SQL revisado + integración real + E2E |
| LF-003 Claude | Contratos UI accesible y shell; LF-001; coordinar rutas con LF-002 | Navegación/estados vacíos/error y teclado; sin auth falsa | components/ui/**, estilos/tokens, spec UI | Conflicto layout compartido; reserva exclusiva y pruebas UI |
| LF-004 Codex | Prospectos/pipeline; LF-002 y contrato datos aprobado | CRUD, etapas/transiciones y 409; tenant/rol y rollback auditados | modules/leads/**, pipeline/**, migrations propias | Cambios esquema; tests DB + recorrido |
| LF-005 Claude | Interacciones/seguimientos; LF-004 contrato estable | Historial, vencimientos UTC, completar idempotente y permisos | modules/interactions/**, followups/** | Zonas horarias/carreras; tests límite y E2E |
| LF-006 Claude | Dashboard real; LF-004, definición R08 estable | Fixtures con denominador cero, cohortes y tenant B | modules/analytics/**, app/dashboard/** | Métrica engañosa; consultas/fixtures y resultados |
| LF-007 Codex | CSV/XLSX y duplicados; LF-004, D-004/D-005 | Preview, límites, fórmulas, reintentos, carreras, resumen exacto | modules/imports/**, migraciones import | Archivos hostiles; fixture máximo y memoria/tiempo medidos |
| LF-008 Claude | Puerto IA y fake; LF-001 y contrato AiProvider aprobado | Salida Zod, timeout y proveedor fake sin red ni gasto | modules/ai/provider/**, contratos y tests | Contrato mutable; revisión Codex antes consumidores |
| LF-009 Codex | Funciones IA y cuotas; LF-004/LF-005/LF-008, D-004/D-007 | Tres acciones, aislamiento, reservas concurrentes, inyección, fallo proveedor sin envío | modules/ai/application/**, UI IA, usage schema | Costo/PII; tests fake, prueba real solo autorizada |
| LF-010 conjunto, propietario autoriza | Hardening y preparación de piloto; LF-005/006/007/009, D-006 | E2E completo, restauración probada, alertas/runbooks y revisión seguridad | docs/runbooks/**, tests/e2e/**, CI | Datos reales/costos; reporte y autorización separada de release |

## Secuencia y paralelismo real
Fase 1 LF-001. Fase 2 LF-002 y LF-003 en paralelo con layout reservado a un agente; LF-008 también posible tras acordar contrato. Fase 3 LF-004. Fase 4 LF-005, LF-006 y LF-007 paralelizables por módulos tras congelar contrato de leads; cada migración tiene nombre único y un único coordinador del índice/schema compartido. Fase 5 LF-009 tras sus dependencias; fase 6 LF-010.

No trabajar simultáneamente sobre lockfile, schema agregado, layout raíz o contratos compartidos. Asignar dueño temporal en HANDOFF y secuenciar PRs; no asumir que ramas eliminan conflictos semánticos. Cada integración exige revisión independiente; si cambia contrato, pausar consumidores y replanificar.

## Plantilla mínima de tarea/handoff
ID, objetivo y exclusiones; estado; responsable/revisor; dependencias y decisiones aprobadas; base SHA y rama; archivos reservados; contratos; criterios observables; riesgos; pruebas obligatorias; comandos/resultados realmente ejecutados; candidato SHA/PR; pendientes y siguiente acción. Una tarea no termina por tener código: debe aportar evidencia ligada al candidato.
