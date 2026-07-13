# 领域数据模型

本文定义上线前需要稳定的核心实体、字段单位和边界。金额、数量、价格、汇率和收益率不得使用浮点数存储或计算。

## 数值约定

- `amountMinor`：货币最小单位整数，例如 CNY 分、USD cents、HKD cents。
- `quantityDecimal`：资产数量，使用定点十进制字符串或 PostgreSQL `numeric(38, 12)`。
- `priceDecimal`：单价或基金净值，使用定点十进制字符串或 PostgreSQL `numeric(38, 12)`。
- `fxRateDecimal`：目标币种到基准币种的汇率，使用定点十进制字符串或 PostgreSQL `numeric(38, 12)`。
- `returnBps`：收益率基点，`10000` 表示 `100%`。
- 时间戳统一使用带时区格式，日期型价格和净值使用自然日期并保存市场时区。

## 用户与权限

### User

- `id`
- `email`
- `displayName`
- `status`
- `createdAt`
- `updatedAt`

### UserSettings

- `userId`
- `displayCurrency`
- `timezone`
- `localOnlyMode`
- `cloudSyncEnabled`
- `createdAt`
- `updatedAt`

所有账户、资产、交易、笔记和社区草稿默认归属于用户。服务端必须用 `userId` 过滤私有数据。

## 账户与资产

### Account

- `id`
- `userId`
- `name`
- `baseCurrency`
- `accountType`
- `visibility`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

### Instrument

证券、ETF、基金、现金和数字资产的标准化代码表。

- `id`
- `symbol`
- `name`
- `assetType`
- `market`
- `exchange`
- `currency`
- `universeKey`
- `isTradable`
- `requiresNav`
- `dataStatus`
- `createdAt`
- `updatedAt`

首版 `universeKey`：

- `csi300`
- `nasdaq100`
- `hstech`
- `etf`
- `fund`
- `cash`
- `crypto`
- `manual`

`universeKey` 可以用于快速标记首版覆盖来源，但不能代替指数成分关系。沪深 300、恒生科技和纳斯达克 100 的完整成员关系必须由 `IndexUniverse` 和 `IndexConstituent` 表示，以支持调样后的历史复盘。

### AssetAlias

用于处理用户输入代码、交易所后缀、数据源代码不一致等问题。

- `id`
- `instrumentId`
- `source`
- `sourceSymbol`
- `createdAt`

### IndexUniverse

指数宇宙定义表，用于声明系统要同步和维护的指数成分股集合。

- `id`
- `indexKey`
- `name`
- `market`
- `currency`
- `source`
- `sourceFetchedAt`
- `createdAt`
- `updatedAt`

首版 `indexKey`：

- `csi300`：沪深 300 全部成分股。
- `hstech`：恒生科技全部成分股。
- `nasdaq100`：纳斯达克 100 全部成分股，按证券代码保存。

### IndexConstituent

指数成员关系表。成分股清单必须保留生效区间，避免指数调样后历史数据无法复算。

- `id`
- `indexKey`
- `instrumentId`
- `symbol`
- `name`
- `market`
- `exchange`
- `currency`
- `weightBps`
- `effectiveFrom`
- `effectiveTo`
- `source`
- `sourceFetchedAt`
- `createdAt`
- `updatedAt`

唯一约束：`indexKey + instrumentId + effectiveFrom`。

查询当前成分股时使用 `effectiveFrom <= targetDate` 且 `effectiveTo` 为空或不早于 `targetDate`。

## 交易与持仓

### Transaction

交易是资产事实来源。持仓、收益和归因必须能由交易流水复算。

- `id`
- `userId`
- `accountId`
- `instrumentId`
- `transactionType`
- `occurredAt`
- `settledAt`
- `quantityDecimal`
- `priceDecimal`
- `tradeCurrency`
- `grossAmountMinor`
- `feeAmountMinor`
- `taxAmountMinor`
- `dividendAmountMinor`
- `interestAmountMinor`
- `fxRateDecimal`
- `cashflowAmountMinor`
- `source`
- `sourceRef`
- `memo`
- `attachmentId`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

`transactionType` 首版枚举：

- `buy`
- `sell`
- `transfer_in`
- `transfer_out`
- `dividend`
- `interest`
- `fee`
- `tax`
- `manual_adjustment`

### Position

持仓是交易流水和价格/净值快照计算后的当前状态，可缓存但不作为唯一事实来源。

- `id`
- `userId`
- `accountId`
- `instrumentId`
- `quantityDecimal`
- `averageCostPriceDecimal`
- `costAmountMinor`
- `marketPriceDecimal`
- `marketValueMinor`
- `unrealizedPnlMinor`
- `returnBps`
- `pricedAt`
- `priceSource`
- `status`
- `updatedAt`

### ClosedPosition

- `id`
- `userId`
- `accountId`
- `instrumentId`
- `openedAt`
- `closedAt`
- `quantityDecimal`
- `costAmountMinor`
- `closeAmountMinor`
- `realizedPnlMinor`
- `closeReason`
- `createdAt`

## 价格、净值和汇率

### PriceSnapshot

股票和 ETF 使用日收盘价。

- `id`
- `instrumentId`
- `tradeDate`
- `market`
- `currency`
- `closePriceDecimal`
- `adjustedClosePriceDecimal`
- `source`
- `sourceFetchedAt`
- `qualityStatus`
- `createdAt`
- `updatedAt`

唯一约束：`instrumentId + tradeDate + source`。

当前公共行情 runtime 记录还需要保存价格时间语义：

- `priceKind`：`close`、`latest`、`reference` 或 `snapshot`；
- `priceAt`：连续市场价格对应的带时区时点；
- `marketTimezone`：交易日或快照采用的市场时区；
- `sourceTimestamp`：外部来源声明的行情时间；
- `sourceFetchedAt`：系统抓取时间，不得代替交易日或价格时点。

股票和场内 ETF 只能使用 `close` 参与当前估值和历史日线。数字资产当前估值可以使用 `latest`，但日频历史只使用已经结束的 UTC 日 K `close`。贵金属 latest 来源使用 `reference`，不能表达为官方收盘。

### FundNavSnapshot

场外基金使用基金公司公告净值。

- `id`
- `instrumentId`
- `navDate`
- `announcedAt`
- `unitNavDecimal`
- `accumulatedNavDecimal`
- `adjustedUnitNavDecimal`
- `source`
- `sourceFetchedAt`
- `qualityStatus`
- `createdAt`
- `updatedAt`

唯一约束：`instrumentId + navDate + source`。

### FxRateSnapshot

- `id`
- `baseCurrency`
- `quoteCurrency`
- `rateDate`
- `rateDecimal`
- `source`
- `sourceFetchedAt`
- `qualityStatus`
- `createdAt`

## 估值、归因和曲线

### ValuationSnapshot

- `id`
- `userId`
- `accountId`
- `snapshotDate`
- `displayCurrency`
- `marketValueMinor`
- `costAmountMinor`
- `cashflowAmountMinor`
- `realizedPnlMinor`
- `unrealizedPnlMinor`
- `source`
- `createdAt`

### AttributionRun

- `id`
- `userId`
- `accountId`
- `startDate`
- `endDate`
- `displayCurrency`
- `startValueMinor`
- `endValueMinor`
- `valueChangeMinor`
- `status`
- `createdAt`

### AttributionItem

- `id`
- `runId`
- `itemKey`
- `label`
- `amountMinor`
- `sortOrder`

首版 `itemKey`：

- `contribution`
- `price`
- `fx`
- `income`
- `fees`
- `taxes`
- `manual`
- `unexplained`

## 数据任务和导入

### MarketDataTask

- `id`
- `universeKey`
- `taskType`
- `status`
- `source`
- `startDate`
- `endDate`
- `successCount`
- `failureCount`
- `failureReason`
- `retryCount`
- `scheduledAt`
- `startedAt`
- `finishedAt`

### ImportBatch

- `id`
- `userId`
- `importType`
- `status`
- `sourceFilename`
- `rowCount`
- `validCount`
- `duplicateCount`
- `errorCount`
- `createdAt`
- `confirmedAt`

### ImportRow

- `id`
- `batchId`
- `rowNumber`
- `rawPayload`
- `normalizedPayload`
- `status`
- `errorMessage`

## 笔记和社区

### Note

- `id`
- `userId`
- `title`
- `content`
- `format`
- `status`
- `visibility`
- `timeRangeStart`
- `timeRangeEnd`
- `createdAt`
- `updatedAt`

### NoteLink

- `id`
- `noteId`
- `targetType`
- `targetId`

### CommunityPost

- `id`
- `userId`
- `title`
- `content`
- `tag`
- `status`
- `visibility`
- `reportCount`
- `createdAt`
- `updatedAt`

### CommunityReport

- `id`
- `postId`
- `reporterId`
- `reason`
- `status`
- `createdAt`
- `resolvedAt`

## 审计

### AuditLog

- `id`
- `userId`
- `actorId`
- `action`
- `entityType`
- `entityId`
- `beforePayload`
- `afterPayload`
- `reason`
- `requestId`
- `ipHash`
- `createdAt`

写入、导入、导出、删除、权限变更、登录失败、社区审核动作都应记录审计日志。
