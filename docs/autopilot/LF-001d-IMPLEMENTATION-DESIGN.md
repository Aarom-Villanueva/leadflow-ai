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
| Almacén de leases (*Lease Store*) | Idempotencia durable por tarea/rutas; detecta llamadas concurrentes o repetidas; emite y, antes de liberar o reasignar, invalida de forma confirmada el token de fencing del proceso anterior (sección 5) | Confiable |
| Ejecutor (*Executor sandbox*) | Corre el agente real sobre una tarea admitida, en una rama propia | **No confiable**: su texto, código generado y salida son siempre datos no confiables; sin red por defecto; **no recibe ninguna credencial** (ni del proveedor de IA, ni del *Authorization Ledger*, ni del *Budget Ledger*, ni del *Publisher*) en entorno, disco, metadatos ni logs — ver sección 6 |
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
3. El `base_sha` declarado sigue siendo la base vigente de la tarea, comprobada contra `docs/HANDOFF.md`/`docs/ROADMAP.md` **en el momento de la admisión**, no solo en el momento de registrar la autorización. Esta comprobación es independiente de la siguiente: **una base obsoleta deniega aunque `spec_sha256` siga coincidiendo con el contenido de la spec en ese `base_sha` antiguo** — la vigencia de la base nunca se infiere de la coincidencia del hash de spec.
4. `spec_sha256` coincide con el contenido real de la spec en `base_sha`. Comprobación independiente de la anterior: una spec modificada deniega aunque la base siga vigente.
5. Las decisiones del propietario que la tarea requiere (sección 8 de `docs/specs/LF-001d.md` u otras declaradas por la spec) están aprobadas en un registro independiente del checkout; cualquier decisión requerida que permanezca pendiente deniega, aunque base, spec y dependencias sean válidas.
6. Dependencias de la tarea están `done` con prueba Git real (reutilizando `verifyBacklogDone`/`verifiedMergeReleases`); una dependencia sin esa prueba deniega aunque no haya ninguna decisión pendiente.
7. `scope_files` coincide exactamente con la columna "Archivos previstos" de `docs/ROADMAP.md` y con la reserva propia vigente en `docs/HANDOFF.md` para esa tarea, y **no se solapa con la reserva vigente de ninguna otra tarea** en ese mismo registro (**reserva ajena**; comprobación estática, independiente de la del `Lease Store` en el paso 9).
8. Presupuesto: `Budget Ledger` reserva de forma atómica `estimated_cost_cents` sin exceder `hard_limit_cents`; sin reserva exitosa, no hay admisión.
9. `Lease Store` no tiene un lease vivo —de esta tarea ni de ninguna otra— cuyo `scope_files` se solape con el solicitado (exclusión operativa en tiempo real, distinta de la comprobación estática del paso 7 contra `docs/HANDOFF.md`).
10. Permisos efectivos de las credenciales de los componentes confiables que intervienen (*Publisher*, invocación al proveedor) no exceden el alcance mínimo documentado en la sección 6; el ejecutor no posee ninguna credencial que verificar, por lo que este paso nunca se aplica a él. Un alcance declarado nunca se asume cumplido sin verificación.

Cualquier fallo en 1–10 deniega sin ejecutar nada, siguiendo el mismo principio fail-closed ya verificado en `simulate.mjs`/`check-done-proof.mjs`/`fake-agent.mjs`. Estas diez comprobaciones son de solo lectura; no reservan ni consumen nada por sí mismas. Las comprobaciones 3–7 son deliberadamente independientes entre sí: cada una debe poder denegar por sí sola, con el resto de condiciones válidas, sin que ninguna otra la sustituya ni la infiera.

### Operación durable de admisión (lease, presupuesto y consumo de autorización)

Superadas las comprobaciones 1–10, la admisión no se confirma con una sola escritura: es una **secuencia ordenada con compensación**, nunca tres actualizaciones independientes:

1. **Adquirir lease** en el *Lease Store* para `(task_id, scope_files)`, junto con un **token de fencing** monótonamente creciente (un número de epoch) exclusivo de esta adquisición. Se rechaza si existe **cualquier** lease vivo —de esta tarea o de otra, bajo cualquier otra autorización— cuyo `scope_files` se solape con el solicitado, reutilizando el mismo criterio de solapamiento de rutas que `scripts/check-coordination.mjs` ya aplica a las reservas de `docs/HANDOFF.md`, ahora contra el registro operativo real. Esto excluye por tarea **y** por rutas solapadas, incluso entre tareas y autorizaciones distintas.
2. **Reservar presupuesto** en el *Budget Ledger* de forma atómica, etiquetada con el mismo token de fencing. Si falla, se libera de inmediato el lease del paso 1 y se deniega; el paso 1 nunca queda huérfano más allá de esta compensación inmediata.
3. **Consumir la autorización** en el *Authorization Ledger*, marcándola **irreversiblemente** usada — una autorización consumida nunca vuelve a admitir, sea cual sea el resultado posterior de la invocación. Si este paso falla, se liberan el presupuesto del paso 2 y el lease del paso 1; no se admite nada.
4. Solo si 1–3 quedan confirmados de forma durable, el `Admission Validator` devuelve `admitted` y autoriza **una única** invocación del ejecutor, que debe presentar el token de fencing vigente en cualquier escritura posterior (`Budget Ledger`, `Authorization Ledger`, `Publisher`).

Cada compensación es idempotente y segura de repetir, y libera únicamente lo que ella misma adquirió. El orden (lease → presupuesto → autorización) es deliberado: la exclusión por tarea/rutas es la primera barrera, antes de comprometer presupuesto o consumir la autorización de un solo uso.

**Fencing: invalidación confirmada del proceso anterior antes de liberar o reasignar**

El mero transcurso de un plazo **nunca** es, por sí solo, motivo suficiente para liberar un lease o reasignar una tarea: un proceso admisor puede estar simplemente demorado —no caído— y seguir intentando escribir después de que la recuperación decida actuar. Por eso, antes de que un barrido de reconciliación libere o reasigne un lease, debe primero **invalidar durablemente** el token de fencing vigente para esa clave `(task_id, scope_files)` en el `Lease Store`. A partir de ese momento, cualquier escritura posterior del proceso anterior —en el `Budget Ledger`, en el `Authorization Ledger` o en el `Publisher`— que presente el token ya invalidado se **rechaza**, en vez de aceptarse silenciosamente; esto es lo que impide que un proceso demorado complete su trabajo o genere una segunda invocación después de que su lease fue reasignado.

**Rechazo confirmado frente a resultado desconocido**

Una operación individual (adquirir lease, reservar presupuesto, consumir autorización) solo cuenta como **rechazada de forma confirmada** cuando el componente confiable correspondiente devuelve, de forma durable y legible en una relectura posterior, una respuesta negativa explícita (p. ej. "lease no otorgado", "presupuesto no reservado", "autorización no marcada como consumida"). Cuando esa respuesta se pierde —por timeout de red, caída del llamador o del propio componente— sin que una relectura pueda confirmar el resultado, el estado correcto es siempre **`unknown_outcome`**, nunca una liberación optimista ni una denegación asumida. La diferencia es observable en la reconciliación: un rechazo confirmado permite liberar de inmediato lo ya reservado, porque nada se perdió; un resultado desconocido exige conservar las reservas y reconciliar antes de decidir cualquier cosa.

**Comportamiento ante fallos entre pasos, concurrencia y reinicio:**

| Momento del fallo/caída | Estado resultante | Acción exigida |
|---|---|---|
| Entre adquirir lease (1) y reservar presupuesto (2), con **rechazo confirmado** legible de que el paso 2 nunca se intentó o fue rechazado | Lease adquirido; presupuesto y autorización sin tocar, confirmado por relectura | Se invalida primero el token de fencing del lease; solo entonces se libera; ninguna invocación ocurrió |
| Entre adquirir lease (1) y reservar presupuesto (2), pero la relectura **no puede confirmar** si el paso 2 se intentó (respuesta perdida) | Resultado desconocido sobre el paso 2 | `unknown_outcome`; el lease **no se libera por el solo transcurso de un plazo**; permanece reservado hasta reconciliar contra el `Budget Ledger` |
| Entre reservar presupuesto (2) y consumir autorización (3), con **rechazo confirmado** legible de que la autorización sigue sin consumir | Lease y presupuesto reservados; autorización confirmada intacta | Se invalida el token de fencing, luego se liberan presupuesto y lease; la autorización queda disponible solo para un reintento **manual** del propietario, nunca automático |
| Entre reservar presupuesto (2) y consumir autorización (3), pero la relectura **no puede confirmar** si el paso 3 llegó a ejecutarse (**respuesta perdida tras un intento de consumo que pudo haberse guardado**) | Resultado desconocido: el consumo de la autorización pudo haberse completado | `unknown_outcome`; lease **y** presupuesto se **mantienen reservados**, sin liberar ni reasignar, hasta reconciliar contra el `Authorization Ledger`; solo esa reconciliación —nunca el transcurso de un plazo— decide liberar (si se confirma que no se consumió) o declarar la autorización gastada (si se confirma que sí) |
| Después de consumir autorización (3) —confirmado por el `Authorization Ledger`—, antes de confirmar el inicio de la invocación | Autorización ya irreversiblemente consumida; invocación sin confirmar | `unknown_outcome` (secciones 4 y 8); nunca se trata como éxito ni como "libre para reintentar"; exige reconciliación contra el proveedor/Actions y una **autorización nueva**, nunca la reutilización de la ya consumida |
| **Proceso demorado** (no caído) que reanuda su ejecución después de que la recuperación ya invalidó su token de fencing y reasignó o liberó el lease | El proceso anterior intenta escribir en el `Budget Ledger`, `Authorization Ledger` o `Publisher` con un token ya invalidado | La escritura se **rechaza** por el token de fencing obsoleto, en cualquier paso donde se presente; el proceso demorado nunca completa la tarea ni genera una segunda invocación |
| Dos solicitudes concurrentes para la misma tarea, o para tareas distintas con `scope_files` solapados | La segunda falla en el paso 1 (lease ya adquirido) | Como máximo una secuencia 1–4 completa a la vez; la segunda se deniega sin tocar presupuesto ni autorización |
| Reinicio del proceso admisor tras una caída, con lease/presupuesto/autorización en cualquier estado parcial | No se reanuda automáticamente ningún paso | El barrido de reconciliación distingue, para cada paso parcial, entre rechazo confirmado (libera, invalidando primero el fencing) y resultado desconocido (`unknown_outcome`, conserva y reconcilia); reiniciar el proceso nunca equivale a reintentar la tarea ni a liberar por el solo transcurso de un plazo |

No hay doble ejecución porque el consumo irreversible de la autorización (paso 3) ocurre dentro de la misma secuencia que adquiere el lease exclusivo del paso 1, y porque ningún lease se libera o reasigna sin invalidar primero, de forma confirmada, el token de fencing del proceso anterior. No hay liberación insegura porque cada liberación exige un rechazo confirmado y legible del paso correspondiente; ante cualquier duda —respuesta perdida, proceso demorado, caída a mitad de un paso— el resultado es `unknown_outcome` y las reservas se conservan hasta reconciliar, nunca se liberan por defecto ni por el solo transcurso de un plazo.

## 6. Permisos y credenciales (diseño, sin provisión)

El proceso no confiable (ejecutor) de la futura implementación offline **no recibe ninguna credencial**: ni clave del proveedor de IA, ni acceso al *Authorization Ledger*, ni al *Budget Ledger*, ni la credencial del *Publisher*, ni un `GITHUB_TOKEN` de ningún alcance, por mínimo que sea. Esta entrega no provisiona, transmite ni menciona ningún secreto real; lo siguiente es únicamente el reparto de custodia propuesto para una implementación futura, sin seleccionar ni provisionar nada:

- **Authorization Ledger**: custodiado por un componente confiable fuera del checkout del ejecutor; su mecanismo concreto de acceso/custodia es una decisión pendiente (sección 11). El ejecutor nunca lee ni escribe este registro directamente.
- **Budget Ledger**: custodiado por un componente confiable separado del anterior; la reserva/liberación la realiza ese componente, nunca el ejecutor.
- **Publisher**: el único componente con credencial de escritura a GitHub (para crear la rama/PR de salida). Recibe del ejecutor exclusivamente **datos** (el diff/los archivos producidos), nunca una credencial, y no comparte la suya con el ejecutor en ningún sentido.
- **Invocación al proveedor**: si la herramienta oficial elegida (sección 11) requiere una clave para invocar al modelo, esa clave la posee un componente de invocación confiable, distinto del proceso que luego ejecuta los comandos no confiables producidos por el agente. **Advertencia de diseño explícita**: varias herramientas oficiales de agentes de código ejecutan comandos en el mismo proceso que posee la credencial del proveedor; si la herramienta elegida tiene ese patrón, la separación exigida aquí **no queda garantizada por el solo hecho de elegirla** — la arquitectura concreta debe demostrar, no suponer, que el subproceso que corre comandos no confiables no puede leer esa credencial (por ejemplo, delegándolo a un sandbox sin la clave en su entorno). Esto es, precisamente, uno de los controles de la sección 14 que ningún mock puede demostrar.
- Un único proveedor/método de autenticación oficial queda por decidir (sección 11); sin asumir que una suscripción personal (Plus/Pro) incluye acceso de API, como ya advierten `AUTOPILOT.md` y `docs/autopilot/ACTIVATION-READINESS.md`.
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

Recuperación: registrar SHA, identificadores de proveedor/Actions, estado, comandos ejecutados, resultados conocidos y desconocidos, costo observado o desconocido, y motivo, sin secretos. Reanudar exige reconciliación completa y una **nueva** autorización; revocar una autorización no deshace un gasto ya producido. La liberación de cualquier lease durante esta recuperación sigue, sin excepción, el mecanismo de fencing y la distinción entre rechazo confirmado y resultado desconocido de la sección 5: nunca se libera solo porque transcurrió un plazo, y un proceso demorado que reanude tras la reasignación queda invalidado por su token de fencing obsoleto.

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

## 12. Correspondencia requisito → caso de prueba → resultado esperado (complementa, no reemplaza, la matriz de `docs/specs/LF-001d.md` §6)

Esta tabla **complementa** la matriz de aceptación futura de la sección 6 de `docs/specs/LF-001d.md`; no la sustituye ni reduce ninguno de sus requisitos. Cada fila traza un requisito de esa matriz hacia el caso de prueba offline previsto en la sección 13 de este documento (mocks, no pruebas ejecutadas) y hacia el resultado que esa prueba, de implementarse, debería exigir. Las dos matrices deben seguir satisfaciéndose juntas; ninguna de las dos está satisfecha todavía, ni esta entrega ejecuta ninguna de las pruebas que describe.

| Requisito (matriz `docs/specs/LF-001d.md` §6) | Caso de prueba offline previsto (sección 13) | Resultado esperado |
|---|---|---|
| Actor impostor, aprobación editable, **revocación**, vencimiento o reutilización de la autorización | *Authorization Ledger* mock: autorización vencida, revocada, reutilizada, `owner_identity_proof_fake` que falla un verificador simulado | Denegado antes de cualquier invocación; cero dispatch; sin exposición de credenciales |
| Spec ausente o modificada | *Admission Validator* mock, caso (2): `spec_sha256` no coincide con el contenido real en el `base_sha` vigente; resto de condiciones (base, decisiones, dependencias, reserva) válidas | Denegado; razón reportada sin valores sensibles |
| **Base obsoleta** | *Admission Validator* mock, caso (1): `base_sha` declarado distinto del vigente, **con `spec_sha256` todavía coincidente** en ese `base_sha` antiguo; resto de condiciones válidas | Denegado únicamente por la base, aunque el hash de la spec siga coincidiendo — la vigencia de la base nunca se infiere del hash de spec |
| **Decisiones pendientes** (decisión requerida sin aprobar) | *Admission Validator* mock, caso (3): una decisión requerida por la tarea no tiene aprobación en el registro simulado; resto de condiciones válidas | Denegado |
| Dependencia no completada | *Admission Validator* mock, caso (4): una dependencia declarada no tiene prueba Git simulada de `done`; resto de condiciones válidas | Denegado |
| **Reserva ajena** | *Admission Validator* mock, caso (5): `scope_files` solicitado se solapa con la reserva vigente de otra tarea en el `docs/HANDOFF.md` simulado; resto de condiciones válidas | Denegado; distinto del solapamiento operativo del *Lease Store* (fila siguiente) |
| **Costo desconocido**, límite ausente, cero o agotado | *Budget Ledger* mock: `hard_limit_cents` nulo/0/negativo; costo "observado" desconocido tras una ejecución simulada; reconciliación con discrepancia | Denegado; sin reserva exitosa no hay admisión; costo desconocido se reporta como incertidumbre, nunca como cero |
| Dos solicitudes simultáneas o reinicio tras envío | *Lease Store* mock: adquisición concurrente simulada; "caída" con rechazo confirmado o con respuesta perdida a mitad de ejecución, seguida de intento de reanudar sin reconciliar; proceso demorado que presenta un token de fencing ya invalidado | Como máximo una invocación real; autorización consumida durablemente; resultado incierto (`unknown_outcome`) conserva las reservas y bloquea nuevas invocaciones hasta reconciliar, nunca se libera por el solo transcurso de un plazo; un proceso demorado nunca completa la tarea tras ser reasignado |
| Inyección en spec, issue o salida; lectura de secretos/red no permitida | *Executor sandbox* mock: cero intentos de resolución de red registrados; cero variables con forma de credencial expuestas; texto de inyección de prompt en la salida del "agente" | Sin efecto; contenido tratado siempre como dato, nunca como instrucción ni como prueba de autorización |
| Traversal, symlink, archivo fuera de alcance, modificación de controles | *Publisher* mock: `../`, symlink fuera del checkout, archivo fuera de `scope_files`, intento de tocar `.github/workflows/`, `docs/DECISIONS.md` o `docs/autopilot/BACKLOG.json` | Rechazado sin escritura privilegiada ni ejecución del artifact entregado |
| **Timeout**, cancelación, **respuesta parcial** y coste no informado | *Lease Store* mock de caída a mitad de ejecución (correspondencia con `unknown_outcome`, sección 4/8); *Pause controller* mock: ninguna admisión nueva tras pausa, reanudar sin nueva autorización falla | Estado `unknown_outcome` o `paused`; **recuperación sin reintento automático**; nunca declaración de éxito o de costo cero sin confirmar |
| Entrega válida sin conexión | Conjunto completo de mocks de la sección 13 (ningún componente real) | Resultado explícitamente `mode:"simulation-only"` o equivalente; diff esperado; ninguna aprobación operativa inferida |
| Único ensayo real, solo tras autorización separada | Ninguno: queda fuera del alcance de los mocks offline; corresponde a la lista de controles no demostrables de la sección 14 | No se diseña aquí una prueba offline sustitutiva; exige entorno y autorización reales, en un PR separado |
| Revisión y cierre | *Reviewer gate* mock: autorrevisión, revisor que no coincide con el SHA revisado, aprobación sin bandera `simulated`/equivalente real | Rechazado; revisor distinto del ejecutor exigido; cierre solo con prueba Git real de merge |

## 13. Plan de pruebas offline con mocks/fixtures

Cada mock es puro, determinista y sin red, siguiendo el mismo estilo que `tests/coordination/fake-agent.test.mjs` y `tests/coordination/backlog-done-proof.test.mjs`:

| Componente | Mock propuesto | Casos de prueba offline |
|---|---|---|
| *Admission Validator* | Función pura que combina fixtures del *Authorization Ledger*, de `docs/HANDOFF.md`/`docs/ROADMAP.md` simulados, de un registro de decisiones simulado y de una prueba de dependencia `done` simulada (reutilizando el estilo de `simulateAdmission`) | Cinco casos negativos **independientes** (sección 5, pasos 3–7), cada uno con el resto de condiciones válidas: (1) **base obsoleta** — `base_sha` declarado distinto del vigente, **aunque `spec_sha256` siga coincidiendo** con el contenido de la spec en ese `base_sha` antiguo; (2) **spec modificada** — `spec_sha256` no coincide con el contenido real en el `base_sha` vigente; (3) **decisión pendiente** — una decisión requerida por la tarea no tiene aprobación en el registro simulado; (4) **dependencia no completada** — una dependencia declarada no tiene prueba Git simulada de `done`; (5) **reserva ajena** — el `scope_files` solicitado se solapa con la reserva vigente de otra tarea en el `docs/HANDOFF.md` simulado (estática, distinta del solapamiento operativo del *Lease Store*). Cada caso debe denegar por sí solo, sin que ninguno de los otros cuatro lo explique |
| *Authorization Ledger* | Fixture JSON con `{authorization_id, owner_identity_proof_fake, task_id, spec_sha256, scope_files, expires_at, max_attempts}` | Válida; vencida; revocada; reutilizada; `owner_identity_proof_fake` que falla un verificador simulado (actor impostor); **consumo simulado que falla con rechazo confirmado** tras un lease y presupuesto ya reservados (debe liberar ambos de inmediato, sección 5, paso 3); **consumo simulado cuya confirmación de red se pierde después de guardarse durablemente** (debe quedar `unknown_outcome`, lease y presupuesto **sin liberar**, hasta reconciliar — nunca el caso anterior); intento de reutilizar una autorización ya marcada consumida |
| *Budget Ledger* | Ledger en memoria con reserva/liberación atómica | Reserva concurrente de dos llamadas simultáneas simuladas (una debe fallar); `hard_limit_cents` nulo/0/negativo; costo "observado" desconocido tras una ejecución simulada; reconciliación con discrepancia; **reserva simulada que falla con rechazo confirmado** tras un lease ya adquirido (debe liberar el lease, sección 5, paso 2); **reserva simulada cuya confirmación se pierde** (debe quedar `unknown_outcome` sin liberar el lease, nunca el caso anterior) |
| *Lease Store* | Mapa en memoria con `acquire`/`release` que indexa por `task_id` y por `scope_files`, y emite un token de fencing (epoch) por cada adquisición | Clave duplicada por `task_id`; **solicitud de una tarea y autorización distintas cuyo `scope_files` se solapa con un lease vivo de otra** (debe rechazarse igual que la misma tarea, sección 5, paso 9); adquisición concurrente simulada para la misma tarea o para rutas solapadas (como máximo una debe obtener el lease); "caída" simulada con **rechazo confirmado** entre adquirir el lease y reservar presupuesto, y entre reservar presupuesto y consumir la autorización, seguida de un intento de reanudar sin reconciliar (debe rechazarse en ambos casos, nunca reintentar automáticamente); la misma caída pero con **respuesta perdida** en vez de rechazo confirmado (debe quedar `unknown_outcome`, conservando lease y presupuesto, nunca liberando por el solo transcurso de un plazo); **invalidación del token de fencing antes de liberar o reasignar**, seguida de un intento de escritura simulado de un **proceso demorado** que presenta el token ya invalidado (debe rechazarse esa escritura); reinicio simulado del proceso admisor con lease/presupuesto/autorización en estado parcial (debe resolver a rechazo confirmado con liberación, o a `unknown_outcome` sin liberar, nunca a reanudación automática ni a liberación por el solo transcurso de un plazo) |
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
