-- A broad category for each show: Music, Dance, Theatre, Comedy, Film, Talks, Family or Other.
-- Ticketmaster shows are all Music. Venue box office listings are sorted by src/data/categories.ts.
alter table public.events add column if not exists category text not null default 'Music';

-- New columns can only go at the end of an existing view.
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
  sub_genre,
  artists,
  price_min,
  price_max,
  currency,
  age_restriction,
  image_url,
  first_seen_at,
  category
from public.events;

revoke all on public.events_with_timing from anon, authenticated;
grant select on public.events_with_timing to anon, authenticated;
