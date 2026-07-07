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

用途：读取当前用户某个资产从首次持有日期开始的每日价格快照，供历史收益走势、回撤和归因复算使用。该接口读取用户资产维度的价格表，不直接暴露其他用户资产。

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

用途：手动同步最新价格。默认会根据所有录入过且有代码资产的首次持有日期回补历史行情缓存，包含当前持仓和历史持仓；再从本地行情缓存读取最新可用价格或净值，并应用到资产状态；同步成功后刷新当前用户资产的每日价格快照。前端可随请求传入本地资产列表，API 会按每个资产 ID、代码和首次持有日期生成用户资产维度价格表。传入 `"autoFetch": false` 时只读取已有缓存，不访问外部数据源。API 服务常驻运行时，也会默认按本机时区每天 `22:00` 调用同一套同步逻辑。

请求：

```json
{
  "symbols": ["00700", "BTC"],
  "assets": [
    {
      "id": "asset-00700",
      "symbol": "00700",
      "purchaseDate": "2026-01-10",
      "quantity": "700",
      "closed": false
    }
  ],
  "account": "港股账户",
  "days": 7,
  "autoFetch": true
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

用途：为单个资产或首版白名单创建历史回补任务。

请求：

```json
{
  "instrumentId": "uuid",
  "dateFrom": "2026-01-29",
  "dateTo": "2026-04-29",
  "reason": "user_created_asset"
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
