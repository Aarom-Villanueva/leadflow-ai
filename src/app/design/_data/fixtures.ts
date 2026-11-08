/**
 * Datos SINTÉTICOS para la propuesta de diseño LF-003 — nunca reales, nunca
 * conectados a backend, nunca usados como semilla de datos de producción
 * (docs/specs/LF-003.md §7). Viven en memoria del navegador; nada aquí se
 * envía por red ni se persiste.
 */
import type { OrgRole } from "@/components/ui/role-badge";
import type { StageKind } from "@/components/ui/stage-badge";

export const SYNTHETIC_ORG = {
  name: "Studio Verde (sintético)",
  slug: "studio-verde",
  timezone: "America/Bogota",
};

export interface SyntheticOrganization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currentMemberRole: OrgRole;
}

/** Organizaciones sintéticas a las que pertenece la persona de prueba — etapa 2, pantalla de selección. */
export const SYNTHETIC_ORGANIZATIONS: SyntheticOrganization[] = [
  { id: "org-1", name: "Studio Verde (sintético)", slug: "studio-verde", timezone: "America/Bogota", currentMemberRole: "owner" },
  { id: "org-2", name: "Andina Soluciones (sintético)", slug: "andina-soluciones", timezone: "America/Lima", currentMemberRole: "admin" },
  { id: "org-3", name: "Taller Nómade (sintético)", slug: "taller-nomade", timezone: "America/Mexico_City", currentMemberRole: "sales" },
];

export interface SyntheticMember {
  id: string;
  name: string;
  role: OrgRole;
}

export const SYNTHETIC_MEMBERS: SyntheticMember[] = [
  { id: "member-1", name: "Marcela Ruiz", role: "owner" },
  { id: "member-2", name: "Andrés Posada", role: "admin" },
  { id: "member-3", name: "Juliana Gómez", role: "sales" },
  { id: "member-4", name: "Tomás Herrera", role: "sales" },
];

export const CURRENT_MEMBER_ID = "member-1";

export interface SyntheticStage {
  id: string;
  name: string;
  kind: StageKind;
  position: number;
}

export const SYNTHETIC_STAGES: SyntheticStage[] = [
  { id: "stage-new", name: "Nuevo", kind: "open", position: 1 },
  { id: "stage-qualify", name: "Calificación", kind: "open", position: 2 },
  { id: "stage-proposal", name: "Propuesta", kind: "open", position: 3 },
  { id: "stage-won", name: "Ganado", kind: "won", position: 4 },
  { id: "stage-lost", name: "Perdido", kind: "lost", position: 5 },
];

export interface SyntheticLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source: "referido" | "sitio web" | "evento" | "llamada en frío";
  stageId: string;
  assignedMemberId: string;
  createdAt: string;
  lastInteractionAt?: string;
  nextFollowupAt?: string;
  archived: boolean;
}

const sources: SyntheticLead["source"][] = ["referido", "sitio web", "evento", "llamada en frío"];
const leadNames = [
  "Café Altiplano", "Taller Rodamientos Sur", "Clínica Vital", "Estudio Lumen", "Panadería Dorada",
  "Constructora Nimbus", "Agro Insumos del Valle", "Boutique Hilo", "Transporte Ándico", "Centro Educativo Raíz",
  "Ferretería Montaña", "Grupo Textil Orión", "Veterinaria Patitas", "Hostal Río Claro", "Consultorio Dental Brisa",
  "Taller Mecánico Veloz", "Librería Horizonte", "Floristería Jardín", "Óptica ClaroVisión", "Imprenta Sello Azul",
  "Spa Serenidad", "Panificadora Trigo", "Distribuidora Andes", "Academia Código Vivo",
];

function syntheticLead(index: number): SyntheticLead {
  const stage = SYNTHETIC_STAGES[index % SYNTHETIC_STAGES.length]!;
  const member = SYNTHETIC_MEMBERS[index % SYNTHETIC_MEMBERS.length]!;
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const daysAhead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
  const isOpen = stage.kind === "open";
  return {
    id: `lead-${index + 1}`,
    name: leadNames[index % leadNames.length]!,
    email: index % 5 === 0 ? undefined : `contacto${index + 1}@ejemplo.invalid`,
    phone: index % 3 === 0 ? undefined : `+57 3${(10 + index).toString().padStart(2, "0")} 555 ${(1000 + index).toString().slice(-4)}`,
    source: sources[index % sources.length]!,
    stageId: stage.id,
    assignedMemberId: member.id,
    // Repartido en ~5 meses (10 a 148 días atrás) para que el dashboard tenga
    // más de una cohorte real que comparar, no solo un mes.
    createdAt: daysAgo(10 + index * 6),
    lastInteractionAt: index % 7 === 0 ? undefined : daysAgo(index % 10),
    nextFollowupAt: isOpen ? (index % 4 === 0 ? daysAgo(2) : daysAhead((index % 9) + 1)) : undefined,
    archived: false,
  };
}

export const SYNTHETIC_LEADS: SyntheticLead[] = Array.from({ length: 24 }, (_, index) => syntheticLead(index));

export interface SyntheticInteraction {
  id: string;
  leadId: string;
  authorMemberId: string;
  kind: "nota" | "llamada" | "reunión" | "conversación";
  body: string;
  occurredAt: string;
}

const interactionBodies: { kind: SyntheticInteraction["kind"]; body: string }[] = [
  { kind: "llamada", body: "Primer contacto; interesados en una demostración la próxima semana." },
  { kind: "nota", body: "Prefieren comunicación por correo; evitar llamadas en la mañana." },
  { kind: "reunión", body: "Reunión de descubrimiento con el equipo de compras." },
  { kind: "conversación", body: "Conversación aportada por la persona de ventas sobre presupuesto disponible." },
  { kind: "llamada", body: "Seguimiento telefónico; piden una propuesta por escrito." },
  { kind: "nota", body: "Referido por un cliente actual; mencionar el descuento de referidos." },
];

const manualInteractions: SyntheticInteraction[] = [
  { id: "int-1", leadId: "lead-1", authorMemberId: "member-3", kind: "llamada", body: interactionBodies[0]!.body, occurredAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: "int-2", leadId: "lead-1", authorMemberId: "member-3", kind: "nota", body: interactionBodies[1]!.body, occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: "int-3", leadId: "lead-2", authorMemberId: "member-4", kind: "reunión", body: interactionBodies[2]!.body, occurredAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
];

/** Interacciones generadas para el resto de prospectos — alimentan el feed agregado de la etapa 2. */
const generatedInteractions: SyntheticInteraction[] = Array.from({ length: 16 }, (_, index) => {
  const leadIndex = index % 12; // primeras 12 leads, varias interacciones cada una
  const entry = interactionBodies[index % interactionBodies.length]!;
  const member = SYNTHETIC_MEMBERS[index % SYNTHETIC_MEMBERS.length]!;
  return {
    id: `int-gen-${index + 1}`,
    leadId: `lead-${leadIndex + 1}`,
    authorMemberId: member.id,
    kind: entry.kind,
    body: entry.body,
    occurredAt: new Date(Date.now() - (4 + index * 3) * 86_400_000).toISOString(),
  };
});

export const SYNTHETIC_INTERACTIONS: SyntheticInteraction[] = [...manualInteractions, ...generatedInteractions];

export interface SyntheticFollowup {
  id: string;
  leadId: string;
  assignedMemberId: string;
  title: string;
  dueAt: string;
  status: "pending" | "completed" | "canceled";
}

const manualFollowups: SyntheticFollowup[] = [
  { id: "fu-1", leadId: "lead-1", assignedMemberId: "member-3", title: "Enviar propuesta comercial", dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), status: "pending" },
  { id: "fu-2", leadId: "lead-1", assignedMemberId: "member-3", title: "Confirmar asistencia a la demo", dueAt: new Date(Date.now() - 1 * 86_400_000).toISOString(), status: "pending" },
  { id: "fu-3", leadId: "lead-2", assignedMemberId: "member-4", title: "Llamada de seguimiento", dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), status: "completed" },
];

const followupTitles = [
  "Enviar cotización actualizada",
  "Confirmar datos de facturación",
  "Agendar demostración del producto",
  "Revisar objeciones de precio",
  "Compartir caso de éxito similar",
  "Validar fecha de cierre estimada",
];

/** Seguimientos generados para el resto de prospectos — alimentan el feed agregado y el dashboard de vencidos. */
const generatedFollowups: SyntheticFollowup[] = Array.from({ length: 18 }, (_, index) => {
  const leadIndex = index % 14;
  const member = SYNTHETIC_MEMBERS[index % SYNTHETIC_MEMBERS.length]!;
  const offsetDays = (index % 6) - 3; // -3..2: mezcla vencidos y próximos
  const status: SyntheticFollowup["status"] = index % 5 === 0 ? "canceled" : index % 3 === 0 ? "completed" : "pending";
  return {
    id: `fu-gen-${index + 1}`,
    leadId: `lead-${leadIndex + 1}`,
    assignedMemberId: member.id,
    title: followupTitles[index % followupTitles.length]!,
    dueAt: new Date(Date.now() + offsetDays * 86_400_000).toISOString(),
    status,
  };
});

export const SYNTHETIC_FOLLOWUPS: SyntheticFollowup[] = [...manualFollowups, ...generatedFollowups];

/**
 * Contenido sintético fijo del panel de IA (docs/specs/LF-003.md §2.1/§4, etapa 2).
 * Nunca generado en tiempo real, nunca conectado a un proveedor: es exactamente
 * el mismo texto en cada carga, para dejar claro que es un ejemplo de diseño,
 * no una llamada real a un modelo.
 */
export const SYNTHETIC_AI_SUMMARY =
  "Esta semana se crearon 4 prospectos nuevos, principalmente por sitio web y referidos. " +
  "Café Altiplano y Taller Rodamientos Sur tienen la actividad más reciente. Hay 3 seguimientos " +
  "vencidos que podrían perder impulso si no se contactan pronto.";

export interface SyntheticAiRecommendation {
  id: string;
  leadId?: string;
  text: string;
}

export const SYNTHETIC_AI_RECOMMENDATIONS: SyntheticAiRecommendation[] = [
  { id: "rec-1", leadId: "lead-1", text: "Café Altiplano lleva 2 días sin respuesta tras pedir la propuesta — un seguimiento corto podría reactivar la conversación." },
  { id: "rec-2", leadId: "lead-2", text: "Taller Rodamientos Sur tuvo una reunión de descubrimiento hace poco; es buen momento para enviar un resumen por escrito." },
  { id: "rec-3", text: "Tres prospectos de origen \"llamada en frío\" no tienen interacciones registradas todavía — podrían necesitar un primer contacto." },
];

export interface SyntheticAiDraft {
  leadId: string;
  subject: string;
  body: string;
}

export const SYNTHETIC_AI_DRAFT: SyntheticAiDraft = {
  leadId: "lead-1",
  subject: "Siguientes pasos con LeadFlow AI",
  body:
    "Hola, gracias por tu interés. Adjunto los detalles que conversamos y quedo atenta a cualquier " +
    "pregunta antes de agendar la demostración. Avísame qué día de la próxima semana te queda mejor.",
};

export function memberById(id: string): SyntheticMember | undefined {
  return SYNTHETIC_MEMBERS.find((member) => member.id === id);
}

export function stageById(id: string): SyntheticStage | undefined {
  return SYNTHETIC_STAGES.find((stage) => stage.id === id);
}

export function leadById(id: string): SyntheticLead | undefined {
  return SYNTHETIC_LEADS.find((lead) => lead.id === id);
}
