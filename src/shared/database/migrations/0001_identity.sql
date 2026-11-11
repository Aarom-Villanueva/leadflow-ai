-- LF-025. Apply once through the explicit migration runner, as the provisioner.
begin;
create table "user" (
  id text primary key,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "session" (
  id text primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" (id) on delete cascade
);
create index session_user_id_idx on "session" ("userId");

create table "account" (
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
create index account_user_id_idx on "account" ("userId");

create table "verification" (
  id text primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index verification_identifier_idx on "verification" (identifier);

create table auth_attempts (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null check(attempts > 0)
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 2 and 100),
  slug text not null unique check(length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null,
  created_by text not null references "user"(id),
  created_at timestamptz not null default now()
);
create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id text not null references "user"(id),
  role text not null check(role in ('owner','admin','sales')),
  revoked_at timestamptz,
  unique(organization_id,user_id)
);
create index memberships_user_idx on memberships(user_id,organization_id);
create table organization_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  actor_user_id text not null references "user"(id),
  action text not null,
  request_id uuid not null,
  created_at timestamptz not null default now()
);

alter table memberships enable row level security;
create policy membership_self on memberships for select using (user_id=nullif(current_setting('app.user_id',true),''));
alter table organizations enable row level security;
create policy organization_member on organizations for select using (
  exists(select 1 from memberships m where m.organization_id=organizations.id
    and m.user_id=nullif(current_setting('app.user_id',true),'') and m.revoked_at is null)
);
alter table organization_audit enable row level security;
-- No runtime writes, role mutations or audit deletion are granted. The only bootstrap
-- writer is this narrow provisioner-owned function. Do not FORCE owner RLS here:
-- bootstrap cannot select a membership before atomically creating it.
create function lf_create_organization(p_name text,p_slug text,p_timezone text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare
  actor text := nullif(current_setting('app.user_id',true),'');
  org_id uuid := gen_random_uuid();
begin
  if actor is null then raise exception 'actor required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then
    raise exception 'invalid timezone' using errcode='22023';
  end if;
  insert into public.organizations(id,name,slug,timezone,created_by) values(org_id,p_name,p_slug,p_timezone,actor);
  insert into public.memberships(organization_id,user_id,role) values(org_id,actor,'owner');
  insert into public.organization_audit(organization_id,actor_user_id,action,request_id)
    values(org_id,actor,'organization.created',p_request_id);
  return org_id;
end;
$$;
revoke all on function lf_create_organization(text,text,text,uuid) from public;
revoke all on organizations,memberships,organization_audit from public;

commit;
