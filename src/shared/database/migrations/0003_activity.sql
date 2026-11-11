begin;
create table interactions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,lead_id uuid not null,author_user_id text not null,
 kind text not null check(kind in('note','call','meeting','conversation')),body text not null check(length(btrim(body)) between 1 and 4000),
 occurred_at timestamptz(3) not null check(occurred_at>='2000-01-01T00:00:00Z' and occurred_at<'2101-01-01T00:00:00Z'),
 version integer not null default 1 check(version>0),creation_key uuid not null,creation_hash text not null check(length(creation_hash)=64),
 created_at timestamptz(3) not null default clock_timestamp(),updated_at timestamptz(3) not null default clock_timestamp(),
 unique(organization_id,id),unique(organization_id,author_user_id,creation_key),
 foreign key(organization_id,lead_id) references leads(organization_id,id),
 foreign key(organization_id,author_user_id) references memberships(organization_id,user_id)
);
create index interaction_list_idx on interactions(organization_id,lead_id,occurred_at,id);
create table followups(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,lead_id uuid not null,created_by text not null,
 title text not null check(length(btrim(title)) between 1 and 200),detail text check(detail is null or length(detail)<=2000),assigned_user_id text not null,
 due_at timestamptz(3) not null check(due_at>='2000-01-01T00:00:00Z' and due_at<'2101-01-01T00:00:00Z'),
 status text not null default 'pending' check(status in('pending','completed','canceled')),completed_at timestamptz(3),closed_by text,
 version integer not null default 1 check(version>0),creation_key uuid not null,creation_hash text not null check(length(creation_hash)=64),
 created_at timestamptz(3) not null default clock_timestamp(),updated_at timestamptz(3) not null default clock_timestamp(),
 check((status='completed')=(completed_at is not null)),check((status<>'pending')=(closed_by is not null)),
 unique(organization_id,id),unique(organization_id,created_by,creation_key),
 foreign key(organization_id,lead_id) references leads(organization_id,id),
 foreign key(organization_id,created_by) references memberships(organization_id,user_id),
 foreign key(organization_id,assigned_user_id) references memberships(organization_id,user_id),
 foreign key(organization_id,closed_by) references memberships(organization_id,user_id)
);
create index followup_list_idx on followups(organization_id,status,due_at,id);
create index followup_owner_idx on followups(organization_id,assigned_user_id,status,due_at,id);
alter table interactions enable row level security;
alter table interactions force row level security;
alter table followups enable row level security;
alter table followups force row level security;
create policy interaction_member on interactions for all using(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=interactions.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null))
 with check(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=interactions.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create policy followup_member on followups for all using(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=followups.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null))
 with check(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=followups.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));

create function lf_activity_lead(p_org uuid,p_lead uuid,p_archived boolean) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare archived timestamptz;
begin
 if p_org::text is distinct from current_setting('app.organization_id',true) or public.lf_lock_membership(p_org) is null then return false; end if;
 select archived_at into archived from public.leads where organization_id=p_org and id=p_lead for share;
 return found and (p_archived or archived is null);
end; $$;
create function lf_validate_interaction() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' then new.author_user_id:=nullif(current_setting('app.user_id',true),'');new.version:=1;new.created_at:=clock_timestamp();
 else
  if (new.id,new.organization_id,new.lead_id,new.author_user_id,new.creation_key,new.creation_hash,new.created_at) is distinct from (old.id,old.organization_id,old.lead_id,old.author_user_id,old.creation_key,old.creation_hash,old.created_at) then raise exception 'immutable identity' using errcode='23514';end if;
  new.version:=old.version+1;
 end if;
 if not public.lf_activity_lead(new.organization_id,new.lead_id,false) then raise exception 'lead unavailable' using errcode='23514';end if;
 new.updated_at:=clock_timestamp();return new;
end; $$;
create function lf_validate_followup() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare closing boolean:=false;
begin
 if tg_op='INSERT' then
  new.created_by:=nullif(current_setting('app.user_id',true),'');new.version:=1;new.created_at:=clock_timestamp();new.status:='pending';new.completed_at:=null;new.closed_by:=null;
 else
  if (new.id,new.organization_id,new.lead_id,new.created_by,new.creation_key,new.creation_hash,new.created_at) is distinct from (old.id,old.organization_id,old.lead_id,old.created_by,old.creation_key,old.creation_hash,old.created_at) then raise exception 'immutable identity' using errcode='23514';end if;
  if old.status<>'pending' then raise exception 'terminal followup' using errcode='23514';end if;
  closing:=new.status in('completed','canceled');
  if closing and (new.title,new.detail,new.assigned_user_id,new.due_at) is distinct from (old.title,old.detail,old.assigned_user_id,old.due_at) then raise exception 'transition only' using errcode='23514';end if;
  new.version:=old.version+1;
  new.completed_at:=case when new.status='completed' then clock_timestamp() else null end;
  new.closed_by:=case when closing then nullif(current_setting('app.user_id',true),'') else null end;
 end if;
 if not public.lf_activity_lead(new.organization_id,new.lead_id,closing) then raise exception 'lead unavailable' using errcode='23514';end if;
 if tg_op='INSERT' or new.assigned_user_id is distinct from old.assigned_user_id then
  if not public.lf_lock_assignee(new.organization_id,new.assigned_user_id) then raise exception 'assignee unavailable' using errcode='23514';end if;
 end if;
 new.updated_at:=clock_timestamp();return new;
end; $$;
create function lf_record_activity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare action_name text;
begin
 if tg_table_name='interactions' then action_name:=case when tg_op='INSERT' then 'interaction.created' else 'interaction.updated' end;
 else action_name:=case when tg_op='INSERT' then 'followup.created' when new.status<>old.status then 'followup.'||new.status else 'followup.updated' end;end if;
 insert into public.organization_audit(organization_id,actor_user_id,action,entity_id,request_id)
 values(new.organization_id,nullif(current_setting('app.user_id',true),''),action_name,new.id,nullif(current_setting('app.request_id',true),'')::uuid);
 return new;
end; $$;
create trigger interaction_validate before insert or update on interactions for each row execute function lf_validate_interaction();
create trigger interaction_record after insert or update on interactions for each row execute function lf_record_activity();
create trigger followup_validate before insert or update on followups for each row execute function lf_validate_followup();
create trigger followup_record after insert or update on followups for each row execute function lf_record_activity();
revoke all on interactions,followups from public;
revoke all on function lf_activity_lead(uuid,uuid,boolean),lf_validate_interaction(),lf_validate_followup(),lf_record_activity() from public;
commit;
