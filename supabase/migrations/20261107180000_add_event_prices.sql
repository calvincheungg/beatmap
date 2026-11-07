-- Ticket prices, when the source gives them. Null means unknown, never free.
alter table public.events add column if not exists price_min numeric(10, 2);
alter table public.events add column if not exists price_max numeric(10, 2);
alter table public.events add column if not exists currency text;

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
  currency
from public.events;

revoke all on public.events_with_timing from anon, authenticated;
grant select on public.events_with_timing to anon, authenticated;
