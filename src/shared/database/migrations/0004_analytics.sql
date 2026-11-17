begin;
-- 1. Historical truth: every stage event keeps the kind its destination stage had when the event happened.
-- The table lock taken here is held until COMMIT, so no event can be inserted between the backfill and the trigger.
alter table lead_stage_events add column to_stage_kind text check(to_stage_kind in('open','won','lost'));
alter table lead_stage_events no force row level security;
update lead_stage_events e set to_stage_kind=s.kind from stages s where s.organization_id=e.organization_id and s.id=e.to_stage_id;
alter table lead_stage_events force row level security;
alter table lead_stage_events alter column to_stage_kind set not null;
create index lead_stage_events_won_idx on lead_stage_events(organization_id,lead_id) where to_stage_kind='won';
-- A table trigger, not a new body for lf_record_lead: it also stamps inserts issued by calls that were already
-- executing the previous function while waiting for this migration's locks, and it ignores any supplied value.
create function lf_stamp_stage_event() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare stage_kind text;
begin
 select s.kind into stage_kind from public.stages s where s.organization_id=new.organization_id and s.id=new.to_stage_id;
 if not found then raise exception 'unknown stage' using errcode='23503';end if;
 new.to_stage_kind:=stage_kind;return new;
end; $$;
create trigger stage_event_stamp before insert on lead_stage_events for each row execute function lf_stamp_stage_event();

-- 2. Saved dashboard cutoffs: an immutable copy of one computed result.
create table dashboard_snapshots(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references organizations(id),created_by text not null,creation_key uuid not null,
 interval_days integer not null check(interval_days in(30,90,180)),as_of timestamptz(3) not null,timezone text not null check(length(timezone) between 1 and 80),
 interval_from timestamptz(3) not null,metrics jsonb not null,created_at timestamptz(3) not null default clock_timestamp(),
 check(interval_from<=as_of),
 check(jsonb_typeof(metrics)='object' and metrics->'interval'->>'days'=interval_days::text and metrics->>'timezone'=timezone),
 unique(organization_id,id),unique(organization_id,created_by,creation_key),
 foreign key(organization_id,created_by) references memberships(organization_id,user_id)
);
create index dashboard_snapshot_list_idx on dashboard_snapshots(organization_id,as_of desc,id desc);
alter table dashboard_snapshots enable row level security;
alter table dashboard_snapshots force row level security;
create policy dashboard_snapshot_member on dashboard_snapshots for all using(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=dashboard_snapshots.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null))
 with check(organization_id::text=current_setting('app.organization_id',true)
 and exists(select 1 from memberships m where m.organization_id=dashboard_snapshots.organization_id and m.user_id=current_setting('app.user_id',true) and m.revoked_at is null));
create function lf_validate_dashboard_snapshot() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare organization_zone text;
begin
 if tg_op<>'INSERT' then raise exception 'immutable snapshot' using errcode='23514';end if;
 if new.organization_id::text is distinct from current_setting('app.organization_id',true) or public.lf_lock_membership(new.organization_id) is null then raise exception 'membership required' using errcode='42501';end if;
 select o.timezone into organization_zone from public.organizations o where o.id=new.organization_id;
 if organization_zone is distinct from new.timezone or new.as_of>clock_timestamp() then raise exception 'incoherent snapshot' using errcode='23514';end if;
 new.created_by:=nullif(current_setting('app.user_id',true),'');new.created_at:=clock_timestamp();return new;
end; $$;
create function lf_record_dashboard_snapshot() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.organization_audit(organization_id,actor_user_id,action,entity_id,request_id)
 values(new.organization_id,new.created_by,'dashboard.snapshot_saved',new.id,nullif(current_setting('app.request_id',true),'')::uuid);
 return new;
end; $$;
create trigger dashboard_snapshot_validate before insert or update or delete on dashboard_snapshots for each row execute function lf_validate_dashboard_snapshot();
create trigger dashboard_snapshot_record after insert on dashboard_snapshots for each row execute function lf_record_dashboard_snapshot();
revoke all on dashboard_snapshots from public;
revoke all on function lf_stamp_stage_event(),lf_validate_dashboard_snapshot(),lf_record_dashboard_snapshot() from public;
commit;
