-- Read-only production verification for the anonymous history-window migration.

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'market_data_sync_targets'
      and column_name = 'history_lookback_days'
      and data_type = 'integer'
      and is_nullable = 'NO'
  ) as history_window_column_ready;

select
  count(*) filter (where history_lookback_days between 1 and 36500) as valid_rows,
  count(*) filter (where history_lookback_days not between 1 and 36500) as invalid_rows,
  min(history_lookback_days) as minimum_days,
  max(history_lookback_days) as maximum_days
from market_data_sync_targets;
