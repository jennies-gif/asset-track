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

可用 `API_PORT=4181 npm run api:start` 指定端口。

服务启动后默认按本机时区每天 `22:00` 自动执行一次行情同步，逻辑与手动调用 `POST /api/market-data/sync-daily` 相同。可用 `MARKET_DAILY_SYNC_HOUR`、`MARKET_DAILY_SYNC_MINUTE` 调整时间，或用 `MARKET_DAILY_SYNC_ENABLED=false` 关闭。

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
