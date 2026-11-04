# LF-016 — Endurecimiento B8 y preparación segura de LF-001d

**Estado:** propuesta pendiente de revisión; este documento no autoriza LF-001d.
**Base:** merge del PR #11 en `main`, `eed7f8c21550094965fe7b191a1194216dbce01a`.
**Alcance:** endurecer el adaptador falso, y definir puertas para el diseño del adaptador real sin ejecutarlo.

## B8 — Claves operativas anidadas

El adaptador de LF-015 rechazaba credenciales/proveedores solo en las claves de primer nivel. LF-016 propone inspeccionar recursivamente todos los campos del fixture **antes de simular admisión**:

- Rechazo explícito de claves operativas (credenciales, tokens, `api_key`, `provider`, `dispatch`, `workflow`, secretos y autorización), también dentro de `scenario`, `review`, `evidence`, arrays y objetos a mayor profundidad. El rechazo se realiza por nombre de campo, sin imprimir ni registrar su valor.
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
