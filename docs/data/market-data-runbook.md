# 行情和基金净值获取运行手册

## 当前能力

已实现三个本地脚本：

- `npm run data:sync-universes`：同步沪深 300、恒生科技和纳斯达克 100 成分股全集。
- `npm run data:backfill`：默认拉取最近三个月数据。
- `npm run data:daily`：默认拉取当天数据，也可指定日期；同时拉取默认汇率对。

数据写入本地目录：

```text
storage/market-data/
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

历史兼容：旧版 `price-snapshots.json` 和 `fund-nav-snapshots.json` 仍可被 API 读取，但新脚本默认写入按证券代码分片的小文件。

`storage/` 已加入 `.gitignore`，不会提交真实行情缓存。

## 数据源

当前脚本默认使用公开数据源，不需要 token：

- A 股股票和 A 股 ETF：东方财富公开 K 线接口。
- 港股恒生科技成分股：东方财富公开 K 线接口。
- 国内公募基金：东方财富基金净值公开脚本。
- 贵金属：Gold API 公开价格接口，默认按 `USD / troy ounce` 存储黄金、白银、铂金和钯金；如配置 `METALS_DEV_API_KEY`，可作为备用源。
- 货币汇率：Frankfurter 参考汇率，默认抓取 `USD/CNY`、`HKD/CNY`、`USD/HKD` 和 `EUR/CNY`。
- 虚拟货币：Binance public market data，默认覆盖 BTC、ETH、SOL、BNB、USDC 等可映射到 USDT 交易对的资产，按 USD/USDT 近似存储价格；CoinGecko 保留为部分稳定币兜底。
- 美股和美股 ETF：Nasdaq historical 公开接口。
- 沪深 300 成分股：东方财富 datacenter 公开接口。
- 恒生科技成分股：Goldman Sachs Warrants 公开 AJAX。
- 纳斯达克 100 成分股：Nasdaq list-type 公开接口。

这些数据源适合 MVP 原型和个人本地使用。上线前仍要确认目标数据源的授权、限频、稳定性和商业使用边界。

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
