begin;
create table app_migrations(version text primary key,sha256 text not null,applied_at timestamptz not null default now());
revoke all on app_migrations from public;
alter table organization_audit add column entity_id uuid;

create table pipelines(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id),
  name text not null default 'Pipeline comercial',
  unique(organization_id,id)
);
create table stages(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pipeline_id uuid not null,
  name text not null check(length(trim(name)) between 1 and 60),
  position integer not null check(position between 1 and 50),
  kind text not null check(kind in('open','won','lost')),
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  unique(organization_id,id),
  constraint stages_order_key unique(organization_id,pipeline_id,position) deferrable initially immediate,
  foreign key(organization_id,pipeline_id) references pipelines(organization_id,id)
);
create unique index stages_name_key on stages(organization_id,lower(name));
create table leads(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  stage_id uuid not null,
  assigned_user_id text,
  name text not null check(length(trim(name)) between 1 and 200),
  email text check(email is null or length(email)<=254),
  email_normalized text generated always as(nullif(lower(btrim(email)),'')) stored,
  phone_e164 text check(phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  source text check(source in('referido','sitio web','evento','llamada en frío','otro')),
  version integer not null default 1 check(version>0),
  archived_at timestamptz(3),
  created_at timestamptz(3) not null default clock_timestamp(),
  updated_at timestamptz(3) not null default clock_timestamp(),
  unique(organization_id,id),
  foreign key(organization_id,stage_id) references stages(organization_id,id),
  foreign key(organization_id,assigned_user_id) references memberships(organization_id,user_id)
);
create index leads_created_idx on leads(organization_id,created_at,id);
create index leads_name_idx on leads(organization_id,lower(name),id);
create index leads_stage_idx on leads(organization_id,stage_id,created_at,id);
create table lead_stage_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  lead_id uuid not null,
  lead_version integer not null check(lead_version>0),
  from_stage_id uuid,
  to_stage_id uuid not null,
  actor_user_id text not null,
  happened_at timestamptz(3) not null default clock_timestamp(),
  unique(organization_id,lead_id,lead_version),
  foreign key(organization_id,lead_id) references leads(organization_id,id),
  foreign key(organization_id,from_stage_id) references stages(organization_id,id),
  foreign key(organization_id,to_stage_id) references stages(organization_id,id),
  foreign key(organization_id,actor_user_id) references memberships(organization_id,user_id)
);

-- Backfill runs before RLS is enabled, in this same uncommitted migration.
insert into pipelines(organization_id) select id from organizations;
insert into stages(organization_id,pipeline_id,name,position,kind)
select p.organization_id,p.id,v.name,v.position,v.kind from pipelines p
cross join(values('Nuevo',1,'open'),('Calificación',2,'open'),('Propuesta',3,'open'),('Ganado',4,'won'),('Perdido',5,'lost')) v(name,position,kind);

create function lf_lock_membership(p_org uuid) returns text language plpgsql security definer set search_path=pg_catalog as $$
declare result text;
begin
  select role into result from public.memberships where organization_id=p_org
    and user_id=nullif(current_setting('app.user_id',true),'') and revoked_at is null for share;
  return result;
end; $$;

create function lf_organization_members(p_org uuid) returns table("userId" text,name text,role text)
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_org::text is distinct from current_setting('app.organization_id',true) or not exists(
    select 1 from public.memberships where organization_id=p_org and user_id=nullif(current_setting('app.user_id',true),'') and revoked_at is null
  ) then raise exception 'membership required' using errcode='42501'; end if;
  return query select m.user_id,u.name,m.role from public.memberships m join public."user" u on u.id=m.user_id
    where m.organization_id=p_org and m.revoked_at is null order by u.name,m.user_id;
end; $$;

create function lf_lock_stage(p_org uuid,p_stage uuid) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_org::text is distinct from current_setting('app.organization_id',true) or public.lf_lock_membership(p_org) is null then return false; end if;
  perform 1 from public.stages where organization_id=p_org and id=p_stage and active for share;
  return found;
end; $$;
create function lf_lock_assignee(p_org uuid,p_user text) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_org::text is distinct from current_setting('app.organization_id',true) or public.lf_lock_membership(p_org) is null then return false; end if;
  perform 1 from public.memberships where organization_id=p_org and user_id=p_user and revoked_at is null for share;
  return found;
end; $$;

alter table pipelines enable row level security;
alter table stages enable row level security;
alter table leads enable row level security;
alter table leads force row level security;
alter table lead_stage_events enable row level security;
alter table lead_stage_events force row level security;

create policy pipeline_read on pipelines for select using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=pipelines.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create policy pipeline_config on pipelines for update using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=pipelines.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null and m.role in('owner','admin')));
create policy stage_read on stages for select using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=stages.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create policy stage_config on stages for all using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=stages.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null and m.role in('owner','admin')))
  with check(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=stages.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null and m.role in('owner','admin')));
create policy leads_member on leads for all using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=leads.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null))
  with check(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=leads.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create policy events_read on lead_stage_events for select using(organization_id::text=current_setting('app.organization_id',true)
  and exists(select 1 from memberships m where m.organization_id=lead_stage_events.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create policy events_append on lead_stage_events for insert with check(organization_id::text=current_setting('app.organization_id',true)
  and actor_user_id=current_setting('app.user_id',true)
  and exists(select 1 from memberships m where m.organization_id=lead_stage_events.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));

create function lf_validate_lead() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.organization_id<>old.organization_id or new.created_at<>old.created_at then raise exception 'immutable identity' using errcode='23514'; end if;
    if old.archived_at is not null then raise exception 'archived lead' using errcode='23514'; end if;
    new.version:=old.version+1;
  else new.version:=1; new.created_at:=clock_timestamp(); end if;
  if not public.lf_lock_stage(new.organization_id,new.stage_id) then raise exception 'invalid stage' using errcode='23514'; end if;
  if new.assigned_user_id is not null and (tg_op='INSERT' or new.assigned_user_id is distinct from old.assigned_user_id) then
    if not public.lf_lock_assignee(new.organization_id,new.assigned_user_id) then raise exception 'invalid assignee' using errcode='23514'; end if;
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end; $$;
create trigger lead_validate before insert or update on leads for each row execute function lf_validate_lead();

create function lf_record_lead() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare actor text:=nullif(current_setting('app.user_id',true),''); action_name text;
begin
  if tg_op='INSERT' then action_name:='lead.created';
  elsif new.archived_at is distinct from old.archived_at then action_name:='lead.archived';
  elsif new.stage_id<>old.stage_id then action_name:='lead.stage_changed';
  else action_name:='lead.updated'; end if;
  if tg_op='INSERT' or new.stage_id<>old.stage_id then
    insert into public.lead_stage_events(organization_id,lead_id,lead_version,from_stage_id,to_stage_id,actor_user_id)
      values(new.organization_id,new.id,new.version,case when tg_op='INSERT' then null else old.stage_id end,new.stage_id,actor);
  end if;
  insert into public.organization_audit(organization_id,actor_user_id,action,entity_id,request_id)
    values(new.organization_id,actor,action_name,new.id,nullif(current_setting('app.request_id',true),'')::uuid);
  return new;
end; $$;
create trigger lead_record after insert or update on leads for each row execute function lf_record_lead();

create or replace function lf_create_organization(p_name text,p_slug text,p_timezone text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare actor text:=nullif(current_setting('app.user_id',true),''); org_id uuid:=gen_random_uuid(); pipeline_id uuid:=gen_random_uuid();
begin
  if actor is null then raise exception 'actor required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'invalid timezone' using errcode='22023'; end if;
  insert into public.organizations(id,name,slug,timezone,created_by) values(org_id,p_name,p_slug,p_timezone,actor);
  insert into public.memberships(organization_id,user_id,role) values(org_id,actor,'owner');
  insert into public.pipelines(id,organization_id) values(pipeline_id,org_id);
  insert into public.stages(organization_id,pipeline_id,name,position,kind) select org_id,pipeline_id,v.name,v.position,v.kind
    from(values('Nuevo',1,'open'),('Calificación',2,'open'),('Propuesta',3,'open'),('Ganado',4,'won'),('Perdido',5,'lost')) v(name,position,kind);
  insert into public.organization_audit(organization_id,actor_user_id,action,request_id) values(org_id,actor,'organization.created',p_request_id);
  return org_id;
end; $$;
revoke all on function lf_lock_membership(uuid),lf_organization_members(uuid),lf_lock_stage(uuid,uuid),lf_lock_assignee(uuid,text),lf_validate_lead(),lf_record_lead() from public;
revoke all on pipelines,stages,leads,lead_stage_events from public;
commit;
