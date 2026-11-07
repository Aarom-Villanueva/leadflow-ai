import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";

const stage1Screens = [
  { href: "/design/access/iniciar-sesion", title: "Iniciar sesión", description: "Acceso con correo y contraseña; errores sin enumerar cuentas." },
  { href: "/design/access/crear-cuenta", title: "Crear cuenta", description: "Registro con validación visual de formato y fuerza." },
  { href: "/design/access/recuperar", title: "Recuperar acceso", description: "Solicitud de recuperación; confirmación siempre igual." },
  { href: "/design/access/restablecer", title: "Restablecer acceso", description: "Nueva contraseña desde un enlace; estado de enlace vencido." },
  { href: "/design/app/leads", title: "Prospectos — listado", description: "Filtros, orden y paginación reales sobre datos sintéticos." },
  { href: "/design/app/leads/lead-1", title: "Prospectos — ficha", description: "Datos, pestañas de actividad y seguimientos de un prospecto." },
  { href: "/design/app/dashboard", title: "Estructura — Dashboard", description: "Punto de navegación; contenido en la etapa 2." },
  { href: "/design/app/pipeline", title: "Estructura — Pipeline", description: "Punto de navegación; contenido en la etapa 2." },
  { href: "/design/app/seguimientos", title: "Estructura — Seguimientos", description: "Punto de navegación; contenido en la etapa 2." },
];

const designVsBackend: { item: string; design: string; backend: string }[] = [
  { item: "Acceso (login/registro/recuperación)", design: "Validación visual, estados de error/carga simulados", backend: "Better Auth real, verificación de correo, cookies de sesión, límites de intentos" },
  { item: "Conmutador de rol (barra superior)", design: "Cambia navegación/acciones visibles, solo prototipo", backend: "Sesión y membresía reales; el servidor decide el rol" },
  { item: "Organización en la barra superior", design: "Nombre sintético fijo", backend: "Selección/creación real, membresías, invitaciones (etapa 2)" },
  { item: "Listado de prospectos", design: "Filtro/orden/paginación interactivos sobre datos en memoria", backend: "Persistencia real, paginación por cursor, autorización por tenant" },
  { item: "Ficha de prospecto", design: "Lectura/edición visual sin persistencia", backend: "CRUD real, versión optimista, auditoría" },
  { item: "Panel de IA", design: "Solo su ubicación/activador", backend: "Todo: puerto AiProvider, cuotas, borradores reales (etapa 2)" },
  { item: "Pipeline, Dashboard, Seguimientos agregados", design: "Solo enlace a pantalla “disponible en la siguiente etapa”", backend: "Todo: no existen aún ni en diseño ni en backend" },
];

export default function DesignIndexPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-6 py-10 sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">LF-003 · Etapa 1</p>
      <h1 className="mt-3 text-[1.75rem] font-semibold tracking-tight sm:text-[2rem]">Propuesta de diseño — LeadFlow AI</h1>
      <p className="mt-3 max-w-2xl text-[0.9375rem] leading-7 text-[var(--text-secondary)]">
        Esta entrega cubre acceso, la estructura principal del CRM y prospectos (listado, filtros y ficha), para validar
        la dirección visual antes de extender el sistema al resto (organización, pipeline, historial agregado, dashboard
        y el contenido del asistente de IA).
      </p>

      <div className="mt-6">
        <Banner tone="prototype" title="Nada de esto es funcional todavía">
          Ningún formulario envía ni guarda lo que se escriba en él. Los datos de prospectos son sintéticos y viven solo
          en la memoria del navegador.
        </Banner>
      </div>

      <section aria-labelledby="screens-title" className="mt-10">
        <h2 id="screens-title" className="text-[1.25rem] font-semibold">
          Pantallas de esta etapa
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {stage1Screens.map((screen) => (
            <Link
              key={screen.href}
              href={screen.href}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <h3 className="font-semibold text-[var(--text-primary)]">{screen.title}</h3>
              <p className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{screen.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="matrix-title" className="mt-10">
        <Card>
          <CardHeader
            title={<span id="matrix-title">Qué es únicamente diseño y qué falta conectar</span>}
            description="Resumen completo en docs/specs/LF-003.md §3."
          />
          <div tabIndex={0} role="region" aria-label="Tabla: qué es diseño y qué falta conectar" className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[0.8125rem]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Elemento
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Es diseño/interacción de front-end
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Falta para ser real
                  </th>
                </tr>
              </thead>
              <tbody>
                {designVsBackend.map((row) => (
                  <tr key={row.item} className="border-b border-[var(--border)] align-top last:border-0">
                    <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">{row.item}</td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">{row.design}</td>
                    <td className="py-3 text-[var(--text-secondary)]">{row.backend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="mt-10">
        <ButtonLink href="/" variant="ghost">
          ← Volver al sitio público
        </ButtonLink>
      </div>
    </main>
  );
}
