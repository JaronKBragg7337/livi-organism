create table public.blob_profiles (
  id bigint generated always as identity primary key,
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z][a-z0-9-]{4,31}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 24),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  phenotype text not null default 'Unclassified',
  life_phase text not null default 'Hatchling',
  age_minutes double precision not null default 0
    check (age_minutes >= 0),
  living_cells integer not null default 0
    check (living_cells between 0 and 2000),
  bond numeric(5, 4) not null default 0
    check (bond between 0 and 1),
  room_id text not null default 'atrium',
  equipped_toy text,
  achievements text[] not null default '{}',
  traits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.cloud_saves (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  save_version integer not null default 1
    check (save_version > 0),
  save_data jsonb not null
    check (jsonb_typeof(save_data) = 'object'),
  checksum text not null
    check (char_length(checksum) between 8 and 128),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.blob_visits (
  id bigint generated always as identity primary key,
  host_profile_id bigint not null
    references public.blob_profiles (id) on delete cascade,
  visitor_profile_id bigint not null
    references public.blob_profiles (id) on delete cascade,
  gift_type text not null default 'hello'
    check (gift_type in ('hello', 'nutrient', 'play')),
  visit_day date not null default current_date,
  created_at timestamptz not null default now(),
  unique (host_profile_id, visitor_profile_id, visit_day),
  check (host_profile_id <> visitor_profile_id)
);

create table public.blob_friendships (
  id bigint generated always as identity primary key,
  requester_profile_id bigint not null
    references public.blob_profiles (id) on delete cascade,
  addressee_profile_id bigint not null
    references public.blob_profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (requester_profile_id <> addressee_profile_id)
);

create unique index blob_friendships_pair_idx
  on public.blob_friendships (
    least(requester_profile_id, addressee_profile_id),
    greatest(requester_profile_id, addressee_profile_id)
  );
create index blob_profiles_public_updated_idx
  on public.blob_profiles (updated_at desc)
  where visibility = 'public';
create index blob_visits_host_profile_id_idx
  on public.blob_visits (host_profile_id);
create index blob_visits_visitor_profile_id_idx
  on public.blob_visits (visitor_profile_id);
create index blob_friendships_requester_profile_id_idx
  on public.blob_friendships (requester_profile_id);
create index blob_friendships_addressee_profile_id_idx
  on public.blob_friendships (addressee_profile_id);

alter table public.blob_profiles enable row level security;
alter table public.cloud_saves enable row level security;
alter table public.blob_visits enable row level security;
alter table public.blob_friendships enable row level security;

create policy "Public profiles are readable"
on public.blob_profiles for select
to anon, authenticated
using (
  visibility = 'public'
  or owner_id = (select auth.uid())
);

create policy "Owners create their profile"
on public.blob_profiles for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update their profile"
on public.blob_profiles for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners read their cloud save"
on public.cloud_saves for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "Owners create their cloud save"
on public.cloud_saves for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update their cloud save"
on public.cloud_saves for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Public visits are readable"
on public.blob_visits for select
to anon, authenticated
using (
  exists (
    select 1
    from public.blob_profiles as host
    where host.id = host_profile_id
      and (
        host.visibility = 'public'
        or host.owner_id = (select auth.uid())
      )
  )
);

create policy "Visitors create one daily visit"
on public.blob_visits for insert
to authenticated
with check (
  visit_day = current_date
  and exists (
    select 1
    from public.blob_profiles as visitor
    where visitor.id = visitor_profile_id
      and visitor.owner_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.blob_profiles as host
    where host.id = host_profile_id
      and host.visibility = 'public'
  )
);

create policy "Friendship participants can read"
on public.blob_friendships for select
to authenticated
using (
  exists (
    select 1
    from public.blob_profiles as profile
    where profile.owner_id = (select auth.uid())
      and profile.id in (requester_profile_id, addressee_profile_id)
  )
);

create policy "Owners send friendship requests"
on public.blob_friendships for insert
to authenticated
with check (
  status = 'pending'
  and exists (
    select 1
    from public.blob_profiles as requester
    where requester.id = requester_profile_id
      and requester.owner_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.blob_profiles as addressee
    where addressee.id = addressee_profile_id
      and addressee.visibility = 'public'
  )
);

create policy "Addressees answer friendship requests"
on public.blob_friendships for update
to authenticated
using (
  exists (
    select 1
    from public.blob_profiles as addressee
    where addressee.id = addressee_profile_id
      and addressee.owner_id = (select auth.uid())
  )
)
with check (
  status in ('accepted', 'declined')
  and exists (
    select 1
    from public.blob_profiles as addressee
    where addressee.id = addressee_profile_id
      and addressee.owner_id = (select auth.uid())
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.blob_profiles, public.blob_visits to anon, authenticated;
grant insert, update on public.blob_profiles to authenticated;
grant select, insert, update on public.cloud_saves to authenticated;
grant insert on public.blob_visits to authenticated;
grant select, insert, update on public.blob_friendships to authenticated;
grant usage, select on all sequences in schema public to authenticated;
