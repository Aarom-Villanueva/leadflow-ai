# Reglas compartidas de LeadFlow AI

## Alcance y autoridad
Leer este archivo, docs/PRODUCT.md, docs/PRD.md, docs/DECISIONS.md y la especificación de la tarea antes de editar. LF-000 autoriza exclusivamente documentación; la implementación requiere aprobación del propietario. Las propuestas pendientes no son requisitos aprobados. No instalar dependencias, ejecutar migraciones, desplegar ni generar costos externos sin autorización.

## Trabajo coordinado
- Usar el checkout aislado existente y una rama por tarea; nunca modificar main directamente. No crear worktrees salvo solicitud expresa.
- Codex y Claude comparten estas reglas; CLAUDE.md solo las referencia.
- Registrar responsable, rama, base SHA, alcance y archivos reservados en docs/HANDOFF.md antes de empezar. Evitar edición simultánea de los mismos archivos. Una reserva es coordinación documental, no un bloqueo técnico: comprobar PRs activos y acordar conflictos.
- Cambios de esquema, permisos, contratos API, errores o especificaciones compartidas requieren propuesta versionada, revisión del otro agente y aprobación del propietario antes de implementarse. Documentar compatibilidad y migración.
- PR contra main con identificador, objetivo, commit revisable, pruebas realmente ejecutadas y resultados, riesgos y pendientes. No integrar sin revisión independiente ni autoaprobarse. El propietario autoriza la integración.
- No exponer secretos ni datos personales en código, prompts, logs, fixtures o documentación. No ampliar alcance unilateralmente.

## Ejecución recuperable
Trabajar por incrementos verificables: especificación y criterios → pruebas de comportamiento cuando exista contrato → implementación mínima → validación → candidato de revisión. Ante interrupción, actualizar HANDOFF con último commit, cambios sin commit, comandos ejecutados, fallos, bloqueos y siguiente acción. No declarar pruebas exitosas si no se ejecutaron; distinguir omitidas, fallidas y aprobadas.

Cada tarea usa el formato de docs/ROADMAP.md. Si cambia el alcance, actualizar su especificación y dependencias antes de continuar. No corregir defectos ajenos ocultamente. Proteger cambios del usuario. No asumir acceso remoto por tener un checkout local.
