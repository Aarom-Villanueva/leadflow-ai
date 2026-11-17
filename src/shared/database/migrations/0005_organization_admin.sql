begin;
alter table organizations add column version integer not null default 1 check(version>0),add column updated_at timestamptz not null default clock_timestamp();
alter table memberships add column version integer not null default 1 check(version>0);
alter table organization_audit add column safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and octet_length(safe_metadata::text)<=2048);

create function lf_admin_version() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.id<>old.id or (to_jsonb(new)->>'organization_id') is distinct from (to_jsonb(old)->>'organization_id')
  or (to_jsonb(new)->>'user_id') is distinct from (to_jsonb(old)->>'user_id')
  or (to_jsonb(new)->>'slug') is distinct from (to_jsonb(old)->>'slug')
  or (to_jsonb(new)->>'created_by') is distinct from (to_jsonb(old)->>'created_by')
  or (to_jsonb(new)->>'created_at') is distinct from (to_jsonb(old)->>'created_at') then
  raise exception 'immutable identity' using errcode='23514';end if;
 new.version:=old.version+1;
 if tg_table_name='organizations' then new.updated_at:=clock_timestamp();end if;
 return new;
end;$$;
create trigger organization_admin_version before update on organizations for each row execute function lf_admin_version();
create trigger membership_admin_version before update on memberships for each row execute function lf_admin_version();

-- Lock order shared by commercial operations and administration: organization, then membership.
-- Drain the old application before migration: already-running old function bodies do not acquire this barrier.
create or replace function lf_lock_membership(p_org uuid) returns text language plpgsql security definer set search_path=pg_catalog as $$
declare result text;
begin
 perform 1 from public.organizations where id=p_org for share;
 select role into result from public.memberships where organization_id=p_org
  and user_id=nullif(current_setting('app.user_id',true),'') and revoked_at is null for share;
 return result;
end;$$;

create table organization_admin_requests(
 organization_id uuid not null,actor_user_id text not null,request_id uuid not null,
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(organization_id,actor_user_id,request_id),
 foreign key(organization_id,actor_user_id) references memberships(organization_id,user_id)
);
alter table organization_admin_requests enable row level security;
-- Private provisioner-owned ledger: no runtime policies or direct grants. Functions below are the only runtime path.

create function lf_admin_access(p_org uuid,p_write boolean) returns public.memberships
language plpgsql security definer set search_path=pg_catalog as $$
declare actor text:=nullif(current_setting('app.user_id',true),'');m public.memberships;
begin
 if actor is null or not exists(select 1 from public.memberships where organization_id=p_org and user_id=actor and revoked_at is null) then
  raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if p_write then perform 1 from public.organizations where id=p_org for update;
 else perform 1 from public.organizations where id=p_org for share;end if;
 select * into m from public.memberships where organization_id=p_org and user_id=actor and revoked_at is null for share;
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if m.role not in('owner','admin') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 return m;
end;$$;

create function lf_admin_info(p_org uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor public.memberships;result jsonb;
begin
 actor:=public.lf_admin_access(p_org,false);
 select jsonb_build_object('organization',jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'timezone',o.timezone,'role',actor.role,'version',o.version,'updatedAt',o.updated_at),
  'actorMembershipId',actor.id,'actorVersion',actor.version) into result from public.organizations o where o.id=p_org;
 return result;
end;$$;

create function lf_admin_members(p_org uuid,p_after uuid,p_limit integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform public.lf_admin_access(p_org,false);
 if p_limit is null or p_limit<1 or p_limit>51 then raise exception 'invalid limit' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into result from(
  select m.id,m.user_id as "userId",u.name,u.email,m.role,m.revoked_at as "revokedAt",m.version
  from public.memberships m join public."user" u on u.id=m.user_id
  where m.organization_id=p_org and(p_after is null or m.id>p_after) order by m.id limit p_limit
 )r;
 return result;
end;$$;

create function lf_admin_audit(p_org uuid,p_at timestamptz,p_id uuid,p_limit integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform public.lf_admin_access(p_org,false);
 if p_limit is null or p_limit<1 or p_limit>51 or (p_at is null)<>(p_id is null) then raise exception 'invalid cursor' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r."cursorAt" desc,r.id desc),'[]'::jsonb) into result from(
  select a.id,a.action,a.entity_id as "entityId",a.actor_user_id as "actorUserId",u.name as "actorName",a.request_id as "requestId",a.created_at as "createdAt",a.safe_metadata as metadata,
   to_char(a.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorAt"
  from public.organization_audit a left join public."user" u on u.id=a.actor_user_id
  where a.organization_id=p_org and(p_at is null or(a.created_at,a.id)<(p_at,p_id)) order by a.created_at desc,a.id desc limit p_limit
 )r;
 return result;
end;$$;

create function lf_admin_mutate(p_org uuid,p_request uuid,p_operation text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor public.memberships;target public.memberships;org public.organizations;prior public.organization_admin_requests;
 keys text[];fingerprint text;new_role text;metadata jsonb;result jsonb;entity uuid;action text;
begin
 if p_request is null or p_operation is null or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>2048 then
  raise exception 'invalid input' using errcode='22023';end if;
 keys:=case p_operation when 'profile' then array['version','name','timezone'] when 'set-role' then array['targetMembershipId','version','role']
  when 'revoke' then array['targetMembershipId','version'] when 'restore' then array['targetMembershipId','version']
  when 'transfer' then array['targetMembershipId','actorVersion','targetVersion'] else null end;
 if keys is null or not(p_input?&keys) or exists(select 1 from jsonb_object_keys(p_input) k where not(k=any(keys))) then
  raise exception 'invalid input' using errcode='22023';end if;
 actor:=public.lf_admin_access(p_org,true);
 fingerprint:=encode(sha256(convert_to(p_operation||p_input::text,'UTF8')),'hex');
 select * into prior from public.organization_admin_requests where organization_id=p_org and actor_user_id=actor.user_id and request_id=p_request;
 if found then
  if prior.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='P0001';end if;
  return prior.result;
 end if;
 if p_operation='profile' then
  select * into org from public.organizations where id=p_org;
  if org.version is distinct from (p_input->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='P0001';end if;
  if jsonb_typeof(p_input->'name')<>'string' or length(trim(p_input->>'name')) not between 2 and 100
   or jsonb_typeof(p_input->'timezone')<>'string' or not exists(select 1 from pg_timezone_names where name=p_input->>'timezone') then
   raise exception 'invalid profile' using errcode='22023';end if;
  update public.organizations set name=trim(p_input->>'name'),timezone=p_input->>'timezone' where id=p_org returning * into org;
  entity:=p_org;action:='organization.profile_updated';metadata:=jsonb_build_object('version',org.version);
  result:=jsonb_build_object('id',org.id,'version',org.version);
 else
  select * into target from public.memberships where organization_id=p_org and id=(p_input->>'targetMembershipId')::uuid for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
  if actor.id=target.id then raise exception 'SELF_CHANGE' using errcode='P0001';end if;
  if p_operation='transfer' then
   if actor.role<>'owner' then raise exception 'FORBIDDEN' using errcode='42501';end if;
   if target.revoked_at is not null then raise exception 'INVALID_STATE' using errcode='P0001';end if;
   if actor.version is distinct from(p_input->>'actorVersion')::integer or target.version is distinct from(p_input->>'targetVersion')::integer then
    raise exception 'VERSION_CONFLICT' using errcode='P0001';end if;
   update public.memberships set role='owner' where id=target.id returning * into target;
   update public.memberships set role='admin' where id=actor.id returning * into actor;
   action:='ownership.transferred';metadata:=jsonb_build_object('actorMembershipId',actor.id,'actorVersion',actor.version,'targetMembershipId',target.id,'targetVersion',target.version);
   result:=metadata;
  else
   if actor.role='admin' and(target.role='owner' or(p_operation='set-role' and p_input->>'role'='owner')) then
    raise exception 'FORBIDDEN' using errcode='42501';end if;
   if target.version is distinct from(p_input->>'version')::integer then raise exception 'VERSION_CONFLICT' using errcode='P0001';end if;
   if p_operation='set-role' then
    new_role:=p_input->>'role';
    if new_role is null or new_role not in('owner','admin','sales') then raise exception 'invalid role' using errcode='22023';end if;
    if target.revoked_at is not null then raise exception 'INVALID_STATE' using errcode='P0001';end if;
    metadata:=jsonb_build_object('previousRole',target.role,'role',new_role);action:='membership.role_updated';
    update public.memberships set role=new_role where id=target.id returning * into target;
   elsif p_operation='revoke' then
    if target.revoked_at is not null then raise exception 'INVALID_STATE' using errcode='P0001';end if;
    update public.memberships set revoked_at=clock_timestamp() where id=target.id returning * into target;
    action:='membership.revoked';metadata:=jsonb_build_object('role',target.role);
   else
    if target.revoked_at is null then raise exception 'INVALID_STATE' using errcode='P0001';end if;
    update public.memberships set revoked_at=null where id=target.id returning * into target;
    action:='membership.restored';metadata:=jsonb_build_object('role',target.role);
   end if;
   metadata:=metadata||jsonb_build_object('version',target.version);result:=jsonb_build_object('id',target.id,'version',target.version);
  end if;
  entity:=target.id;
  if not exists(select 1 from public.memberships where organization_id=p_org and role='owner' and revoked_at is null) then
   raise exception 'LAST_OWNER' using errcode='P0001';end if;
 end if;
 insert into public.organization_audit(organization_id,actor_user_id,action,entity_id,request_id,safe_metadata)
  values(p_org,actor.user_id,action,entity,p_request,metadata);
 result:=jsonb_build_object('requestId',p_request,'operation',p_operation,'result',result);
 insert into public.organization_admin_requests(organization_id,actor_user_id,request_id,request_hash,result) values(p_org,actor.user_id,p_request,fingerprint,result);
 return result;
end;$$;

revoke all on organization_admin_requests from public;
revoke all on function lf_admin_version(),lf_admin_access(uuid,boolean),lf_admin_info(uuid),lf_admin_members(uuid,uuid,integer),lf_admin_audit(uuid,timestamptz,uuid,integer),lf_admin_mutate(uuid,uuid,text,jsonb) from public;
commit;
