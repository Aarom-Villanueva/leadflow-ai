# Requisitos y aceptación del MVP

Estado: especificación propuesta, salvo alcance explícitamente solicitado. Los límites numéricos son valores iniciales pendientes de aprobación (D-004).

| ID / dominio | Comportamiento y aceptación verificable |
|---|---|
| R01 Identidad | Registro/login/logout, verificación y recuperación; cookies seguras. Sesión revocada no accede a recursos. Errores de login no enumeran cuentas. Entrega de correo pendiente de D-003. |
| R02 Organizaciones | Crear organización crea membresía owner atómicamente. Cambiar organización no conserva permisos del contexto previo. Último owner no puede ser eliminado ni degradado. Invitación expira y solo se acepta por identidad destinataria verificada. |
| R03 Prospectos | CRUD con paginación y filtros; email/teléfono opcionales, nombre obligatorio, propietario asignado miembro del tenant. IDs ajenos responden como inexistentes. Archivar preserva historia. |
| R04 Pipeline | Un pipeline por organización para MVP, etapas ordenadas open/won/lost. Mover prospecto registra transición atómica. No borrar etapas usadas; desactivar o reasignar transaccionalmente. |
| R05 Interacciones | Registrar nota, llamada, reunión o conversación aportada, autor y fecha. Contenido con límites, sin HTML ejecutable. Ediciones auditadas. |
| R06 Seguimientos | Responsable miembro, vencimiento UTC y estado pending/completed/canceled. Lista de vencidos y próximos, completar una vez con seguridad ante reintento. Recordatorio visible en aplicación; canal externo pendiente. |
| R07 Importación | CSV y XLSX, previsualización y mapeo, validación por fila, errores descargables sanitizados y resumen de creados/duplicados/rechazados. Confirmación explícita; repetir confirmación no duplica. Sin macros ni enlaces externos. |
| R08 Métricas | Solo datos del tenant; contar prospectos no archivados por etapa; conversión = prospectos creados en intervalo que llegaron a won / prospectos creados en intervalo. Denominador cero → sin datos. Registrar fecha de corte; no sumar transiciones como personas. |
| R09 IA | Usuario autorizado elige acción y texto permitido; obtiene borrador identificado como IA, trazabilidad, consumo y opción de descartar. Fallo/cuota no pierde datos comerciales ni envía mensajes. |
| R10 Administración | Owner controla propiedad y eliminación; admin gestiona miembros, configuración y auditoría; vendedor solo funciones comerciales. Auditoría registra cambios sensibles sin secretos ni texto de conversaciones. |

## Contratos transversales
Listados ordenados establemente con cursor y límite máximo; mutaciones con Zod en servidor, errores tipados y requestId. Moneda no se agrega al MVP sin especificación. Fechas persistidas UTC, presentación en zona IANA del usuario/organización. Exportaciones y contenido renderizado neutralizan fórmulas y XSS. Backend aplica autorización independientemente de controles visuales.

Duplicados: email normalizado (trim y dominio/caja según política documentada; MVP propone lowercase completo), teléfono E.164 solo con país conocido. Sin identificador confiable, marcar candidato por nombre y pedir resolución; no fusionar automáticamente por nombre. Archivo no conserva fórmulas como código ni utiliza datos para entrenamiento.

## Recorridos de aceptación
1. Owner crea organización, invita vendedor, configura etapas; vendedor registra prospecto, interacción y seguimiento; dashboard refleja los registros.
2. Importador previsualiza mezcla de filas válidas, inválidas y duplicadas; confirma y reintenta sin duplicar ni ocultar errores.
3. Vendedor solicita resumen/borrador; revisa o descarta. No existe ruta de envío automático.
4. Usuario de otra organización intenta leer, modificar, importar y consultar IA sobre IDs ajenos: sin acceso ni filtración de existencia.

## Objetivos no funcionales propuestos
Conjunto representativo de 10 000 prospectos/tenant, 20 usuarios concurrentes; p95 de lecturas normales <500 ms en región acordada, excluyendo proveedor IA. Medir antes de comprometer SLA. Accesibilidad WCAG 2.2 AA en recorridos principales. Compatibilidad navegadores actuales Chromium/Firefox/WebKit. Cuotas y tamaños en SECURITY; RPO/RTO en QUALITY.
