# 指数成分股全集数据获取和存储方案

## 目标

首版不只保存指数本身价格，而是覆盖以下指数的全部成分股：

- 沪深 300：全部 A 股成分股。
- 恒生科技：全部港股成分股。
- 纳斯达克 100：全部美股成分股，按证券代码保存，允许一个公司存在多类股票。

系统应先同步成分股清单，再按清单批量拉取最近三个月历史日线，并支持每日更新最新可用交易日数据。

## 核心原则

- 成分股清单和价格数据分离。
- 成分股清单保留版本和生效日期，避免指数调样后无法复盘历史。
- `instrument` 是证券代码主数据，`index_constituent` 是指数成员关系。
- 每日价格更新只更新当前有效成分股；历史复盘可按指定日期读取当时的成分股版本。
- 公开数据源只适合原型和个人本地使用，上线前必须确认授权、限频和商业使用边界。

## 免费数据源规划

### 沪深 300 成分股

优先级：

1. 中证指数公司官方页面或可下载文件，作为人工核验或上线后的首选来源。
2. 东方财富成分股页面：`https://data.eastmoney.com/other/index/hs300.html`。
3. 新浪最新成分页面：`https://money.finance.sina.com.cn/corp/go.php/vII_NewestComponent/indexid/000300.phtml`，作为备用校验源。

行情日线：

- 腾讯证券公开 K 线接口，代码映射：
  - 上交所：`sh600000`
  - 深交所：`sz000001`
- 如果腾讯接口失败，再考虑东方财富 K 线接口作为备用。

### 恒生科技成分股

优先级：

1. 恒生指数公司官方资料，作为上线前核验源。
2. AASTOCKS 恒生科技成分股页面：`https://www.aastocks.com/en/stocks/market/index/hk-index-con.aspx?index=HSTECH`。

行情日线：

- 腾讯证券公开 K 线接口，代码映射：
  - 港股：`hk00700`

### 纳斯达克 100 成分股

优先级：

1. Nasdaq 官方 Nasdaq-100 companies 页面：`https://www.nasdaq.com/solutions/global-indexes/nasdaq-100/companies`。
2. Nasdaq 公开接口或页面数据，作为脚本同步来源。

行情日线：

- Nasdaq historical 公开接口：
  - `https://api.nasdaq.com/api/quote/{symbol}/historical?assetclass=stocks`
  - ETF 或特殊代码按实际 asset class 处理。

## 同步流程

### 1. 成分股同步

命令建议：

```bash
npm run data:sync-universes
```

当前已实现本地 JSON 版本，脚本位于 `scripts/market-data/sync-index-universes.mjs`。

流程：

1. 拉取三个指数的最新成分股清单。
2. 标准化为 `instrument`：
   - `symbol`
   - `name`
   - `market`
   - `exchange`
   - `currency`
   - `assetType=stock`
3. 写入或更新 `instruments`。
4. 写入 `index_constituents`：
   - `indexKey`
   - `instrumentId`
   - `effectiveFrom`
   - `effectiveTo`
   - `source`
   - `sourceFetchedAt`
5. 对不再存在于最新清单中的旧成员，关闭上一版本的 `effectiveTo`。
6. 记录 `market_data_tasks` 和审计日志。

### 2. 最近三个月历史回补

命令建议：

```bash
npm run data:backfill -- --universes=csi300,hstech,nasdaq100 --months=3
```

当前 `scripts/market-data/fetch-market-data.mjs` 已支持 `--universes` 参数，会从 `storage/market-data/index-constituents.json` 读取当前有效成分股。

流程：

1. 读取当前有效成分股。
2. 按市场拆分队列：
   - A 股
   - 港股
   - 美股
3. 每个市场限速批量请求，避免公开接口封禁。
4. 每只股票写入 `price_snapshots` 或本地 `storage/market-data/price-snapshots.json`。
5. 对失败项记录失败原因，允许重跑时只补失败项。

### 3. 每日更新

命令建议：

```bash
npm run data:daily -- --universes=csi300,hstech,nasdaq100
```

当前 `daily` 模式已支持 `--universes` 参数。对美股和基金类数据，如果指定日期没有可用数据，会取指定日期之前最近一个可用交易日或净值日。

流程：

1. 每天晚上按市场时间运行：
   - A 股：北京时间收盘后。
   - 港股：香港时间收盘后。
   - 美股：美东收盘后，建议北京时间次日早晨补跑。
2. 对当天没有可用日线的市场，取指定日期之前最近一个可用交易日。
3. 写入价格快照，使用唯一约束去重。
4. 每日任务完成后写入任务统计：
   - 成功数量
   - 跳过数量
   - 失败数量
   - 数据源
   - 运行时间

## 存储设计

### index_universes

用于定义指数宇宙。

- `id`
- `index_key`：`csi300`、`hstech`、`nasdaq100`
- `name`
- `market`
- `currency`
- `source`
- `created_at`
- `updated_at`

### index_constituents

用于保存指数和证券的成员关系，支持历史版本。

- `id`
- `index_key`
- `instrument_id`
- `symbol`
- `name`
- `market`
- `exchange`
- `currency`
- `weight_bps`
- `effective_from`
- `effective_to`
- `source`
- `source_fetched_at`
- `created_at`
- `updated_at`

唯一约束建议：

- `index_key + instrument_id + effective_from`

查询当前有效成分股：

```sql
select *
from index_constituents
where index_key = 'csi300'
  and effective_from <= current_date
  and (effective_to is null or effective_to >= current_date);
```

### price_snapshots

继续使用已有设计，价格快照按证券和交易日保存。

关键唯一约束：

- `instrument_id + trade_date + source`

## 本地 JSON 缓存结构

在未接 PostgreSQL 前，可以先写入：

```text
storage/market-data/
  index-universes.json
  index-constituents.json
  price-snapshots.json
  market-data-runs.json
```

`index-constituents.json` 示例：

```json
{
  "indexKey": "hstech",
  "symbol": "00700",
  "name": "腾讯控股",
  "market": "HK",
  "exchange": "HKEX",
  "currency": "HKD",
  "effectiveFrom": "2026-04-29",
  "effectiveTo": null,
  "source": "AASTOCKS HSTECH constituents",
  "sourceFetchedAt": "2026-04-29T00:00:00.000Z"
}
```

## 批量规模和限速

首版规模预估：

- 沪深 300：约 300 只证券。
- 恒生科技：约 30 只证券。
- 纳斯达克 100：约 100 只公司，但实际证券代码数量可能超过 100。

三个月日线按 60-70 个交易日估算：

- 约 430 只证券。
- 约 26,000-30,000 条日线记录。

建议限速：

- 单市场串行或小并发，初始并发 `2-4`。
- 每次请求间隔 `300-800ms`。
- 失败后指数退避重试，最多 3 次。
- 对公开接口设置本地缓存和断点续跑，避免重复请求。

## 质量检查

入库前检查：

- 成分股代码非空，市场和币种可识别。
- 日期不能晚于当前日期。
- 收盘价必须大于 0。
- 同一证券同一交易日去重。
- 单日涨跌幅异常时标记 `qualityStatus=suspect`，不静默丢弃。
- 成分股数量异常时阻断发布：
  - 沪深 300 少于 250 或多于 350。
  - 恒生科技少于 20 或多于 40。
  - 纳斯达克 100 少于 90 或多于 120。

## 后续实现顺序

1. 已新增 `data:sync-universes` 脚本，先写本地 JSON。
2. 已扩展 `data:backfill`，支持 `--universes=csi300,hstech,nasdaq100`，从成分股清单读取股票全集。
3. 已扩展 `data:daily`，支持按所有当前有效成分股更新。
4. API `/api/instruments/search` 已读取本地成分股缓存；后续继续把数据任务页改为展示真实同步任务统计。
5. 接 PostgreSQL 后迁移到 `index_universes`、`index_constituents`、`instruments`、`price_snapshots`。
