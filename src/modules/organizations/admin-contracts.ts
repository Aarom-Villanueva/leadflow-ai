import { z } from "zod";
import type { Role } from "./service";
const uuid = z.uuid().transform(value => value.toLowerCase());
const version = z.number().int().min(1).max(2147483646);
export const validText = (value: string) => ![...value].some(c => c.codePointAt(0) === 0 || (c.codePointAt(0)! >= 0xd800 && c.codePointAt(0)! <= 0xdfff));
/**
 * Nombre de organización: una sola regla, con las mismas listas de puntos de código que `lf_org_name_valid` (0005).
 * Solo se recortan espacios ASCII; controles, espacios Unicode raros, formato invisible y marcas bidireccionales se rechazan
 * (docs/specs/LF-030.md, «Nombre de organización»). Longitud en puntos de código.
 */
const NAME_FORBIDDEN = /[\u0001-\u001f\u007f-\u009f\u00a0\u00ad\u061c\u1680\u180e\u2000-\u200b\u200e\u200f\u2028-\u202f\u205f\u2060-\u206f\u3000\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/u;
const NAME_NOT_VISIBLE = /[ \u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f\u200c\u200d\u{e0100}-\u{e01ef}]/gu;
export const trimSpaces = (value: string) => value.replace(/^ +| +$/g, "");
export const validOrganizationName = (value: string) => { const length = [...value].length; return length >= 2 && length <= 100 && !NAME_FORBIDDEN.test(value) && [...value.replace(NAME_NOT_VISIBLE, "")].length >= 2; };
export const organizationName = z.string().transform(trimSpaces).pipe(z.string().refine(validText).refine(validOrganizationName));
export const profileInput = z.object({ requestId: uuid, version, name: organizationName, timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; } }) }).strict();
export const memberInput = z.discriminatedUnion("action", [
  z.object({ requestId: uuid, version, action: z.literal("set-role"), role: z.enum(["owner", "admin", "sales"]) }).strict(),
  z.object({ requestId: uuid, version, action: z.enum(["revoke", "restore"]) }).strict(),
]);
export const transferInput = z.object({ requestId: uuid, actorVersion: version, targetMembershipId: uuid, targetVersion: version }).strict();
export const pageInput = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().min(1).max(600).optional() }).strict();
export const memberCursor = z.object({ org: uuid, id: uuid }).strict();
export const auditCursor = memberCursor.extend({ at: z.iso.datetime({ offset: true }) }).strict();
export interface AdminInfo { organization: { id: string; name: string; slug: string; timezone: string; role: Role; version: number; updatedAt: string }; actorMembershipId: string; actorVersion: number; capabilities: { manageMembers: boolean; importLeads: boolean; transferOwnership: boolean } }
export interface AdminMember { id: string; userId: string; name: string; email: string; role: Role; revokedAt: string | null; version: number }
export interface AdminAudit { id: string; action: string; entityId: string | null; actorUserId: string; actorName: string | null; requestId: string; createdAt: string; metadata: Record<string, unknown> }
export interface AdminPage<T> { items: T[]; nextCursor: string | null }
export interface AdminReceipt { requestId: string; operation: string; result: { id?: string; version?: number; actorMembershipId?: string; actorVersion?: number; targetMembershipId?: string; targetVersion?: number } }
