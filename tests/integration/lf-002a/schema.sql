-- LF-002a / LF-023 — laboratorio descartable de identidad y aislamiento RLS.
--
-- Este archivo NUNCA se aplica a ninguna base en la fase 1 (LF-023). Es DDL revisado,
-- pendiente de ejecutarse solo tras autorizar la fase 2 (docs/specs/LF-023.md §4) contra
-- la base descartable exacta del spike. Nunca ejecutar contra una base cuyo nombre no
-- coincida con la reservada para el laboratorio.
--
-- Las columnas de "user"/"session"/"account"/"verification" se verificaron por lectura
-- directa del paquete publicado @better-auth/core@1.7.18 (src/db/get-tables.ts), no por
-- suposición ni por documentación — ver docs/specs/LF-023.md §3. Ninguna de esas cuatro
-- tablas tiene organization_id/tenant_id: son globales de identidad, nunca sujetas a RLS
-- por tenant. Esa es precisamente la premisa que el spike debe confirmar en tiempo de
-- ejecución (P13), no solo en el esquema declarado aquí.

begin;

-- NOTA (revisión independiente del PR #19, hallazgo 1 de la segunda ronda): la fila
-- marcadora de procedencia (`lf002a_lab_marker`) ya NO se crea aquí. Hacerlo en este
-- archivo, aplicable en teoría a cualquier base cuyo nombre coincidiera, era precisamente
-- la "excepción general por nombre" que permitía que una base preexistente ajena
-- adquiriera la marca. Ahora la escribe exclusivamente
-- `tests/integration/lf-002a/database.ts#createSpikeDatabaseIfMatching`, inmediatamente
-- después de un `CREATE DATABASE` real y exitoso — nunca por aplicar este archivo. Este
-- archivo exige esa marca ya presente (vía `applySchemaSql`, que llama a
-- `assertAuthorizedLabTarget` antes de ejecutar nada de lo que sigue) en vez de crearla.

create table if not exists "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists "session" (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" (id) on delete cascade
);
create index if not exists session_user_id_idx on "session" ("userId");

create table if not exists "account" (
  id text primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists account_user_id_idx on "account" ("userId");

create table if not exists "verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists verification_identifier_idx on "verification" (identifier);

-- Tabla auxiliar descartable del laboratorio (LF-022 §"Preparación de alcance"): prueba
-- la recomendación de fuente única de verdad de rol/membresía para D-002. Nunca es la
-- tabla comercial `memberships`; se destruye al cerrar el spike (P16).
create table if not exists probe_memberships (
  id text primary key,
  "userId" text not null references "user" (id) on delete cascade,
  tenant_id text not null,
  role text not null check (role in ('owner', 'admin', 'sales')),
  revoked_at timestamptz,
  "createdAt" timestamptz not null default now()
);
create unique index if not exists probe_memberships_user_tenant_uq
  on probe_memberships ("userId", tenant_id);

-- Única tabla de datos de tenant protegida por RLS en el laboratorio. tenant_id es un
-- identificador sintético de fixture (tests/integration/lf-002a/fixtures.ts), nunca una
-- fila de una tabla `organizations` real ni un dato de negocio.
create table if not exists tenant_probe (
  id text primary key,
  tenant_id text not null,
  label text not null,
  "createdAt" timestamptz not null default now()
);
create index if not exists tenant_probe_tenant_idx on tenant_probe (tenant_id);

-- RLS activa para todos los comandos (USING cubre SELECT/UPDATE/DELETE, WITH CHECK
-- cubre INSERT/UPDATE). FORCE además de ENABLE: defensa en profundidad si algo llegara
-- a ejecutarse como propietario de la tabla, que de otro modo ignora RLS por defecto.
-- current_setting(..., true) devuelve NULL si el contexto nunca se fijó (en vez de
-- lanzar un error) — y tenant_id = NULL nunca es verdadero, así que la ausencia de
-- contexto deniega todo acceso por construcción, no por un caso especial adicional.
alter table tenant_probe enable row level security;
alter table tenant_probe force row level security;

create policy tenant_probe_isolation on tenant_probe
  using (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Re-otorgar privilegios ordinarios del rol runtime (revisión independiente del PR #19,
-- hallazgo 6): un `CREATE DATABASE` nuevo (P16, ciclo de borrado/recreación) NO hereda los
-- GRANT por objeto de la base anterior, aunque el propio rol persista a nivel de clúster.
-- Sin estas líneas, tras recrear la base el rol runtime no podría ni siquiera SELECT sus
-- propias filas — el preflight/los casos positivos fallarían por falta de permisos
-- ordinarios, no por RLS. Idempotente: segura de re-ejecutar en cada aplicación, no solo
-- tras una recreación. El runtime nunca recibe TRUNCATE/DDL/REFERENCES/TRIGGER (plan
-- §3: "El runtime no recibe TRUNCATE, DDL ni elevación a roles privilegiados"); el nombre
-- del rol debe coincidir exactamente con SPIKE_RUNTIME_ROLE en
-- tests/integration/lf-002a/lab-target.ts.
grant usage on schema public to lf002a_runtime;
grant select, insert, update, delete on
  "user", "session", "account", "verification", probe_memberships, tenant_probe
  to lf002a_runtime;
revoke truncate, trigger, references on
  "user", "session", "account", "verification", probe_memberships, tenant_probe
  from lf002a_runtime;

commit;
