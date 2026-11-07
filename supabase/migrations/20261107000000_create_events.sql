-- The starting point: events, read-only public access and the timing view.
-- This matches what's already in production, where it's marked as applied rather than run.
-- Visitors can only read. Only the service key, used by the GitHub Action, can write.

create table if not exists public.events (
  source text not null,
  source_id text not null,
  -- The venue's id from src/data/toronto_music_venues.csv. Venues aren't in the database yet.
  venue_id text not null,
  name text not null,
  -- The date and time at the venue, in Toronto time.
  local_date date not null,
  local_time time,
  status text not null,
  url text not null check (url ~* '^https?://'),
  -- When the last sync saw this event. Upcoming events that a sync didn't see get removed.
  fetched_at timestamptz not null default now(),
  primary key (source, source_id)
);

alter table public.events add column if not exists genre text;
alter table public.events add column if not exists sub_genre text;

create index if not exists events_venue_date on public.events (venue_id, local_date);
create index if not exists events_date on public.events (local_date);

alter table public.events enable row level security;

drop policy if exists "Anyone can read events" on public.events;
create policy "Anyone can read events" on public.events
  for select to anon, authenticated using (true);

-- Row level security already blocks writes. Removing the grants is a second layer.
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;

-- Works out whether a show is over, so that never has to be stored or kept up to date.
-- A show counts as upcoming until the end of its day in Toronto.
create or replace view public.events_with_timing
with (security_invoker = true) as
select
  source,
  source_id,
  venue_id,
  name,
  local_date,
  local_time,
  status,
  url,
  (local_date + coalesce(local_time, time '00:00')) at time zone 'America/Toronto' as starts_at,
  case
    when local_date < (now() at time zone 'America/Toronto')::date then 'over'
    else 'upcoming'
  end as timing,
  genre,
  sub_genre
from public.events;

revoke all on public.events_with_timing from anon, authenticated;
grant select on public.events_with_timing to anon, authenticated;
