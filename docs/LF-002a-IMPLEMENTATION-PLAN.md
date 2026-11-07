# LF-002a — Plan concreto de validación de identidad y aislamiento

**Estado:** propuesta preparada por LF-022; no implementada ni ejecutada.
**Base:** `0b0110969493a9e74b618f20540d280fc21d7993`.
**Contrato vigente:** [LF-002a](specs/LF-002a.md). Preparación documental: [LF-022](specs/LF-022.md).

## 1. Resultado que debe entregar el spike

Un laboratorio descartable que ejecute Better Auth y su adaptador Drizzle sobre PostgreSQL real con identidades, sesiones y dos organizaciones sintéticas. Debe demostrar qué consultas del adaptador comparten conexión/transacción con el contexto de tenant y cuáles son globales de identidad, sin atribuir automáticamente RLS a tablas sin tenant. Antes de abrir LF-002, entregar evidencia reproducible y una recomendación para D-002, nunca aprobarla unilateralmente.

No es una pantalla de login ni la implementación de organizaciones comerciales. No requiere terminar AUTOPILOT, construir el sandbox del ejecutor ni invocar otro agente: un desarrollador puede realizarlo por encargo manual y revisión independiente, después de autorizar su entorno de pruebas.

## 2. Lo comprobado en esta preparación y lo que falta

- El repositorio aún no declara Better Auth, Drizzle ni un cliente PostgreSQL en package.json. No se instalaron paquetes ni se eligieron versiones a ciegas.
- En el Windows de esta sesión no se encontraron `psql`, `postgres` ni `pg_ctl` mediante búsqueda de comandos en PATH. Eso no prueba que no estén instalados en otra ubicación.
- Se encontró el ejecutable de Docker; no se consultó ni arrancó su daemon, no se descargaron imágenes ni se creó un contenedor. Su disponibilidad para este ensayo sigue sin comprobarse.
- Node 24.22.1 está disponible como runtime local; `.nvmrc` fija 24.19.0 para CI. La base existente y sus controles ya tienen pruebas; ninguna prueba de este laboratorio existe todavía.
- No se inspeccionaron valores de variables sensibles, conexiones guardadas ni credenciales. No se supone disponible ninguna base de datos del usuario.

## 3. Laboratorio futuro y límites de datos

Elegir explícitamente entre PostgreSQL local ya disponible y una instancia local efímera en contenedor, después de una inspección y autorización propias. No crear ni conectar una base remota. Si falta una herramienta, presentar la instalación exacta y sus efectos antes de realizarla.

La base será nueva, identificada de forma inequívoca como descartable del spike y accesible solo por loopback o socket local. El runner debe verificar el destino antes de DDL/limpieza; una conexión arbitraria suministrada por entorno nunca autoriza borrar una base. No usar credenciales productivas ni registrar URLs, contraseñas, cookies, tokens o el entorno completo. Cualquier secreto interno que exija Better Auth o autenticación local de PostgreSQL será efímero, de prueba y generado solo tras autorizar expresamente esa preparación; no se solicita una clave del propietario ni se guarda en Git.

Roles separados: provisionador limitado al laboratorio para DDL, y runtime no superusuario, sin BYPASSRLS, sin propiedad de las tablas ni pertenencia a roles que permitan evadir el control. Verificar atributos, propietario, grants y políticas desde la base antes de los casos negativos. El runtime no recibe TRUNCATE, DDL ni elevación a roles privilegiados. No basta que una variable diga `runtime`.

Tablas permitidas: las de identidad que requiera la versión fijada de Better Auth y, solo dentro del laboratorio, `probe_memberships` y `tenant_probe`. La primera contiene membresías/roles sintéticos para probar la recomendación de fuente única; la segunda contiene filas de ensayo de A/B con RLS. No se crean `organizations`, `memberships`, `leads`, `pipelines` ni migraciones de producción. Los identificadores de tenant pueden ser fixtures sin una tabla comercial de organizaciones. La futura spec debe detallar las columnas y SQL antes de aplicarlo.

## 4. Contrato propuesto del contexto y del adaptador

El harness deriva actor y tenant desde sesión y membresía sintéticas válidas; el tenant enviado por un cliente es una selección que debe autorizarse, nunca una prueba de pertenencia. La operación tenant se ejecuta con una transacción explícita y contexto transaction-local parametrizado en **la misma conexión** que las consultas protegidas. Sin contexto válido se deniega lectura/escritura; la política cubre USING y WITH CHECK, y el runtime no puede desactivarla.

Un pool con máximo una conexión fuerza la reutilización en los casos secuenciales, registrando un identificador de backend y transacción sin datos sensibles. Con otro tamaño de pool se comprueba concurrencia A/B. El harness no usa SET de sesión como sustituto de SET LOCAL ni conserva contexto entre solicitudes. RLS es defensa frente a omisión de filtros: no demuestra seguridad frente a un runtime comprometido que pueda fijar otro contexto; la autorización de membresía es obligatoria antes de fijarlo.

Instrumentar las operaciones reales del adaptador elegido para registrar nombre de operación, conexión/transacción y clasificación global/tenant, sin valores de parámetros ni material de sesión. Si una consulta de identidad se ejecuta fuera de la transacción tenant, identificarla y justificar que no toca datos tenant. Si un hook toca membresías o la tabla de prueba, demostrar que no evade el wrapper autorizado. Si la integración no ofrece la garantía requerida, registrar el fallo y proponer una alternativa; no parchear una afirmación de éxito sobre mocks.

## 5. Matriz de pruebas futuras (ninguna ejecutada en LF-022)

| ID | Caso sobre PostgreSQL/Better Auth reales | Evidencia y resultado esperado |
|---|---|---|
| P01 | Preflight del rol y esquema | Runtime no propietario/superusuario/BYPASSRLS; políticas y permisos efectivos correctos. Un preflight fallido impide aprobar la suite. |
| P02 | Control positivo A y B | Cada contexto autorizado lee sus filas y puede escribir en su tenant; evita aprobar una base que simplemente deniegue todo. |
| P03 | A lee filas de B por ID y listado, y viceversa | Cero filas ajenas; evidencia independiente por dirección y operación. |
| P04 | INSERT con tenant ajeno | WITH CHECK impide persistir; conteo final desde el provisionador confirma ausencia del cambio. |
| P05 | UPDATE/DELETE de fila ajena y cambio de organization_id | Sin alteración ajena ni movimiento entre tenants; comprobar estado persistido, no solo el código de error. |
| P06 | Contexto ausente, vacío y malformado | Sin lectura/escritura; error sanitizado o cero filas según contrato, nunca acceso por defecto. |
| P07 | Pool de una conexión: A → sin contexto → B → sin contexto | Mismo backend confirmado; tras COMMIT no queda contexto del tenant anterior. |
| P08 | Error/ROLLBACK en A seguido de B y sin contexto | No fuga de contexto ni escritura parcial; comprobar reutilización real del backend. |
| P09 | Concurrencia A/B con varias conexiones | Ninguna respuesta contiene filas ajenas y ninguna escritura cruza tenant; no sustituir por llamadas secuenciales. |
| P10 | Sesión válida, inválida, expirada y revocada | Solo la sesión vigente alcanza la autorización de tenant; no divulgar tokens en evidencia. |
| P11 | Sesión válida de usuario sin membresía o con membresía revocada | No fija contexto ni accede a tenant_probe, incluso reutilizando una selección anterior. |
| P12 | Selección de tenant ajeno desde un cliente | Rechazo antes de consultar datos tenant; usuario multimiembro sí puede elegir cada tenant permitido. |
| P13 | Trazas de signup/signin/get-session y verificación/revocación disponibles | Clasificar cada consulta real global/tenant y su transacción; determinar si el adaptador comparte el wrapper. Sin correo real ni OAuth externo. |
| P14 | Ruta/hook que toca probe_memberships | Contexto y autorización explícitos, fuente única de rol; si el hook no existe en la versión elegida, documentarlo y probar la ruta alternativa, no inventarlo. |
| P15 | Control negativo del propio ensayo | Demostrar que una configuración deliberadamente insegura del fixture descartable es detectada por el preflight; nunca desactivar políticas de otra base. |
| P16 | Limpieza y repetición completa | Solo se elimina el laboratorio previamente identificado; repetición limpia produce resultados trazables sin tocar bases ajenas. |

No se cierra el spike con tests de SQL aislados si P10–P14 siguen sin pasar por Better Auth real. Tampoco se infiere que identidad global necesita RLS tenant: separar la protección de sesión de la autorización de datos del CRM.

## 6. Archivos candidatos de implementación (no creados ni reservados por LF-022)

| Ruta exacta propuesta | Función futura |
|---|---|
| `docs/specs/LF-002a.md` | Alcance de implementación aprobado y criterios detallados, sin cerrar D-002 anticipadamente. |
| `docs/LF-002a-RESULTS.md` | Versiones, matriz ejecutada/fallida/omitida, trazas sanitizadas, SHA y recomendación. |
| `docs/HANDOFF.md`, `docs/ROADMAP.md` | Reserva y evidencia del incremento ejecutable. |
| `package.json`, `package-lock.json` | Versiones exactas autorizadas de Better Auth/adaptador, Drizzle y cliente PostgreSQL; comando explícito de integración. |
| `vitest.lf-002a.config.ts` | Configuración separada del laboratorio, sin conectar DB al importar la suite ordinaria. |
| `tests/integration/lf-002a/schema.sql` | DDL revisado de identidad y tablas probe en el laboratorio, separado de migraciones de producción. |
| `tests/integration/lf-002a/fixtures.ts` | Dos tenants y usuarios completamente sintéticos. |
| `tests/integration/lf-002a/database.ts` | Pool, preflight, instrumentación y destino descartable. |
| `tests/integration/lf-002a/auth.ts` | Configuración e instrumentación de Better Auth sin proveedores externos. |
| `tests/integration/lf-002a/tenant-context.ts` | Wrapper de sesión/membresía/transacción/contexto. |
| `tests/integration/lf-002a/isolation.test.ts` | Casos negativos RLS y reutilización de pool, escritos antes del soporte. |
| `tests/integration/lf-002a/auth-boundary.test.ts` | Sesiones y trazas del adaptador, sin mocks que sustituyan sus consultas. |
| `tests/integration/lf-002a/lifecycle.test.ts` | Destino descartable, limpieza y repetición segura. |

Es una propuesta de rutas, no una reserva ejecutable ni permiso de editarlas ahora. Si el esquema real de la versión fijada requiere archivos adicionales, actualizar spec/reserva y revisar el cambio antes de crearlos. No se añaden SDKs IA ni módulos de negocio, workflows, Dockerfiles o configuración operativa en este incremento preparatorio.

## 7. Orden del incremento ejecutable y evidencias

1. Revisar LF-022, confirmar entorno local, permisos, versiones exactas y material de prueba permitido. No instalar con `latest` ni usar un generador sin fijar versión.
2. Autorizar expresamente el alcance ejecutable y registrar una reserva nueva en una rama propia. LF-002a sigue blocked hasta la reconciliación de planificación autorizada; nunca cambiar BACKLOG para hacer pasar pruebas.
3. Escribir primero P03/P04/P07/P08 y controles positivos/preflight, y después el soporte mínimo. Ejecutar en PostgreSQL real; una DB ausente produce resultado bloqueado/exit no exitoso, no tests omitidos presentados como verdes.
4. Añadir y ejecutar la frontera real de Better Auth P10–P14 y el resto de la matriz. Registrar si las consultas del adaptador están dentro o fuera de la transacción, con justificación por tabla y ruta.
5. Ejecutar los checks ordinarios y el comando separado de integración. CI actual no proporciona PostgreSQL a este laboratorio: un Foundation verification verde no demostrará su integración DB. Si se necesita servicio DB en CI, proponer y autorizar un cambio de workflow independiente; hasta entonces adjuntar evidencia local real por SHA y declarar la cobertura que CI no ejecutó.
6. Entregar resultados y revisión independiente; propietario decide D-002. LF-002 y LF-003 no arrancan por aprobar esta preparación. La aprobación del spike no constituye un login funcional terminado.

## 8. Autorización pendiente concreta

La siguiente autorización debería permitir implementar únicamente este spike, instalar las dependencias exactas previamente revisadas y, en un entorno local elegido, crear una base descartable, roles de prueba y material de autenticación efímero sintético. Debe resolver si se usará PostgreSQL instalado o un contenedor disponible y autorizar cualquier instalación/descarga necesaria por separado. No incluye credenciales productivas, base remota, correo real, proveedores IA, pagos, despliegue ni agentes autónomos. Si estos medios no están autorizados o disponibles, mantener el bloqueo y reportar qué falta.

D-002 es precisamente la decisión que el spike debe informar; no es requisito aprobarla de antemano para investigar la recomendación. D-003 permanece pendiente para el login del producto; probar identidad local sintética no aprueba correo, invitaciones ni recuperación en producción.

## 9. Referencias primarias consultadas (2026-11-06)

- [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): alcance de USING/WITH CHECK, propietarios y BYPASSRLS; por eso el preflight forma parte del resultado.
- [PostgreSQL: SET](https://www.postgresql.org/docs/current/sql-set.html): duración transaction-local y efectos de COMMIT/ROLLBACK; fundamento de los casos de reutilización.
- [Better Auth: Drizzle ORM Adapter](https://better-auth.com/docs/adapters/drizzle): integración y esquema dependientes de la versión elegida. No prueba por sí sola que el adaptador comparta la transacción de la aplicación; eso debe medirse en el spike. Verificar de nuevo la documentación correspondiente a las versiones exactas antes de instalarlas.
