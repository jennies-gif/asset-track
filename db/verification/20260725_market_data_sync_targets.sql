-- Run with the same PostgreSQL role used by the deployed API after migration.
-- All checks are read-only.

select
  to_regclass('public.market_data_sync_targets') is not null as table_exists;

select
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'market_data_sync_targets';

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'market_data_sync_targets'
order by indexname;

select
  current_user as database_role,
  has_table_privilege(current_user, 'public.market_data_sync_targets', 'select') as can_select,
  has_table_privilege(current_user, 'public.market_data_sync_targets', 'insert') as can_insert,
  has_table_privilege(current_user, 'public.market_data_sync_targets', 'update') as can_update;

select
  count(*) as target_count,
  count(*) filter (where source_type = 'benchmark') as benchmark_count,
  count(*) filter (where source_type = 'user_requested') as user_requested_count,
  count(*) filter (where status = 'error') as error_count
from market_data_sync_targets;
