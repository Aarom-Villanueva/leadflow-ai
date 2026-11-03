# LeadFlow AI

SaaS de gestión comercial con asistencia de IA y aprobación humana. Busca servir como portafolio de ingeniería profesional y evolucionar hacia uso comercial real.

Estado: **LF-000 integrada, D-001 aprobada y LF-001 en revisión (PR #3)**. Existe una base Next.js ejecutable; las capacidades comerciales siguen fuera de esta entrega.

## Guía de lectura
- [Producto](docs/PRODUCT.md) y [requisitos](docs/PRD.md).
- [Arquitectura](docs/ARCHITECTURE.md), [datos](docs/DATA_MODEL.md) y [seguridad](docs/SECURITY.md).
- [Calidad y operación](docs/QUALITY.md), [roadmap](docs/ROADMAP.md) y [decisiones](docs/DECISIONS.md).
- [LF-001](docs/specs/LF-001.md): base técnica futura, bloqueada por aprobación del diseño.
- [LF-002a](docs/specs/LF-002a.md): spike de validación Better Auth + membresías + RLS, bloqueante para el resto de LF-002.
- [Reglas comunes](AGENTS.md) y [handoff](docs/HANDOFF.md).

D-001 autoriza desarrollo y CI sin producción ni costos externos. No ejecutar migraciones ni crear servicios. LF-001 requiere revisión del candidato y sus checks antes de integración.

## Desarrollo local (LF-001)

Requisitos verificados: Node **24.19.0**, npm **11.9.0**. `.nvmrc`, `engines`, versiones directas exactas y `package-lock.json` fijan la base. Si usas nvm, ejecuta `nvm use`. No se requiere DB, proveedor IA ni credenciales.

```bash
npm ci
npm run dev
```

Abre el servidor local en el puerto 3000. `LOG_LEVEL` es opcional (`info`, `warn` o `error`); `.env.example` contiene el ejemplo no secreto. No agregues secretos al repositorio. Una configuración inválida impide cargar Next sin revelar su valor. `.npmrc` bloquea scripts de instalación de terceros; los scripts de proyecto siguen siendo explícitos y la instalación/build se verifican con esta política.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx --no-install playwright install --with-deps chromium
npm run test:e2e
```

`npm test` incluye Vitest y las pruebas de coordinación con repositorios Git temporales. `npm run test:coordination` las ejecuta de forma aislada. `npm run check` reúne lint, tipos, tests y build; E2E se ejecuta aparte sobre un build previo. `npm run start` arranca ese build en el puerto 3000. E2E arranca y detiene su propio servidor en el puerto 3100, que debe estar libre.

En este Cloud el sandbox puede requerir autorización para puertos locales y acceso al proxy. Si la política bloquea `cdn.playwright.dev`, no desactives TLS ni el proxy: solicita habilitar el destino o prueba explícitamente con el Chromium instalado:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Ese fallback comprueba el navegador del sistema, no el navegador exacto de Playwright. La suite prueba home, móvil, teclado, health, 404, cabeceras y accesibilidad con axe-core; no certifica WCAG completa ni todos los navegadores.

## Coordinación y CI

Antes de trabajar, lee AGENTS.md, registra tarea/rama/reservas en HANDOFF y rutas explícitas en la columna Archivos previstos de ROADMAP. Para validar un candidato ya confirmado en Git:

```bash
npm run check:coordination -- --base <SHA40-de-main> --head <SHA40-del-candidato> --branch integration/lf-001-foundation
```

CI ejecuta `Coordination gate` en todos los PR contra main. Verifica alcance y reservas de otras tareas (base y head). Los PR de solo Markdown/LICENSE evitan instalación, build y browser; el gate ligero permanece activo para que un check requerido no quede pendiente. No hay runs duplicados por push a ramas de documentación. Un administrador debe exigir el gate y las verificaciones apropiadas en las reglas de main; el workflow por sí solo no configura esas reglas.

## Límites de esta entrega

La aplicación todavía no implementa CRM, autenticación, aislamiento de tenants, DB ni IA. `/api/health` es liveness local: no mide disponibilidad de servicios externos. Hosting, presupuesto y producción siguen pendientes; Better Auth/Drizzle requieren LF-002a antes del esquema de negocio.

Consulta [la revisión LF-001](docs/LF-001-REVIEW.md) para resultados, versiones Actions, CSP y riesgo residual de dependencias. La CSP actual restringe orígenes, framing y objetos, pero permite inline para la hidratación estática de Next; no debe presentarse como una defensa completa contra XSS. No se configura HSTS hasta acordar HTTPS y hosting.
