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
    createdAt: daysAgo(30 - (index % 28)),
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

export const SYNTHETIC_INTERACTIONS: SyntheticInteraction[] = [
  { id: "int-1", leadId: "lead-1", authorMemberId: "member-3", kind: "llamada", body: "Primer contacto; interesados en una demostración la próxima semana.", occurredAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: "int-2", leadId: "lead-1", authorMemberId: "member-3", kind: "nota", body: "Prefieren comunicación por correo; evitar llamadas en la mañana.", occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  { id: "int-3", leadId: "lead-2", authorMemberId: "member-4", kind: "reunión", body: "Reunión de descubrimiento con el equipo de compras.", occurredAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
];

export interface SyntheticFollowup {
  id: string;
  leadId: string;
  assignedMemberId: string;
  title: string;
  dueAt: string;
  status: "pending" | "completed" | "canceled";
}

export const SYNTHETIC_FOLLOWUPS: SyntheticFollowup[] = [
  { id: "fu-1", leadId: "lead-1", assignedMemberId: "member-3", title: "Enviar propuesta comercial", dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), status: "pending" },
  { id: "fu-2", leadId: "lead-1", assignedMemberId: "member-3", title: "Confirmar asistencia a la demo", dueAt: new Date(Date.now() - 1 * 86_400_000).toISOString(), status: "pending" },
  { id: "fu-3", leadId: "lead-2", assignedMemberId: "member-4", title: "Llamada de seguimiento", dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), status: "completed" },
];

export function memberById(id: string): SyntheticMember | undefined {
  return SYNTHETIC_MEMBERS.find((member) => member.id === id);
}

export function stageById(id: string): SyntheticStage | undefined {
  return SYNTHETIC_STAGES.find((stage) => stage.id === id);
}

export function leadById(id: string): SyntheticLead | undefined {
  return SYNTHETIC_LEADS.find((lead) => lead.id === id);
}
