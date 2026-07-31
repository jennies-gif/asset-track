-- Persist the public history window required for unattended market-data repair.
-- Production prerequisite: create a Supabase recovery point or database backup.
-- This migration is additive and does not read or modify private asset tables.

begin;

alter table market_data_sync_targets
  add column if not exists history_lookback_days integer not null default 7;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_data_sync_targets_history_lookback_days_check'
      and conrelid = 'market_data_sync_targets'::regclass
  ) then
    alter table market_data_sync_targets
      add constraint market_data_sync_targets_history_lookback_days_check
      check (history_lookback_days between 1 and 36500);
  end if;
end
$$;

with public_history_bounds as (
  select symbol, market, min(price_date) as earliest_date
  from (
    select symbol, market, trade_date as price_date
    from market_data_price_snapshots
    union all
    select symbol, market, nav_date as price_date
    from market_data_fund_nav_snapshots
  ) public_rows
  group by symbol, market
)
update market_data_sync_targets target
set history_lookback_days = greatest(
  target.history_lookback_days,
  least(36500, current_date - bounds.earliest_date + 1)
)
from public_history_bounds bounds
where bounds.symbol = target.symbol
  and bounds.market = target.market;

comment on column market_data_sync_targets.history_lookback_days is
  'Largest anonymous public-history window requested for this symbol; contains no user or asset identifier.';

commit;
