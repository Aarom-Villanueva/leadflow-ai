# Registro de decisiones

Estado inicial: ninguna selección técnica detallada está aprobada para implementación. La aprobación de alcance documental no aprueba stack, costos ni despliegue.

| ID | Propuesta / justificación | Alternativas y consecuencia | Estado / quién decide |
|---|---|---|---|
| D-001 | Monolito modular Next.js + TS, PostgreSQL/Drizzle, Tailwind/Zod; hosting Next compatible | SPA + API separada añade despliegues; microservicios sin necesidad demostrada. Elegir proveedor/región/versiones tras compatibilidad y recursos. | Pendiente: propietario tras revisión Claude; antes LF-001 |
| D-002 | Better Auth como identidad, sesiones y membresías; roles owner/admin/sales, datos comerciales compartidos dentro tenant; RLS + FKs compuestas | Membresías propias duplican riesgo si conviven con plugin. Confirmar una sola fuente y adaptación RLS mediante prueba LF-002. ACL por vendedor queda fuera salvo cambio aprobado. | Pendiente: propietario y revisor; contrato antes LF-002 |
| D-003 | Credenciales email/password con verificación, recuperación e invitaciones; recordatorio in-app | OAuth/correo externo requieren proveedor, credenciales y costo. Dev puede usar buzón local; no enviar correo real sin autorización. | Pendiente: propietario antes LF-002; sin proveedor no afirmar flujo de correo completo |
| D-004 | Límites de SECURITY, presupuesto duro tenant/global, duplicados como candidatos y sin fusión automática | Unicidad rígida impide contactos compartidos; límites muy altos elevan abuso. Fijar presupuesto monetario/modelo y país para teléfonos. | Pendiente: propietario antes imports/IA |
| D-005 | Imports acotados; jobs PostgreSQL solo si prueba de tiempo/memoria exige | Worker/broker externo incrementa operación; requests largos no fiables en todo hosting. Decidir ejecución con fixture límite antes de implementar. | Pendiente: propietario tras medición LF-001/LF-007 |
| D-006 | PII mínima, staging 24 h, sin prompts en logs; backups 30 días, RPO 1 h/RTO 4 h | Jurisdicción, residencia, base legal, retención comercial/auditoría y proveedor IA deben definirse para uso real. Objetivos no garantías. | Pendiente: propietario antes piloto con datos reales |
| D-007 | OpenAI inicial detrás de puerto; modelo por allowlist; sin herramientas ni envío | Otros proveedores posibles sin cambiar dominio; SDK/modelo exacto según disponibilidad/precio y políticas. | Pendiente: propietario antes LF-009 |

## Procedimiento
Cada decisión aprobada registra fecha, aprobador, PR/commit revisado, motivación, alcance y consecuencias. No convertir silencio en aprobación. Cambios posteriores agregan decisión que sustituye la anterior; actualizar especificaciones afectadas. Claude ofrece revisión independiente; el propietario decide. No hay despliegue ni gasto autorizado en LF-000.
