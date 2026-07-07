# 行情和基金净值获取运行手册

## 当前能力

已实现四个本地脚本：

- `npm run data:sync-registry`：同步资产名称/代码/市场主库，生成录入搜索使用的 `instrument-registry`。默认要求 A 股、港股和美股各自达到覆盖阈值，避免美股数量掩盖中国市场缺口。
- `npm run data:sync-universes`：同步沪深 300、恒生科技和纳斯达克 100 成分股全集。
- `npm run data:backfill`：默认拉取最近三个月数据。
- `npm run data:daily`：默认拉取当天数据，也可指定日期；同时拉取默认汇率对和分析页收益表现对比基准。

数据写入本地目录：

```text
storage/market-data/
  instrument-registry.json
  instrument-registry-summary.json
  index-universes.json
  index-constituents.json
  prices/
    CN/000001.json
    HK/00700.json
    US/AAPL.json
  fund-nav/
    CN/000001.OF.json
  fx-rates.json
  market-data-runs.json
```

`instrument-registry.json` 是资产搜索主库，只保存名称、代码、市场、类型、币种和来源等主数据，不保存用户持仓，也不会触发价格抓取。脚本默认覆盖阈值为 A 股 `5000`、港股 `2000`、美股 `4000`；如果某个市场低于阈值，同步运行会在 `market-data-runs.json` 中标记失败，便于发现源失效或缓存不足。历史兼容：旧版 `price-snapshots.json` 和 `fund-nav-snapshots.json` 仍可被 API 读取，但新脚本默认写入按证券代码分片的小文件。

`storage/` 已加入 `.gitignore`，不会提交真实行情缓存。

## 用户资产每日价格表

全局行情缓存只表示“某个标的某天的市场价格”，不直接等同于用户的持仓收益曲线。用户录入资产后，API 会维护一层用户资产维度的每日价格快照：

```text
storage/market-data/user-asset-prices/{userId}/{assetId}.json
```

线上使用 PostgreSQL 时，对应运行时表为 `user_asset_daily_price_snapshots`。正式 schema 也保留同名领域表，主键语义是当前用户、资产/持仓和价格日期。

生成口径：

- 手动或自动同步会覆盖所有录入过且有代码的资产，包含当前持仓和历史持仓。
- 每个资产单独确定起点：优先取该资产 `purchaseDate`，没有持有日期时从已缓存行情的第一天开始。
- 股票、ETF 和指数使用日收盘价；基金使用单位净值；贵金属和虚拟货币使用数据源提供的日价格。
- 每个自然日最多一条价格。非交易日或单日缺缓存时沿用上一条可用价格，并标记 `priceBasis=carry_forward`、`qualityStatus=carried_forward` 和 `carriedFromDate`。
- 首次可用行情之前的缺口不会填假价格；同步结果会累计 `dailyPriceGapCount`，后续 UI 应提示用户补价格或扩大回补范围。

读取接口：

```text
GET /api/asset-prices/daily?assetId=asset-00700
```

手动同步最新价会同时刷新这张表：

```bash
curl -X POST http://127.0.0.1:4180/api/market-data/sync-daily \
  -H 'Content-Type: application/json' \
  -d '{"symbols":["00700"],"autoFetch":false}'
```

## 数据源

当前脚本默认使用公开数据源，不需要 token：

- A 股股票、A 股 ETF 和港股：当前代码主路径使用腾讯证券公开 K 线接口，并补充腾讯实时 quote 作为同日最新参考价。
- 东方财富 K 线适配函数仍保留在脚本中，但当前 `fetchInstrument()` 主流程没有调用；不要在产品文案中写成当前默认源。
- 国内公募基金：东方财富基金净值公开脚本。
- 贵金属：Gold API 公开价格接口，默认按 `USD / troy ounce` 存储黄金、白银、铂金和钯金；如配置 `METALS_DEV_API_KEY`，可作为备用源。
- 货币汇率：Frankfurter 参考汇率，默认抓取 `USD/CNY`、`HKD/CNY`、`USD/HKD` 和 `EUR/CNY`。
- 虚拟货币：Binance public market data，默认覆盖 BTC、ETH、SOL、BNB、USDC 等可映射到 USDT 交易对的资产，按 USD/USDT 近似存储价格；CoinGecko 保留为部分稳定币兜底。
- 美股和美股 ETF：Nasdaq historical 公开接口。
- 资产主库：A 股优先使用上交所官方股票列表和深交所官方 A 股列表，东方财富市场列表仅作为兜底；港股支持读取 `hkex-list-of-securities.csv` 或 `hkex-list-of-securities.txt` 本地缓存，也可回退到东方财富港股列表；美股普通股票和 ETF 使用 Nasdaq Trader symbol directory。脚本会优先读取 `storage/market-data/*stock-list*.json`、`storage/market-data/*clist*.json`、`nasdaqlisted.txt` 和 `otherlisted.txt` 本地缓存，缓存缺失时再访问公开源。
- 沪深 300 成分股：东方财富 datacenter 公开接口。
- 恒生科技成分股：Goldman Sachs Warrants 公开 AJAX。
- 纳斯达克 100 成分股：Nasdaq list-type 公开接口。

## 资产主库同步策略

资产主库和价格缓存是两套任务：主库用于录入时匹配名称、代码、市场、类型和币种；价格脚本按用户录入且需要行情的资产抓取价格，同时稳定维护分析页收益表现对比使用的少量基准指数或 ETF 缓存。

当前 A 股主库策略是官方源优先：上交所接口提供 `SECURITY_CODE_A`、`SECURITY_ABBR_A` 和 `LISTING_DATE` 等字段，深交所接口提供 `agdm`、`agjc`、`bk` 和 `agssrq` 等字段。公开官网接口可能限流或临时返回空响应；同步脚本会保留已成功分页和既有缓存，不应因为单个市场失败而用更薄的数据覆盖已生成主库。

面向中国用户时，不应为了控制总量而降低美股覆盖，因为美元资产录入仍然常见。当前策略是保留美股普通股票和 ETF，同时用市场级覆盖闸门要求 A 股和港股必须补齐：

```bash
npm run data:sync-registry
```

如在本地调试某个单一来源，可临时降低阈值：

```bash
npm run data:sync-registry -- --sources=cn,us,core --min-cn=100 --min-hk=0
```

生产或正式发布前不要降低默认阈值；如果 A 股低于 `5000` 或港股低于 `2000`，应补齐缓存或修复源适配器后再生成主库。港股官方清单可先转换为 CSV/制表符文本，放入：

```text
storage/market-data/hkex-list-of-securities.csv
storage/market-data/hkex-list-of-securities.txt
```

脚本会过滤港股窝轮、牛熊证、权证、债券和结构化产品，保留普通股、ETF 和 REIT 等适合资产录入的主流品种。

这些数据源适合 MVP 原型和个人本地使用。上线前仍要确认目标数据源的授权、限频、稳定性和商业使用边界。

## P0 价格状态口径

前端和 API 需要统一展示以下价格状态：

- `synced`：已从行情缓存同步，必须显示价格日期、来源和抓取时间。
- `manual`：用户或交易记录手动录入，必须保留来源和日期。
- `pending`：尚未取得行情，当前价按成本价兜底估值。
- `stale`：价格日期距离当前日期超过 7 天，需要提示用户核对。
- `missing`：同步时没有找到可用缓存，不能覆盖旧价格。
- `error`：同步请求失败，不能覆盖旧价格，但要保留失败原因。

缺价格时可以继续保存资产，但持仓、总览和分析必须显式提示“待获取价格 / 成本价兜底 / 缺缓存”，不得把兜底估值伪装为真实市场价格。

## 贵金属、汇率和虚拟货币

贵金属默认使用 Gold API，无需配置 key：

```bash
npm run data:daily -- --symbols=XAU,XAG
```

如果需要使用 Metals.Dev 作为备用源，运行前配置：

```bash
export METALS_DEV_API_KEY=your_api_key
```

虚拟货币使用 Binance 日 K 线和 ticker price：

```bash
npm run data:daily -- --symbols=BTC,ETH,SOL
```

汇率默认随 `data:daily` 抓取。也可以指定汇率对：

```bash
npm run data:daily -- --fx-pairs=USD/CNY,HKD/CNY,EUR/CNY
```

如只想抓资产价格、不更新汇率：

```bash
npm run data:daily -- --fx=false
```

收益表现对比基准会随无参数的 `npm run data:daily` 一起抓取；手动指定 `--symbols=` 时只抓指定代码。前端“同步价格”会把当前开放资产和分析页已选基准一起提交给 API，API 每日固定同步会抓取默认基准集合。

汇率写入：

```text
storage/market-data/fx-rates.json
```

API 骨架可读取缓存：

```text
GET /api/market-data/fx-rates?base=USD&quote=CNY
```

## 同步指数成分股全集

首次回补沪深 300、恒生科技和纳斯达克 100 前，先同步成分股清单：

```bash
npm run data:sync-universes
```

只同步部分指数：

```bash
npm run data:sync-universes -- --universes=csi300,hstech
```

同步结果写入：

```text
storage/market-data/index-universes.json
storage/market-data/index-constituents.json
```

脚本会做数量校验。若公开页面或接口结构变化导致数量异常，会写入失败任务，不会把明显不完整的清单当作有效数据。

## 本地行情缓存分片

价格和净值按证券代码分片，而不是继续写入单个大文件：

```text
storage/market-data/prices/{market}/{symbol}.json
storage/market-data/fund-nav/{market}/{symbol}.json
```

选择按证券代码分片的原因：

- 页面常见访问模式是查询单个资产历史曲线，按代码分片只需要读取一个小文件。
- 单个证券失败或重跑时只影响自己的分片文件。
- 每日更新虽然会写多个小文件，但能避免 `price-snapshots.json` 随时间无限膨胀。
- 后续迁移 PostgreSQL 时，可直接按 `{market, symbol, tradeDate, source}` 批量导入。

迁移旧的大文件：

```bash
npm run data:migrate-storage
```

默认会将旧文件归档为：

```text
storage/market-data/price-snapshots.json.legacy
storage/market-data/fund-nav-snapshots.json.legacy
```

如果只想生成分片但保留旧文件原名：

```bash
npm run data:migrate-storage -- --archive-legacy=false
```

## 拉最近三个月

```bash
npm run data:backfill
```

等价于：

```bash
node scripts/market-data/fetch-market-data.mjs backfill --months=3
```

指定日期范围：

```bash
node scripts/market-data/fetch-market-data.mjs backfill --from=2026-01-29 --to=2026-04-29
```

只拉部分代码：

```bash
node scripts/market-data/fetch-market-data.mjs backfill --months=3 --symbols=00700,510300,QQQ
```

按指数成分股全集回补：

```bash
npm run data:backfill -- --universes=csi300,hstech,nasdaq100
```

使用 `--universes` 时脚本会默认串行请求，并在每个证券之间等待 `350ms`。如需调低请求频率：

```bash
npm run data:backfill -- --universes=csi300,hstech,nasdaq100 --delay-ms=800
```

## 每天晚上拉最新一天

当天：

```bash
npm run data:daily
```

如果指定日期当天没有美股收盘价或基金净值披露，脚本会取该日期之前最近一个可用交易日或净值日。

指定日期：

```bash
npm run data:daily -- --date=2026-04-29
```

按指数成分股全集更新最新可用交易日：

```bash
npm run data:daily -- --universes=csi300,hstech,nasdaq100
```

## crontab 示例

每天晚上 22:30 拉最新一天：

```cron
30 22 * * 1-5 cd /home/ubuntu/asset-trail && npm run data:daily >> storage/market-data/cron.log 2>&1
```

如果要每天更新三类指数当前成分股，建议先同步成分股，再拉最新价：

```cron
20 22 * * 1-5 cd /home/ubuntu/asset-trail && npm run data:sync-universes >> storage/market-data/cron.log 2>&1
30 22 * * 1-5 cd /home/ubuntu/asset-trail && npm run data:daily -- --universes=csi300,hstech,nasdaq100 >> storage/market-data/cron.log 2>&1
```

如果要兼顾基金净值迟到披露，可以次日早上补跑一次：

```cron
30 8 * * 2-6 cd /home/ubuntu/asset-trail && npm run data:daily -- --date=$(date -u -d yesterday +\%F) >> storage/market-data/cron.log 2>&1
```

## 数据源映射

- A 股股票：东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get`
- A 股 ETF：东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get`
- 港股恒生科技：东方财富 `push2his.eastmoney.com/api/qt/stock/kline/get`
- 国内公募基金：东方财富 `fund.eastmoney.com/pingzhongdata/{code}.js`
- 美股和美股 ETF：Nasdaq `api.nasdaq.com/api/quote/{symbol}/historical` 和 `api.nasdaq.com/api/quote/{symbol}/info`
- 虚拟货币：Binance `data-api.binance.vision/api/v3/klines` 和 `data-api.binance.vision/api/v3/ticker/price`
- 贵金属：Gold API `api.gold-api.com/price/{symbol}`，Metals.Dev `api.metals.dev/v1/latest` 可作为备用源
- 沪深 300 成分股：东方财富 `datacenter-web.eastmoney.com/api/data/v1/get`
- 恒生科技成分股：Goldman Sachs Warrants `gswarrants.com.hk/sc/ajax/constituents-result`
- 纳斯达克 100 成分股：Nasdaq `api.nasdaq.com/api/quote/list-type/nasdaq100`

## 注意事项

- 当前脚本只负责拉取和缓存，不提供投资建议。
- 公开接口可能变更、限频或临时不可用；脚本会把失败写入 `market-data-runs.json`。
- 公开数据源的授权、限频和商业使用范围需要上线前单独确认。
- 美股会同时抓日线历史和 Nasdaq quote 当前价；公开接口可能存在延迟、限频或盘前盘后口径差异。
- 贵金属按金衡盎司报价，实物克重估值需要在业务层明确换算口径：`1 troy ounce = 31.1034768 g`。
- Binance 默认使用 USDT 交易对近似 USD 估值，不代表所有交易所的实际成交价；如用户需要按 OKX、Coinbase 等口径估值，后续应作为可选来源单独记录。
- 后续接 PostgreSQL 时，应将 JSON 缓存迁移到 `index_universes`、`index_constituents`、`price_snapshots`、`fund_nav_snapshots` 和 `market_data_tasks` 表。
