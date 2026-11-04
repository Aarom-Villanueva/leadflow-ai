# LF-012 — AUTOPILOT: preparación de activación sin conectar agentes

**Estado:** propuesta para revisión. **No autoriza ni activa LF-001d.**
**Base:** merge PR #7 en `main` `047e6d27396564ebdd57d68d859fe30b81de62ea`.
**Alcance autorizado:** evaluar opciones, documentar requisitos, controles y criterios para una eventual prueba de **una** tarea, sin facturación ni servicios pagados.

## 1. Situación comprobable

- LF-001b definió el diseño; LF-001c añadió un simulador sin efectos; LF-011 endureció las entradas malformadas con 55 pruebas de coordinación aprobadas en CI al momento del merge.
- `scripts/autopilot/simulate.mjs` **no** puede ejecutar Codex o Claude, autenticar aprobaciones ni comprobar merges reales. Sus resultados `would_admit` son solo sintéticos.
- `docs/autopilot/BACKLOG.json` mantiene `execution_enabled=false`. Su entrada LF-001a permanece `in_progress` aunque ya está fusionada; **esto es deuda de sincronización de estado**, no permiso para despachar LF-002a. Antes de conectar ejecutores se requerirá reconciliar backlog, spec, evidencia Git y HANDOFF en un PR independiente y revisado.
- La capa de ejecución no está instalada ni habilitada. Este documento no debe interpretarse como un pipeline autónomo en funcionamiento.

## 2. Diseño de primera integración futura: dos caminos, sin seleccionar

| Alternativa | Ventajas | Límites y condiciones de adopción |
|---|---|---|
| A. GitHub Actions con `openai/codex-action` para una sola tarea pequeña | Reproduce CI y resultados visibles en PR | Requiere credencial oficial admitida, evaluación del costo API/uso, límites de Actions, permisos mínimos, actions pinneadas a SHA inmutable, validación de trusted inputs y autorización nueva del propietario. |
| B. GitHub Actions con `anthropics/claude-code-action` | Proporciona ruta de revisión o implementación según configuración oficial | Las **mismas** condiciones A: pin a SHA, credencial aprobada, costos de proveedor y Actions, validación de permisos. |
| C. Revisión/ejecución manual desde las herramientas Cloud ya utilizadas | Sin instalar dispatcher ni entregar nuevas credenciales GitHub | **No es AUTOPILOT desatendido**; el usuario sigue iniciando sesiones y podría depender de límites de suscripción. No convertir cookies/tokens de sesiones personales en secrets. |

**Decisión pendiente:** la existencia de ChatGPT Plus o Claude Pro no implica API incluida. No se ha autorizado una API, modalidad de autenticación, plan, token, servicio ni presupuesto. Si no existe un camino oficialmente admitido sin costo adicional y con permisos apropiados, **mantener ejecución apagada**.

## 3. Puertas que debe pasar LF-001d ANTES de ejecutarse

### G1. Autoridad demostrable
- La aprobación no puede venir del propio PR, de la IA, de un issue, etiqueta o comentario de tercero. Exigir aprobación explícita del propietario y registro inmutable/verificable fuera del material no confiable.
- La lista de tareas y directorios autorizados debe coincidir con una spec existente y aprobada, ROADMAP, HANDOFF y commits conocidos.
- No usar `approval_id:SIM-...` del simulador como aprobación real.

### G2. Credenciales y permisos
- Elegir **un** proveedor/acción oficial, verificar su mecanismo de autenticación y el alcance exacto de repositorios y tokens.
- GitHub Actions: usar `contents: read` para checks y separación estricta entre checkout de código no confiable y cualquier job con credenciales. Solo el componente indispensable puede crear rama/PR; nunca otorgar administración de rulesets o merge de `main`.
- Pin por SHA inmutable tanto `openai/codex-action` como `anthropics/claude-code-action` **antes de usar cualquiera**. Revisar cadena de dependencias y permisos. No usar `pull_request_target` con código de un fork ni disparos por comentarios externos.
- Sin credenciales en commits, documentación, outputs de Actions o logs. Rotación/revocación documentadas.

### G3. Límites externos y costos
- Identificar costo de **API**, minutos/concurrencia de **GitHub Actions** y otras tarifas separadamente; anotar fuente, fecha y condiciones verificadas al momento de activación.
- Sin presupuesto aprobado, el techo es **S/ 0 / USD 0 de gasto autorizado**, y no debe iniciarse una ejecución susceptible de facturar.
- Para una prueba posterior con gastos potenciales se exige monto máximo **por ejecución y por período**, moneda, quién controla el saldo, timeout, límite de tokens, límite de intentos y un freno externo del proveedor cuando exista.
- Los límites de código no garantizan corte inmediato de facturación. Ante incertidumbre de costos o uso: bloquear.

### G4. Resistencia a fallos
- Simular antes de habilitar: rechazo por spec ausente, hash cambiado, base SHA obsoleto, dependencia pendiente, permiso desconocido, lease duplicado, presupuesto nulo, credencial ausente, actor incorrecto, conflicto de archivos, timeout, consumo desconocido y prompt injection.
- El contrato de `done` exige merge comprobado contra GitHub protegido; `git_verified:true` proporcionado por el mismo agente **no es evidencia**.
- Operaciones idempotentes, con una tarea pequeña y máximo un agente en la prueba inicial. La posibilidad de un segundo agente o retries se aprueba por separado.
- Comando/procedimiento de PAUSA: deshabilitar trigger, cancelar runs, revocar credenciales, conservar logs y registrar estado seguro. Probarlo con un mecanismo sin secretos.

### G5. Gobierno y revisión
- Trabajar en rama aislada y PR; las verificaciones `Coordination gate` / `Foundation verification` siguen obligatorias en `main`.
- Una segunda IA revisa el SHA **exacto** y los logs; el propietario aprueba el merge. No auto-merge.
- No desplegar, tocar datos reales, configurar facturación de producto ni iniciar LF-002 automáticamente.

## 4. Ensayo sin costo que sí se puede hacer sin más permisos

1. Ejecutar `node scripts/autopilot/plan.mjs` y `node scripts/autopilot/simulate.mjs docs/autopilot/fixtures/denied.json` localmente o por workflow manual existente, sabiendo que una ejecución en GitHub Actions puede consumir cuota de minutos del plan.
2. Revisar `node --test tests/coordination/*.test.mjs`; verificar negativas de M1, lease `null` y no efectos externos.
3. Comprobar con `git` o GitHub API la trazabilidad de commits y el ruleset; no copiar una aserción de test `git_verified:true` como prueba.
4. Preparar en una spec futura el **contrato de un adapter falso** (sin red) con `dispatch(task)` bloqueado por defecto, sin APIs ni nuevos permisos, si se decide implementar esa etapa.

**Ninguno de esos pasos inicia agentes reales.** Las simulaciones siguen siendo simulaciones. Tampoco se ejecutarán automáticamente por este documento.

## 5. Hitos posteriores y criterios de aprobación

| Hito | Entrega | Estado |
|---|---|---|
| LF-012 | Este plan de puertas, riesgos y decisiones | En revisión |
| LF-001d0 (futuro ID sujeto a registro y coordinación) | Adapter falso, invariantes y auditoría de costos en dry-run, sin credenciales | No autorizado todavía |
| LF-001d | **Una** ejecución real acotada mediante integración oficial, si el propietario aprueba el proveedor, permisos y presupuesto | **No autorizado** |
| LF-001e | Revisión cruzada y continuidad acotada con dos agentes | **No autorizado** |

No crear ni registrar una nueva tarea con ID no validado por los scripts actuales; la numeración definitiva de futuros hitos se establecerá antes de implementarlos.

## 6. Decisiones que hay que pedir al propietario, no suponer

- ¿Se prefiere empezar con Codex o con Claude en una futura prueba real? Esto es una elección de diseño; todavía no se pide activar.
- ¿Hay disposición a usar una API con costo variable? Si no, permanecer en simulación o modalidad manual; **no asumir que Plus/Pro incluyen API**.
- ¿Qué gasto máximo autorizado, si alguno, por corrida y por mes? Sin respuesta: **0**.
- ¿Qué nivel de acceso a GitHub puede tener un futuro ejecutor? Por defecto, lectura; escritura solo con aprobación y separación técnica.
- ¿Se conserva aprobación humana de todos los merges, incluidos tests? **Sí** en el diseño actual, salvo autorización explícita futura que no se presume.

## 7. Señal de listo para solicitar autorización real

Solo cuando exista una propuesta revisada que identifique proveedor oficial, credencial/custodia, permisos exactos, límites monetarios y de GitHub Actions, prueba de pausa, test de fallo cerrado, una tarea segura con spec y archivos permitidos, y revisión independiente de SHA. **Este LF-012 no satisface ni sustituye la autorización de ejecutar.**

## Referencias de diseño existentes

- `docs/autopilot/PHASE-2-DESIGN.md`
- `AUTOPILOT.md`
- `docs/specs/LF-001c.md`
- `docs/specs/LF-011.md`
- `docs/DECISIONS.md`
