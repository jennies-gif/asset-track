let poolPromise = null;
let schemaReadyPromise = null;

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

    create index if not exists market_data_price_symbol_date_idx
      on market_data_price_snapshots(symbol, market, trade_date desc);

    create index if not exists market_data_nav_symbol_date_idx
      on market_data_fund_nav_snapshots(symbol, market, nav_date desc);
  `);
}
