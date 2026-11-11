# Interacciones y seguimientos reales — LF-027

Rutas reales: ficha /app/:organizationId/leads/:leadId y lista /app/:organizationId/followups. /design sigue siendo la propuesta sintética. Se reutilizan componentes y colores aprobados. No hay correo, cron, conectores de mensajes ni asistencia IA conectada.

## Migración explícita

Sobre una base local dedicada que ya aplicó 0001 y la 0002 integrada de LF-026, ejecutar node scripts/activity/migrate.mjs con IDENTITY_MIGRATION_URL del provisionador original y IDENTITY_RUNTIME_ROLE separado. DATABASE_URL de Next siempre usa el runtime, nunca el propietario. Las variables de identidad/origen/secret están documentadas en IDENTITY-LOCAL.md; no imprimirlas con valores sensibles.

El runner exige loopback y base no de sistema, sin parámetros de URL, cinco objetos anteriores propiedad del provisionador y checksum correcto de 0002. Usa el mismo advisory lock del runner comercial. 0003 agrega interactions/followups, políticas FORCE RLS, FKs por tenant, cuatro funciones confiables con search_path=pg_catalog y sin EXECUTE para PUBLIC. Runtime solo SELECT/INSERT/UPDATE en estas tablas; no DELETE ni acceso a auditoría. DDL, grants y ledger se confirman juntos; un fallo revierte todos. Una repetición con checksum idéntico no modifica datos. No corrige ni vacía esquemas desconocidos; no hay migración automática al iniciar Next.

## Contratos y comportamiento

- Interacciones note/call/meeting/conversation: texto plano hasta 4000 caracteres, fecha con offset, autor de sesión, versión y auditoría de edición sin copiar contenido. Todos los miembros vigentes comparten la gestión comercial. La interfaz escapa el texto; no interpreta HTML ni importa conversaciones automáticamente. No se guardan revisiones completas del texto anterior.
- Seguimientos: título, detalle opcional, prospecto, responsable vigente y vencimiento. Solo pending puede editarse; completed/canceled son terminales. No se reabren ni borran. La misma transición terminal repetida devuelve el resultado confirmado, conservando fecha/actor/versión y una sola auditoría, incluso con la versión original. Un destino distinto o edición antigua da 409.
- Creación con creationKey UUID de un solo payload por organización/actor/recurso. El hash usa el input validado y normalizado (incluido el instante UTC). Repetir devuelve el registro existente, que puede haber sido editado posteriormente; no promete reproducir una copia inmutable de la respuesta inicial. Misma clave con otro payload da 409. Claves y hashes internos no se incluyen en los listados/respuestas. No hay reintento automático ni garantía de disponibilidad ante caída.
- Archivar conserva lectura e historia y bloquea nuevas interacciones/seguimientos o sus ediciones. Los pendientes existentes sí pueden completarse/cancelarse. No se cancelan automáticamente. Revocar responsable conserva referencia histórica y posibilidad de cierre; asignaciones nuevas exigen membresía vigente.
- Ficha e historial se leen sin FOR UPDATE de la entidad. Mutaciones bloquean su fila; triggers bloquean el prospecto compartidamente y el responsable vigente para serializar frente a archivo/revocación. Contexto de sesión/membresía y RLS de LF-026 se mantienen.
- Listas paginadas (20 por defecto, máximo 50), orden occurredAt desc/id o dueAt asc/id; filtros por prospecto, responsable/estado/vencido/próximo y tipo de interacción. Cursor vinculado a filtros/organización y asOf fijo entre páginas. No es autorización ni una instantánea frente a ediciones. Se indican resultados por página, sin inventar totales globales. Vencido: pending y dueAt < asOf; próximo: pending y dueAt >= asOf.
- Fechas UTC de 2000 a 2100, vistas/formularios en zona IANA de la organización. Horas locales inexistentes o repetidas por DST se rechazan al elegir una nueva; un instante ya guardado que no se cambió conserva su offset real. Zona del navegador no decide silenciosamente. Los límites UTC permiten el año local adyacente al editar cerca de enero/diciembre.
- Cuerpo máximo 20000 bytes, input estricto y errores sin texto/SQL. Mismo contador comercial persistido de LF-026: 120 intentos/minuto por identidad, entre recursos/organizaciones. UUID mal formado no asigna contador. Ventana fija y hardening por IP/proxy/limpieza histórica pendientes.

## Reproducción

node node_modules/vitest/vitest.mjs run --config vitest.activity.config.ts requiere ACTIVITY_TEST_ADMIN_URL con pathname exacto /lf027_activity_test en un clúster local descartable. Crea exclusivamente esa base y roles lf027_test_owner/lf027_test_runtime; rechaza una base existente, sin borrarla. El administrador se usa solo para preparar el laboratorio y provocar fallos sintéticos; no para el servidor. Cada repetición de integración necesita un laboratorio limpio preparado explícitamente.

La suite ejecuta 0001, 0002 y el runner 0003 reales. Prueba rollback DDL/ledger, repetición/checksum, RLS/FKs/permisos, otro tenant/actor, origen/input, creación y cierre idempotentes y concurrentes, conflictos, auditoría fallida, archivo/revocación en ambos órdenes con locks reales, campos de servidor, cursores/corte y contador compartido con prospectos.

Tras build, playwright test --config playwright.activity.config.ts usa DATABASE_URL runtime, APP_ORIGIN=http://127.0.0.1:4312 y AUTH_SECRET efímero en memoria; canal Edge opcional mediante IDENTITY_BROWSER_CHANNEL=msedge. No guardar trazas/cookies/secretos. CI ejecuta PostgreSQL 16/Chromium; el navegador comercial anterior también usa la base completa de LF-027 para que las nuevas secciones de la ficha dispongan de 0003, mientras su integración independiente sigue comprobando 0001/0002 en otra base.

## Límites pendientes

Sin entrega externa de recordatorios, notificaciones push, calendario externo, adjuntos, editor HTML, borrado/restauración, retención productiva, dashboard, importaciones ni IA. No se afirma auditoría manual WCAG completa, rendimiento a escala, operación productiva o políticas legales resueltas. La seguridad del servidor/runtime y sus credenciales sigue siendo una frontera confiable. Sin datos reales, gastos nuevos, despliegue o agentes. BACKLOG/AUTOPILOT siguen en pausa. PR independiente DRAFT y revisión antes de cualquier merge.
