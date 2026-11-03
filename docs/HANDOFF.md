# Handoff versionado

## LF-000
- Responsable: Codex. Siguiente revisor: Claude Code (revisión independiente aún no ejecutada).
- Rama: codex/lf-000-architecture. Base local: 305e86463bc206e870c56c34435d3156673015db (Initial commit, solo LICENSE).
- Alcance reservado: AGENTS.md, CLAUDE.md, README.md y docs/** para propuesta LF-000. Sin aplicación, dependencias ni migraciones.
- Estado: documentos preparados para revisión; todas las decisiones D-001…D-007 pendientes del propietario.
- Acceso: git ls-remote origin refs/heads/main falló al conectar al proxy:8080. La coincidencia con main remoto no se pudo verificar. No se alteró main.
- Evidencia: consultar el commit LF-000 y el resultado de validación reportado en la entrega; pruebas de aplicación no aplican porque no existe código. No hay revisión de Claude ni despliegue realizado.
- Siguiente acción: Claude revisa consistencia, amenazas, datos, límites operativos y LF-001; registra hallazgos por severidad y archivo. Propietario resuelve decisiones; corregir documentación mediante PR antes de autorizar implementación.

## LF-000a (corrección documental tras revisión independiente)
- Responsable: Claude Code. Base: rama `codex/lf-000-architecture` (PR #1), commit `6a63227`. Rama de esta corrección: `claude/lf-000a-correcciones-documentales`.
- Alcance reservado: AGENTS.md, README.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/DECISIONS.md, docs/HANDOFF.md, docs/PRD.md, docs/PRODUCT.md, docs/QUALITY.md, docs/ROADMAP.md, docs/SECURITY.md, docs/specs/LF-001.md y el nuevo docs/specs/LF-002a.md. Sin aplicación, dependencias ni migraciones; no se tocó ningún archivo de alcance de LF-001 (package.json, src/**, CI).
- Corrige: C1 (spike LF-002a obligatorio antes de esquema de negocio), A1 (D-008 monetización diferida), A2 (purga de importaciones en dos capas, independiente de D-005), A3 (check de CI de coordinación como criterio de LF-001, manifiesto de hashes), A4 (seudonimización de auditoría sin declarar irreversibilidad ni suficiencia legal). Precisa M1 (regla CSRF concreta), M2 (propiedad de tablas transversales), M3 (evaluación de escaneo de archivos), M4 (axe-core para accesibilidad) y M5 (moderación mínima de salida de IA).
- Decisiones nuevas o actualizadas: D-002 (recomendación por defecto sujeta a LF-002a), D-005 (alcance acotado a jobs de negocio), D-005bis (nueva, purga por retención), D-006 (seudonimización como mitigación, no garantía legal), D-008 (nueva, monetización diferida).
- Pendiente de aprobación del propietario: ejecutar LF-002a antes de continuar LF-002; frecuencia del workflow de purga y umbral de alerta de D-005bis; recomendación por defecto de D-002; apertura futura de fase de facturación (D-008); validación legal de la seudonimización (D-006).
- Estado de publicación: commit creado en `claude/lf-000a-correcciones-documentales`; intento de push/PR documentado en el propio PR o en la respuesta de esta sesión. No se modificó `main` ni se fusionó el PR #1.
- Manifiesto de verificación: ver hashes SHA-256 de los archivos modificados en el mensaje de commit de esta corrección.

## Cómo continuar
Leer AGENTS.md y verificar git status y base SHA antes de editar. Registrar aquí nuevos responsables y reservas; para cada revisión indicar SHA exacto, hallazgos, pruebas ejecutadas/no ejecutadas, riesgos y siguiente paso. Incluir manifiesto de hashes SHA-256 de los archivos entregados y, cuando exista el check de CI de LF-001, si detectó o no conflicto. No interpretar este documento como lock automático ni como aprobación del diseño.
