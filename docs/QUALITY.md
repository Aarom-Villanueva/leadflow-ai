# Calidad, confiabilidad y operación

## Método
SDD: especificación con contratos y criterios antes de código. ODD: incrementos recuperables, pequeños y con riesgos explícitos. RDD: revisión del candidato identificado por SHA, diff, evidencia y riesgos. Pruebas primero para reglas deterministas, permisos, deduplicación e idempotencia; no fabricar pruebas de código inexistente.

## Estrategia de pruebas futura
- Vitest: políticas de rol, validaciones, normalización, transiciones, métricas y contratos de proveedor fake.
- Integración con PostgreSQL real y rol runtime: FKs, RLS, contexto ausente, pool que alterna tenants, carreras de cuotas/owner/importación, rollback de auditoría y migraciones desde versión anterior. No sustituir aislamiento por mocks.
- Playwright: login, organización, CRUD y pipeline, seguimiento, importación con errores, dashboard y borrador IA. Dos tenants y roles separados; controles de teclado y verificación automatizada de accesibilidad con axe-core (p. ej. axe-playwright) en cada recorrido principal, sin sustituir revisión manual de lectores de pantalla antes de un piloto real.
- Contratos IA con fake en CI: timeout, rechazo, salida malformada, inyección, 429 y uso. Proveedor real solo prueba opt-in autorizada con presupuesto; no requisito de PR.
- CI propuesto: instalación congelada, lint, tipos, unitarias/integración, build y E2E representativo. Jobs sin credenciales productivas; PostgreSQL efímero con fixtures sintéticos. Guardar conteos y exit status. Cero tests no significa suite aprobada.

Gate por PR: criterios completos, pruebas pertinentes ejecutadas, revisión independiente, sin secretos ni vulnerabilidades críticas sin resolver, cambios de contrato aprobados. No exigir porcentaje de cobertura como sustituto de pruebas útiles. LF-000 solo admite revisión documental y verificaciones de enlaces/consistencia; no afirma validar producto.

## Operación propuesta
| Área | Política y evidencia requerida |
|---|---|
| Errores | Adaptador central con códigos de ARCHITECTURE, requestId, redacción y causa interna. Excepción no expone SQL/stack/PII. |
| Timeouts/reintentos | Presupuesto HTTP por ruta; IA 30 s y DB statement timeout menor al límite de hosting. Máximo dos reintentos con backoff+jitter solo en fallos transitorios seguros; no auth/validación. Un timeout de proveedor puede haber consumido dinero: estado unknown y conciliación, sin reintento ciego. |
| Idempotencia | Import confirm y mutaciones sensibles guardan clave tenant+actor+operación y hash. Repetición retorna referencia previa; hash distinto →409. Retención inicial 24 h; fuera de ventana no se garantiza replay. IA no duplica solicitudes automáticamente si resultado incierto. |
| Concurrencia | Versiones optimistas para leads/seguimientos →409 ante edición obsoleta. Locks para owner, import confirm y reserva de cuota; transacciones breves, sin llamada IA mientras se retiene lock DB. Pool y máximo de conexiones fijados según hosting. |
| Costos IA | Reservar coste máximo antes de llamar; contabilizar real, liberar sobrante al completar; desconocidos conservan reserva hasta conciliación. Presupuesto mensual tenant y global, límite duro y alerta al 80%; modelo allowlist, sin fallback ilimitado. Precio/config versión auditada. |
| Jobs condicionales | Persistencia/outbox atómica; lease y recuperación de worker muerto, deduplicación y máximo 3 intentos por trabajo seguro. Fallidos visibles para operador; payload mínimo y autorización vigente al ejecutar. Sin prometer exactly-once. |
| Migraciones | SQL generado por Drizzle revisado y versionado en tarea futura; probar base vacía y upgrade. Expand/contract, backup previo, cambios destructivos separados. Nunca schema push automático en producción ni migración al arrancar cada instancia. Rollback preferentemente aplicación compatible; restaurar backup implica pérdida según RPO. |
| Backups | Propuesta DB administrada con PITR, respaldo diario, retención 30 días; RPO objetivo 1 h, RTO 4 h sujetos a proveedor/costo. Restaurar en entorno aislado antes de lanzamiento y trimestralmente; verificar integridad y aislamiento. Incluir objetos temporales solo si necesarios; no asumir snapshot del entorno dev como backup de negocio. |
| Observabilidad | Logs JSON con requestId, operación, tenant/actor pseudonimizados, duración y código. Métricas de error/latencia, DB pool, job lag, cuotas, tokens/costo y fallos auth; sin prompts/cookies. Acceso y retención de logs limitados. |
| Alertas | Propuesta: 5xx >2% por 5 min con mínimo 100 solicitudes, agotamiento pool persistente, jobs atrasados >10 min, backup fallido y gasto al 80/100%. Ajustar ruido; runbook con responsable, inspección por requestId, mitigación y recuperación verificada. |

## Riesgos operativos
Sin SLA hasta medición; proveedor IA o DB puede fallar. CRM debe conservar funciones sin IA; mostrar estado reintentable sin perder texto del usuario. Serverless limita tiempo/memoria y puede impedir workers: D-001/D-005 condicionan diseño final. Backups no equivalen a restauración probada. Separar desarrollo/staging/producción, credenciales y datos; despliegue y costos requieren autorización.
