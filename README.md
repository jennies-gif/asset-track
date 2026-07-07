# 资产轨迹

资产轨迹是一个简约清晰的资产管理网站原型，用于记录资产、计算持仓价值、解释资产变化来源，并沉淀私有投资复盘。

当前版本以静态 MVP 为主：页面数据保存在浏览器 `localStorage`，金融计算和市场数据边界位于 `src/domain/`，页面只负责展示和交互。仓库已提供本地行情脚本和本地 API，可手动同步首版股票、ETF、基金净值、贵金属、虚拟货币和汇率缓存；生产环境授权数据源上线前不承诺实时或完整行情覆盖，价格可能延迟或缺失。

## 功能范围

- 总览：作为专业资产 dashboard 展示总资产、累计收益、收益率、最近变化、数据状态、资产配置概览、主要持仓、最近交易、最近复盘和待补全信息；复杂趋势、基准对比和自定义日期筛选集中在分析页。
- 本地登录：使用浏览器本地身份记录邮箱和昵称，不上传账户数据。
- 资产：资产页分为“添加资产”和“记录交易”两条路径；添加资产只负责建立资产档案和初始持仓，默认展示名称、分类、账户、币种、数量、平均成本价和首次持有日期等字段，其中成本价和首次持有日期可后续补充；已有持仓行中的“记录交易”用于加仓、减仓和清仓。账户类型是大类预设并支持自定义，账户名称按账户类型提供常见选项，也可新增自定义名称；支持输入代码或名称快速识别并自动带出资产名称、市场、类型和币种；当前价格/最新净值缺失且成本价已填写时暂按成本价估值并标记待获取价格；税费/手续费和汇率通过可选开关展开录入；持仓列表展示数据状态和已实现收益，历史持仓展示已实现收益和复盘状态。
- 持仓价值：按用户录入价格和汇率计算成本、市值、未实现收益和收益率；成本缺失时仍可保存资产并查看市值、账户分布和资产配置，但收益、收益率和依赖成本的归因会标记为暂无法计算。资产模块内可切换持仓列表和历史持仓，支持编辑资产关键字段，也支持填写卖出数量、卖出时间、卖出价格、费用税费和原因后进行分批卖出/减仓，清仓时转入历史持仓并累计已实现收益，同时弹窗建议用户写清仓复盘。
- 分析：展示复杂收益曲线、基准对比、自定义日期筛选，并解释组合价值变化；拆分净投入/提现、价格变动、汇率变动、分红/利息、手续费、税费、手动调整和未归因差异，各项贡献加总后对齐组合价值变化。行情缓存缺失或同步失败时，提供折叠隐藏的临时手动补录价格/净值入口；“同步价格”和 API 每日定时同步会同时抓取收益表现对比的已选或默认基准缓存。
- 本地备份：支持导出 JSON 全量备份、导出资产 CSV，并通过粘贴 JSON 进行校验、预览差异和二次确认后导入。
- 复盘：默认展示已有私有复盘笔记，支持 Markdown 或纯文本写作、草稿保存、标签、资产/交易关联，并可编辑、删除本地笔记；社区/观点广场入口当前不作为 MVP UI 功能呈现。
- 用户反馈：页脚提供“用户反馈”入口，可生成结构化试用反馈模板并通过复制或邮件草稿发送；模板只包含试用概况，不会自动附带资产明细、备份文件或敏感数据。
- 设置：右上角可选择计价货币、美元/人民币汇率、BTC/美元汇率、中文/英文、全站字体和白色/黑色主题；默认计价货币为人民币，默认美元/人民币汇率为 `6.85`，默认 BTC/美元汇率为 `70000`。

页面中的数据仅供记录和分析，不构成投资建议。当前数据默认保存在浏览器本地，不会主动上传到服务器；请在集中录入或重要修改后导出 JSON 备份。

## 数据口径

页面会尽量标明图表和指标的数据来源：

- 当前录入：基于用户录入的资产数量、价格、成本、费用和汇率计算，适合查看当前持仓、市值和配置；成本缺失的资产不会生成完整收益率。
- 估算趋势：在缺少真实历史价格或估值快照时，基于持仓成本、当前价格和日期推导中间点，只用于辅助观察，不代表真实每日净值或真实回撤；成本或首次持有日期缺失时会降低趋势和归因可信度。
- 行情缓存：基准和部分资产价格来自本地行情缓存，可能延迟或缺失，应以来源和时间戳为准。
- 演示估算：示例数据用于展示流程，不包含真实资产记录。

后续生产版本应优先按用户实际持仓按需补齐历史价格和汇率：当前持有资产从最早买入日到今天，历史清仓资产从买入日到清仓日，基准同步限制在分析页可选的少量指数或 ETF。图表应优先使用真实历史价格或每日估值快照；缺失时显式提示，不静默伪装为真实历史走势。

## MVP 上线边界

适合明天上线给种子用户试用的能力：

- 录入股票、ETF、基金、现金、数字资产、贵金属和实物资产等常见资产。
- 查看总览、变化曲线、资产类别分布、市场分布、账户分布和区间变化拆解。
- 当前价格缺失且成本价已填写时暂按成本价估值；成本、首次持有日期或当前价格缺失时，会在数据质量清单中提示待补全。
- 手动补录价格/净值，导出 JSON/CSV，粘贴 JSON 备份并校验导入。
- 分批卖出、清仓后进入历史持仓，并提示写清仓复盘。

暂不承诺的能力：

- 不提供自动投顾、收益承诺、保本暗示或个性化投资建议。
- 不保证行情、基金净值、贵金属、虚拟货币或汇率实时更新；MVP 阶段可手动同步本地缓存，但价格可能延迟或缺失，用户仍可手动补录。
- 不提供服务端账户同步、券商/交易所自动同步、多设备云同步或权限体系。
- 浏览器本地数据可能因清理缓存、更换浏览器或无痕模式而丢失，需要用户自行导出备份。

## 上线前手动验收

发布到公网前，至少走通以下路径：

1. 录入一笔股票或 ETF，不填写当前价，确认持仓显示待获取价格且估值暂按成本价。
2. 录入一笔股票或 ETF，只填写数量和当前价、不填写成本价，确认持仓可保存且收益显示成本缺失。
3. 录入一笔现金资产，确认表单显示现金金额，市场和账户类型自动切换。
4. 录入一笔数字资产或黄金类资产，确认分类、市场和币种符合预期。
5. 在总览查看总资产、区间收益、资产类别分布、市场分布和账户列表。
6. 在分析中查看区间变化拆解，并手动补录一次价格/净值。
7. 对一笔资产做分批卖出，再做清仓，确认历史持仓和已实现收益展示正常。
8. 点击清仓复盘弹窗中的“去写复盘笔记”，确认能进入笔记写作区。
9. 导出 JSON 备份，刷新页面后粘贴导入，确认能恢复数据。
10. 在手机宽度下打开页面，确认表格可横向滚动，关键按钮可点击。

## 静态部署

当前原生 JS MVP 可以作为 HTTPS 静态站部署，推荐使用 Vercel、Netlify 或 Cloudflare Pages。静态站只包含浏览器端资产台账、复盘、导入导出和本地计算能力；行情同步 API 不会随静态站一起发布，线上如需自动同步价格，应单独部署 HTTPS API 或保持手动补录价格。

通用部署要求：

- 构建命令：`npm run build:static`
- 发布目录：`dist-static`
- 发布内容只包含 `index.html`、`src/`、`public/`，不要把仓库根目录、`storage/`、`docs/`、`node_modules/` 或本地缓存作为静态资源发布。
- 部署后必须使用 HTTPS 链接访问，不要长期暴露本地 `npm start` 预览服务。
- HTTPS 页面不会调用硬编码的本地 HTTP API，避免 mixed content。默认会请求同源 `/api`；如果静态站没有同源 API，“同步价格”和基准同步会显示失败，但不影响手动录入、计算、复盘和导入导出。

推荐线上架构：

- Vercel 只部署静态前端。
- `apps/api` 独立部署为 HTTPS API 服务。
- Vercel 环境变量 `MARKET_API_BASE_URL` 指向独立 API 域名，例如 `https://asset-trail-api.onrender.com`。
- API 环境变量 `API_ALLOWED_ORIGINS` 只允许前端域名调用，例如 `https://your-project.vercel.app`。

Vercel 部署：

- 仓库已配置 `vercel.json`，会执行 `npm run build:static` 并发布 `dist-static`。
- 已配置 SPA rewrite，非 `/api/` 路径会回退到 `index.html`。
- 已配置基础安全响应头，包括 HSTS、`nosniff`、Referrer-Policy、Permissions-Policy 和 CSP。

Netlify / Cloudflare Pages 部署：

- Build command：`npm run build:static`
- Publish directory：`dist-static`
- 如需要单页路由回退，添加规则把所有非文件路径回退到 `/index.html`。
- 如平台支持响应头，建议保持与 `vercel.json` 等价的 HTTPS 安全头。

如线上需要接入独立行情 API，请确保 API 也是 HTTPS，并通过部署环境注入或发布前替换 `window.ASSET_TRAIL_CONFIG.marketApiBaseUrl`。不要把 HTTPS 页面指向 `http://127.0.0.1:4180` 或任何明文 HTTP API。

## 独立部署行情 API

长期推荐将 `apps/api` 作为独立 HTTPS 服务部署，并使用 Supabase PostgreSQL 保存行情缓存和同步记录。仓库已提供 `render.yaml`，可在 Render 中用 Blueprint 创建 `asset-trail-api` 服务；也可以手动创建 Web Service 后按下方环境变量配置。

API 部署环境变量：

```text
API_HOST=0.0.0.0
API_ALLOWED_ORIGINS=https://your-project.vercel.app
DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-xxx.pooler.supabase.com:6543/postgres
DATABASE_SSL=true
MARKET_DAILY_SYNC_ENABLED=true
```

Render Blueprint 默认会：

- 执行 `npm install` 安装依赖。
- 执行 `npm run api:start` 启动 API。
- 通过 `/api/health` 做健康检查。
- 在设置 `DATABASE_URL` 后，将行情价格、基金净值、汇率、收益表现对比基准缓存和同步运行记录写入 Supabase PostgreSQL。

获取 Supabase 数据库连接字符串：

1. 打开 Supabase 项目。
2. 进入 `Project Settings` -> `Database`。
3. 找到 `Connection string`。
4. 选择适合服务端应用的 pooled connection string，复制形如 `postgresql://...pooler.supabase.com:6543/postgres` 的 URI。
5. 将其中的 `[YOUR-PASSWORD]` 替换为项目数据库密码。
6. 粘贴到 Render 的 `DATABASE_URL` 环境变量。

API 服务部署成功后，确认健康检查：

```text
https://your-api.example.com/api/health
```

然后在 Vercel 前端项目配置：

```text
MARKET_API_BASE_URL=https://your-api.example.com
```

重新部署前端后，“同步价格”会请求：

```text
https://your-api.example.com/api/market-data/sync-daily
```

如果线上仍看到 `行情 API 路由不存在`，通常表示 `MARKET_API_BASE_URL` 没有配置、配置到了静态前端域名，或 API 服务没有部署对应路由。

如暂时没有 `DATABASE_URL`，API 会回退到文件缓存；生产环境不要把 `MARKET_DATA_DIR` 指向不可写的 `/var/data`，除非已经配置 Render Disk。短期临时测试可用 `/tmp/market-data`，但它会随实例重启丢失。

## 邮箱注册和登录

当前版本已支持接入 Supabase Auth 做邮箱注册和邮箱密码登录。账号由 Supabase 处理，密码不会保存到本仓库或浏览器业务数据中；但资产、交易、复盘仍保存在当前浏览器 `localStorage`，尚未云同步到数据库。

配置 Supabase：

1. 打开 Supabase，新建项目。
2. 在项目的 Auth / Providers 中启用 Email。
3. 在 Auth / URL Configuration 中把 Site URL 设置成线上地址，例如 `https://your-project.vercel.app`。
4. 在 Project Settings / API 里复制 Project URL 和 anon public key。

配置 Vercel 环境变量：

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

重新部署后，`npm run build:static` 会把这两个变量写入 `dist-static/public/runtime-config.js`。`anon public key` 是前端公开密钥，不要填写 service role key。

如将来单独部署 HTTPS 行情 API，可额外配置：

```text
MARKET_API_BASE_URL=https://api.example.com
```

本地调试注册登录时，可以复制示例配置：

```bash
cp public/runtime-config.example.js public/runtime-config.js
```

然后把 `public/runtime-config.js` 中的 Supabase URL 和 anon key 改成你的项目值。这个本地配置文件已被 `.gitignore` 忽略，不要提交真实配置。

线上冒烟测试：

- 打开首页不白屏，顶部本地数据提醒、行情说明和风险提示可见。
- 输入邮箱和密码注册；如果 Supabase 开启邮箱验证，应收到验证邮件。
- 验证邮箱后登录，右上角头像显示账号昵称首字母。
- 新增资产后刷新页面，数据仍保存在当前浏览器。
- JSON 导出可下载，导入失败时有明确错误提示。
- 未部署 API 时，点击“同步价格”应给出同步失败提示，页面其余功能仍可继续使用。
- 页面不出现真实密钥、真实账户隐私数据或收益承诺文案。

## 本地运行

安装依赖：

```bash
npm install
```

运行当前原生 JS 原型：

```bash
npm start
```

默认访问：

```text
http://localhost:4173
```

运行 React + TypeScript 重构入口：

```bash
npm run dev
```

默认访问：

```text
http://localhost:5173
```

运行 API 骨架：

```bash
npm run api:start
```

默认访问：

```text
http://localhost:4180/api/health
```

API 常驻运行时会默认按本机时区每天 `22:00` 执行一次价格同步，默认按所有录入过且有代码资产的首次持有日期回补历史价格，并把最新可用价格应用到资产状态。可用环境变量调整或关闭：

```bash
MARKET_DAILY_SYNC_HOUR=22 MARKET_DAILY_SYNC_MINUTE=0 npm run api:start
MARKET_DAILY_SYNC_ENABLED=false npm run api:start
```

拉取首版行情 / 净值数据：

```bash
npm run data:sync-registry
npm run data:sync-universes
npm run data:migrate-storage
npm run data:backfill
npm run data:daily
```

`data:sync-registry` 维护资产名称/代码/市场主库，用于录入搜索和自动补全；它不会抓取价格。该脚本按市场设置覆盖闸门，默认要求 A 股、港股和美股分别达到最小数量，避免单一市场数量过大掩盖中国市场缺口。价格和净值仍只通过后续行情脚本、API 手动同步或用户录入资产触发。当前脚本默认使用公开数据源；A 股主库优先使用上交所官方股票列表和深交所官方 A 股列表，东方财富市场列表仅作为兜底；港股可读取 HKEX 本地清单或回退到东方财富港股列表；美股使用 Nasdaq 公开接口，基金使用东方财富基金净值，虚拟货币、贵金属和汇率的默认源都不需要 token，`METALS_DEV_API_KEY` 仅作为贵金属备用源配置。基准对比可在分析页选择，默认展示沪深300指数 `000300`、标普500的 SPY ETF 代理基准 `SPY` 和 QQQ ETF `QQQ`；也支持中证500 `000905`、上证50 `000016`、纳斯达克100指数 `NDX`、罗素2000的 IWM ETF 代理基准 `IWM`、全球股票 VT ETF `VT` 和黄金 GLD ETF `GLD`。前端会展示数据口径和来源。详见 [行情和基金净值获取运行手册](docs/data/market-data-runbook.md)。

价格状态统一为 `synced`、`manual`、`pending`、`stale`、`missing` 和 `error`：缺行情时允许继续保存资产，但页面必须提示待获取价格、成本价兜底、缺缓存或同步失败，不能把兜底估值展示成真实市场价格。缺成本时允许保存持仓，但收益、收益率和依赖成本的归因必须显示为暂无法计算或待补全。

汇率缓存读取接口：

```text
http://localhost:4180/api/market-data/fx-rates?base=USD&quote=CNY
```

抓取传入代码近 7 天价格缓存：

```bash
curl -X POST http://localhost:4180/api/market-data/fetch-recent \
  -H "Content-Type: application/json" \
  -d '{"symbols":["SPY","NVDA","BTC"],"days":7}'
```

自动按所有录入过且有代码资产的首次持有日期回补历史价格，并应用最新价格到资产状态：

```bash
curl -X POST http://localhost:4180/api/market-data/sync-daily \
  -H "Content-Type: application/json" \
  -d '{"symbols":["00700","BTC"],"days":7}'
```

如只想使用已有本地缓存、不触发外部行情抓取，可传入 `"autoFetch": false`。

前端价格同步有两条路径：

- 手动点击“同步价格”会立即调用 `/api/market-data/sync-daily`，按所有录入过且有代码资产的首次持有日期回补历史价格，包含当前持仓和历史持仓；再把最新价格和用户资产每日价格快照写回浏览器本地资产。
- 页面启动后会检查当天是否已经自动同步；若未同步，会按所有录入过且有代码的资产自动触发一次同一接口，并以最新抓取到的价格为准。本地 MVP 需要先运行 API 服务：`npm run api:start`。

同步组合收益对比所需基准数据：

```bash
curl -X POST http://localhost:4180/api/market-data/sync-daily \
  -H "Content-Type: application/json" \
  -d '{"symbols":["000300","SPY","QQQ"],"days":30}'
```

沪深 300、恒生科技和纳斯达克 100 需要先维护成分股全集，再按成分股批量回补和每日更新。方案详见 [指数成分股全集数据获取和存储方案](docs/data/index-universe-data-plan.md)。

如需指定端口：

```bash
PORT=3000 npm start
```

## 从本地电脑访问 AWS 服务器上的预览

推荐使用 SSH 隧道访问开发预览，不需要开放 AWS 安全组端口：

1. 在 AWS 服务器上启动服务：

```bash
npm start
```

2. 在你的本地电脑执行：

```bash
ssh -N -L 4173:127.0.0.1:4173 ubuntu@52.196.26.99
```

3. 在本地浏览器打开：

```text
http://localhost:4173
```

如果你明确需要通过公网 IP 直接访问，可以在 AWS 服务器上监听所有网卡：

```bash
HOST=0.0.0.0 PORT=4173 npm start
```

然后在 AWS 安全组中只允许你的本地公网 IP 访问 TCP `4173` 端口，再打开：

```text
http://52.196.26.99:4173
```

公网方式只适合临时预览。当前原型没有登录和权限系统，不要长期暴露到公网。

## 测试

```bash
npm test
```

TypeScript 检查和 React 构建：

```bash
npm run typecheck
npm run build
```

当前测试覆盖：

- Decimal/定点数解析和舍入。
- 数量、价格、汇率的持仓价值计算。
- 分批卖出场景的已实现收益计算。
- 组合总市值和未实现收益。
- 持仓分类市值和权重汇总。
- 资产变化归因的价格、汇率、分红/利息、费用、税费和手动调整拆分。
- 首版行情覆盖白名单、数据任务和历史价格曲线生成。
- 收益率格式化。

总览变化曲线支持选择总资产或收益率，坐标轴会分别显示金额或百分比；也支持选择开始日期和结束日期，或通过时间范围列表选择最近 1 个月、3 个月、半年或一年；总览区间变化默认展示近一年，并可手动筛选日期。

计价货币只影响页面展示，不修改资产原始录入数据。选择人民币时，人民币资产按原始人民币价格展示，美元资产按设置汇率折算；选择美元时，人民币资产按设置汇率折算为美元；选择 BTC 时，美元资产按 BTC/美元汇率折算，人民币资产先按美元/人民币汇率折算为美元，再折算为 BTC。金额和单价展示统一使用币种代码前缀，例如 `CNY 1,000.00`、`USD 78.00`。

## 目录

```text
apps/
  api/                  # Node API 骨架，后续替换为数据库 repository
  web/                  # React + TypeScript 重构入口
packages/
  domain/               # 可复用 TypeScript 领域包
index.html              # 应用页面入口
server.mjs              # 本地静态文件服务器
src/
  app.js                # UI 状态、事件和渲染
  domain/
    calculations.js     # 金融计算、校验和格式化
    marketData.js       # 首版市场覆盖、白名单、历史曲线和数据任务模型
  styles/
    app.css             # 简约工具型界面样式
docs/
  data/
    api-contract.md     # 服务端 API 契约草案
    domain-model.md     # 领域实体、字段单位和边界
    index-universe-data-plan.md
    market-data-runbook.md
  decisions/
    0001-launch-sequence-and-data-boundaries.md
    0002-react-typescript-parallel-migration.md
  plans/
    to-c-product-plan.md
  product/
    mvp-prd.md          # MVP PRD
db/
  schema.sql            # PostgreSQL schema 草案
tests/
  unit/
    calculations.test.js
AGENTS.md              # 项目开发规范和合规要求
```

## 后续计划

- 按 `docs/data/domain-model.md` 和 `db/schema.sql` 推进后端数据层。
- 将本地登录替换为服务端认证、权限检查和审计日志。
- 将本地数据替换为后端 API 和关系型数据库，并增加导入去重、事务回滚和服务端校验。
- 将本地模拟行情替换为授权数据源：Tushare、Alpha Vantage、EODHD、Polygon 或其他商业授权服务。
- 引入 Playwright 端到端测试覆盖关键用户路径。
