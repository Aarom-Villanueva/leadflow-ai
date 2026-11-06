# LF-016 — Endurecimiento B8 y preparación segura de LF-001d

**Estado:** LF-016 integrado por PR #12 el 2026-11-05 tras corrección M2 y segunda auditoría aprobada. Las puertas operativas de LF-001d siguen pendientes; este documento no lo autoriza.
**Base:** merge del PR #11 en `main`, `eed7f8c21550094965fe7b191a1194216dbce01a`.
**Alcance:** endurecer el adaptador falso, y definir puertas para el diseño del adaptador real sin ejecutarlo.

## B8 — Claves operativas anidadas

El adaptador de LF-015 rechazaba credenciales/proveedores solo en las claves de primer nivel. LF-016 propone inspeccionar recursivamente todos los campos del fixture **antes de simular admisión**:

- Rechazo de **todos los campos no permitidos por una lista blanca estructural** de cada objeto (`scenario`, `backlog`, `contract`, `policy`, `review`, `evidence`, tareas, reservas y leases), incluso si la clave operativa anidada tiene un nombre nunca visto (por ejemplo `client_secret` o `refresh_token`). No depende de la coincidencia contra palabras sospechosas, ni imprime o registra el valor de los campos.
- Solo se permiten valores JSON normales, objetos de prototipo ordinario o nulo y arrays. Se rechazan getters/accesores, símbolos, funciones, referencias cíclicas/compartidas, profundidad excesiva y estructuras desproporcionadas; falla cerrado.
- Se mantienen las validaciones originales de alcance, identidad sintética del revisor, SHA sintético y replays.
- Las funciones continúan siendo puras respecto a red, procesos, GitHub, persistencia y escritura. El CLI únicamente puede leer un fixture local pasado explícitamente y mostrar un resultado sintético.

Las pruebas deben cubrir campos anidados, variantes de nombres y estructuras peligrosas, así como la ruta sintética autorizada y el replay.

## Puertas futuras para LF-001d: no habilitadas

Antes de agregar un adapter capaz de despachar un agente deberán existir, en un PR separado y auditado:

1. **Identidad del propietario** validada fuera de contenido controlado por agentes; aprobación auditable de una sola tarea y una sola ejecución. `SIM-...` es un identificador de fixture y no demuestra aprobación.
2. **Credenciales y permisos**: elegir proveedor admitido oficialmente, documentar custodia/rotación y token de GitHub de mínimo privilegio; aislar checkout de código no confiable de secrets. Acciones externas fijadas por SHA inmutable. Nada de permisos para saltar branch protection o merge automático.
3. **Límites de costo externos**: confirmar precios y términos actuales de API y GitHub Actions con fuentes y fecha. Presupuesto autorizado por defecto **USD 0 / S/ 0**; no lanzar trabajos susceptibles de facturar sin límite por ejecución, por período y control de cuota/proveedor.
4. **Aislamiento**: un solo agente y una sola tarea aprobada, rama aislada y rutas permitidas; límites de tiempo/recursos, prohibiciones de red cuando corresponda, secuestro de instrucciones y salida maliciosa tratados como datos.
5. **Validación de evidencia real**: spec y hash, dependencias, decisiones, reserva de archivos, historial Git y revisión humana. El resultado `fake_ready_for_owner` no puede transformarse implícitamente en `ready_for_owner` o `done`.
6. **Detención y recuperación**: mecanismo de pausa/cancelación, revocación de credenciales, trazabilidad por SHA, idempotencia persistente, límites de reintentos y pruebas de fallo cerrado.
7. **Revisión y autorización**: checks obligatorios en el SHA exacto, una segunda revisión independiente y autorización expresa del propietario para cada paso que cambie permisos, presupuestos, despliegues o ejecución real.

## Estado y límites

- `docs/autopilot/BACKLOG.json`: `execution_enabled=false`, LF-001a `done` y LF-002a/LF-002/LF-003 `blocked` **sin cambio**.
- LF-016 no agrega un workflow, provider SDK, token, secreto, despacho, servicio de pago, despliegue o autorización operativa.
- Ni el PR de LF-016 ni su posible merge equivalen a permitir una ejecución real o activar LF-001d. El siguiente hito deberá tener especificación independiente y revisión de las decisiones no resueltas.

## Consideración de seguridad específica

Aunque esta validación más estricta reduce accidentes en fixtures sintéticos, **no constituye un sandbox de procesos ni una política de seguridad para agentes reales**. Una futura implementación con conexión no debe reutilizar esta verificación como único control de credenciales, autenticación o autorización.

## Auditoría M2: decisión de diseño

La primera versión de LF-016 utilizó una lista cerrada de palabras clave y la auditoría independiente de Claude demostró nueve formas de introducir credenciales plausibles sin rechazo. Se reemplazó ese enfoque por una **lista blanca de campos por estructura**: los campos nuevos son rechazados por defecto y deben pasar revisión de contrato y pruebas antes de incorporarse. Se mantiene la prohibición de reutilizar esta lógica como única frontera de seguridad de un ejecutor real.

## Continuidad documental tras PR #12

LF-017 registra el cierre verificable de LF-016 y prepara [la especificación independiente de LF-001d](../specs/LF-001d.md). Su alcance es solo documentación, sin implementar ni activar el adaptador real. Las siete puertas anteriores requieren evidencia operativa futura; aprobar este diseño no equivale a superarlas. Se conservan proveedor y método sin seleccionar, presupuesto autorizado cero y BACKLOG intacto.
