# LF-001 — Revisión final y evidencia

Fecha: 2026-11-03 (America/Lima). Responsable: Codex. Revisor independiente: Claude Code. PR #3, rama `integration/lf-001-foundation`; no merge ni despliegue autorizados en esta entrega.

## Base y cambios

Se verificó que `refs/pull/3/head` coincidía con la rama de integración en `754fa06448ec93ab30323d5a8e36bc5b1d88e0dc`. Se incorporó main `9c6971b` con merge `e1c3a5b`, sin conflictos. Las especificaciones y correcciones aprobadas de LF-000 se preservaron. Se actualizan solo coordinación, instrucciones y evidencia dentro del alcance de LF-001.

- Control Node sin dependencias adicionales: alcance explícito de ROADMAP y reservas JSON en HANDOFF; compara reservas de base y head. Falla ante conflicto, alcance inválido, rama no registrada o formato incorrecto. El paso de CLI usa SHA completos y argumentos de execFile, sin ejecutar texto de ramas en shell.
- CI solo para PR a main, sin duplicar push; gate ligero siempre, aplicación solo si hay archivos no documentales. Caso docs-only probado, sin usar paths-ignore que dejaría checks requeridos pendientes.
- README con comandos reproducibles, puertos, variables, política de instalación y límites reales.
- Actions checkout/setup-node v6 verificadas por tags remotos y action.yml oficial (`using: node24`), fijadas por SHA. En ubuntu-24.04 administrado; los runners self-hosted necesitan los mínimos documentados por esas acciones antes de adoptarlas. No se emplean runners self-hosted en este proyecto.
- CSP de producción y Permissions-Policy; prueba de cabeceras en HTML y health. Sin unsafe-eval en producción. Inline permanece permitido para hidratación estática de Next y estilos; limita la defensa XSS. Una CSP estricta con nonces exige revisar el costo de renderizado dinámico; no se introduce esa complejidad ahora. Sin HSTS hasta definir HTTPS/hosting. Dev permite eval para tooling; no reutilizar esa política en producción.
- axe-core vía `@axe-core/playwright` 4.14.0 (Node >=22.12): comprobación WCAG A/AA desktop/móvil, adicional a teclado y viewport. No sustituye lector de pantalla/revisión manual ni certifica conformidad total.

## Pruebas realmente ejecutadas

| Comando | Resultado local |
|---|---|
| npm ci --no-fund --fetch-retries=0 --fetch-timeout=20000 | exit 0; 396 paquetes |
| npm run lint | exit 0; sin warnings |
| npm run typecheck | exit 0 |
| npm test | exit 0; 9 Vitest + 9 coordinación |
| npm run build | exit 0; home/404 estáticos, health dinámico |
| npm run test (después del build) | exit 0; 9 Vitest + 9 coordinación |
| npm run test:coordination | exit 0; 9 casos, incluidos CLI positivo/negativo contra Git real temporal |
| npm run test:e2e | exit 0; 6 pruebas, incluye cabeceras y axe en 1280/375px |
| npm ls --all | exit 0; sin peers obligatorios inválidos |
| npm audit --json | exit 1; 16 moderadas, 0 altas, 0 críticas |

Toolchain: Node 24.19.0 / npm 11.9.0; Next 16.4.4, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.4, Zod 4.6.7, Vitest 5.1.0, Playwright 1.64.1. Smoke/E2E usó `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` (Chromium 154.0.8037.57); no se afirma haber probado el navegador exacto de Playwright 156.0.8078.4. Su descarga está bloqueada por la política de `cdn.playwright.dev` en este Cloud. CI instala la versión estándar con TLS, sin ese override.

Pruebas de coordinación: positivo propio, conflicto ajeno, intento de liberar reserva solo en head, reserva completada, fuera de ROADMAP, sin reserva propia, rama desconocida, duplicados/rutas inválidas, docs-only/mixed, registro ausente/malformado y CLI real con exit 0/1. Son nueve casos agrupados. No cambia permisos Git ni impide pushes. Para bloquear merge realmente debe configurarse `Coordination gate` como requerido en las reglas de main; esa configuración no se presupone por existir un workflow.

## Investigación de vulnerabilidades y ESLint

El reporte de npm contabiliza **16 nodos afectados por una vulnerabilidad raíz**, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249): amplificación de globparts en minimatch <11.0.1 (denegación de servicio). Instalados: minimatch 3.1.5 y 10.2.6. Se verificó en package-lock que todos los nodos reportados son `dev: true`; no es una prueba general de ausencia de vulnerabilidades runtime.

Cadena afectada: minimatch → ESLint/config-array/eslintrc, plugins import/react/jsx-a11y y typescript-eslint → eslint-config-next y @next/eslint-plugin-next. El conteo no implica 16 fallas independientes.

ESLint actual 9.39.5 tiene aviso de fin de soporte. Se consultó ESLint latest 10.14.0: eslint-plugin-import aún declara hasta ^9 y eslint-plugin-react hasta ^9.7. Se conserva 9.39.5 para no romper compatibilidad ni ignorar peers. No se usó audit fix --force, legacy-peer-deps, overrides de major ni se suprimió la auditoría. Las remediaciones sugeridas (ESLint 4 / eslint-config-next 12) degradan contratos y no son aceptables para Next 16.

Riesgo residual: consumo de CPU en herramientas de lint al procesar patrones hostiles, incluidos PR de colaboradores no confiables; no se considera inocuo por ser dev-only. Mitigación limitada: jobs efímeros, timeout 5/15 minutos, cancelación de runs previos, permisos contents:read, checkout sin credenciales persistidas y sin secretos. El gate usa matchesGlob de Node y no agrega minimatch npm. La revisión de cambios a tooling y los límites de CI reducen impacto, no reparan minimatch.

Seguimiento: revisar versiones upstream compatibles antes de actualizar lint, repetir instalación/peers/lint/tipos/tests/build/E2E y audit; responsable de mantenimiento propietario/Codex bajo tarea autorizada. Reevaluar antes del piloto. El riesgo se documenta para aprobación del revisor/propietario; no se presenta como aceptado automáticamente ni como cadena de suministro saneada.

## Límites de aceptación

Hosting final sigue diferido explícitamente por D-001; esta fase prueba Node/build local. No se contrataron ni se evaluaron como definitivos recursos de producción. Better Auth/Drizzle/PostgreSQL y pooling/RLS se validarán mediante LF-002a; no se afirma compatibilidad todavía.

La evidencia local es positiva. Publicación final, resultado de Actions y protección de rama se anotarán en el handoff de cierre; no se afirma un check remoto aprobado antes de observarlo. El cierre completo requiere revisión del candidato y confirmación de los gates remotos. No continuar LF-002 ni otro módulo hasta configurar el orquestador y recibir autorización.
