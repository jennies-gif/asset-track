# API 契约草案

本文定义后续数据库和服务端 API 的第一版边界。所有私有资源必须在服务端按 `userId` 鉴权，不允许仅依赖客户端过滤。

## 通用约定

- 请求和响应使用 JSON。
- 金额使用 `amountMinor` 整数字符串或数字，避免浮点误差。
- 数量、价格、净值和汇率使用十进制字符串。
- 时间戳使用 ISO 8601 带时区格式。
- 日期字段使用 `YYYY-MM-DD`。
- 写接口成功后返回标准化资源，不返回原始外部数据源密钥或内部凭据。
- 错误响应包含 `code`、`message`、`fieldErrors` 和 `requestId`。

## Auth

### `POST /api/auth/login`

用途：邮箱验证码或 OAuth 登录。

请求：

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "本地用户"
  }
}
```

### `POST /api/auth/logout`

用途：退出会话，并写入审计日志。

## Accounts

### `GET /api/accounts`

返回当前用户账户列表和聚合市值摘要。

### `POST /api/accounts`

请求：

```json
{
  "name": "长期账户",
  "baseCurrency": "CNY",
  "accountType": "investment"
}
```

服务端校验：

- `name` 在当前用户下唯一。
- `baseCurrency` 必须为支持币种。

## Instruments

### `GET /api/instruments/search?query=00700`

用途：搜索首版白名单或已缓存资产代码。

响应字段：

- `id`
- `symbol`
- `name`
- `assetType`
- `market`
- `exchange`
- `currency`
- `universeKey`
- `dataStatus`

## Transactions

### `GET /api/transactions`

查询参数：

- `accountId`
- `instrumentId`
- `dateFrom`
- `dateTo`
- `transactionType`

### `POST /api/transactions`

用途：创建交易流水，并触发持仓重算。

请求：

```json
{
  "accountId": "uuid",
  "instrumentId": "uuid",
  "transactionType": "buy",
  "occurredAt": "2026-04-29T10:00:00+08:00",
  "quantityDecimal": "100.000000",
  "priceDecimal": "12.3400",
  "tradeCurrency": "HKD",
  "feeAmountMinor": 150,
  "taxAmountMinor": 30,
  "fxRateDecimal": "0.128000",
  "memo": "手动录入"
}
```

服务端校验：

- 账户必须属于当前用户。
- 数量、价格、汇率必须为有效定点数。
- 影响现金流、费用、税费和持仓的字段必须可复算。
- 创建成功后写入 `audit_logs`。

## Positions

### `GET /api/positions`

查询参数：

- `accountId`
- `status=open|closed`

返回：

- 当前持仓数量、成本、市值、未实现收益、收益率。
- 价格或净值日期、来源和缺失状态。

### `POST /api/positions/{id}/close`

用途：清仓当前持仓，并生成历史持仓记录。

请求：

```json
{
  "closedAt": "2026-04-29T15:00:00+08:00",
  "closePriceDecimal": "13.2000",
  "closeReason": "达到目标仓位"
}
```

## Price And NAV

### `GET /api/instruments/lookup`

查询参数：

- `query`：资产代码或名称。

用途：为新增资产匹配公共标的并取得最新公共行情。当前 local-first 种子版不向行情服务发送首次持有日期，也不由服务端自动推断买入价格；买入日期和买入价格只在浏览器本地保存。除 `query` 外的查询字段返回 `400 request_field_not_allowed`。

### `GET /api/market-data/history`

查询参数：

- `instrumentId`
- `dateFrom`
- `dateTo`
- `kind=price|nav`

响应：

```json
{
  "instrumentId": "uuid",
  "kind": "price",
  "source": "Tushare hk_daily",
  "points": [
    {
      "date": "2026-04-28",
      "closePriceDecimal": "320.4000",
      "qualityStatus": "ok"
    }
  ]
}
```

历史接口只返回可复算的日频记录，不返回数字资产 ticker 最新价。公共行情同步和 lookup 的当前价格响应补充：

- `priceKind`：价格口径；
- `priceAt`：最新价或参考价的具体时点；
- `marketTimezone`：价格时间口径；
- `sourceFetchedAt`：系统抓取时间。

股票和场内 ETF 返回最近真实交易日 `close`；数字资产当前估值可返回 `latest`，历史仍使用已结束的 Binance UTC 日线。

### `GET /api/market-data/fx-rates`

查询参数：

- `base`
- `quote`

响应：

```json
{
  "source": "storage/market-data",
  "rates": [
    {
      "baseCurrency": "USD",
      "quoteCurrency": "CNY",
      "rateDate": "2026-06-02",
      "rate": "7.12",
      "source": "Frankfurter reference rate",
      "sourceFetchedAt": "2026-06-02T10:00:00.000Z",
      "qualityStatus": "ok"
    }
  ]
}
```

### `GET /api/asset-prices/daily`

用途：未来用户资产维度每日价格能力。当前 local-first 种子版不调用该接口；默认返回 `403 private_asset_api_disabled`。当前主入口从浏览器本地资产快照读取 `dailyPrices`。

查询参数：

- `assetId`：用户资产记录 ID，优先使用。
- `symbol`：资产代码，未传 `assetId` 时可用。
- `dateFrom`
- `dateTo`

响应：

```json
{
  "userId": "demo-user",
  "assetId": "asset-00700",
  "symbol": "00700",
  "source": "storage/user-asset-prices",
  "points": [
    {
      "priceDate": "2026-06-01",
      "closePrice": "338",
      "priceType": "close",
      "priceBasis": "actual",
      "source": "Tencent finance kline",
      "sourceFetchedAt": "2026-06-01T10:00:00.000Z",
      "qualityStatus": "ok"
    },
    {
      "priceDate": "2026-06-02",
      "closePrice": "338",
      "priceType": "close",
      "priceBasis": "carry_forward",
      "carriedFromDate": "2026-06-01",
      "qualityStatus": "carried_forward"
    }
  ]
}
```

口径：

- 股票、ETF 和指数使用日收盘价；基金使用单位净值；贵金属和虚拟货币使用数据源提供的日价格。
- 价格表按用户资产维护，主键语义为 `userId + assetId + priceDate`。
- 非交易日或单日缺缓存时可沿用上一条可用价格，但必须标记 `priceBasis=carry_forward` 和 `carriedFromDate`，不得伪装成当日真实成交价。
- 首次持有日前的行情不写入用户资产价格表；首次持有日之后仍无可用历史行情的日期必须在响应或任务结果中显式标记缺口。

### `POST /api/market-data/sync-daily`

用途：同步最新公共行情，也可按固定公共窗口返回历史行情。浏览器不发送首次持有日期；返回的公共历史行情由浏览器在本地结合 `purchaseDate` 生成每日价格。传入 `"autoFetch": false` 时只读取已有缓存，不访问外部数据源。API 服务常驻运行时也会默认按本机时区每天 `22:00` 同步少量系统默认基准。

请求：

```json
{
  "symbols": ["00700", "BTC"],
  "trigger": "manual",
  "days": 365,
  "includeHistory": true,
  "autoFetch": true
}
```

HTTP 请求字段采用白名单，只允许：

- `symbols`：1–50 个公共资产代码；只同步系统基准时可省略。
- `trigger`：`manual`、`auto` 或 `asset_created`。
- `days`：1–365 天的固定公共历史窗口。
- `includeHistory`、`includeBenchmarks`、`autoFetch`：布尔值。

任何其他字段返回 `400 request_field_not_allowed`。尤其不接受 `assets`、`assetId`、`account`、`purchaseDate`、`dateFrom`、`dateTo`、数量、成本或备注。

用户触发的代码集合只用于本次公共行情请求，不写入 `market_data_runs.requested_symbols`、本地运行记录或运行记录的 `raw_payload`；服务端只允许保存不含代码的聚合成功、失败和跳过数量。

如果请求包含白名单外字段，API 返回：

```json
{
  "code": "request_field_not_allowed",
  "message": "同步价格只接受公共行情字段"
}
```

响应：

```json
{
  "syncedAt": "2026-06-02T10:00:00.000Z",
  "summary": {
    "requestedCount": 1,
    "syncedCount": 1,
    "missingCount": 0,
    "skippedCount": 0,
    "dailyPriceRowsUpserted": 2,
    "dailyPriceGapCount": 0
  },
  "results": [
    {
      "symbol": "00700",
      "name": "腾讯控股",
      "status": "synced",
      "after": {
        "currentPrice": "341.5",
        "previousPrice": "338",
        "pricedAt": "2026-06-02",
        "priceSource": "test price source",
        "priceStatus": "synced"
      },
      "dailyPrices": []
    }
  ]
}
```

`fetch.status` 用于区分本轮公共行情抓取结果：

- `covered`：现有公共缓存已覆盖请求区间，没有重复抓取；
- `completed`：抓取完成且没有失败或跳过；
- `completed_with_warnings`：抓取完成，但至少一个代码暂无新日线；响应可以继续返回该代码已有缓存，前端必须表达为“使用缓存”，不能表达为本轮已取得新价格；
- `completed_with_errors`：至少一个外部源抓取失败；
- `failed`：本轮抓取流程整体失败，API 尝试回退读取已有公共缓存。

股票、ETF、指数和基金的日频当前价必须先按 `tradeDate` 或 `navDate` 选择最新日期；`sourceFetchedAt` 只用于同一价格日期内的版本比较，不能让较晚抓取的旧交易日覆盖较新的交易日。

### `POST /api/market-data/fetch-recent`

用途：按传入资产代码抓取最近若干天价格缓存。默认抓取 7 天，只写入 `storage/market-data`，不直接修改用户资产。

请求：

```json
{
  "symbols": ["SPY", "NVDA", "513050", "BTC"],
  "days": 7
}
```

响应：

```json
{
  "dateFrom": "2026-05-27",
  "dateTo": "2026-06-02",
  "symbols": ["SPY", "NVDA", "513050", "BTC"],
  "run": {
    "id": "run-backfill-1780400000000",
    "status": "completed",
    "successCount": 8,
    "skippedCount": 0,
    "failureCount": 0
  }
}
```

### `POST /api/market-data/tasks/backfill`

用途：未来私人资产云端回补任务。当前 local-first 种子版默认返回 `403 private_asset_api_disabled`，主入口不调用。

请求：

```json
{
  "assetId": "asset-110020",
  "symbol": "110020",
  "assetName": "易方达沪深300ETF联接A",
  "account": "长期账户",
  "dateFrom": "2026-01-29",
  "dateTo": "2026-04-29",
  "trigger": "asset_created"
}
```

响应：

```json
{
  "task": {
    "id": "task-backfill-DEMO-USER-ASSET-110020-CN-110020.OF-2026-01-29-2026-04-29",
    "userId": "demo-user",
    "assetId": "asset-110020",
    "symbol": "110020.OF",
    "market": "CN",
    "currency": "CNY",
    "assetName": "易方达沪深300ETF联接A",
    "taskType": "backfill",
    "status": "pending",
    "trigger": "asset_created",
    "dateFrom": "2026-01-29",
    "dateTo": "2026-04-29",
    "retryCount": 0
  }
}
```

幂等规则：同一 `userId + assetId + symbol + market + dateFrom + dateTo` 只保留一条任务，重复请求会更新同一任务。

### `GET /api/assets`

用途：未来云端资产同步能力接口。当前种子版默认本地保存私人资产数据，因此该接口默认关闭。只有显式设置 `PRIVATE_ASSET_CLOUD_SYNC_ENABLED=true` 后，才返回当前用户已录入资产。

默认响应：

```json
{
  "code": "private_asset_cloud_sync_disabled",
  "message": "当前种子版默认本地保存私人资产数据，未启用资产云同步"
}
```

启用云同步后的响应：


```json
{
  "assets": [
    {
      "id": "asset-110020",
      "name": "易方达沪深300ETF联接A",
      "symbol": "110020.OF",
      "market": "CN",
      "currency": "CNY"
    }
  ]
}
```

### `POST /api/assets`

用途：未来云端资产同步能力接口。当前种子版默认关闭，不作为主体验调用路径。只有显式设置 `PRIVATE_ASSET_CLOUD_SYNC_ENABLED=true` 后，才创建或更新当前用户资产，并在资产有代码和首次持有日期时自动创建一次历史回补任务。

请求：

```json
{
  "id": "asset-110020",
  "name": "易方达沪深300ETF联接A",
  "symbol": "110020",
  "type": "基金",
  "market": "CN",
  "account": "长期账户",
  "currency": "CNY",
  "quantity": "1000",
  "costPrice": "1.25",
  "currentPrice": "1.25",
  "fxRate": "1",
  "purchaseDate": "2026-01-29"
}
```

响应：

```json
{
  "asset": {
    "id": "asset-110020",
    "symbol": "110020"
  },
  "backfillTask": {
    "status": "pending",
    "symbol": "110020.OF",
    "dateFrom": "2026-01-29"
  }
}
```

### `GET /api/market-data/tasks`

返回数据任务状态、成功数量、失败原因和重试次数。

## Valuation And Attribution

### `GET /api/valuation/snapshots`

查询参数：

- `accountId`
- `dateFrom`
- `dateTo`

### `POST /api/attribution/runs`

用途：生成一次归因分析。

请求：

```json
{
  "accountId": "uuid",
  "startDate": "2026-01-29",
  "endDate": "2026-04-29",
  "displayCurrency": "CNY"
}
```

响应：

```json
{
  "id": "uuid",
  "startValueMinor": 1000000,
  "endValueMinor": 1120000,
  "valueChangeMinor": 120000,
  "items": [
    { "key": "contribution", "label": "净投入/提现", "amountMinor": 30000 },
    { "key": "price", "label": "价格变动", "amountMinor": 60000 },
    { "key": "fx", "label": "汇率变动", "amountMinor": 10000 },
    { "key": "income", "label": "分红/利息", "amountMinor": 5000 },
    { "key": "fees", "label": "手续费", "amountMinor": -1000 },
    { "key": "taxes", "label": "税费", "amountMinor": -500 },
    { "key": "manual", "label": "手动调整", "amountMinor": 0 },
    { "key": "unexplained", "label": "未归因差异", "amountMinor": 16500 }
  ]
}
```

## Notes

### `GET /api/notes`

查询参数：

- `status`
- `visibility`
- `linkedAssetId`

### `POST /api/notes`

支持草稿、私有、发布状态。发布前需做合规表达检查。

## Import And Export

### `POST /api/imports/preview`

用途：上传 CSV / JSON 后预览、校验和去重，不直接入库。

响应包含：

- `batchId`
- `rowCount`
- `validCount`
- `duplicateCount`
- `errorCount`
- 行级错误列表。

### `POST /api/imports/{batchId}/confirm`

用途：用户确认后写入数据库。必须使用事务，失败时回滚。

### `GET /api/exports/assets.csv`

导出当前用户资产和交易数据。

### `GET /api/exports/backup.json`

导出当前用户完整备份，不包含其他用户数据、服务端密钥或内部任务凭据。

## Community

社区后置上线。首版 API 必须保证社区观点和用户资产数据隔离。

### `POST /api/community/posts`

默认状态为 `pending_review`。

### `POST /api/community/posts/{id}/reports`

举报社区内容，并更新审核队列。
