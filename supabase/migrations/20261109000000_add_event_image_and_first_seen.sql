-- A picture for each show, linked from Ticketmaster's image server. Null when there's only a placeholder.
alter table public.events add column if not exists image_url text check (image_url ~* '^https://');

-- When a sync first saw the show, for the "Just added" stamp. Shows stored before this column
-- existed stay null, so they aren't all marked as new. The sync never sends this column, so new
-- rows get the default and later updates leave it alone.
alter table public.events add column if not exists first_seen_at timestamptz;
alter table public.events alter column first_seen_at set default now();

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
  first_seen_at
from public.events;

revoke all on public.events_with_timing from anon, authenticated;
grant select on public.events_with_timing to anon, authenticated;
