import assert from "node:assert/strict";
import test from "node:test";

import {
  conflictingOtcInstrumentCleanupSql,
  conflictingOtcNavCleanupSql,
  instrumentRegistrySearchSql
} from "../../src/server/marketDataDatabase.js";

test("instrument registry search aggregates aliases without grouping CTE result columns", () => {
  assert.match(instrumentRegistrySearchSql, /left join lateral/iu);
  assert.doesNotMatch(instrumentRegistrySearchSql, /group\s+by\s+i\.instrument_key/iu);
  assert.match(instrumentRegistrySearchSql, /jsonb_agg\(distinct alias\)/iu);
});

test("registry reconciliation removes conflicting OTC metadata and NAV caches by symbol set", () => {
  assert.match(conflictingOtcInstrumentCleanupSql, /delete from market_data_instruments/iu);
  assert.match(conflictingOtcInstrumentCleanupSql, /market\s*=\s*'CN'/iu);
  assert.match(conflictingOtcInstrumentCleanupSql, /upper\(symbol\)\s*=\s*any\(\$1::text\[\]\)/iu);
  assert.match(conflictingOtcNavCleanupSql, /delete from market_data_fund_nav_snapshots/iu);
  assert.match(conflictingOtcNavCleanupSql, /upper\(market\)\s*=\s*'CN'/iu);
  assert.doesNotMatch(conflictingOtcInstrumentCleanupSql, /513050/u);
  assert.doesNotMatch(conflictingOtcNavCleanupSql, /513050/u);
});

test("instrument registry search keeps exact symbol, fund suffix and alias matching", () => {
  assert.match(instrumentRegistrySearchSql, /upper\(i\.symbol\)\s*=\s*\$3/iu);
  assert.match(instrumentRegistrySearchSql, /upper\(replace\(i\.symbol, '\.OF', ''\)\)\s*=\s*\$3/iu);
  assert.match(instrumentRegistrySearchSql, /a\.normalized_alias\s*=\s*\$2/iu);
  assert.match(instrumentRegistrySearchSql, /limit\s+\$6/iu);
});
