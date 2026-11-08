-- Facts read from venues' show pages, so each page is fetched again only every few days.
-- Only the sync script uses it, with the service key. Visitors can't read it.
create table if not exists public.venue_page_cache (
  url text primary key check (url ~* '^https://'),
  source text not null,
  fetched_at timestamptz not null default now(),
  -- Performance facts only: dates, times, prices and availability. Never descriptions or images.
  rows jsonb not null default '[]'
);

create index if not exists venue_page_cache_source on public.venue_page_cache (source, fetched_at);

alter table public.venue_page_cache enable row level security;
-- No policies: row level security then refuses everyone except the service key.
revoke all on public.venue_page_cache from anon, authenticated;
