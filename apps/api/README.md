# Asset Trail API Skeleton

这是上线优先级第 4-7 项的临时 API 骨架，用 Node 内置 HTTP 实现，不依赖数据库。

当前目标：

- 固定 API 路径和响应结构。
- 复用现有领域计算、归因和市场数据任务模型。
- 为后续 PostgreSQL repository、认证和任务队列替换留边界。

## 运行

```bash
npm run api:start
```

默认地址：

```text
http://127.0.0.1:4180
```

可用 `API_PORT=4181 npm run api:start` 指定端口。云服务部署时需要监听所有网卡：

```bash
API_HOST=0.0.0.0 npm run api:start
```

服务启动后默认按本机时区每天 `22:00` 自动执行一次行情同步，逻辑与手动调用 `POST /api/market-data/sync-daily` 相同。可用 `MARKET_DAILY_SYNC_HOUR`、`MARKET_DAILY_SYNC_MINUTE` 调整时间，或用 `MARKET_DAILY_SYNC_ENABLED=false` 关闭。

## 线上部署

推荐将 API 独立部署为 HTTPS 服务，并让静态前端通过 `MARKET_API_BASE_URL` 调用。仓库根目录提供 `render.yaml`，可用 Render Blueprint 创建服务。生产环境推荐将 `DATABASE_URL` 指向 Supabase PostgreSQL。

生产环境建议配置：

```text
API_HOST=0.0.0.0
API_ALLOWED_ORIGINS=https://your-project.vercel.app
DATABASE_URL=postgresql://postgres.xxxxxx:PASSWORD@aws-xxx.pooler.supabase.com:6543/postgres
DATABASE_SSL=true
MARKET_DAILY_SYNC_ENABLED=true
```

`API_ALLOWED_ORIGINS` 是逗号分隔的前端来源白名单。不要在生产环境长期使用 `*`，除非只是临时公开演示。

设置 `DATABASE_URL` 后，行情价格、基金净值、汇率和同步运行记录会写入 Supabase PostgreSQL。没有数据库时会回退到文件缓存；如果使用 Render Free，不要把 `MARKET_DATA_DIR` 指向 `/var/data`，除非已经配置可写的持久化 Disk。

## 已有接口

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/accounts`
- `POST /api/accounts`
- `GET /api/instruments/search?query=00700`
- `GET /api/positions`
- `GET /api/market-data/history?symbol=00700`
- `GET /api/market-data/fx-rates?base=USD&quote=CNY`
- `POST /api/market-data/fetch-recent`
- `POST /api/market-data/sync-daily`：默认先抓取近 7 天行情，再把本地缓存中的最新价格应用到内存资产；传入 `"autoFetch": false` 可只使用已有缓存。
- `GET /api/market-data/tasks`
- `POST /api/market-data/tasks/backfill`
- `POST /api/attribution/runs`
- `POST /api/imports/preview`
- `GET /api/exports/backup.json`

## 下一步

- 用 PostgreSQL repository 替换内存 state。
- 将登录占位替换为真实认证和服务端会话。
- 将市场数据任务接入队列和授权数据源。
- 将导入预览的校验规则迁移到服务层并加集成测试。
