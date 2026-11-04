# LeadFlow AI — AUTOPILOT (fase 1: simulación)

**Estado: propuesta para revisión. No está operando como un agente autónomo.**

## Objetivo y fuente de verdad

Reducir prompts repetidos sin saltarse SDD → ODD → RDD. La jerarquía es `docs/PRODUCT.md` y `docs/PRD.md` (alcance), `docs/DECISIONS.md` (decisiones), `docs/ROADMAP.md` + `docs/specs/` (contrato de tarea), `docs/HANDOFF.md` (reservas), y `docs/autopilot/BACKLOG.json` (planificación legible por máquina). Los documentos ganan si el JSON está desactualizado: detener y proponer reconciliación, no adivinar.

## Qué está autorizado

- Dentro de una tarea autorizada: los agentes pueden implementar, probar, corregir código, documentar evidencia y abrir PR en rama aislada sin pedir permiso para cada archivo.
- Un agente implementa y el otro revisa. No pueden autoaprobarse. La CI y las protecciones de `main` son obligatorias.
- Las decisiones técnicas menores no requieren nuevas aprobaciones mientras respeten seguridad, presupuesto cero y alcance definido.
- No se fusiona a `main` sin autorización del propietario; no se publica producción, contratan servicios, añaden secretos, procesan datos reales ni habilitan facturación.

## Estados y política de ejecución

`done` requiere PR fusionado + checks y handoff; `in_progress` significa tarea reservada; `queued` significa propuesta, nunca autorización automática; `blocked` indica dependencia externa o de producto. Solo puede haber una reserva activa por agente en ejecución. El planificador rechaza IDs duplicados, dependencias inexistentes/cíclicas, aprobaciones desconocidas y propietarios/revisores iguales.

En la fase 1: `execution_enabled=false`, sin credenciales ni disparadores programados. `node scripts/autopilot/plan.mjs` solo imprime una propuesta, **no abre issues ni PR, no lanza agentes y no cobra nada**. `AUTOPILOT Preview` será ejecutable manualmente desde GitHub Actions *solo después* de que su workflow sea integrado a la rama predeterminada. Nunca se confía en la ejecución de un PR no revisado.

## Fase 2 — activación (NO autorizada ahora)

Antes de implementar un dispatcher que llame a APIs o acciones externas: (1) elegir autenticación oficial y revisar costos independientes de suscripciones, (2) definir límite de gasto mensual, concurrencia, turnos y tiempo por tarea, (3) aprobar scope de GitHub App/Actions y guardado seguro de secretos, (4) separar ejecución y revisión en permisos mínimos, (5) documentar comandos de PAUSA y recuperación ante fallos, (6) implementar controles anti-loop, idempotencia, firma de tareas y seguimiento de resultados, (7) probar en dry-run y con una tarea de bajo riesgo. Sin estas condiciones el dispatcher debe seguir deshabilitado.

Integraciones posibles: `codex exec` / Codex SDK para trabajo acotado; Claude Code Action para revisión/ejecución bajo controles de confianza adecuados. No asumir que Plus/Pro cubran API, runners o tokens. Ningún workflow de esta fase invoca Codex o Claude.

## Riesgos explícitos

Una IA puede cometer fallos de seguridad, alterar contratos compartidos o gastar tokens sin control. El mecanismo de reservas es un control de proceso, no una frontera contra alguien con permiso para editar el propio gate. Ante tarea bloqueada, PR sin checks, cambios fuera de alcance, datos/secretos, error repetido o costo desconocido: detener y emitir informe. No permitir loops ilimitados ni auto-merge de `main`.

## Recuperación

El estado durable vive en GitHub: commits, PR, tareas y evidencias en `docs/HANDOFF.md`. Ante interrupción registrar último SHA, resultados realmente ejecutados, bloqueo y siguiente acción. Reanudar de estado confirmado; no asumir que una sesión cloud permanecerá activa indefinidamente.