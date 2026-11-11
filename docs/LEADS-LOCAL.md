# Prospectos y pipeline reales — LF-026

Incremento local/manual sobre LF-025. `/design` sigue siendo una propuesta con datos sintéticos; las operaciones persistentes están en `/app/:organizationId/leads`, `/pipeline` y `/stages`. Conservan los componentes y colores aprobados. Requieren identidad configurada y migraciones 0001 y 0002. No hay migración automática al iniciar Next.

## Preparación explícita

Usar una base **local dedicada**, un provisionador propietario del esquema de identidad y un runtime separado, sin superusuario/BYPASSRLS/CREATEDB/CREATEROLE ni pertenencia al propietario. Sobre una instalación LF-025 existente, ejecutar `node scripts/leads/migrate.mjs` con `IDENTITY_MIGRATION_URL` apuntando al provisionador y `IDENTITY_RUNTIME_ROLE` al rol runtime. El runner rechaza destinos de sistema, hosts externos, parámetros de URL, objetos comerciales desconocidos y propietario incorrecto. No imprimir las URLs con contraseñas.

0002 agrega tablas, contextos, FKs, RLS, funciones y grants en una transacción; conserva identidad y organizaciones. Crea cinco etapas para cada organización existente y modifica el bootstrap para las nuevas. Un bloqueo de migración serializa aplicadores concurrentes. `app_migrations` guarda SHA-256 con finales LF normalizados: una repetición idéntica comprueba el checksum, nunca recrea datos; un checksum distinto falla. No hay downgrade automático ni borrado de esquemas existentes. Antes de usar datos reales harán falta backup/restauración y revisión de operación.

Arrancar Next con las variables de identidad documentadas en IDENTITY-LOCAL.md. El runtime no tiene DELETE de prospectos, mutación de eventos ni acceso a auditoría. No usar el provisionador como DATABASE_URL del servidor.

## Comportamiento

- Cualquier miembro vigente puede listar/crear/editar/asignar/mover/archivar dentro de su organización. No hay prospectos privados por vendedor. La membresía real decide; el cliente no manda actor, rol u organización en el cuerpo.
- Owner/admin crean, renombran, ordenan y desactivan etapas. Máximo 50; al menos una activa por cada tipo abierta/ganada/perdida. Una etapa referenciada, incluso por un prospecto archivado, conserva su tipo y no se desactiva. Nombres únicos sin distinguir mayúsculas. No se borran etapas.
- Asignación opcional a miembro vigente del mismo equipo. Revocación posterior conserva la referencia histórica, mostrada como «Miembro anterior». La próxima operación de ese miembro se rechaza. Una operación ya admitida retiene un bloqueo compartido de membresía hasta confirmar o revertir; la revocación espera ese cierre.
- Edición, movimiento y archivo requieren `version`. Conflicto devuelve 409 y requiere recargar; no se sobrescriben cambios concurrentes. Archivo conserva ficha, historial y auditoría y bloquea ediciones; restauración pendiente.
- Crear y mover insertan un evento inmutable; repetir la misma etapa no agrega otro. Auditoría (solo identificadores/tipo de acción) y evento confirman o revierten con el prospecto. Renombrar una etapa cambia la etiqueta con la que se muestra su ID histórico; no se guarda una copia del nombre antiguo.
- Buscar por nombre/correo, filtros de etapa/responsable/origen/archivo, orden por fecha o nombre y páginas acotadas a 50. Los caracteres `%` y `_` se buscan literalmente. Cursor vinculado a filtros/organización/orden; no constituye autorización ni una instantánea frente a inserciones o renombrados concurrentes. El tablero indica cuántos registros están **cargados**, con «Cargar más», sin fingir totales globales.
- Nombres recortados; correo normalizado sin unicidad/fusión; teléfono E.164 explícito; campos de contacto opcionales. No se infiere país. Fechas UTC y visualización en zona de la organización.

## Verificación reproducible

`npx --no-install vitest run --config vitest.leads.config.ts` requiere `LEADS_TEST_ADMIN_URL` hacia **un clúster descartable local** y pathname `/lf026_leads_test`. Crea únicamente esa base y roles `lf026_test_owner`/`lf026_test_runtime`; rechaza una base existente en vez de vaciarla. Requiere un administrador de ese laboratorio para preparar roles y provocar fallos sintéticos. Nunca apuntar al servicio o a una base de trabajo existente. Cada repetición de integración requiere un laboratorio limpio preparado explícitamente. El helper de prueba no borra bases ni roles.

La suite usa Better Auth, HTTP y servicios reales, ejecuta los dos runners reales y fuerza un fallo de DDL a mitad de la migración para comprobar rollback antes de aplicarla correctamente. También comprueba checksum alterado, organizaciones anteriores/posteriores, RLS, permisos, referencias entre tenants, membresías revocadas y bloqueo concurrente de revocación, versiones concurrentes, historial/archivo, fallo real de auditoría, búsqueda y cursores.

Después del build, `npx --no-install playwright test --config playwright.leads.config.ts` usa esa base migrada con `DATABASE_URL` runtime, `APP_ORIGIN=http://127.0.0.1:4311` y un `AUTH_SECRET` efímero generado en memoria. Recorre registro → organización → creación/edición → pipeline → recarga → historial → archivo/filtro → nueva etapa, con axe en escritorio/móvil. No guarda trazas, cookies ni secretos. Opcional `IDENTITY_BROWSER_CHANNEL=msedge` usa Edge instalado; CI usa Chromium. No publica nada.

## Límites

Sin importación, interacciones/seguimientos, dashboard real, IA conectada, correo, invitaciones o gestión de miembros. Sin despliegue ni permiso para datos reales. No se demuestra aquí seguridad de infraestructura productiva, backup/restauración, política por IP/proxy, rendimiento a gran escala o entrega exactamente una vez ante caída tras COMMIT. No hay reintentos automáticos de mutaciones; ante respuesta incierta consultar la ficha/listado antes de repetir. El rol runtime y el servidor que establece contexto son confiables: RLS no sustituye proteger sus credenciales frente a compromiso. AUTOPILOT permanece en pausa y BACKLOG no cambia.
