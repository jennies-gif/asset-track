-- Add the public, user-unlinked market-data synchronization target pool.
-- Production prerequisite: create a Supabase recovery point or database backup.
-- This migration is additive and does not read or modify private asset tables.

begin;

create table if not exists market_data_sync_targets (
  symbol text not null,
  market text not null,
  source_type text not null default 'user_requested',
  status text not null default 'active',
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (market, symbol),
  check (source_type in ('user_requested', 'benchmark')),
  check (status in ('active', 'error'))
);

create index if not exists market_data_sync_targets_status_idx
  on market_data_sync_targets(status, market, symbol);

alter table market_data_sync_targets enable row level security;

comment on table market_data_sync_targets is
  'Public market symbols maintained for shared price synchronization; must not contain user or private asset identifiers.';

commit;
