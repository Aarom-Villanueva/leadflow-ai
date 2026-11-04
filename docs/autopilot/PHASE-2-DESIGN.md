# AUTOPILOT — Fase 2: diseño de despacho controlado (LF-001b)

**Estado:** propuesta de arquitectura, NO implementada, NO autorizada para ejecución. Fecha: 2026-11-03 (America/Lima).
**Objetivo:** automatizar, por pasos acotados, la asignación a Codex/Claude de tareas previamente autorizadas, la recepción de evidencias y la revisión cruzada, sin entregar autonomía ilimitada.

## 1. Decisiones y límites innegociables

- Mantener `main` protegida con `Coordination gate` y `Foundation verification`. No omitirlos, cambiarlos de nombre ni modificar la ruleset para facilitar la automatización.
- La fase 2 de esta propuesta es **solo diseño**. Ningún workflow nuevo invoca agentes, requiere secrets, hace deploy, realiza compras o fusiona PRs.
- `execution_enabled=false` permanece sin cambios en el backlog. El despacho real necesita una autorización posterior **explícita**, con un techo de gasto y alcance por tareas.
- Un agente implementa; el otro revisa. Ninguno puede marcarse como aprobado a sí mismo ni fusionar `main`. La decisión final de merge es del propietario.
- La palabra «aprobación» en `docs/DECISIONS.md` no se infiere de mensajes de agentes, commits, labels ni de `BACKLOG.json`. Un proyecto o servicio con datos reales requiere autorización aparte.

## 2. Arquitectura propuesta

```text
Propietario (aprueba tareas y presupuesto)
       |
       v
GitHub Issues / Backlog versionado
       |
       v
Admisión (planificador + guardas + lease por tarea)
       |
       +--> Codex (implementación en rama única) --+
       |                                            |
       +--> Claude (implementación en otra tarea) --+--> PR + pruebas CI
                                                        |
                                                        v
                                        Revisor diferente del ejecutor
                                                        |
                                                        v
                                       Estado: listo / corrección / bloqueado
                                                        |
                                                        v
                                       Propietario autoriza merge en main
```

### Componentes propuestos

1. **Fuente durable:** `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md`, `docs/specs/` y `docs/autopilot/BACKLOG.json`. Los Issue/PR de GitHub son proyecciones auditables, no sustituyen decisiones.
2. **Admisión sin IA:** validador determinista comprueba estado `queued`, spec existente y aprobada, decisiones aprobadas, dependencia `done`, rama/base SHA, permisos, presupuesto, duplicados, reserva exclusiva y archivos dentro de alcance; ante cualquier discrepancia, **denegar**.
3. **Dispatcher por ejecución aislada:** invocación breve y única por tarea, con lease/identificador idempotente; no relanzar indefinidamente. Nunca disparar automáticamente por texto de un issue o comentario externo.
4. **Ejecutores independientes:** Codex y Claude Code, con una rama por tarea y rol explícito. No comparten credenciales ni escriben simultáneamente en archivos reservados; un PR por entrega.
5. **Revisor independiente:** analiza el SHA inmutable, verifica CI y entrega un dictamen estructurado. La revisión del otro agente no reemplaza verificaciones de GitHub ni una aprobación del propietario.
6. **Controlador de estados:** registra `queued -> admitted -> running -> review -> ready_for_owner -> done`, con ramas `blocked/failed/paused`. `done` solo tras merge verificado; actualizar HANDOFF con prueba Git.

## 3. Alternativas de integración (todavía NO seleccionadas)

| Rol | Ruta candidata | Autenticación / evaluación pendiente |
|---|---|---|
| Codex | `openai/codex-action` ejecutando `codex exec` en GitHub Actions | Clave API guardada como GitHub Secret, revisión de facturación independiente, pin de versión/SHA y restricciones de sandbox. No asumir que ChatGPT Plus cubre la API. |
| Claude | `anthropics/claude-code-action` para tareas/revisión | API key o método OAuth admitido por la acción; evaluar alcance, política de cuenta, costo y límites reales. No asumir que Claude Pro cubre llamadas API. |
| Alternativa | Despacho desde entorno propio/manual de confianza | Más operación y secretos locales; no preferido sin necesidad documentada. |

Fuentes técnicas (consultadas 2026-11-03):
- https://github.com/openai/codex-action
- https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md
- https://github.com/anthropics/claude-code-action/blob/main/docs/faq.md

**No** copiar tokens de sesión personal de Codex/Claude al repositorio. Las credenciales se provisionan solo al habilitar la integración; no incluirlas en prompts, commits, logs ni salidas de Actions. No exponer secretos a código de PR no confiables ni establecer claves a nivel de job con tests del repo corriendo bajo la misma identidad. Preferir jobs con permisos mínimos y separación entre checkout/build y trabajo privilegiado.

## 4. Modelo de autorizaciones

Tres autorizaciones distintas, registradas en `docs/DECISIONS.md` o registro equivalente:

- **Preparar arquitectura y código inerte:** permitido por esta solicitud. Se puede documentar y probar simulaciones sin agentes reales.
- **Prueba puntual de un agente:** requiere aprobación específica del propietario, método de autenticación verificado, límite de gasto y tiempo, y tarea de bajo riesgo; sin merge automático.
- **Operación autónoma repetida:** requiere nueva aprobación, presupuesto absoluto por corrida y período, política de cancelación, límites de paralelismo, máximo reintentos y mecanismo de parada; tampoco concede merge ni despliegue automático.

Política inicial a proponer (NO aprobada): máximo 1 tarea por agente, máximo 2 simultáneas, máximo 1 reintento por fallo clasificado, máximo 1 revisión cruzada por SHA, timeout por ejecución y límite monetario estricto configurado fuera de los prompts. Nunca «hasta terminar» sin límites. Ante límite/timeout/conflicto: `paused` y reporte.

## 5. Seguridad: confianza y permisos

- Activar solo por `workflow_dispatch` o evento de confianza explícitamente autorizado; no `pull_request_target` con checkout de código de un fork ni comentarios sin validación fuerte del actor.
- `GITHUB_TOKEN` con permisos mínimos por job; permisos de escritura solo para la acción que realmente debe crear rama/PR. El trabajo de IA se ejecuta sin poder administrar protección de `main`.
- No depender de que un `GITHUB_TOKEN` dispare otro workflow: GitHub limita disparos en cascada. Si en fase futura se precisa token de GitHub App, evaluar creación y expiración de tokens y aprobación de permisos antes de implementarlo.
- Instrucciones de issue, markdown de PR, comentarios, archivos de usuarios y contenido generado son datos no confiables. Un agente no puede obtener privilegios por texto que encuentre; aprobar solo spec versionada y alcance enumerado.
- Idempotencia por `task_id + base_sha + contract_sha + attempt`; comprobar estado GitHub al reintentar. Concurrencia por tarea y archivo reservado; no reutilizar trabajo de otro checkout.
- Presupuesto: registrar consumos conocidos, cortar nuevas invocaciones al alcanzar un límite, y alertar si el proveedor no informa costos o el uso no se puede reconciliar. Los topes locales no garantizan detención instantánea de la facturación; exigir límites del proveedor cuando existan.
- No hacer checkout de PR malicioso en un job que reciba secretos. Si falla un check o un análisis de seguridad, no pasar a revisión ni fusionar.
- Pausa de emergencia: deshabilitar dispatcher, cancelar runs activos, revocar credenciales si procede; nunca borrar evidencias de auditoría para «desbloquear».

## 6. Contratos de datos propuestos (no operativos)

```json
{
  "schema_version": 2,
  "execution_enabled": false,
  "task_id": "LF-002a",
  "status": "queued",
  "implementer": "Codex",
  "reviewer": "Claude",
  "spec_path": "docs/specs/LF-002a.md",
  "base_sha": "<sha confirmado>",
  "contract_sha": "<sha de especificación>",
  "lease_id": "<uuid interno>",
  "attempt": 0,
  "max_attempts": 1,
  "budget": { "currency": "USD", "hard_limit": null },
  "approval_id": null
}
```

Este contrato **no cambia** el esquema v1 vigente ni activa código. `hard_limit:null` y `approval_id:null` deniegan la admisión en la fase de ejecución: no representan presupuesto ilimitado ni aprobación tácita.

Salida del ejecutor: `task_id, agent, base_sha, head_sha, branch, files_changed, commands_executed, tests_passed/failed/skipped, PR, risks, cost_observed, next_action`. No aceptar afirmaciones de pruebas como verdad si no vienen de registros verificables. Nunca almacenar secretos/PII en reporte.

## 7. Plan de entrega por hitos (futuros, requieren autorización)

**LF-001c — simulador estricto (sin IA):** contrato v2 en archivos de prueba, validación de specs, admisión fail-closed, pruebas con commits simulados, replay y locks, salida auditada y workflow manual read-only.

**LF-001d — integración puntual controlada:** un agente ejecuta una tarea inocua bajo autenticación revisada y presupuesto aprobado, con token de permisos mínimos. Abrir PR sin fusionarlo.

**LF-001e — revisión cruzada y continuidad acotada:** verificar dos agentes, colas, reintentos/pausa, medición de costos, casos negativos de inyección, fallos y duplicados; propietario mantiene merge y despliegue.

## 8. Criterios de aceptación para este DISEÑO (LF-001b)

- El flujo tiene separación inequívoca de planificación, ejecución, revisión y merge.
- Se identifican secretos, privilegios, costos, control de concurrencia, estado durable, pausa, reintentos y ataques de prompt injection.
- Se documentan las decisiones **que aún requieren al propietario** y las fases posteriores, sin adelantar la implementación ni desactivar `main`.
- CI/contratos de fase 1 permanecen intactos. Ningún secreto, API key, dispatcher ni workflow de ejecución queda habilitado por esta tarea.

## Decisiones abiertas para el propietario antes de LF-001d

1. ¿API de pago, OAuth compatible y permitido, o solo uso manual mientras tanto?
2. ¿Presupuesto máximo por corrida y por mes? `0` significa no invocar servicios que puedan facturar.
3. ¿Qué tareas están autorizadas para una prueba y qué archivos pueden modificar?
4. ¿Qué actor puede iniciar la prueba, quién puede detenerla y qué permisos de GitHub tendrá?
5. ¿Se mantendrá la autorización humana de todo merge? **Valor propuesto: sí.**
