import {
  buildDataTasks,
  calculateAttribution,
  calculatePortfolio,
  formatPercent,
  marketUniverses,
  normalizeAsset,
  securityWhitelist,
  type NormalizedAsset
} from "@asset-trail/domain";
import { useEffect, useState } from "react";

const demoAssets: NormalizedAsset[] = [
  normalizeAsset({
    id: "demo-hk-00700",
    name: "腾讯控股",
    symbol: "00700",
    type: "股票",
    account: "港股账户",
    currency: "HKD",
    quantity: "700",
    costPrice: "310.00",
    previousPrice: "322.00",
    currentPrice: "335.00",
    previousFxRate: "0.1275",
    fxRate: "0.1280",
    contribution: "0",
    dividends: "0",
    interest: "0",
    fees: "40",
    taxes: "12",
    manualAdjustment: "0",
    purchaseDate: "2026-02-10",
    pricedAt: "2026-04-29",
    priceSource: "Tushare hk_daily 待接入"
  }),
  normalizeAsset({
    id: "demo-etf-510300",
    name: "沪深300ETF",
    symbol: "510300",
    type: "ETF",
    account: "长期账户",
    currency: "CNY",
    quantity: "52000",
    costPrice: "3.70",
    previousPrice: "3.82",
    currentPrice: "3.95",
    previousFxRate: "0.1460",
    fxRate: "0.1460",
    contribution: "0",
    dividends: "0",
    interest: "0",
    fees: "18",
    taxes: "0",
    manualAdjustment: "0",
    purchaseDate: "2026-01-29",
    pricedAt: "2026-04-29",
    priceSource: "Tushare fund_daily 待接入"
  }),
  normalizeAsset({
    id: "demo-us-qqq",
    name: "Invesco QQQ Trust",
    symbol: "QQQ",
    type: "ETF",
    account: "美股账户",
    currency: "USD",
    quantity: "90",
    costPrice: "420.00",
    previousPrice: "438.00",
    currentPrice: "452.00",
    previousFxRate: "1",
    fxRate: "1",
    contribution: "0",
    dividends: "85",
    interest: "0",
    fees: "6",
    taxes: "12",
    manualAdjustment: "0",
    purchaseDate: "2026-01-29",
    pricedAt: "2026-04-29",
    priceSource: "EODHD 待接入"
  })
];

const currencyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function App() {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const portfolio = calculatePortfolio(demoAssets);
  const attribution = calculateAttribution(demoAssets);
  const tasks = buildDataTasks(demoAssets);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => {
        if (!cancelled) setApiStatus(response.ok ? "online" : "offline");
      })
      .catch(() => {
        if (!cancelled) setApiStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-main shell content-container">
      <header className="topbar">
        <div>
          <p className="eyebrow">Asset Trail React + TypeScript</p>
          <h1>资产轨迹工程化重构入口</h1>
        </div>
        <div className="topbar-meta">
          <span className={`status ${apiStatus}`}>API {statusLabel(apiStatus)}</span>
          <p className="risk">数据仅供记录和分析，不构成投资建议。</p>
        </div>
      </header>

      <section className="metrics">
        <Metric label="总市值" value={money(portfolio.totals.marketValueCents)} hint="按 USD 基准展示" />
        <Metric label="未实现收益" value={money(portfolio.totals.unrealizedPnlCents)} hint={formatPercent(portfolio.totals.returnBps)} />
        <Metric label="持仓数量" value={String(portfolio.positions.length)} hint="当前演示资产" />
        <Metric label="数据任务" value={String(tasks.length)} hint="按市场拆分" />
      </section>

      <section className="grid">
        <Panel title="持仓列表" eyebrow="Positions">
          <table>
            <thead>
              <tr>
                <th>资产</th>
                <th>账户</th>
                <th>数量</th>
                <th>现价</th>
                <th>市值</th>
                <th>收益</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((position) => (
                <tr key={position.id}>
                  <td>
                    <strong>{position.name}</strong>
                    <span>{[position.symbol, position.type, position.currency].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td>{position.account}</td>
                  <td>{position.quantity}</td>
                  <td>{position.currentPrice}</td>
                  <td>{money(position.marketValueCents)}</td>
                  <td className={position.unrealizedPnlCents >= 0n ? "positive" : "negative"}>
                    {money(position.unrealizedPnlCents)} {formatPercent(position.returnBps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="资产变化归因" eyebrow="Attribution">
          <div className="stack">
            {attribution.items.map((item) => (
              <div className="row" key={item.key}>
                <span>{item.label}</span>
                <strong className={item.amountCents >= 0n ? "positive" : "negative"}>{money(item.amountCents)}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid">
        <Panel title="首版数据覆盖" eyebrow="Market Coverage">
          <div className="cards">
            {marketUniverses.map((universe) => (
              <article className="card" key={universe.key}>
                <strong>{universe.label}</strong>
                <span>{universe.coverage}</span>
                <small>{universe.source}</small>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="每日更新任务" eyebrow="Data Tasks">
          <div className="stack">
            {tasks.map((task) => (
              <div className="row" key={task.id}>
                <span>{task.label}</span>
                <strong>{task.assetCount} 项 · {task.status}</strong>
              </div>
            ))}
          </div>
          <p className="footnote">白名单示例资产：{securityWhitelist.length} 个。真实数据源接入将在 API 和任务队列阶段完成。</p>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function money(cents: bigint): string {
  return currencyFormatter.format(Number(cents) / 100);
}

function statusLabel(status: "checking" | "online" | "offline"): string {
  if (status === "online") return "已连接";
  if (status === "offline") return "未连接";
  return "检查中";
}
