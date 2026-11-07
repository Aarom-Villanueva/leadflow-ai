/**
 * Clasificación pura de consultas SQL por tabla realmente referenciada, y detección de
 * marcadores de límite transaccional (BEGIN/COMMIT/ROLLBACK) — hallazgo 5 de la revisión
 * independiente del PR #19. Extraído de auth.ts a un módulo sin importaciones externas
 * (nada de `pg`/`better-auth`/`drizzle-orm`) para que esta lógica sea ejecutable y
 * probable ahora mismo (ver tests/unit/lf-002a/query-classifier.test.ts), separada de la
 * orquestación impura (instrumentar conexiones reales del pool) que sí vive en auth.ts.
 *
 * A diferencia del diseño anterior (una subcadena `tenant_id`/`organization_id` en
 * cualquier parte del texto SQL), esto extrae los nombres de tabla que aparecen tras
 * FROM/INTO/UPDATE/TABLE/JOIN y los compara contra el conjunto CERRADO de tablas del
 * laboratorio — demuestra qué tabla toca la consulta, no solo si una palabra aparece en
 * cualquier parte de su texto.
 */

export const IDENTITY_TABLES: ReadonlySet<string> = new Set(['user', 'session', 'account', 'verification']);
export const TENANT_TABLES: ReadonlySet<string> = new Set(['probe_memberships', 'tenant_probe']);

const TABLE_REFERENCE_PATTERN = /\b(?:from|into|update|table|join)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;

export type QueryClassification = 'identity' | 'tenant' | 'other';

export function referencedTables(sql: string): ReadonlySet<string> {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  TABLE_REFERENCE_PATTERN.lastIndex = 0;
  while ((match = TABLE_REFERENCE_PATTERN.exec(sql)) !== null) {
    found.add(match[1].toLowerCase());
  }
  return found;
}

export function classifyQuery(sql: string): QueryClassification {
  const tables = referencedTables(sql);
  for (const table of tables) if (TENANT_TABLES.has(table)) return 'tenant';
  for (const table of tables) if (IDENTITY_TABLES.has(table)) return 'identity';
  return 'other';
}

export type TransactionMarker = 'begin' | 'commit' | 'rollback' | null;

export function sqlMarker(sql: string): TransactionMarker {
  const normalized = sql.trim().toLowerCase().replace(/;\s*$/, '');
  if (normalized === 'begin' || normalized.startsWith('begin ')) return 'begin';
  if (normalized === 'commit') return 'commit';
  if (normalized === 'rollback') return 'rollback';
  return null;
}
