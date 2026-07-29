-- LIVI v0.5: immutable, encrypted, multi-device save history and memory.
-- The legacy cloud_saves table stays readable/deletable for one-way v0.4
-- migration, while v0.5 revokes writes so plaintext cannot reappear.

create schema if not exists livi_private;
revoke all on schema livi_private from public, anon, authenticated;

create or replace function public.livi_server_clock()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select clock_timestamp();
$$;

create table public.cloud_devices (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'LIVI device'
    check (char_length(label) between 1 and 48),
  platform text not null default 'web'
    check (platform in ('web', 'ios', 'android', 'desktop', 'unknown')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.cloud_account_metadata (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  active_generation integer not null default 1
    check (active_generation between 1 and 1000000),
  encryption_version smallint not null default 1
    check (encryption_version between 1 and 32),
  key_version integer not null default 1
    check (key_version between 1 and 1000000),
  kdf_algorithm text not null default 'PBKDF2-SHA-256'
    check (kdf_algorithm = 'PBKDF2-SHA-256'),
  kdf_iterations integer not null default 600000
    check (kdf_iterations between 310000 and 2000000),
  password_salt text not null
    check (char_length(password_salt) between 16 and 256),
  password_wrapped_key text not null
    check (char_length(password_wrapped_key) between 16 and 1024),
  password_wrap_iv text not null
    check (char_length(password_wrap_iv) between 12 and 128),
  recovery_salt text not null
    check (char_length(recovery_salt) between 16 and 256),
  recovery_wrapped_key text not null
    check (char_length(recovery_wrapped_key) between 16 and 1024),
  recovery_wrap_iv text not null
    check (char_length(recovery_wrap_iv) between 12 and 128),
  legacy_migrated_at timestamptz,
  autosave_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.cloud_save_revisions (
  revision_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_revision_id uuid not null,
  device_id uuid not null,
  parent_revision_id uuid,
  merge_parent_revision_id uuid,
  restored_from_revision_id uuid,
  generation integer not null
    check (generation between 1 and 1000000),
  save_version integer not null
    check (save_version between 1 and 1000000),
  revision_kind text not null default 'periodic'
    check (revision_kind in (
      'periodic', 'milestone', 'manual', 'merge', 'restore',
      'legacy', 'migration'
    )),
  sync_status text not null
    check (sync_status in ('accepted', 'conflict')),
  milestone_type text
    check (
      milestone_type is null
      or milestone_type ~ '^[a-z][a-z0-9_-]{1,47}$'
    ),
  encryption_algorithm text not null default 'AES-GCM-256'
    check (encryption_algorithm = 'AES-GCM-256'),
  key_version integer not null
    check (key_version between 1 and 1000000),
  compression text not null default 'none'
    check (compression in ('gzip', 'none')),
  payload_ciphertext text not null
    check (char_length(payload_ciphertext) between 16 and 15000000),
  payload_iv text not null
    check (char_length(payload_iv) between 12 and 128),
  payload_checksum text not null
    check (payload_checksum ~ '^[0-9a-f]{64}$'),
  plaintext_bytes integer not null
    check (plaintext_bytes between 2 and 50000000),
  device_timestamp timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, client_revision_id),
  unique (revision_id, owner_id),
  foreign key (device_id, owner_id)
    references public.cloud_devices (id, owner_id) on delete restrict,
  foreign key (parent_revision_id, owner_id)
    references public.cloud_save_revisions (revision_id, owner_id)
    on delete restrict,
  foreign key (merge_parent_revision_id, owner_id)
    references public.cloud_save_revisions (revision_id, owner_id)
    on delete restrict,
  foreign key (restored_from_revision_id, owner_id)
    references public.cloud_save_revisions (revision_id, owner_id)
    on delete restrict,
  check (
    merge_parent_revision_id is null
    or merge_parent_revision_id <> parent_revision_id
  )
);

create table public.cloud_save_heads (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  revision_id uuid,
  revision_count bigint not null default 0
    check (revision_count >= 0),
  conflict_count bigint not null default 0
    check (conflict_count >= 0),
  updated_at timestamptz not null default now(),
  foreign key (revision_id, owner_id)
    references public.cloud_save_revisions (revision_id, owner_id)
    on delete restrict
);

create table public.cloud_keyring_revisions (
  keyring_revision_id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  key_version integer not null check (key_version between 1 and 1000000),
  encryption_version smallint not null check (encryption_version between 1 and 32),
  kdf_algorithm text not null check (kdf_algorithm = 'PBKDF2-SHA-256'),
  kdf_iterations integer not null check (kdf_iterations between 310000 and 2000000),
  password_salt text not null,
  password_wrapped_key text not null,
  password_wrap_iv text not null,
  recovery_salt text not null,
  recovery_wrapped_key text not null,
  recovery_wrap_iv text not null,
  reason text not null
    check (reason in (
      'provisioned', 'before-password-change', 'password-changed'
    )),
  created_at timestamptz not null default now()
);

create table public.blob_memory_episodes (
  event_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_event_id uuid not null,
  device_id uuid not null,
  generation integer not null
    check (generation between 1 and 1000000),
  event_type text not null
    check (event_type ~ '^[a-z][a-z0-9_-]{1,47}$'),
  importance smallint not null
    check (importance between 1 and 5),
  occurred_at timestamptz not null,
  encryption_algorithm text not null default 'AES-GCM-256'
    check (encryption_algorithm = 'AES-GCM-256'),
  key_version integer not null
    check (key_version between 1 and 1000000),
  compression text not null default 'none'
    check (compression in ('gzip', 'none')),
  payload_ciphertext text not null
    check (char_length(payload_ciphertext) between 16 and 2000000),
  payload_iv text not null
    check (char_length(payload_iv) between 12 and 128),
  payload_checksum text not null
    check (payload_checksum ~ '^[0-9a-f]{64}$'),
  plaintext_bytes integer not null
    check (plaintext_bytes between 2 and 5000000),
  created_at timestamptz not null default now(),
  unique (owner_id, client_event_id),
  unique (event_id, owner_id),
  foreign key (device_id, owner_id)
    references public.cloud_devices (id, owner_id) on delete restrict
);

create table public.blob_routine_summaries (
  summary_id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_summary_id uuid not null,
  device_id uuid not null,
  supersedes_summary_id uuid,
  summary_day date not null,
  generation integer not null
    check (generation between 1 and 1000000),
  encryption_algorithm text not null default 'AES-GCM-256'
    check (encryption_algorithm = 'AES-GCM-256'),
  key_version integer not null
    check (key_version between 1 and 1000000),
  compression text not null default 'none'
    check (compression in ('gzip', 'none')),
  payload_ciphertext text not null
    check (char_length(payload_ciphertext) between 16 and 2000000),
  payload_iv text not null
    check (char_length(payload_iv) between 12 and 128),
  payload_checksum text not null
    check (payload_checksum ~ '^[0-9a-f]{64}$'),
  plaintext_bytes integer not null
    check (plaintext_bytes between 2 and 5000000),
  created_at timestamptz not null default now(),
  unique (owner_id, client_summary_id),
  unique (summary_id, owner_id),
  foreign key (device_id, owner_id)
    references public.cloud_devices (id, owner_id) on delete restrict,
  foreign key (supersedes_summary_id, owner_id)
    references public.blob_routine_summaries (summary_id, owner_id)
    on delete restrict
);

create index cloud_devices_owner_last_seen_idx
  on public.cloud_devices (owner_id, last_seen_at desc);
create index cloud_save_revisions_owner_created_idx
  on public.cloud_save_revisions (owner_id, created_at desc);
create index cloud_save_revisions_owner_parent_idx
  on public.cloud_save_revisions (owner_id, parent_revision_id);
create index cloud_save_revisions_device_idx
  on public.cloud_save_revisions (device_id, owner_id);
create index cloud_save_revisions_merge_parent_idx
  on public.cloud_save_revisions (merge_parent_revision_id, owner_id)
  where merge_parent_revision_id is not null;
create index cloud_save_revisions_restore_source_idx
  on public.cloud_save_revisions (restored_from_revision_id, owner_id)
  where restored_from_revision_id is not null;
create index cloud_save_revisions_owner_conflicts_idx
  on public.cloud_save_revisions (owner_id, created_at desc)
  where sync_status = 'conflict';
create index cloud_save_revisions_milestones_idx
  on public.cloud_save_revisions (owner_id, created_at desc)
  where revision_kind in ('milestone', 'legacy', 'restore');
create index blob_memory_episodes_owner_occurred_idx
  on public.blob_memory_episodes (owner_id, occurred_at desc);
create index blob_memory_episodes_owner_type_idx
  on public.blob_memory_episodes (owner_id, event_type, occurred_at desc);
create index blob_memory_episodes_device_idx
  on public.blob_memory_episodes (device_id, owner_id);
create index blob_routine_summaries_owner_day_idx
  on public.blob_routine_summaries
    (owner_id, summary_day desc, created_at desc);
create index blob_routine_summaries_device_idx
  on public.blob_routine_summaries (device_id, owner_id);
create index blob_routine_summaries_supersedes_idx
  on public.blob_routine_summaries (supersedes_summary_id, owner_id)
  where supersedes_summary_id is not null;

alter table public.cloud_devices enable row level security;
alter table public.cloud_account_metadata enable row level security;
alter table public.cloud_keyring_revisions enable row level security;
alter table public.cloud_save_revisions enable row level security;
alter table public.cloud_save_heads enable row level security;
alter table public.blob_memory_episodes enable row level security;
alter table public.blob_routine_summaries enable row level security;

create policy "Owners delete migrated plaintext saves"
on public.cloud_saves for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners manage enrolled devices"
on public.cloud_devices for all
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners read account encryption metadata"
on public.cloud_account_metadata for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners create account encryption metadata"
on public.cloud_account_metadata for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update account encryption metadata"
on public.cloud_account_metadata for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners read keyring history"
on public.cloud_keyring_revisions for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners append keyring history"
on public.cloud_keyring_revisions for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners read immutable save history"
on public.cloud_save_revisions for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners read their save head"
on public.cloud_save_heads for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners read permanent memories"
on public.blob_memory_episodes for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners append permanent memories"
on public.blob_memory_episodes for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners read routine summaries"
on public.blob_routine_summaries for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners append routine summaries"
on public.blob_routine_summaries for insert
to authenticated
with check (owner_id = (select auth.uid()));

create or replace function livi_private.push_cloud_revision_internal(
  p_revision_id uuid,
  p_client_revision_id uuid,
  p_device_id uuid,
  p_parent_revision_id uuid,
  p_merge_parent_revision_id uuid,
  p_restored_from_revision_id uuid,
  p_generation integer,
  p_save_version integer,
  p_revision_kind text,
  p_milestone_type text,
  p_key_version integer,
  p_compression text,
  p_payload_ciphertext text,
  p_payload_iv text,
  p_payload_checksum text,
  p_plaintext_bytes integer,
  p_device_timestamp timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_head_revision_id uuid;
  v_existing public.cloud_save_revisions%rowtype;
  v_status text;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.cloud_devices
    where id = p_device_id and owner_id = v_owner_id
  ) then
    raise exception 'Device is not enrolled for this account'
      using errcode = '23503';
  end if;

  insert into public.cloud_save_heads (owner_id)
  values (v_owner_id)
  on conflict (owner_id) do nothing;

  select revision_id into v_head_revision_id
  from public.cloud_save_heads
  where owner_id = v_owner_id
  for update;

  select * into v_existing
  from public.cloud_save_revisions
  where owner_id = v_owner_id
    and client_revision_id = p_client_revision_id;

  if found then
    if v_existing.payload_checksum <> p_payload_checksum
      or v_existing.revision_id <> p_revision_id
      or v_existing.device_id <> p_device_id
      or v_existing.parent_revision_id is distinct from p_parent_revision_id
      or v_existing.merge_parent_revision_id
        is distinct from p_merge_parent_revision_id
      or v_existing.restored_from_revision_id
        is distinct from p_restored_from_revision_id
      or v_existing.generation <> p_generation
      or v_existing.save_version <> p_save_version
      or v_existing.revision_kind <> p_revision_kind
      or v_existing.milestone_type is distinct from p_milestone_type
      or v_existing.key_version <> p_key_version
      or v_existing.device_timestamp is distinct from p_device_timestamp
    then
      raise exception 'Client revision id was reused with different immutable metadata'
        using errcode = '23505';
    end if;
    select revision_id into v_head_revision_id
      from public.cloud_save_heads where owner_id = v_owner_id;
    return jsonb_build_object(
      'status', 'idempotent',
      'revision_id', v_existing.revision_id,
      'revision_status', v_existing.sync_status,
      'head_revision_id', v_head_revision_id
    );
  end if;

  if p_parent_revision_id is not null and not exists (
    select 1 from public.cloud_save_revisions
    where revision_id = p_parent_revision_id and owner_id = v_owner_id
  ) then
    raise exception 'Parent revision does not belong to this account'
      using errcode = '23503';
  end if;

  if p_merge_parent_revision_id is not null and not exists (
    select 1 from public.cloud_save_revisions
    where revision_id = p_merge_parent_revision_id and owner_id = v_owner_id
  ) then
    raise exception 'Merge parent does not belong to this account'
      using errcode = '23503';
  end if;

  if p_restored_from_revision_id is not null and not exists (
    select 1 from public.cloud_save_revisions
    where revision_id = p_restored_from_revision_id and owner_id = v_owner_id
  ) then
    raise exception 'Restore source does not belong to this account'
      using errcode = '23503';
  end if;

  v_status := case
    when v_head_revision_id is not distinct from p_parent_revision_id
      then 'accepted'
    else 'conflict'
  end;

  insert into public.cloud_save_revisions (
    revision_id, owner_id, client_revision_id, device_id,
    parent_revision_id, merge_parent_revision_id,
    restored_from_revision_id, generation, save_version,
    revision_kind, sync_status, milestone_type, key_version,
    compression, payload_ciphertext, payload_iv, payload_checksum,
    plaintext_bytes, device_timestamp
  ) values (
    p_revision_id, v_owner_id, p_client_revision_id, p_device_id,
    p_parent_revision_id, p_merge_parent_revision_id,
    p_restored_from_revision_id, p_generation, p_save_version,
    p_revision_kind, v_status, p_milestone_type, p_key_version,
    p_compression, p_payload_ciphertext, p_payload_iv,
    p_payload_checksum, p_plaintext_bytes, p_device_timestamp
  );

  update public.cloud_save_heads
  set
    revision_id = case
      when v_status = 'accepted' then p_revision_id
      else revision_id
    end,
    revision_count = revision_count + 1,
    conflict_count = conflict_count
      + case when v_status = 'conflict' then 1 else 0 end,
    updated_at = now()
  where owner_id = v_owner_id;

  return jsonb_build_object(
    'status', v_status,
    'revision_id', p_revision_id,
    'revision_status', v_status,
    'head_revision_id', case
      when v_status = 'accepted' then p_revision_id
      else v_head_revision_id
    end,
    'conflicting_revision_id', case
      when v_status = 'conflict' then p_revision_id
      else null
    end
  );
end;
$$;

create or replace function public.push_cloud_revision(
  p_revision_id uuid,
  p_client_revision_id uuid,
  p_device_id uuid,
  p_parent_revision_id uuid default null,
  p_merge_parent_revision_id uuid default null,
  p_restored_from_revision_id uuid default null,
  p_generation integer default 1,
  p_save_version integer default 1,
  p_revision_kind text default 'periodic',
  p_milestone_type text default null,
  p_key_version integer default 1,
  p_compression text default 'none',
  p_payload_ciphertext text default '',
  p_payload_iv text default '',
  p_payload_checksum text default '',
  p_plaintext_bytes integer default 2,
  p_device_timestamp timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select livi_private.push_cloud_revision_internal(
    p_revision_id, p_client_revision_id, p_device_id,
    p_parent_revision_id, p_merge_parent_revision_id,
    p_restored_from_revision_id, p_generation, p_save_version,
    p_revision_kind, p_milestone_type, p_key_version,
    p_compression, p_payload_ciphertext, p_payload_iv,
    p_payload_checksum, p_plaintext_bytes, p_device_timestamp
  );
$$;

revoke all on function livi_private.push_cloud_revision_internal(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, text, text,
  integer, text, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant usage on schema livi_private to authenticated;
grant execute on function livi_private.push_cloud_revision_internal(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, text, text,
  integer, text, text, text, text, integer, timestamptz
) to authenticated;

revoke all on function public.push_cloud_revision(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, text, text,
  integer, text, text, text, text, integer, timestamptz
) from public, anon;
grant execute on function public.push_cloud_revision(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, text, text,
  integer, text, text, text, text, integer, timestamptz
) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.cloud_devices to authenticated;
grant select, insert, update on public.cloud_account_metadata to authenticated;
grant select, insert on public.cloud_keyring_revisions to authenticated;
grant select on public.cloud_save_revisions, public.cloud_save_heads
  to authenticated;
grant select, insert on public.blob_memory_episodes,
  public.blob_routine_summaries to authenticated;
grant delete on public.cloud_saves to authenticated;
revoke insert, update on public.cloud_saves from authenticated;
grant execute on function public.livi_server_clock() to authenticated;

comment on table public.cloud_save_revisions is
  'Append-only encrypted LIVI checkpoints. Conflicting branches are preserved.';
comment on table public.cloud_keyring_revisions is
  'Append-only recovery wrappers retained before and after credential changes.';
comment on table public.blob_memory_episodes is
  'Permanent, client-encrypted episodic memories. No update or delete grant.';
comment on table public.blob_routine_summaries is
  'Append-only client-encrypted daily routine summaries.';
