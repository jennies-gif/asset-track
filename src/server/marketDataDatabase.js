let poolPromise = null;
let schemaReadyPromise = null;

export const instrumentRegistrySearchSql = `
  with matched_instruments as (
    select distinct i.*
    from market_data_instruments i
    left join market_data_instrument_aliases a
      on a.instrument_key = i.instrument_key
    where i.status = 'active'
      and (
        upper(i.symbol) = $3
        or upper(replace(i.symbol, '.OF', '')) = $3
        or a.normalized_alias = $2
        or upper(i.symbol) like $4
        or upper(replace(i.symbol, '.OF', '')) like $4
        or a.normalized_alias like $5
        or upper(replace(i.name, ' ', '')) like $1
        or upper(replace(coalesce(a.alias, ''), ' ', '')) like $1
      )
    order by i.market asc, i.symbol asc
    limit $6
  )
  select
    i.instrument_key,
    i.symbol,
    i.name,
    i.market,
    i.exchange,
    i.asset_type,
    i.currency,
    i.universe_key,
    i.market_data_supported,
    i.status,
    i.data_source,
    i.source_updated_at,
    i.updated_at,
    coalesce(alias_rows.aliases, '[]'::jsonb) as aliases
  from matched_instruments i
  left join lateral (
    select jsonb_agg(distinct alias) filter (where alias is not null) as aliases
    from market_data_instrument_aliases
    where instrument_key = i.instrument_key
  ) alias_rows on true
  order by i.market asc, i.symbol asc
`;

export function isMarketDataDatabaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export async function readMarketDataRows({ symbol, market, kind }) {
  const pool = await getPool();
  if (!pool) return [];
  await ensureMarketDataSchema(pool);
  const table = kind === "nav" ? "market_data_fund_nav_snapshots" : "market_data_price_snapshots";
  const dateColumn = kind === "nav" ? "nav_date" : "trade_date";
  const valueColumn = kind === "nav" ? "unit_nav_decimal" : "close_price_decimal";
  const query = `
    select raw_payload
    from ${table}
    where upper(symbol) = upper($1)
      and ($2::text is null or upper(market) = upper($2))
    order by ${dateColumn} asc, ${valueColumn} asc, source asc
  `;
  const result = await pool.query(query, [symbol, market || null]);
  return result.rows.map((row) => row.raw_payload).filter(Boolean);
}

export async function readInstrumentRegistryRows({ query = "", limit = 200 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  await ensureMarketDataSchema(pool);
  const normalizedQuery = normalizeSearchText(query);
  const boundedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), 500) : 200;
  if (!normalizedQuery) return [];
  const exactQuery = normalizedQuery.toUpperCase();
  const result = await pool.query(
    instrumentRegistrySearchSql,
    [`%${normalizedQuery}%`, normalizedQuery, exactQuery, `${exactQuery}%`, `${normalizedQuery}%`, boundedLimit]
  );
  return result.rows.map(instrumentRegistryRowFromDatabase);
}

export async function upsertInstrumentRegistryRows(rows) {
  const pool = await getPool();
  if (!pool || !Array.isArray(rows) || !rows.length) return 0;
  await ensureMarketDataSchema(pool);
  let changedCount = 0;
  for (const row of rows) {
    const instrument = normalizeInstrumentRegistryRow(row);
    if (!instrument) continue;
    const aliases = [...new Set([instrument.symbol, instrument.name, ...(instrument.aliases || [])].filter(Boolean).map(String))];
    const sourceUpdatedAt = instrument.sourceUpdatedAt || null;
    const rawPayload = JSON.stringify(row);
    const result = await pool.query(
      `
        insert into market_data_instruments (
          instrument_key, symbol, name, market, exchange, asset_type, currency,
          universe_key, market_data_supported, status, data_source,
          source_updated_at, raw_payload, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::jsonb, now())
        on conflict (instrument_key)
        do update set
          symbol = excluded.symbol,
          name = excluded.name,
          market = excluded.market,
          exchange = excluded.exchange,
          asset_type = excluded.asset_type,
          currency = excluded.currency,
          universe_key = excluded.universe_key,
          market_data_supported = excluded.market_data_supported,
          status = excluded.status,
          data_source = excluded.data_source,
          source_updated_at = excluded.source_updated_at,
          raw_payload = excluded.raw_payload,
          updated_at = now()
        where market_data_instruments.raw_payload is distinct from excluded.raw_payload
      `,
      [
        instrument.instrumentKey,
        instrument.symbol,
        instrument.name,
        instrument.market,
        instrument.exchange || "",
        instrument.type,
        instrument.currency,
        instrument.universe || "",
        instrument.marketDataSupported !== false,
        instrument.status || "active",
        instrument.dataSource || "",
        sourceUpdatedAt,
        rawPayload
      ]
    );
    changedCount += result.rowCount;

    await pool.query("delete from market_data_instrument_aliases where instrument_key = $1", [instrument.instrumentKey]);
    for (const alias of aliases) {
      await pool.query(
        `
          insert into market_data_instrument_aliases (instrument_key, alias, normalized_alias)
          values ($1, $2, $3)
          on conflict (instrument_key, normalized_alias)
          do update set alias = excluded.alias
        `,
        [instrument.instrumentKey, alias, normalizeSearchText(alias)]
      );
    }

    await pool.query(
      `
        insert into market_data_instrument_sources (
          instrument_key, source, source_updated_at, raw_payload, updated_at
        )
        values ($1, $2, $3::timestamptz, $4::jsonb, now())
        on conflict (instrument_key, source)
        do update set
          source_updated_at = excluded.source_updated_at,
          raw_payload = excluded.raw_payload,
          updated_at = now()
      `,
      [instrument.instrumentKey, instrument.dataSource || "unknown", sourceUpdatedAt, rawPayload]
    );
  }
  return changedCount;
}

export async function readUserAssetDailyPriceRows({ userId, assetId, dateFrom, dateTo }) {
  const pool = await getPool();
  if (!pool) return [];
  await ensureMarketDataSchema(pool);
  const result = await pool.query(
    `
      select raw_payload
      from user_asset_daily_price_snapshots
      where user_id = $1
        and asset_id = $2
        and ($3::date is null or price_date >= $3::date)
        and ($4::date is null or price_date <= $4::date)
      order by price_date asc
    `,
    [userId, assetId, dateFrom || null, dateTo || null]
  );
  return result.rows.map((row) => row.raw_payload).filter(Boolean);
}

export async function upsertUserAssetDailyPriceRows(rows) {
  const pool = await getPool();
  if (!pool) return 0;
  await ensureMarketDataSchema(pool);
  let changedCount = 0;
  for (const row of rows) {
    const result = await pool.query(
      `
        insert into user_asset_daily_price_snapshots (
          user_id, asset_id, account, symbol, market, currency, price_date,
          close_price_decimal, price_type, price_basis, carried_from_date,
          source, source_fetched_at, quality_status, raw_payload, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12, $13::timestamptz, $14, $15::jsonb, now())
        on conflict (user_id, asset_id, price_date)
        do update set
          account = excluded.account,
          symbol = excluded.symbol,
          market = excluded.market,
          currency = excluded.currency,
          close_price_decimal = excluded.close_price_decimal,
          price_type = excluded.price_type,
          price_basis = excluded.price_basis,
          carried_from_date = excluded.carried_from_date,
          source = excluded.source,
          source_fetched_at = excluded.source_fetched_at,
          quality_status = excluded.quality_status,
          raw_payload = excluded.raw_payload,
          updated_at = now()
        where user_asset_daily_price_snapshots.raw_payload is distinct from excluded.raw_payload
      `,
      [
        row.userId,
        row.assetId,
        row.account || "",
        row.symbol,
        row.market || "UNKNOWN",
        row.currency || "USD",
        row.priceDate,
        row.closePrice,
        row.priceType,
        row.priceBasis,
        row.carriedFromDate || null,
        row.source,
        row.sourceFetchedAt || null,
        row.qualityStatus || "ok",
        JSON.stringify(row)
      ]
    );
    changedCount += result.rowCount;
  }
  return changedCount;
}

export async function upsertMarketDataRows({ instrument, rows, kind }) {
  const pool = await getPool();
  if (!pool) return 0;
  await ensureMarketDataSchema(pool);
  if (kind === "nav") return upsertNavRows(pool, instrument, rows);
  return upsertPriceRows(pool, instrument, rows);
}

export async function upsertFxRateRows(rows) {
  const pool = await getPool();
  if (!pool) return 0;
  await ensureMarketDataSchema(pool);
  let changedCount = 0;
  for (const row of rows.filter((item) => item.qualityStatus === "ok")) {
    const result = await pool.query(
      `
        insert into market_data_fx_rate_snapshots (
          base_currency, quote_currency, rate_date, rate_decimal, source,
          source_fetched_at, quality_status, raw_payload, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
        on conflict (base_currency, quote_currency, rate_date, source)
        do update set
          rate_decimal = excluded.rate_decimal,
          source_fetched_at = excluded.source_fetched_at,
          quality_status = excluded.quality_status,
          raw_payload = excluded.raw_payload,
          updated_at = now()
        where market_data_fx_rate_snapshots.raw_payload is distinct from excluded.raw_payload
      `,
      [
        row.baseCurrency,
        row.quoteCurrency,
        row.rateDate,
        row.rate,
        row.source,
        row.sourceFetchedAt,
        row.qualityStatus || "ok",
        JSON.stringify(row)
      ]
    );
    changedCount += result.rowCount;
  }
  return changedCount;
}

export async function appendMarketDataRun(run) {
  const pool = await getPool();
  if (!pool) return false;
  await ensureMarketDataSchema(pool);
  await pool.query(
    `
      insert into market_data_runs (
        id, command, status, started_at, finished_at, requested_symbols,
        success_count, skipped_count, failure_count, raw_payload
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      on conflict (id) do update set
        status = excluded.status,
        finished_at = excluded.finished_at,
        success_count = excluded.success_count,
        skipped_count = excluded.skipped_count,
        failure_count = excluded.failure_count,
        raw_payload = excluded.raw_payload
    `,
    [
      run.id,
      run.command,
      run.status,
      run.startedAt,
      run.finishedAt || null,
      run.requestedSymbols || [],
      run.successCount || 0,
      run.skippedCount || 0,
      run.failureCount || 0,
      JSON.stringify(run)
    ]
  );
  return true;
}

export async function upsertMarketDataBackfillTask(task) {
  const pool = await getPool();
  if (!pool) return false;
  await ensureMarketDataSchema(pool);
  await pool.query(
    `
      insert into market_data_backfill_tasks (
        id, user_id, asset_id, account, symbol, market, currency, asset_name,
        date_from, date_to, status, trigger, requested_at, retry_count,
        success_count, missing_count, failure_reason, raw_payload, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::date, $10::date, $11, $12, $13::timestamptz, $14,
        $15, $16, $17, $18::jsonb, now()
      )
      on conflict (user_id, asset_id, symbol, market, date_from, date_to)
      do update set
        account = excluded.account,
        currency = excluded.currency,
        asset_name = excluded.asset_name,
        status = excluded.status,
        trigger = excluded.trigger,
        requested_at = excluded.requested_at,
        retry_count = excluded.retry_count,
        success_count = excluded.success_count,
        missing_count = excluded.missing_count,
        failure_reason = excluded.failure_reason,
        raw_payload = excluded.raw_payload,
        updated_at = now()
    `,
    [
      task.id,
      task.userId,
      task.assetId,
      task.account || "",
      task.symbol,
      task.market || "UNKNOWN",
      task.currency || "USD",
      task.assetName || task.symbol,
      task.dateFrom,
      task.dateTo,
      task.status || "pending",
      task.trigger || "asset_created",
      task.requestedAt,
      task.retryCount || 0,
      task.successCount || 0,
      task.missingCount || 0,
      task.failureReason || null,
      JSON.stringify(task)
    ]
  );
  return true;
}

export async function readPendingMarketDataBackfillTasks({ limit = 5 } = {}) {
  const pool = await getPool();
  if (!pool) return [];
  await ensureMarketDataSchema(pool);
  const boundedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), 50) : 5;
  const result = await pool.query(
    `
      select raw_payload
      from market_data_backfill_tasks
      where status = 'pending'
      order by requested_at asc
      limit $1
    `,
    [boundedLimit]
  );
  return result.rows.map((row) => row.raw_payload).filter(Boolean);
}

export async function updateMarketDataBackfillTaskStatus({ id, status, startedAt, finishedAt, successCount, missingCount, failureReason, rawPayload }) {
  const pool = await getPool();
  if (!pool) return false;
  await ensureMarketDataSchema(pool);
  const updates = [];
  const values = [];
  addUpdate("status", status);
  addUpdate("started_at", startedAt);
  addUpdate("finished_at", finishedAt);
  addUpdate("success_count", successCount);
  addUpdate("missing_count", missingCount);
  addUpdate("failure_reason", failureReason);
  addUpdate("raw_payload", rawPayload ? JSON.stringify(rawPayload) : null, "::jsonb");
  updates.push("updated_at = now()");
  values.push(id);
  await pool.query(
    `
      update market_data_backfill_tasks
      set ${updates.join(", ")}
      where id = $${values.length}
    `,
    values
  );
  return true;

  function addUpdate(column, value, cast = "") {
    if (value === undefined) return;
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  }
}

export async function readUserAssetRows({ userId }) {
  const pool = await getPool();
  if (!pool) return [];
  await ensureMarketDataSchema(pool);
  const result = await pool.query(
    `
      select raw_payload
      from user_assets
      where user_id = $1
      order by created_at desc
    `,
    [userId]
  );
  return result.rows.map((row) => row.raw_payload).filter(Boolean);
}

export async function upsertUserAssetRow(asset) {
  const pool = await getPool();
  if (!pool) return false;
  await ensureMarketDataSchema(pool);
  await pool.query(
    `
      insert into user_assets (
        user_id, asset_id, account, symbol, market, currency, asset_name,
        asset_type, quantity_decimal, cost_price_decimal, purchase_date,
        status, raw_payload, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11::date,
        $12, $13::jsonb, now()
      )
      on conflict (user_id, asset_id)
      do update set
        account = excluded.account,
        symbol = excluded.symbol,
        market = excluded.market,
        currency = excluded.currency,
        asset_name = excluded.asset_name,
        asset_type = excluded.asset_type,
        quantity_decimal = excluded.quantity_decimal,
        cost_price_decimal = excluded.cost_price_decimal,
        purchase_date = excluded.purchase_date,
        status = excluded.status,
        raw_payload = excluded.raw_payload,
        updated_at = now()
    `,
    [
      asset.userId,
      asset.id,
      asset.account || "",
      asset.symbol || "",
      asset.market || "UNKNOWN",
      asset.currency || "USD",
      asset.name || asset.symbol || "",
      asset.type || "其他",
      asset.quantity || "0",
      asset.costPrice || "0",
      asset.purchaseDate || null,
      asset.closed ? "closed" : "open",
      JSON.stringify(asset)
    ]
  );
  return true;
}

async function upsertPriceRows(pool, instrument, rows) {
  let changedCount = 0;
  for (const row of rows.filter((item) => item.qualityStatus === "ok")) {
    const result = await pool.query(
      `
        insert into market_data_price_snapshots (
          symbol, name, market, currency, trade_date, close_price_decimal,
          source, source_fetched_at, quality_status, raw_payload, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
        on conflict (symbol, market, trade_date, source)
        do update set
          name = excluded.name,
          currency = excluded.currency,
          close_price_decimal = excluded.close_price_decimal,
          source_fetched_at = excluded.source_fetched_at,
          quality_status = excluded.quality_status,
          raw_payload = excluded.raw_payload,
          updated_at = now()
        where market_data_price_snapshots.raw_payload is distinct from excluded.raw_payload
      `,
      [
        row.instrumentSymbol || instrument.symbol,
        row.instrumentName || instrument.name || instrument.symbol,
        row.market || instrument.market || "UNKNOWN",
        row.currency || instrument.currency || "USD",
        row.tradeDate,
        row.closePrice,
        row.source,
        row.sourceFetchedAt,
        row.qualityStatus || "ok",
        JSON.stringify(row)
      ]
    );
    changedCount += result.rowCount;
  }
  return changedCount;
}

async function upsertNavRows(pool, instrument, rows) {
  let changedCount = 0;
  for (const row of rows.filter((item) => item.qualityStatus === "ok")) {
    const result = await pool.query(
      `
        insert into market_data_fund_nav_snapshots (
          symbol, name, market, currency, nav_date, unit_nav_decimal,
          source, source_fetched_at, quality_status, raw_payload, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
        on conflict (symbol, market, nav_date, source)
        do update set
          name = excluded.name,
          currency = excluded.currency,
          unit_nav_decimal = excluded.unit_nav_decimal,
          source_fetched_at = excluded.source_fetched_at,
          quality_status = excluded.quality_status,
          raw_payload = excluded.raw_payload,
          updated_at = now()
        where market_data_fund_nav_snapshots.raw_payload is distinct from excluded.raw_payload
      `,
      [
        row.instrumentSymbol || instrument.symbol,
        row.instrumentName || instrument.name || instrument.symbol,
        row.market || instrument.market || "UNKNOWN",
        row.currency || instrument.currency || "CNY",
        row.navDate,
        row.unitNav,
        row.source,
        row.sourceFetchedAt,
        row.qualityStatus || "ok",
        JSON.stringify(row)
      ]
    );
    changedCount += result.rowCount;
  }
  return changedCount;
}

async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    }));
  }
  return poolPromise;
}

async function ensureMarketDataSchema(pool) {
  if (!schemaReadyPromise) schemaReadyPromise = createMarketDataSchema(pool);
  return schemaReadyPromise;
}

async function createMarketDataSchema(pool) {
  await pool.query(`
    create table if not exists market_data_instruments (
      instrument_key text primary key,
      symbol text not null,
      name text not null,
      market text not null,
      exchange text not null default '',
      asset_type text not null,
      currency char(3) not null,
      universe_key text not null default '',
      market_data_supported boolean not null default true,
      status text not null default 'active',
      data_source text not null default '',
      source_updated_at timestamptz,
      raw_payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (market, symbol)
    );

    create table if not exists market_data_instrument_aliases (
      instrument_key text not null references market_data_instruments(instrument_key) on delete cascade,
      alias text not null,
      normalized_alias text not null,
      created_at timestamptz not null default now(),
      primary key (instrument_key, normalized_alias)
    );

    create table if not exists market_data_instrument_sources (
      instrument_key text not null references market_data_instruments(instrument_key) on delete cascade,
      source text not null,
      source_updated_at timestamptz,
      raw_payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (instrument_key, source)
    );

    create table if not exists market_data_price_snapshots (
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

    create table if not exists market_data_fund_nav_snapshots (
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

    create table if not exists market_data_fx_rate_snapshots (
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

    create table if not exists user_asset_daily_price_snapshots (
      user_id text not null,
      asset_id text not null,
      account text not null default '',
      symbol text not null,
      market text not null,
      currency char(3) not null,
      price_date date not null,
      close_price_decimal numeric(38, 12) not null,
      price_type text not null,
      price_basis text not null,
      carried_from_date date,
      source text not null,
      source_fetched_at timestamptz,
      quality_status text not null default 'ok',
      raw_payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (user_id, asset_id, price_date),
      check (close_price_decimal > 0),
      check (price_type in ('close', 'unit_nav')),
      check (price_basis in ('actual', 'carry_forward')),
      check (quality_status in ('ok', 'carried_forward', 'missing', 'error'))
    );

    create index if not exists user_asset_daily_price_symbol_date_idx
      on user_asset_daily_price_snapshots(user_id, symbol, market, price_date desc);

    create table if not exists user_assets (
      user_id text not null,
      asset_id text not null,
      account text not null default '',
      symbol text not null default '',
      market text not null default 'UNKNOWN',
      currency char(3) not null,
      asset_name text not null,
      asset_type text not null,
      quantity_decimal numeric(38, 12) not null default 0,
      cost_price_decimal numeric(38, 12) not null default 0,
      purchase_date date,
      status text not null default 'open',
      raw_payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (user_id, asset_id),
      check (quantity_decimal >= 0),
      check (cost_price_decimal >= 0),
      check (status in ('open', 'closed'))
    );

    create index if not exists user_assets_user_symbol_idx
      on user_assets(user_id, symbol, market);

    create table if not exists market_data_runs (
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

    create table if not exists market_data_backfill_tasks (
      id text primary key,
      user_id text not null,
      asset_id text not null,
      account text not null default '',
      symbol text not null,
      market text not null,
      currency char(3) not null,
      asset_name text not null,
      date_from date not null,
      date_to date not null,
      status text not null default 'pending',
      trigger text not null default 'asset_created',
      requested_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz,
      retry_count integer not null default 0,
      success_count integer not null default 0,
      missing_count integer not null default 0,
      failure_reason text,
      raw_payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, asset_id, symbol, market, date_from, date_to),
      check (date_to >= date_from),
      check (status in ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled'))
    );

    create index if not exists market_data_backfill_tasks_status_idx
      on market_data_backfill_tasks(status, requested_at);

    create index if not exists market_data_backfill_tasks_symbol_date_idx
      on market_data_backfill_tasks(symbol, market, date_from, date_to);

    create index if not exists market_data_price_symbol_date_idx
      on market_data_price_snapshots(symbol, market, trade_date desc);

    create index if not exists market_data_nav_symbol_date_idx
      on market_data_fund_nav_snapshots(symbol, market, nav_date desc);

    create index if not exists market_data_instruments_symbol_idx
      on market_data_instruments(symbol, market);

    create index if not exists market_data_instruments_upper_symbol_idx
      on market_data_instruments(upper(symbol));

    create index if not exists market_data_instruments_upper_symbol_no_fund_suffix_idx
      on market_data_instruments(upper(replace(symbol, '.OF', '')));

    create index if not exists market_data_instruments_market_type_idx
      on market_data_instruments(market, asset_type);

    create index if not exists market_data_instrument_aliases_normalized_idx
      on market_data_instrument_aliases(normalized_alias);
  `);
  await enableMarketDataRowLevelSecurity(pool);
}

async function enableMarketDataRowLevelSecurity(pool) {
  await pool.query(`
    alter table market_data_instruments enable row level security;
    alter table market_data_instrument_aliases enable row level security;
    alter table market_data_instrument_sources enable row level security;
    alter table market_data_price_snapshots enable row level security;
    alter table market_data_fund_nav_snapshots enable row level security;
    alter table market_data_fx_rate_snapshots enable row level security;
    alter table market_data_runs enable row level security;
    alter table market_data_backfill_tasks enable row level security;
    alter table user_asset_daily_price_snapshots enable row level security;
    alter table user_assets enable row level security;

    do $$
    begin
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'market_data_instruments'
          and policyname = 'market data instruments are publicly readable'
      ) then
        create policy "market data instruments are publicly readable"
          on market_data_instruments for select
          using (true);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'market_data_instrument_aliases'
          and policyname = 'market data instrument aliases are publicly readable'
      ) then
        create policy "market data instrument aliases are publicly readable"
          on market_data_instrument_aliases for select
          using (true);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'market_data_price_snapshots'
          and policyname = 'market data price snapshots are publicly readable'
      ) then
        create policy "market data price snapshots are publicly readable"
          on market_data_price_snapshots for select
          using (true);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'market_data_fund_nav_snapshots'
          and policyname = 'market data fund nav snapshots are publicly readable'
      ) then
        create policy "market data fund nav snapshots are publicly readable"
          on market_data_fund_nav_snapshots for select
          using (true);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'market_data_fx_rate_snapshots'
          and policyname = 'market data fx rate snapshots are publicly readable'
      ) then
        create policy "market data fx rate snapshots are publicly readable"
          on market_data_fx_rate_snapshots for select
          using (true);
      end if;
    end $$;
  `);
}

function normalizeInstrumentRegistryRow(row) {
  const symbol = String(row?.symbol || "").trim().toUpperCase();
  const market = String(row?.market || "").trim().toUpperCase();
  if (!symbol || !market) return null;
  const type = String(row.type || row.assetType || row.asset_type || "股票").trim();
  const instrumentKey = row.instrumentKey || row.instrument_key || `${market}:${symbol}`;
  return {
    instrumentKey,
    symbol,
    name: String(row.name || symbol).trim(),
    market,
    exchange: String(row.exchange || "").trim(),
    type,
    currency: String(row.currency || "USD").trim().toUpperCase(),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    status: row.status || "active",
    universe: row.universe || row.universeKey || row.universe_key || "",
    marketDataSupported: row.marketDataSupported ?? row.market_data_supported ?? true,
    dataSource: row.dataSource || row.source || row.data_source || "",
    sourceUpdatedAt: row.sourceUpdatedAt || row.source_updated_at || row.updatedAt || null
  };
}

function instrumentRegistryRowFromDatabase(row) {
  return {
    id: row.instrument_key,
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    exchange: row.exchange || "",
    type: row.asset_type,
    currency: row.currency,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    status: row.status || "active",
    universe: row.universe_key || "",
    marketDataSupported: row.market_data_supported !== false,
    dataSource: row.data_source || "",
    sourceUpdatedAt: row.source_updated_at || "",
    updatedAt: row.updated_at || ""
  };
}

function normalizeSearchText(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
}
