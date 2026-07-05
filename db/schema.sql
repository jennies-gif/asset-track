-- Asset Trail initial relational schema draft.
-- Monetary amounts use integer minor units. Quantities, prices, NAVs and FX rates
-- use PostgreSQL numeric to avoid floating-point error.

create table users (
  id uuid primary key,
  email text not null unique,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  display_currency char(3) not null default 'CNY',
  timezone text not null default 'Asia/Shanghai',
  local_only_mode boolean not null default false,
  cloud_sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table accounts (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  base_currency char(3) not null,
  account_type text not null default 'investment',
  visibility text not null default 'private',
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table instruments (
  id uuid primary key,
  symbol text not null,
  name text not null,
  asset_type text not null,
  market text not null,
  exchange text,
  currency char(3) not null,
  universe_key text not null default 'manual',
  is_tradable boolean not null default true,
  requires_nav boolean not null default false,
  data_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, symbol)
);

create table index_universes (
  id uuid primary key,
  index_key text not null unique,
  name text not null,
  market text not null,
  currency char(3) not null,
  source text not null,
  source_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table index_constituents (
  id uuid primary key,
  index_key text not null references index_universes(index_key) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  symbol text not null,
  name text not null,
  market text not null,
  exchange text,
  currency char(3) not null,
  weight_bps integer,
  effective_from date not null,
  effective_to date,
  source text not null,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (index_key, instrument_id, effective_from),
  check (weight_bps is null or weight_bps >= 0),
  check (effective_to is null or effective_to >= effective_from)
);

create index index_constituents_current_idx
  on index_constituents(index_key, effective_from, effective_to);

create index index_constituents_instrument_idx
  on index_constituents(instrument_id, effective_from desc);

create table asset_aliases (
  id uuid primary key,
  instrument_id uuid not null references instruments(id) on delete cascade,
  source text not null,
  source_symbol text not null,
  created_at timestamptz not null default now(),
  unique (source, source_symbol)
);

create table attachments (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  filename text not null,
  content_type text not null,
  storage_key text not null,
  byte_size bigint not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  instrument_id uuid not null references instruments(id),
  transaction_type text not null,
  occurred_at timestamptz not null,
  settled_at timestamptz,
  quantity_decimal numeric(38, 12) not null,
  price_decimal numeric(38, 12) not null,
  trade_currency char(3) not null,
  gross_amount_minor bigint not null,
  fee_amount_minor bigint not null default 0,
  tax_amount_minor bigint not null default 0,
  dividend_amount_minor bigint not null default 0,
  interest_amount_minor bigint not null default 0,
  fx_rate_decimal numeric(38, 12) not null,
  cashflow_amount_minor bigint not null default 0,
  source text not null default 'user_input',
  source_ref text,
  memo text,
  attachment_id uuid references attachments(id),
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_decimal >= 0),
  check (price_decimal >= 0),
  check (fx_rate_decimal > 0)
);

create index transactions_user_account_time_idx on transactions(user_id, account_id, occurred_at desc);
create index transactions_instrument_time_idx on transactions(instrument_id, occurred_at desc);

create table positions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  instrument_id uuid not null references instruments(id),
  quantity_decimal numeric(38, 12) not null,
  average_cost_price_decimal numeric(38, 12) not null,
  cost_amount_minor bigint not null,
  market_price_decimal numeric(38, 12) not null,
  market_value_minor bigint not null,
  unrealized_pnl_minor bigint not null,
  return_bps integer not null,
  priced_at date,
  price_source text,
  status text not null default 'open',
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, instrument_id)
);

create table closed_positions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  instrument_id uuid not null references instruments(id),
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  quantity_decimal numeric(38, 12) not null,
  cost_amount_minor bigint not null,
  close_amount_minor bigint not null,
  realized_pnl_minor bigint not null,
  close_reason text,
  created_at timestamptz not null default now()
);

create table price_snapshots (
  id uuid primary key,
  instrument_id uuid not null references instruments(id) on delete cascade,
  trade_date date not null,
  market text not null,
  currency char(3) not null,
  close_price_decimal numeric(38, 12) not null,
  adjusted_close_price_decimal numeric(38, 12),
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_id, trade_date, source),
  check (close_price_decimal > 0)
);

create table fund_nav_snapshots (
  id uuid primary key,
  instrument_id uuid not null references instruments(id) on delete cascade,
  nav_date date not null,
  announced_at timestamptz,
  unit_nav_decimal numeric(38, 12) not null,
  accumulated_nav_decimal numeric(38, 12),
  adjusted_unit_nav_decimal numeric(38, 12),
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instrument_id, nav_date, source),
  check (unit_nav_decimal > 0)
);

create table fx_rate_snapshots (
  id uuid primary key,
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate_date date not null,
  rate_decimal numeric(38, 12) not null,
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  created_at timestamptz not null default now(),
  unique (base_currency, quote_currency, rate_date, source),
  check (rate_decimal > 0)
);

-- Runtime market-data cache used by the standalone API before the full
-- instrument-backed repository is introduced. Rows keep the normalized payload
-- used by the current app while preserving decimal-safe typed columns.
create table market_data_price_snapshots (
  symbol text not null,
  name text not null,
  market text not null,
  currency char(3) not null,
  trade_date date not null,
  close_price_decimal numeric(38, 12) not null,
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (symbol, market, trade_date, source),
  check (close_price_decimal > 0)
);

create index market_data_price_symbol_date_idx
  on market_data_price_snapshots(symbol, market, trade_date desc);

create table market_data_fund_nav_snapshots (
  symbol text not null,
  name text not null,
  market text not null,
  currency char(3) not null,
  nav_date date not null,
  unit_nav_decimal numeric(38, 12) not null,
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (symbol, market, nav_date, source),
  check (unit_nav_decimal > 0)
);

create index market_data_nav_symbol_date_idx
  on market_data_fund_nav_snapshots(symbol, market, nav_date desc);

create table market_data_fx_rate_snapshots (
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate_date date not null,
  rate_decimal numeric(38, 12) not null,
  source text not null,
  source_fetched_at timestamptz not null,
  quality_status text not null default 'ok',
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (base_currency, quote_currency, rate_date, source),
  check (rate_decimal > 0)
);

create table market_data_runs (
  id text primary key,
  command text not null,
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  requested_symbols text[] not null default '{}',
  success_count integer not null default 0,
  skipped_count integer not null default 0,
  failure_count integer not null default 0,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table valuation_snapshots (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  snapshot_date date not null,
  display_currency char(3) not null,
  market_value_minor bigint not null,
  cost_amount_minor bigint not null,
  cashflow_amount_minor bigint not null default 0,
  realized_pnl_minor bigint not null default 0,
  unrealized_pnl_minor bigint not null default 0,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  unique (user_id, account_id, snapshot_date, display_currency)
);

create table user_asset_daily_price_snapshots (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  position_id uuid not null references positions(id) on delete cascade,
  instrument_id uuid not null references instruments(id),
  price_date date not null,
  close_price_decimal numeric(38, 12) not null,
  price_type text not null,
  price_basis text not null,
  carried_from_date date,
  source text not null,
  source_fetched_at timestamptz,
  quality_status text not null default 'ok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, position_id, instrument_id, price_date),
  check (close_price_decimal > 0),
  check (price_type in ('close', 'unit_nav')),
  check (price_basis in ('actual', 'carry_forward')),
  check (quality_status in ('ok', 'carried_forward', 'missing', 'error'))
);

create index user_asset_daily_prices_user_instrument_date_idx
  on user_asset_daily_price_snapshots(user_id, instrument_id, price_date desc);

create table attribution_runs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  display_currency char(3) not null,
  start_value_minor bigint not null,
  end_value_minor bigint not null,
  value_change_minor bigint not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table attribution_items (
  id uuid primary key,
  run_id uuid not null references attribution_runs(id) on delete cascade,
  item_key text not null,
  label text not null,
  amount_minor bigint not null,
  sort_order integer not null,
  unique (run_id, item_key)
);

create table market_data_tasks (
  id uuid primary key,
  universe_key text not null,
  task_type text not null,
  status text not null,
  source text not null,
  start_date date,
  end_date date,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  failure_reason text,
  retry_count integer not null default 0,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz
);

create table import_batches (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  import_type text not null,
  status text not null,
  source_filename text,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table import_rows (
  id uuid primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb,
  status text not null,
  error_message text
);

create table notes (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null,
  format text not null default 'markdown',
  status text not null default 'draft',
  visibility text not null default 'private',
  time_range_start date,
  time_range_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_links (
  id uuid primary key,
  note_id uuid not null references notes(id) on delete cascade,
  target_type text not null,
  target_id uuid not null
);

create table community_posts (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null,
  tag text,
  status text not null default 'pending_review',
  visibility text not null default 'public',
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table community_reports (
  id uuid primary key,
  post_id uuid not null references community_posts(id) on delete cascade,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table audit_logs (
  id uuid primary key,
  user_id uuid references users(id) on delete set null,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_payload jsonb,
  after_payload jsonb,
  reason text,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_logs_user_time_idx on audit_logs(user_id, created_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);
