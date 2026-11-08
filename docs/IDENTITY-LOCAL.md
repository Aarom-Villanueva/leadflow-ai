# Acceso y organizaciones — desarrollo local (LF-025)

Este incremento conecta `/register`, `/login`, `/organizations` y `/app/<id>` con PostgreSQL y Better Auth. `/design` conserva el prototipo; sus prospectos, métricas e IA no se convierten en datos reales al iniciar sesión.

## Configuración privada

Usar Node 24 y npm 11 fijados por el proyecto; `npm ci` no agrega versiones nuevas. Preparar una base nueva y exclusiva de desarrollo, distinta de postgres, plantillas y lf002a_spike. No usar bases con datos previos.

Un operador configura dos roles separados: provisionador LOGIN propietario de la base y runtime LOGIN sin pertenencia al provisionador. Ambos sin superusuario/BYPASSRLS/CREATEROLE/CREATEDB en su uso ordinario. El operador solo necesita privilegio administrativo para la creación inicial. El runtime recibe exclusivamente los grants de la migración y nunca escribe organizaciones/membresías/auditoría directamente.

Guardar privadamente en `.env.local` (gitignored): `DATABASE_URL` del runtime, `AUTH_SECRET` aleatorio privado de al menos 32 caracteres y `APP_ORIGIN=http://127.0.0.1:3000`. No hay valores secretos por defecto. No registrar esos valores en docs o terminales compartidos.

Ejecutar una sola vez desde la raíz, con `IDENTITY_MIGRATION_URL` del provisionador e `IDENTITY_RUNTIME_ROLE` configurados solo para ese proceso:

```sh
node scripts/identity/migrate.mjs
```

El runner acepta únicamente PostgreSQL local sin parámetros de consulta, rechaza bases de sistema, exige esquema público vacío y valida el runtime antes de DDL. Esquema y grants forman una sola transacción. Nunca se ejecuta automáticamente al arrancar la web.

Después, `npm run dev` carga `.env.local`. Sesión en cookie HttpOnly, SameSite=Lax y Secure bajo HTTPS; ningún token en localStorage. Organización seleccionada por URL y reautorizada en cada petición; el rol nunca procede del cliente.

## Pruebas reproducibles

`vitest.identity.config.ts` requiere `IDENTITY_TEST_ADMIN_URL` hacia una base vacía llamada exactamente `lf025_identity_test`, en loopback y dentro de un clúster descartable. No omite pruebas si falta: falla. Crea los roles fijos `lf025_test_owner` y `lf025_test_runtime`, ejecuta el runner real y prueba Better Auth/SQL reales. Un esquema o roles preexistentes hacen fallar el bootstrap, no se borran automáticamente.

```sh
npx --no-install vitest run --config vitest.identity.config.ts
```

El navegador se prueba después de la integración, en esa misma base descartable, con DATABASE_URL del runtime de pruebas, APP_ORIGIN=http://127.0.0.1:4310 y un AUTH_SECRET sintético efímero en el entorno. Ejecutar `npm run build` y:

```sh
npx --no-install playwright test --config playwright.identity.config.ts
```

El test levanta/termina la web, registra una cuenta sintética, crea su organización y comprueba recarga, cookie HttpOnly, redirección anónima, logout y nuevo login. Trazas deshabilitadas para no capturar tokens/contraseñas. En Windows se puede usar IDENTITY_BROWSER_CHANNEL=msedge; CI usa Chromium.

CI usa PostgreSQL 16 efímero con trust exclusivamente en el runner de pruebas, sin credenciales productivas; no es configuración de aplicación o producción. El contenedor termina con el job. La prueba local utilizó PostgreSQL 18 en otro clúster y puerto, sin tocar el servicio existente.

## Límites explícitos

- Recuperación, verificación e invitaciones por correo pendientes. No se requiere email verificado en desarrollo; no usar con datos reales.
- Gestión de roles, transferencia y eliminación de miembros pendientes. No hay ruta para degradar/eliminar al último owner.
- RLS protege lecturas con actor transaction-local. Bootstrap por función security definer mínima, provisioner-owned, search_path fijo y permisos restringidos. Sin FORCE para el propietario en estas tablas para permitir ese bootstrap; runtime no propietario siempre sujeto a RLS.
- El contexto SQL no prueba identidad por sí solo: lo establece el servidor tras validar sesión. No protege frente a credencial runtime totalmente comprometida.
- Límites persistidos por identidad, compartidos entre procesos. Política por IP/proxy y hardening final requieren revisión antes del piloto.
- Sin despliegue, datos reales, proveedores IA ni AUTOPILOT. No se declara completo LF-002.
