# LF-001d — Diseño técnico de implementación offline (LF-018)

**Estado:** propuesta de diseño técnico, NO implementada, NO autorizada para ejecución ni para conexión real.
**Base:** `7498c1849c76f2e661a266ec87fcb7eead70c905` (merge PR #13 en `main`); especificación origen `docs/specs/LF-001d.md`.
**Responde al:** paso 2 de la sección 2 de `docs/specs/LF-001d.md` ("proponer un alcance de implementación con rama, rutas exactas, contrato versionado y pruebas"). No resuelve ni adelanta los pasos 3–5 de esa misma sección (auditoría, autorización de ejecución, merge).
**Relación con documentos previos:** complementa, sin sustituir, `AUTOPILOT.md`, `docs/autopilot/PHASE-2-DESIGN.md`, `docs/autopilot/ACTIVATION-READINESS.md` y `docs/autopilot/LF-001d-SAFETY-GATES.md`. Ninguna puerta (G1–G5) declarada pendiente en esos documentos queda satisfecha por este diseño.

## 0. Qué autoriza y qué no autoriza este documento

Autoriza: documentar, para revisión, la arquitectura técnica de una futura implementación offline-testeable de LF-001d.

No autoriza: instalar dependencias, crear workflows, provisionar credenciales, seleccionar proveedor, modificar `docs/autopilot/BACKLOG.json`, cambiar `execution_enabled`, desbloquear `LF-002a`/`LF-002`/`LF-003`, ni ejecutar ningún agente real. Ningún archivo de código mencionado en la sección 10 existe tras esta entrega; son rutas **previstas** para una propuesta de implementación posterior y separada.

## 1. Componentes propuestos

| Componente | Responsabilidad | Confianza |
|---|---|---|
| Fuente durable | `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/HANDOFF.md`, `docs/specs/`, `docs/autopilot/BACKLOG.json` | Confiable (ya existente, sin cambios de esta entrega) |
| Registro de autorización (*Authorization Ledger*) | Guarda la aprobación de un solo uso del propietario: identidad, tarea, hash de spec, SHA base, alcance, vencimiento, intento máximo | Confiable, mantenido fuera del checkout del ejecutor |
| Presupuesto (*Budget Ledger*) | Reserva atómica de costo antes de invocar; libera sobrante; bloquea ante costo desconocido | Confiable, componente separado del admisor |
| Validador de admisión (*Admission Validator*) | Verifica, inmediatamente antes de admitir, spec/hash/decisiones/dependencias con prueba Git, reservas, base actual, autorización vigente, presupuesto y permisos efectivos | Confiable, determinista, sin IA (extiende el patrón ya usado en `simulate.mjs`/`check-done-proof.mjs`, pero contra el registro real, no contra un fixture) |
| Almacén de leases (*Lease Store*) | Idempotencia durable por tarea/rutas; detecta llamadas concurrentes o repetidas | Confiable |
| Ejecutor (*Executor sandbox*) | Corre el agente real sobre una tarea admitida, en una rama propia | **No confiable**: su texto, código generado y salida son siempre datos no confiables; sin red por defecto; sin secretos del proveedor ni token de publicación en entorno/disco/logs |
| Publicador (*Publisher*) | Único componente con credencial de escritura a GitHub; valida diff, rutas, símlinks y tamaño antes de publicar solo la rama autorizada | Confiable, credencial distinta de la del ejecutor |
| Puerta de revisión (*Reviewer gate*) | Exige que el revisor sea distinto del ejecutor; nunca autoaprobación | Confiable |
| Controlador de pausa (*Pause controller*) | Deshabilita admisiones nuevas, invalida autorizaciones pendientes, cancela procesos, confirma detención externa antes de liberar recursos | Confiable |

Ninguno de estos componentes existe como código en esta entrega. El `Admission Validator` y el `Lease Store` reutilizarían, en una futura implementación, los mismos patrones fail-closed ya probados en `scripts/autopilot/simulate.mjs`, `scripts/autopilot/check-done-proof.mjs` y `scripts/autopilot/fake-agent.mjs` (listas blancas estructurales, verificación de padres de merge contra Git real, rechazo de getters/ciclos/prototipos exóticos) — no se reinventa esa lógica, se extiende a datos reales.

## 2. Fronteras de confianza

```text
Propietario (confiable; única fuente de autorización)
       |
       v
Authorization Ledger (confiable, fuera del checkout del ejecutor)
       |
       v
Admission Validator (confiable, determinista, sin IA) <-- Budget Ledger (confiable)
       |                                                <-- Lease Store (confiable)
       v
Executor sandbox (NO CONFIABLE: código/texto del agente, sin red por defecto, sin secretos)
       |
       v
Publisher (confiable, credencial propia, valida diff/rutas antes de escribir)
       |
       v
Reviewer gate (confiable; revisor != ejecutor)
       |
       v
Propietario autoriza merge en main (Coordination gate + Foundation verification obligatorios)
```

Principio heredado de `docs/autopilot/PHASE-2-DESIGN.md` §5 y mantenido sin excepción: todo contenido editable por el ejecutor o por terceros (texto de spec, issues, comentarios, salida del propio agente) es **dato no confiable**, nunca una instrucción ni una prueba de autorización. El `Admission Validator` y el `Publisher` nunca confían en una afirmación (`approved:true`, `git_verified:true`, un `approval_id` con prefijo `SIM-`) sin verificarla contra una fuente confiable independiente del ejecutor.

## 3. Contrato versionado propuesto (`schema_version: 3`, no implementado)

Extiende, sin sustituir, el contrato v1 de `docs/autopilot/BACKLOG.json` y el contrato v2 sintético de `docs/autopilot/PHASE-2-DESIGN.md`/`scripts/autopilot/simulate.mjs`. Es una **ilustración de diseño**, no un archivo de esquema instalado:

```json
{
  "schema_version": 3,
  "execution_enabled": false,
  "task_id": "<LF-0NNx>",
  "implementer": "Codex | Claude",
  "reviewer": "Codex | Claude (!= implementer)",
  "spec_path": "docs/specs/<id>.md",
  "spec_sha256": "<hash real del contenido de la spec en base_sha>",
  "base_sha": "<SHA40 confirmado en main>",
  "authorization_id": "<identificador de un solo uso, NO prefijo SIM->",
  "authorization_expires_at": "<timestamp>",
  "scope_files": ["<rutas exactas permitidas>"],
  "environment": "<identificador de entorno aislado, pendiente de diseño>",
  "network_allowlist": [],
  "budget": {
    "currency": "USD",
    "hard_limit_cents": 0,
    "reserved_cents": 0
  },
  "attempt": 0,
  "max_attempts": 1
}
```

Reglas de diseño (heredadas de `simulate.mjs`/`fake-agent.mjs`, extendidas):
- `execution_enabled:false` o `hard_limit_cents` nulo/≤0/ausente **deniegan** la admisión; nunca se interpretan como "sin límite".
- `authorization_id` se valida contra el *Authorization Ledger* real, nunca contra un valor declarado en el propio contrato; un prefijo `SIM-` identifica siempre un fixture, nunca una autorización real (regla ya establecida en `docs/autopilot/LF-001d-SAFETY-GATES.md`, puerta G1).
- `spec_sha256` se recalcula contra el contenido real del archivo en `base_sha`, no contra un valor declarado — mismo principio que `contract_sha` en `simulate.mjs`.
- `network_allowlist` vacío por defecto; cualquier destino de red del ejecutor debe enumerarse y aprobarse explícitamente antes de habilitarse, nunca de forma implícita.
- Este esquema **no** sustituye ni es leído por el `schema_version:1` de `BACKLOG.json`; ambos coexisten como contratos independientes hasta que una tarea futura, separada y autorizada, decida migrar.

## 4. Estados propuestos (operativos, no añadidos al esquema vigente)

| Estado | Entrada | Salida válida |
|---|---|---|
| `authorization_pending` | Propietario registra autorización en el *Authorization Ledger* | `admitted` o `denied` |
| `admitted` | Validador aprueba spec/dependencias/presupuesto/permisos | `running` o `paused` |
| `running` | Lease adquirido, ejecutor invocado una sola vez | `delivery_pending` o `unknown_outcome` |
| `delivery_pending` | Ejecutor entrega rama/diff | `review` o `failed` |
| `review` | Publicador validó diff y lo expuso en un PR propio | `ready_for_owner` o `failed` |
| `ready_for_owner` | Revisor (≠ ejecutor) aprobó evidencia verificable | `completed` (solo tras merge real) o `paused` |
| `denied` / `failed` / `paused` / `unknown_outcome` | Cualquier verificación falla, se agota el intento o se pierde la respuesta | Reinicio exige nueva `authorization_pending`, nunca reanudación automática |

`fake_ready_for_owner` y `would_admit` (de `fake-agent.mjs`/`simulate.mjs`) **no tienen conversión** a ninguno de estos estados: son exclusivamente resultados de simulación, como ya advierte `docs/specs/LF-001d.md` §5. `completed` exige evidencia de merge real verificada con el mismo mecanismo de padres de merge y ancestría ya usado en `scripts/check-coordination.mjs` (`verifiedMergeReleases`) — nunca una afirmación del ejecutor.

## 5. Autorización

Secuencia de validación propuesta para el `Admission Validator` (orden de denegación explícito, mismo estilo que `simulateAdmission`, pero contra fuentes reales en vez de un fixture):

1. `authorization_id` existe en el *Authorization Ledger*, no está vencido, no fue revocado ni reutilizado.
2. La identidad que registró la autorización es el propietario, verificada por un mecanismo externo al contenido del repositorio (raíz de confianza concreta: **pendiente de decisión**, ver sección 11).
3. `spec_sha256` coincide con el contenido real de la spec en `base_sha`.
4. Dependencias de la tarea están `done` con prueba Git real (reutilizando `verifyBacklogDone`/`verifiedMergeReleases`).
5. `scope_files` coincide exactamente con la columna "Archivos previstos" de `docs/ROADMAP.md` y con la reserva vigente en `docs/HANDOFF.md` para esa tarea.
6. Presupuesto: `Budget Ledger` reserva de forma atómica `estimated_cost_cents` sin exceder `hard_limit_cents`; sin reserva exitosa, no hay admisión.
7. `Lease Store` no tiene un lease vivo para la misma tarea ni para el mismo `implementer`.
8. Permisos efectivos del token/credencial a usar no exceden el alcance mínimo documentado (sección 6); un alcance declarado nunca se asume cumplido sin verificación.

Cualquier fallo en 1–8 deniega sin ejecutar nada, siguiendo el mismo principio fail-closed ya verificado en `simulate.mjs`/`check-done-proof.mjs`/`fake-agent.mjs`.

## 6. Permisos y credenciales (diseño, sin provisión)

- Un único proveedor/método de autenticación oficial por decidir (sección 11); sin asumir que una suscripción personal (Plus/Pro) incluye acceso de API, como ya advierten `AUTOPILOT.md` y `docs/autopilot/ACTIVATION-READINESS.md`.
- `GITHUB_TOKEN`/credencial del ejecutor: sin permisos de administración de reglas de protección, sin merge, sin lectura de secretos ajenos a su tarea.
- Credencial del *Publisher* separada de la del ejecutor; solo el *Publisher* puede crear rama/PR; nunca la misma identidad que ejecutó código no confiable.
- Acciones de terceros candidatas (`openai/codex-action`, `anthropics/claude-code-action`) deben fijarse por SHA inmutable **ambas por igual** antes de cualquier adopción, como ya exige la puerta G2 de `docs/autopilot/LF-001d-SAFETY-GATES.md`; este diseño no las fija ni las instala.
- Prohibido `pull_request_target` con checkout de código no confiable, y prohibido disparar por texto de issues/comentarios sin validación fuerte del actor (heredado de `docs/autopilot/PHASE-2-DESIGN.md` §5).

## 7. Presupuesto

- Reserva atómica antes de invocar; liberación del sobrante al conocer el costo real; costo desconocido o no reconciliado **bloquea nuevas invocaciones** y se reporta como incertidumbre, nunca como cero (mismo principio que `docs/specs/LF-001d.md` §4).
- Dos categorías de costo siempre separadas: API del proveedor y minutos/concurrencia de GitHub Actions (puerta G3 de `LF-001d-SAFETY-GATES.md`).
- Presupuesto autorizado por esta entrega: **USD 0 / S/ 0**, sin cambios. Cualquier valor distinto de cero requiere autorización explícita y separada del propietario, con moneda, techo por ejecución y por período, y responsable del corte (sección 11).
- Un tope expresado solo en código o en el propio contrato no sustituye un control externo real del proveedor; si ese control no puede confirmarse, el diseño exige no operar (ver sección 14).

## 8. Idempotencia

- Clave de idempotencia propuesta: `hash(repositorio, task_id, spec_sha256, base_sha, authorization_id, attempt)` — extiende el patrón ya usado en `simulate.mjs` (`lease.idempotency_key`) y en `fake-agent.mjs`, añadiendo `authorization_id` para que una autorización distinta nunca reutilice la clave de otra.
- Llamadas concurrentes con la misma clave colapsan en una sola invocación real; el `Lease Store` es la fuente de verdad, no la memoria del proceso que invoca.
- Tras timeout, pérdida de respuesta o reinicio: el estado pasa a `unknown_outcome`: se detiene, se reconcilia contra identificadores del proveedor y de GitHub (run, rama, PR, consumo) antes de decidir cualquier siguiente paso. Nunca reintento automático por falta de respuesta — mismo principio que `docs/specs/LF-001d.md` §5.
- `max_attempts:1` para el primer ensayo (coherente con la limitación ya documentada y verificada en el simulador: `simulate.mjs` solo admite `attempt:0`). Un segundo intento requeriría una propuesta y autorización separadas, no un cambio silencioso de `max_attempts`.

## 9. Pausa y recuperación

Procedimiento de PAUSA (idéntico en intención al ya descrito en `docs/autopilot/PHASE-2-DESIGN.md` §5 y `docs/autopilot/ACTIVATION-READINESS.md` G4, operacionalizado aquí):

1. Deshabilitar el disparador de admisión (ningún `authorization_pending` nuevo se evalúa).
2. Invalidar autorizaciones `admitted`/`running` pendientes en el *Authorization Ledger*.
3. Cancelar el proceso/run del ejecutor si está activo.
4. Revocar credenciales del ejecutor si la arquitectura concreta lo permite sin afectar a terceros.
5. Confirmar la detención **externamente** (run del proveedor/Actions en estado terminal) antes de liberar el lease; si no hay confirmación, el lease permanece bloqueado y las evidencias se conservan — nunca se borran para "desbloquear".

Recuperación: registrar SHA, identificadores de proveedor/Actions, estado, comandos ejecutados, resultados conocidos y desconocidos, costo observado o desconocido, y motivo, sin secretos. Reanudar exige reconciliación completa y una **nueva** autorización; revocar una autorización no deshace un gasto ya producido.

## 10. Archivos previstos (NO creados por esta entrega)

Rutas hipotéticas para una futura propuesta de implementación, sujetas a su propia reserva, revisión y aprobación — ninguna existe tras este PR:

| Ruta prevista | Propósito |
|---|---|
| `scripts/autopilot/authorization-ledger.mjs` | Lectura/validación del registro de autorización (sin red) |
| `scripts/autopilot/budget-ledger.mjs` | Reserva/liberación atómica de presupuesto (en memoria o almacén durable por decidir) |
| `scripts/autopilot/lease-store.mjs` | Idempotencia durable por tarea/rutas |
| `scripts/autopilot/real-agent-adapter.mjs` | Adaptador real (sucesor documentado de `fake-agent.mjs`), bloqueado por defecto hasta nueva autorización |
| `docs/autopilot/fixtures/lf-001d/*.json` | Fixtures offline para el plan de pruebas de la sección 13 |
| `tests/coordination/lf-001d-design.test.mjs` | Pruebas offline contra los mocks de la sección 13 |
| `.github/workflows/autopilot-dispatch-dry-run.yml` | Workflow manual futuro, solo validación offline, sin credenciales — su creación exige autorización y revisión propias, no se crea ni modifica ningún workflow en esta entrega |

## 11. Decisiones pendientes del propietario

Consolida y hace técnicamente concreta la sección 8 de `docs/specs/LF-001d.md`:

| Decisión | Por qué bloquea | Estado |
|---|---|---|
| Proveedor oficial (Codex vs. Claude vs. manual) y modalidad de autenticación | Determina qué acción/SDK fijar por SHA y qué costos verificar | Sin seleccionar |
| Raíz de confianza para verificar identidad del propietario en el *Authorization Ledger* | Sin esto, el paso 2 de la sección 5 no tiene mecanismo concreto | Diseño conceptual aquí; implementación pendiente de revisión |
| Herramienta de custodia/rotación de credenciales | Condiciona sección 6 | No provisionada |
| Presupuesto real por ejecución/período y quién lo controla | Condiciona sección 7 | USD 0 / S/ 0 sin cambios |
| Tecnología de aislamiento del ejecutor (contenedor, VM efímera, runner dedicado) y lista de red | Condiciona si la sección 14 puede algún día reducirse | Sin decidir |
| Primera tarea real propuesta por `docs/specs/LF-001d.md` §4 (cambio documental sintético pequeño) | Debe fijarse con spec/hash/rutas exactas antes de cualquier ensayo | Sin asignar |
| Persistencia concreta del *Lease Store*/*Budget Ledger* (archivo versionado vs. servicio externo) | Afecta si el diseño sigue siendo "sin servicios" | Sin decidir; preferible mantenerlo sin servicios mientras no haya autorización de infraestructura |

Mientras una fila quede sin resolver, LF-001d permanece bloqueado, igual que establece `docs/specs/LF-001d.md` §8.

## 12. Criterios de aceptación de una futura implementación (no de este diseño)

| Caso | Resultado exigido |
|---|---|
| Autorización ausente, vencida, revocada o reutilizada | Denegado antes de cualquier invocación |
| `spec_sha256` no coincide con el contenido real en `base_sha` | Denegado |
| Dependencia sin prueba Git de `done` | Denegado |
| Presupuesto nulo/cero/agotado o costo desconocido | Denegado; sin reserva no hay admisión |
| Dos autorizaciones o reintentos concurrentes para la misma clave de idempotencia | Como máximo una invocación real |
| Contenido de spec/issue/salida del agente con instrucciones de privilegio | Sin efecto; tratado siempre como dato |
| Diff con traversal, symlink fuera del checkout, o archivo fuera de `scope_files` | Publicador rechaza sin escribir |
| PAUSA solicitada durante `running` | Sin nuevas admisiones; evidencia conservada; reanudación exige nueva autorización |
| Entrega completa sin conexión real (modo mock) | Resultado explícitamente `mode:"simulation-only"` o equivalente, nunca inferido como aprobación operativa |
| Único ensayo real autorizado | Logs, consumo, diff, SHA y PR verificables; revisor distinto; merge solo con autorización del propietario |

Esta tabla reemplaza, para una implementación real, a la matriz de la sección 6 de `docs/specs/LF-001d.md`; ninguna de las dos está satisfecha todavía.

## 13. Plan de pruebas offline con mocks/fixtures

Cada mock es puro, determinista y sin red, siguiendo el mismo estilo que `tests/coordination/fake-agent.test.mjs` y `tests/coordination/backlog-done-proof.test.mjs`:

| Componente | Mock propuesto | Casos de prueba offline |
|---|---|---|
| *Authorization Ledger* | Fixture JSON con `{authorization_id, owner_identity_proof_fake, task_id, spec_sha256, scope_files, expires_at, max_attempts}` | Válida; vencida; revocada; reutilizada; `owner_identity_proof_fake` que falla un verificador simulado (actor impostor); `spec_sha256` no coincide |
| *Budget Ledger* | Ledger en memoria con reserva/liberación atómica | Reserva concurrente de dos llamadas simultáneas simuladas (una debe fallar); `hard_limit_cents` nulo/0/negativo; costo "observado" desconocido tras una ejecución simulada; reconciliación con discrepancia |
| *Lease Store* | Mapa en memoria con `acquire`/`release` | Clave duplicada; adquisición concurrente simulada; "caída" a mitad de ejecución seguida de intento de reanudar sin reconciliar (debe rechazarse) |
| *Executor sandbox* | Proceso falso que registra si intentó resolver un host de red o leer una variable con forma de secreto en un entorno simulado | Cero intentos de red registrados; cero variables con forma de credencial expuestas; salida del "agente" con texto de inyección de prompt tratada solo como dato, nunca como instrucción |
| *Publisher* | Escritor de Git falso con validación de rutas (reutiliza el patrón `validFile`/lista blanca de `fake-agent.mjs`) | Traversal (`../`), symlink fuera del checkout, archivo fuera de `scope_files`, intento de tocar `.github/workflows/`, `docs/DECISIONS.md` o `docs/autopilot/BACKLOG.json`, diff de tamaño desproporcionado |
| *Reviewer gate* | Igual que `review.agent !== lease.reviewer` en `fake-agent.mjs` | Autorrevisión; revisor que no coincide con el SHA revisado; aprobación sin bandera `simulated`/equivalente real |
| *Pause controller* | Simulación de pausa a mitad de un flujo falso | Ninguna admisión nueva tras pausa; reanudar sin nueva autorización falla; evidencia simulada no se borra |

Estos mocks reutilizan explícitamente la lógica ya auditada en `simulate.mjs`, `fake-agent.mjs` y `check-done-proof.mjs` en vez de reescribirla; ninguno de estos archivos de prueba se crea en esta entrega (ver sección 10).

## 14. Qué NO puede demostrarse con mocks — requiere validación posterior real

Lista explícita de controles que ningún fixture offline puede probar, cada uno exigiendo evidencia de un entorno o proveedor real, en un PR separado y con autorización propia:

- **Custodia y rotación real de credenciales**: depende de la consola/IAM del proveedor elegido; un mock de "credencial válida" no prueba que la rotación o revocación funcionen en producción.
- **Aislamiento de red real del ejecutor**: un mock que registra "cero intentos de red" no prueba que un sandbox real (contenedor, VM, runner) bloquee efectivamente salidas; eso exige una prueba contra la tecnología de aislamiento real elegida en la sección 11.
- **Límite de gasto real aplicado por el proveedor**: el *Budget Ledger* local no controla la facturación real; solo una verificación contra el proveedor (p. ej. un tope configurado en su panel) puede confirmar que el límite se respeta incluso si el código local fallara.
- **Minutos/concurrencia reales y costo exacto de GitHub Actions**: dependen del plan vigente al momento de activar, verificable solo contra la cuenta real, no contra un fixture.
- **Efectividad real de PAUSA sobre una ejecución ya en curso en el proveedor**: un mock de cancelación no prueba que una llamada real al proveedor se detenga; requiere una prueba contra la API real de cancelación de ese proveedor.
- **Permisos efectivos de un token real de GitHub**: un mock de "permisos declarados" no prueba que GitHub los honre exactamente como se espera; requiere inspección del token real.
- **Comportamiento ante inyección de prompt con un modelo real**: los mocks no tienen comportamiento emergente de un LLM; solo prueban que el *diseño* trata el contenido como dato, no que un modelo real nunca se desvíe.
- **Reconciliación contra el dashboard de uso real de un proveedor**: ningún fixture sustituye comparar el consumo registrado localmente contra la fuente de verdad del proveedor.

Mientras estos puntos no tengan evidencia real, ninguna ejecución con presupuesto distinto de cero debe autorizarse, conforme a la sección 7 y a la puerta G3 de `docs/autopilot/LF-001d-SAFETY-GATES.md`.

## 15. Cumplimiento de las restricciones de esta entrega

- Sin código, scripts, tests, workflows ni dependencias nuevas.
- `docs/autopilot/BACKLOG.json` sin diff: `execution_enabled=false`; `LF-002a`/`LF-002`/`LF-003` siguen `blocked`.
- Sin credenciales, proveedores seleccionados, presupuesto distinto de cero, agentes reales, despliegues ni servicios activados.
- Ninguna decisión `D-002`…`D-008` cambia.
- Este documento no habilita LF-001d; solo lo diseña para revisión independiente.
