# Seguridad y pruebas negativas

## Modelo de amenazas
Actores: usuario anónimo, miembro malicioso de otro tenant, miembro con rol insuficiente, archivo o conversación hostil, dependencia/proveedor comprometido. Activos: identidad, datos comerciales, conversaciones, claves, presupuesto IA y evidencia de auditoría. Fronteras: navegador/backend, tenant/tenant, runtime/DB, runtime/proveedor y CI/producción.

| Amenaza | Control diseñado | Prueba negativa obligatoria |
|---|---|---|
| IDOR/BOLA y filtraciones | Contexto desde sesión y membresía activa en cada servicio; filtros, FKs compuestas y RLS propuesta | Tenant B usa IDs de A en lectura/escritura, nested resources, exports, dashboard, imports, jobs y prompts: cero datos/cambios |
| Escalada de roles | Políticas deny-by-default backend; no confiar en rol/tenant enviados | Vendedor modifica roles, auditoría, pipeline o cuotas; membresía revocada reutiliza sesión |
| Robo/fijación de sesión | Better Auth, TLS, cookies HttpOnly Secure SameSite=Lax, path / y host-only; rotar/revocar según soporte verificado; no tokens en localStorage | Cookie alterada, sesión expirada/revocada, reutilización tras logout; recuperación e invitación expiran y no se reusan |
| CSRF | Toda mutación (POST/PUT/PATCH/DELETE) vía Route Handler verifica Origin/Referer contra el origen configurado del despliegue y se rechaza (403) si falta o no coincide en una ruta no pública de solo lectura; las Server Actions usan la protección de origen nativa de Next.js sin token adicional, salvo que se desactive explícitamente esa protección (en cuyo caso se exige token CSRF manual); ninguna mutación se expone vía GET | Origen externo, Origin ausente en ruta mutadora, formulario cross-site y GET mutador: todos rechazados; no asumir protección automática sin la verificación explícita anterior |
| XSS/inyección | Zod con límites, render texto escapado, CSP compatible Next.js, SQL parametrizado | HTML/script, SQL hostil, enlaces javascript y errores con contenido del usuario |
| Abuso y costos | Límites por IP/identidad/tenant, cuotas atómicas y concurrencia compartida, 429 sin llamadas proveedor | Paralelismo y múltiples instancias no superan presupuesto; login/imports no agotan memoria |
| Archivos hostiles | CSV/XLSX únicamente; firma/extensión, tamaño y expansión limitados; parser sin macros, fórmulas, ejecución ni fetch externo; staging privado temporal; biblioteca de parsing con historial de seguridad mantenido, sujeta al mismo proceso de supply chain (lockfile, escaneo de dependencias); evaluación de escáner de malware gestionado registrada en LF-007 como aceptada o implementada, no omitida en silencio | Zip bomb, XLSM renombrado, fórmula, external links, filas enormes, archivo de otro tenant, descarga expirada |
| Prompt injection | Texto no confiable delimitado, instrucciones fijas, datos mínimos, sin herramientas; salida con esquema y render seguro; toda salida de IA se etiqueta como generada por IA de forma no evitable por el usuario y pasa por un filtro mínimo de formato/longitud (Zod) más una lista de bloqueo básica de contenido claramente inapropiado, sin moderación semántica completa en el MVP (limitación documentada, no omitida) | Conversación pide revelar secretos, datos ajenos, cambiar rol, enviar mensajes o devolver HTML; ninguna acción privilegiada ocurre; salida de IA nunca se envía a terceros automáticamente y siempre se muestra con el aviso de origen |
| Secretos y errores | Variables seguras, server-only, redacción logs, mensajes genéricos y requestId | Bundle/logs/errores no contienen claves, cookies, conversaciones ni stack; jamás registrar environment completo |
| Supply chain/CI | Lockfile congelado, versiones fijadas, revisión de actualizaciones/licencias, escaneo dependencias/secrets; permisos mínimos y actions por SHA | PR externo no obtiene secretos ni ejecuta job privilegiado; fallo crítico bloquea release hasta decisión documentada |
| Auditoría manipulada | Append-only runtime, escritura transaccional, acceso owner/admin y metadatos permitidos; ante solicitud de borrado, el actor se reemplaza por un identificador seudonimizado (ver DATA_MODEL.md) como mitigación técnica, pendiente de validación legal (D-006), no declarada como solución irreversible ni legalmente suficiente por sí sola | Mutación sensible sin auditoría revierte; vendedor no lee ni modifica auditoría; tras seudonimizar un actor, el conteo e integridad referencial de auditoría se conservan pero no permiten reconstruir la identidad original por medios de la aplicación |

## Matriz de autorización propuesta
| Capacidad | Owner | Admin | Sales |
|---|---|---|---|
| Prospectos, interacciones, seguimientos e IA dentro del tenant | Sí | Sí | Sí |
| Importar | Sí | Sí | No |
| Configurar etapas, miembros no owner y ver auditoría | Sí | Sí | No |
| Transferir propiedad, eliminar organización, configurar cuotas | Sí | No | No |

MVP propone visibilidad comercial compartida dentro de organización; asignación indica responsabilidad, no ACL privada. Esta decisión necesita aprobación D-002. Prohibir autoescalada y asignaciones a miembros inactivos. Auditoría para cambios de rol, invitaciones, transferencia, importación, eliminación y uso IA (metadatos).

## Límites iniciales propuestos
Archivo 5 MiB, máximo 5 000 filas, 50 columnas, 10 000 caracteres/celda y 25 MiB descomprimidos. Preview sin persistir original indefinidamente; retención staging 24 h. Texto IA 20 000 caracteres, salida 2 000 tokens, timeout 30 s, una operación concurrente por usuario y dos por tenant. Login 5 intentos/min por identidad e IP, IA 10/min por tenant, importación una activa por tenant. Ajustar con medición y D-004; usar almacén compartido/DB para límites que protegen gasto, nunca solo memoria serverless. IP tras proxy solo de cabeceras de proxies confiables.

La retención de 24 h de staging es un objetivo con mecanismo verificable, no una promesa absoluta sin respaldo (D-005bis): (1) toda lectura de datos de importación con `expires_at` vencido se deniega a nivel de autorización, sin excepción, independientemente de si la purga física ya ocurrió; (2) la purga física corre mediante un workflow programado, con alerta si se retrasa más allá del umbral acordado. Sin ambas capas y su monitoreo, no se declara cumplida la retención de 24 h.

IA no dispone de secretos de aplicación en prompts, contexto de otros tenants ni herramientas de envío. Prompt injection no se resuelve solo con un system prompt. Salida Zod, política de contenidos apropiada al uso, revisión humana y acceso limitado reducen impacto. Verificar condiciones de retención, ubicación y tratamiento de PII del proveedor antes de datos reales. No guardar conversaciones por defecto en trazas ni fixtures.

## Condiciones para producción
Revisión de permisos y RLS con PostgreSQL real, restauración ensayada, escaneo de secretos, revisión de proveedor y política de privacidad/retención aprobada. Cifrado en tránsito y almacenamiento mediante proveedor elegido; sin afirmar cumplimiento regulatorio no evaluado. Eliminación, acceso/portabilidad y respuesta a incidentes requieren responsable y jurisdicción D-006.
