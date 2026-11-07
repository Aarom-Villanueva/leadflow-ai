/**
 * Pruebas puras y ejecutables ahora (sin `pg`, sin `better-auth`) de
 * tests/integration/lf-002a/query-classifier.ts — hallazgo 5 de la revisión independiente
 * del PR #19: la clasificación debe demostrar qué tabla toca una consulta (nombre de tabla
 * realmente referenciado tras FROM/INTO/UPDATE/TABLE), no basarse en si aparece la
 * subcadena "tenant_id"/"organization_id" en cualquier parte del texto SQL.
 */
import { describe, expect, test } from 'vitest';
import { classifyQuery, referencedTables, sqlMarker } from '../../integration/lf-002a/query-classifier.js';

describe('query-classifier: classifyQuery', () => {
  test('clasifica SELECT/INSERT/UPDATE sobre tenant_probe como tenant', () => {
    expect(classifyQuery('select id from tenant_probe where tenant_id = $1')).toBe('tenant');
    expect(classifyQuery('insert into tenant_probe (id, tenant_id, label) values ($1, $2, $3)')).toBe('tenant');
    expect(classifyQuery('update tenant_probe set label = $1 where id = $2')).toBe('tenant');
  });

  test('clasifica consultas sobre probe_memberships como tenant', () => {
    expect(classifyQuery('select tenant_id, role from probe_memberships where "userId" = $1')).toBe('tenant');
  });

  test('clasifica consultas sobre las tablas de identidad de Better Auth como identity', () => {
    expect(classifyQuery('select * from "user" where email = $1')).toBe('identity');
    expect(classifyQuery('insert into "session" (id, "userId", token) values ($1, $2, $3)')).toBe('identity');
    expect(classifyQuery('update "account" set "accessToken" = $1 where id = $2')).toBe('identity');
    expect(classifyQuery('select * from "verification" where identifier = $1')).toBe('identity');
  });

  test('el hallazgo exacto: una consulta que MENCIONA "tenant_id" en un comentario/alias pero no toca una tabla tenant no se clasifica como tenant', () => {
    // La heurística anterior (substring) habría clasificado esto como "tenant" solo
    // porque la palabra aparece en el texto; el nombre de tabla real referenciado
    // (`"user"`) es una tabla de identidad, no una tabla de tenant.
    expect(classifyQuery('select id as tenant_id_alias from "user" -- tenant_id nunca existe aquí')).toBe('identity');
  });

  test('una consulta que no referencia ninguna tabla conocida del laboratorio se clasifica como other', () => {
    expect(classifyQuery('select 1')).toBe('other');
    expect(classifyQuery('select pg_backend_pid()')).toBe('other');
    expect(classifyQuery('select current_database() as db')).toBe('other');
  });

  test('si una consulta referencia tanto una tabla de identidad como una de tenant, prevalece tenant', () => {
    // Una consulta con JOIN entre "user" y tenant_probe sí es relevante para el aislamiento
    // de tenant, aunque también toque identidad — tenant debe prevalecer como la
    // clasificación más cautelosa.
    expect(
      classifyQuery('select u.id from "user" u join tenant_probe tp on tp.id = u.id where tp.tenant_id = $1'),
    ).toBe('tenant');
  });

  test('referencedTables extrae múltiples tablas distintas', () => {
    const tables = referencedTables('insert into "session" (id, "userId") select id, id from "user"');
    expect([...tables].sort()).toEqual(['session', 'user']);
  });
});

describe('query-classifier: sqlMarker', () => {
  test('detecta begin/commit/rollback sin distinguir mayúsculas ni punto y coma final', () => {
    expect(sqlMarker('begin')).toBe('begin');
    expect(sqlMarker('BEGIN;')).toBe('begin');
    expect(sqlMarker('begin transaction')).toBe('begin');
    expect(sqlMarker('commit')).toBe('commit');
    expect(sqlMarker('COMMIT;')).toBe('commit');
    expect(sqlMarker('rollback')).toBe('rollback');
    expect(sqlMarker('ROLLBACK;')).toBe('rollback');
  });

  test('no clasifica una consulta ordinaria como marcador', () => {
    expect(sqlMarker('select 1')).toBeNull();
    expect(sqlMarker('select * from tenant_probe')).toBeNull();
  });
});
