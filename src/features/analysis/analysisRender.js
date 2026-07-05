import { calculateAttribution, formatPercent, roundDivide } from "../../domain/calculations.js";
import { buildAssetDataIssues } from "../assets/dataQuality.js";
import { benchmarkInstruments } from "../../domain/marketData.js";
import { inferAssetMarket, marketLabel } from "../assets/marketOptions.js";
import { absBigInt } from "../../utils/bigint.js";
import { escapeHtml } from "../../utils/dom.js";
import { trustBadge } from "../../ui/badges.js";
import { emptyActionState, emptyStateInner } from "../../ui/emptyState.js";
import {
  formatDisplayCurrency,
  formatShare,
  formatSignedCurrency,
  hasDisplayValue,
  toneClassForValue
} from "../../ui/formatters.js";
import {
  analysisBarRow,
  analysisMiniMetric,
  analysisStatusClass,
  analysisStatusLabel,
  renderBenchmarkComparisonChart,
  renderAllocationBars,
  renderDrawdownChart,
  renderWaterfallChart
} from "./analysisUi.js";
import {
  analysisStageEndLabel,
  analysisStageStartLabel,
  buildAnalysisModel,
  buildAnalysisTrendPoints,
  configureAnalysisModel
} from "./analysisModel.js";
import {
  buildAnalysisReturnRows,
  configureAnalysisReturns,
  formatAnalysisReturnValue,
  syncAnalysisReturnMetricButtons
} from "./analysisReturns.js";
import {
  analysisScopeLabel,
  configureAnalysisFilters,
  renderAnalysisFilters,
  selectedAnalysisAssets,
  syncAnalysisFilters
} from "./analysisFilters.js";

const DATA_UNAVAILABLE = "暂无数据";
let ctx = {};
let analysisElements = {};

export function configureAnalysisRender(context) {
  ctx = context;
  analysisElements = context.elements;
  configureAnalysisModel({
    getAnalysisFilter: context.getAnalysisFilter,
    openAssets: context.openAssets,
    calculateDisplayPortfolio: context.calculateDisplayPortfolio,
    convertUsdToDisplay: context.convertUsdToDisplay,
    assetValueAtTrendDate: context.assetValueAtTrendDate,
    buildTrendDates: context.buildTrendDates,
    latestTrendDate: context.latestTrendDate,
    assetTypeKey: context.assetTypeKey
  });
  configureAnalysisReturns({
    getAnalysisReturnMetric: context.getAnalysisReturnMetric,
    getBenchmarkPerformanceState: context.getBenchmarkPerformanceState,
    selectedBenchmarkInstruments: context.selectedBenchmarkInstruments,
    benchmarkReturnPeriods: context.benchmarkReturnPeriods,
    benchmarkHistoryPeriodReturnBps: context.benchmarkHistoryPeriodReturnBps
  });
  configureAnalysisFilters({
    elements: context.elements,
    getAnalysisFilter: context.getAnalysisFilter,
    setAnalysisFilter: context.setAnalysisFilter,
    openAssets: context.openAssets,
    buildAccountSummaries: context.buildAccountSummaries
  });
}

function syncAnalysisContext() {
  syncAnalysisFilters();
  renderAnalysisBenchmarkSelector();
}

export function renderAttribution() {
  syncAnalysisContext();
  renderAttributionInternal();
}

export function renderCurrentAnalysisReturnRows() {
  syncAnalysisContext();
  const assets = selectedAnalysisAssets();
  renderAnalysisReturnRows(buildAnalysisModel(assets, calculateDisplayPortfolio(assets), calculateAttribution(assets)));
}

function openAssets() { return ctx.openAssets(); }
function calculateDisplayPortfolio(assets) { return ctx.calculateDisplayPortfolio(assets); }
function convertUsdToDisplay(cents) { return ctx.convertUsdToDisplay(cents); }
function renderMarketSyncResult() { return ctx.renderMarketSyncResult(); }
function latestOverviewUpdateLabel() { return ctx.latestOverviewUpdateLabel(); }
function fxRateSummary() { return ctx.fxRateSummary(); }
function calculateTrendValueChangeForRange(range) { return ctx.calculateTrendValueChangeForRange(range); }
function buildEvenlySpacedXAxisLabels(points, maxLabels) { return ctx.buildEvenlySpacedXAxisLabels(points, maxLabels); }
function allocationWeightBps(positions, totalValueCents, predicate) { return ctx.allocationWeightBps(positions, totalValueCents, predicate); }
function renderAttributionInternal() {
  renderAnalysisFilters();
  const assets = selectedAnalysisAssets();
  const displayPortfolio = calculateDisplayPortfolio(assets);
  const attribution = calculateAttribution(assets);
  const analysis = buildAnalysisModel(assets, displayPortfolio, attribution);
  if (!assets.length) {
    setAnalysisAssetCardsVisible(false);
    renderEmptyAnalysis();
    renderMarketSyncResult();
    return;
  }
  setAnalysisAssetCardsVisible(true);
  const convertedStart = convertUsdToDisplay(attribution.startValueCents);
  const convertedEnd = analysis.endValueCents;
  const convertedChange = analysis.valueChangeCents;
  const convertedContribution = analysis.contributionCents;
  const investmentResult = analysis.investmentResultCents;
  const dataIssues = analysisDataIssues(assets);
  const topConcentration = topHoldingConcentration(displayPortfolio.positions, displayPortfolio.totals.marketValueCents);
  renderAnalysisJudgement(analysis, dataIssues);
  analysisElements.analysisHealthList.innerHTML = renderAnalysisHealthMetrics(analysis, dataIssues, topConcentration);
  analysisElements.stageComparisonGrid.innerHTML = [
    analysisMiniMetric("期初资产", formatDisplayCurrency(convertedStart), analysisStageStartLabel(assets)),
    analysisMiniMetric("当前资产", formatDisplayCurrency(convertedEnd), analysisStageEndLabel(assets)),
    analysisMiniMetric("净投入", formatSignedCurrency(convertedContribution), "用户录入资金变化"),
    analysisMiniMetric("投资结果", formatSignedCurrency(investmentResult), "扣除净投入")
  ].join("");

  if (analysisElements.attributionList) analysisElements.attributionList.innerHTML = "";
  renderAttributionWaterfall(analysis, convertedStart, convertedEnd);
  renderAnalysisQuality(analysis);
  renderAnalysisAllocation(analysis);
  renderAnalysisConcentration(analysis);
  renderAnalysisRisk(analysis);
  renderAnalysisDataTrust(analysis, dataIssues);
  renderMarketSyncResult();
  renderAnalysisContributionRows(displayPortfolio);
}

function setAnalysisAssetCardsVisible(isVisible) {
  document.querySelectorAll("[data-analysis-requires-assets]").forEach((card) => {
    card.classList.toggle("is-hidden", !isVisible);
  });
}

function renderEmptyAnalysis() {
  if (analysisElements.analysisJudgementTitle) analysisElements.analysisJudgementTitle.textContent = "分析数据不足";
  if (analysisElements.analysisJudgementList) {
    analysisElements.analysisJudgementList.innerHTML = "<li>添加资产和交易记录后，这里会解释组合价值变化来源。</li><li>收益、回撤和归因仅用于记录与复盘，不构成投资建议。</li>";
  }
  if (analysisElements.analysisHealthList) {
    analysisElements.analysisHealthList.innerHTML = emptyActionState("暂无分析数据", "录入资产、价格和交易后，这里会展示总资产、收益率、回撤、集中度和数据质量。", "添加第一笔资产", "add-asset");
  }
  if (analysisElements.stageComparisonGrid) analysisElements.stageComparisonGrid.innerHTML = "";
  if (analysisElements.analysisCashflowChart) {
    analysisElements.analysisCashflowChart.innerHTML = emptyStateInner("暂无归因拆解", "有交易和估值记录后，这里会区分净投入、价格变动、汇率、费用和未归因差异。");
  }
  if (analysisElements.analysisTopReturnAssets) {
    analysisElements.analysisTopReturnAssets.innerHTML = emptyStateInner("暂无贡献排行", "补充资产当前价格后，这里会展示贡献最大和拖累最大的资产。");
  }
  if (analysisElements.analysisContributionSummary) analysisElements.analysisContributionSummary.textContent = "";
  if (analysisElements.analysisRiskNote) {
    analysisElements.analysisRiskNote.innerHTML = `${trustBadge("本地保存")} ${trustBadge("数据未上传")} ${trustBadge("仅供记录与复盘")}`;
  }
  if (analysisElements.analysisContributionRows) {
    analysisElements.analysisContributionRows.innerHTML = `<tr><td colspan="4" class="empty-table-cell">${emptyStateInner("暂无数据核对项", "录入资产后，这里会列出价格、汇率、权重和待核对状态。")}</td></tr>`;
  }
  if (analysisElements.analysisMonthlyReturnChart) analysisElements.analysisMonthlyReturnChart.innerHTML = "";
  if (analysisElements.analysisBenchmarkTrendChart) analysisElements.analysisBenchmarkTrendChart.innerHTML = "";
  if (analysisElements.analysisAllocationChart) analysisElements.analysisAllocationChart.innerHTML = "";
  if (analysisElements.analysisAllocationRows) analysisElements.analysisAllocationRows.innerHTML = "";
  if (analysisElements.analysisAllocationNote) analysisElements.analysisAllocationNote.textContent = "";
  if (analysisElements.analysisConcentrationMetrics) analysisElements.analysisConcentrationMetrics.innerHTML = "";
  if (analysisElements.analysisTopHoldings) analysisElements.analysisTopHoldings.innerHTML = "";
  if (analysisElements.analysisConcentrationNote) analysisElements.analysisConcentrationNote.textContent = "";
  if (analysisElements.analysisRiskMetrics) analysisElements.analysisRiskMetrics.innerHTML = "";
  if (analysisElements.analysisDrawdownChart) analysisElements.analysisDrawdownChart.innerHTML = "";
}


function renderAnalysisJudgement(analysis, dataIssues) {
  if (!analysisElements.analysisJudgementTitle || !analysisElements.analysisJudgementList) return;
  const riskHigh = analysis.allocation.highRiskBps >= 3000n || analysis.drawdown.maxDrawdownBps <= -1500n || analysis.concentration.status === "high";
  const qualityOkay = analysis.realReturnBps >= 0n || analysis.investmentResultCents >= 0n;
  analysisElements.analysisJudgementTitle.textContent = riskHigh
    ? `风险与收益结论：组合风险偏高，收益质量${qualityOkay ? "尚可" : "承压"}。`
    : `风险与收益结论：组合风险可控，收益质量${qualityOkay ? "尚可" : "仍需观察"}。`;
  const cryptoBps = cryptoAllocationBps(analysis.portfolio.positions, analysis.portfolio.totals.marketValueCents);
  const cashBps = analysis.allocation.cashBps;
  const topDriver = topVolatileDriver(analysis);
  const yearChange = calculateTrendValueChangeForRange("ytd");
  const items = [
    `数字资产占比 ${formatShare(cryptoBps)}，${cryptoBps >= 500n ? "高于稳健参考值" : "处于较低水平"}。`,
    `最大回撤 ${formatPercent(analysis.drawdown.maxDrawdownBps)}，组合${analysis.drawdown.maxDrawdownBps <= -1500n ? "波动较大" : "回撤仍在可观察范围"}。`,
    `今年收益${yearChange !== null && yearChange >= 0n ? "为正" : "仍需观察"}，${topDriver ? `主要受 ${topDriver} 等高波动资产影响` : "需要结合资产结构继续拆解"}。`,
    `现金占比 ${formatShare(cashBps)}，${cashBps >= 2000n ? "仍有防守和再配置空间" : "防守缓冲相对有限"}。`
  ];
  if (dataIssues.length) items.push(`仍有 ${dataIssues.length} 项数据待核对，结论需在补齐价格、费用或历史记录后复查。`);
  analysisElements.analysisJudgementList.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function cryptoAllocationBps(positions, totalValueCents) {
  return allocationWeightBps(positions, totalValueCents, (position) => position.type === "数字资产" || inferAssetMarket(position) === "WEB3");
}

function topVolatileDriver(analysis) {
  const candidate = [...analysis.portfolio.positions]
    .filter((position) => position.unrealizedPnlCents !== 0n)
    .sort((left, right) => absBigInt(right.unrealizedPnlCents) > absBigInt(left.unrealizedPnlCents) ? 1 : -1)
    .find((position) => position.type === "数字资产" || inferAssetMarket(position) === "WEB3" || absBigInt(position.returnBps) >= 1000n);
  return candidate?.name || "";
}

function renderAnalysisHealthMetrics(analysis, dataIssues, topConcentration) {
  const cryptoBps = cryptoAllocationBps(analysis.portfolio.positions, analysis.portfolio.totals.marketValueCents);
  const metrics = [
    {
      label: "当前资产",
      value: formatDisplayCurrency(analysis.endValueCents),
      status: analysis.endValueCents > 0n ? "low" : "medium",
      description: "当前筛选范围内所有持仓折算后的总市值。"
    },
    {
      label: "剔除投入收益率",
      value: formatPercent(analysis.realReturnBps),
      status: analysis.realReturnBps >= 0n ? "low" : "medium",
      description: "剔除净投入/提现后，用于观察资产本身表现。"
    },
    {
      label: "最大回撤",
      value: formatPercent(analysis.drawdown.maxDrawdownBps),
      status: analysis.drawdown.maxDrawdownBps <= -1500n ? "high" : analysis.drawdown.maxDrawdownBps <= -800n ? "medium" : "low",
      description: "历史高点到低点的最大跌幅，衡量组合波动压力。"
    },
    {
      label: "数字资产占比",
      value: formatShare(cryptoBps),
      status: cryptoBps >= 3000n ? "high" : cryptoBps >= 1000n ? "medium" : "low",
      description: "数字资产通常波动更高，占比越高组合弹性和回撤都更大。"
    },
    {
      label: "Top 5 集中度",
      value: formatShare(analysis.concentration.top5WeightBps || topConcentration.top5WeightBps),
      status: analysis.concentration.status,
      description: "前五大持仓合计占比，反映组合是否依赖少数资产。"
    },
    {
      label: "数据质量",
      value: dataIssues.length ? `${dataIssues.length} 项待核对` : "关键数据完整",
      status: dataIssues.length ? "medium" : "low",
      description: dataIssues.length ? "部分价格、费用或历史记录会影响计算复算。" : "关键价格、成本、汇率和交易字段可支持当前分析。"
    }
  ];
  return metrics.map((metric) => `
    <article class="analysis-health-item ${analysisStatusClass(metric.status)}">
      <div>
        <span>${escapeHtml(metric.label)}</span>
        <b class="status-tag ${analysisStatusClass(metric.status)}">${escapeHtml(analysisStatusLabel(metric.status))}</b>
      </div>
      <strong class="${toneClassForValue(metric.value)}">${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.description)}</small>
    </article>
  `).join("");
}

function renderAttributionWaterfall(analysis, startValueCents, endValueCents) {
  if (!analysisElements.analysisCashflowChart) return;
  const itemByKey = new Map(analysis.attribution.items.map((item) => [item.key, convertUsdToDisplay(item.amountCents)]));
  const income = (itemByKey.get("income") || 0n);
  const fees = (itemByKey.get("fees") || 0n) + (itemByKey.get("taxes") || 0n);
  const rows = [
    { key: "start", label: "起点资产", amount: startValueCents, type: "total" },
    { key: "contribution", label: "净投入", amount: itemByKey.get("contribution") || 0n },
    { key: "price", label: "价格变动", amount: itemByKey.get("price") || 0n },
    { key: "fx", label: "汇率影响", amount: itemByKey.get("fx") || 0n },
    { key: "income", label: "分红", amount: income },
    { key: "fees", label: "手续费", amount: fees },
    { key: "unexplained", label: "未归因差异", amount: itemByKey.get("unexplained") || 0n },
    { key: "end", label: "当前资产", amount: endValueCents, type: "total" }
  ];
  const maxAmount = rows.reduce((max, row) => {
    const value = row.type === "total" ? absBigInt(row.amount) : absBigInt(row.amount);
    return value > max ? value : max;
  }, 1n);
  analysisElements.analysisCashflowChart.innerHTML = `${chartSourceLine("录入计算", "基于用户录入的期初价、当前价、汇率、现金流、费用和税费拆解。未补字段会进入未归因差异。", "positive")}${rows.map((row) => {
    const width = Math.max(4, Number((absBigInt(row.amount) * 10000n) / maxAmount) / 100);
    const tone = row.type === "total" ? "total" : row.amount > 0n ? "positive" : row.amount < 0n ? "negative" : "muted";
    return `
      <div class="waterfall-row ${tone}">
        <span>${escapeHtml(row.label)}</span>
        <div class="waterfall-track"><i style="width:${width.toFixed(2)}%"></i></div>
        <strong class="${row.type === "total" ? "" : toneClassForValue(row.amount)}">${escapeHtml(row.type === "total" ? formatDisplayCurrency(row.amount) : formatSignedCurrency(row.amount))}</strong>
      </div>
    `;
  }).join("")}`;
}

function attributionItemDescription(key) {
  return {
    contribution: "用户录入的新增投入或提现，不计入投资表现判断。",
    price: "由资产期初价与当前价变化产生，使用用户录入或补录价格计算。",
    fx: "多币种资产因期初汇率和当前汇率变化产生的折算影响。",
    income: "现金分红、利息或类似收入，来自用户录入记录。",
    fees: "交易手续费会减少组合变化结果，按用户录入金额扣减。",
    taxes: "税费会减少组合变化结果，按用户录入金额扣减。",
    manual: "手动调整用于记录迁移、对账修正或非标准资产变化。",
    unexplained: "可能来自数据缺失、价格/汇率口径不一致或记录未补全，需要优先核对。"
  }[key] || "用于解释组合价值变化的一项来源。";
}

function analysisOverallCard(analysis, { dataIssues, convertedEnd, convertedChange }) {
  const status = analysisOverallStatus(analysis, dataIssues);
  const changeText = formatSignedCurrency(convertedChange);
  if (!hasDisplayValue(formatPercent(analysis.realReturnBps)) || !hasDisplayValue(formatPercent(analysis.drawdown.maxDrawdownBps))) {
    return analysisInsufficientDataCard();
  }
  return `
    <article class="analysis-overall-inner ${analysisStatusClass(status)}">
      <div class="analysis-overall-top">
        <span class="status-tag ${analysisStatusClass(status)}">${escapeHtml(analysisStatusLabel(status))}</span>
        <small>${escapeHtml(analysisScopeLabel())}</small>
      </div>
      <strong>${escapeHtml(formatDisplayCurrency(convertedEnd))}</strong>
      <p>区间变化 <span class="${toneClassForValue(convertedChange)}">${escapeHtml(changeText)}</span>。${escapeHtml(analysisOverallConclusion(analysis, dataIssues))}</p>
      <dl>
        <div>
          <dt>真实投资收益率</dt>
          <dd class="${toneClassForValue(analysis.realReturnBps)}">${escapeHtml(formatPercent(analysis.realReturnBps))}</dd>
        </div>
        <div>
          <dt>最大回撤</dt>
          <dd class="${toneClassForValue(analysis.drawdown.maxDrawdownBps)}">${escapeHtml(formatPercent(analysis.drawdown.maxDrawdownBps))}</dd>
        </div>
        <div>
          <dt>数据可信度</dt>
          <dd>${escapeHtml(dataIssues.length ? `${dataIssues.length} 项待核对` : "关键数据完整")}</dd>
        </div>
      </dl>
    </article>
  `;
}

function analysisInsufficientDataCard() {
  return `
    <article class="analysis-overall-inner analysis-empty-card">
      <strong>暂无足够数据</strong>
      <p>请补充资产成本价、当前价或历史记录后查看。</p>
    </article>
  `;
}

function analysisOverallStatus(analysis, dataIssues) {
  if (analysis.drawdown.currentDrawdownBps <= -1000n || analysis.concentration.status === "high" || analysis.allocation.highRiskBps >= 7000n) return "high";
  if (dataIssues.length || analysis.realReturnBps < 0n || analysis.drawdown.currentDrawdownBps <= -500n || analysis.concentration.status === "medium") return "medium";
  return "low";
}

function analysisOverallConclusion(analysis, dataIssues) {
  if (dataIssues.length) return "当前结论受数据缺口影响，建议先核对价格、汇率和未归因差异。";
  if (analysis.realReturnBps < 0n) return "剔除投入后组合仍为负收益，需要重点复盘拖累来源。";
  if (analysis.concentration.status !== "low") return "组合表现为正，但集中度偏高，需要确认是否符合风险承受范围。";
  return "组合结构和收益质量暂未出现明显异常，继续保持数据更新。";
}

function renderAnalysisQuality(analysis) {
  if (analysisElements.analysisQualityMetrics) {
    const positiveMonths = analysis.monthlyReturns.filter((item) => item.amountCents > 0n).length;
    const positiveMonthBps = analysis.monthlyReturns.length
      ? roundDivide(BigInt(positiveMonths) * 10000n, BigInt(analysis.monthlyReturns.length))
      : 0n;
    analysisElements.analysisQualityMetrics.innerHTML = [
      analysisMiniMetric("累计收益金额", formatDisplayCurrency(analysis.portfolio.totals.unrealizedPnlCents), "当前市值 - 成本"),
      analysisMiniMetric("年化收益率", formatPercent(analysis.annualizedReturnBps), "按持仓时间折算"),
      analysisMiniMetric("真实投资收益率", formatPercent(analysis.realReturnBps), "剔除净投入/提现"),
      analysisMiniMetric("正收益月份占比", formatShare(positiveMonthBps), `${positiveMonths}/${analysis.monthlyReturns.length} 个月`)
    ].join("");
  }
  if (analysisElements.analysisMonthlyReturnChart) {
    renderAnalysisReturnRows(analysis);
  }
  analysisElements.analysisTopReturnAssets.innerHTML = renderTopReturnAssets(analysis);
  renderContributionSummary(analysis);
}

function renderAnalysisReturnRows(analysis) {
  ensureAnalysisBenchmarkDataLoaded();
  syncAnalysisReturnMetricButtons();
  const rows = buildAnalysisReturnRows(analysis, analysisScopeLabel);
  const tableWrap = analysisElements.analysisMonthlyReturnChart?.closest(".table-wrap");
  tableWrap?.classList.toggle("is-hidden", !rows.length);
  if (!rows.length) {
    analysisElements.analysisMonthlyReturnChart.innerHTML = "";
    renderAnalysisBenchmarkTrendChart(analysis);
    return;
  }
  analysisElements.analysisMonthlyReturnChart.innerHTML = rows
    .map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.meta)}</span>
        </td>
        ${row.periods.map((period) => `
          <td class="${!hasDisplayValue(period.valueBps) ? "placeholder-value" : toneClassForValue(period.valueBps)}">${escapeHtml(!hasDisplayValue(period.valueBps) ? DATA_UNAVAILABLE : formatAnalysisReturnValue(period.valueBps))}</td>
        `).join("")}
      </tr>
    `)
    .join("");
  renderAnalysisBenchmarkTrendChart(analysis);
}

function ensureAnalysisBenchmarkDataLoaded() {
  const status = ctx.getBenchmarkPerformanceState?.().status;
  if (status === "idle" || status === "error") ctx.loadBenchmarkPerformance?.({ force: status === "error" });
}

function renderAnalysisBenchmarkSelector() {
  if (!analysisElements.analysisBenchmarkSelector) return;
  const selected = new Set(ctx.getSelectedBenchmarkKeys());
  analysisElements.analysisBenchmarkSelector.innerHTML = benchmarkInstruments
    .map((benchmark) => `
      <label class="benchmark-option ${selected.has(benchmark.key) ? "is-selected" : ""}">
        <input type="checkbox" value="${escapeHtml(benchmark.key)}" ${selected.has(benchmark.key) ? "checked" : ""}>
        <span>${escapeHtml(benchmark.label)}</span>
      </label>
    `)
    .join("");
}

function renderAnalysisBenchmarkTrendChart(analysis) {
  if (!analysisElements.analysisBenchmarkTrendChart) return;
  const trendPoints = buildAnalysisTrendPoints(analysis.assets);
  const comparableSeries = buildComparableBenchmarkSeries(trendPoints);
  analysisElements.analysisBenchmarkTrendChart.innerHTML = renderBenchmarkComparisonChart(comparableSeries, buildEvenlySpacedXAxisLabels);
}

function buildComparableBenchmarkSeries(trendPoints) {
  const portfolioRawPoints = trendPoints
    .map((point) => ({ date: point.date, value: Number(BigInt(point.valueCents || 0)) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0);
  const benchmarkRawSeries = ctx.selectedBenchmarkInstruments().map((benchmark) => ({
    label: benchmark.label,
    points: (ctx.getBenchmarkPerformanceState().histories[benchmark.key] || [])
      .map((point) => ({ date: point.date, value: Number(point.close) }))
      .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value) && point.value > 0)
  }));
  const availableSeries = [
    { label: "我的组合", points: portfolioRawPoints },
    ...benchmarkRawSeries
  ].filter((series) => series.points.length >= 2);
  if (!availableSeries.length) return [];

  const commonStart = availableSeries.reduce(
    (current, series) => series.points[0].date > current ? series.points[0].date : current,
    availableSeries[0].points[0].date
  );
  const commonEnd = availableSeries.reduce(
    (current, series) => series.points.at(-1).date < current ? series.points.at(-1).date : current,
    availableSeries[0].points.at(-1).date
  );
  if (commonStart >= commonEnd) return [];

  return availableSeries.map((series) => ({
    label: series.label,
    points: normalizedReturnPoints(series.points, commonStart, commonEnd)
  }));
}

function normalizedReturnPoints(points, start, end) {
  const scopedPoints = points.filter((point) => point.date >= start && point.date <= end);
  const first = scopedPoints.find((point) => point.value > 0);
  if (!first) return [];
  const base = first.value;
  return scopedPoints
    .filter((point) => point.date >= first.date && point.value > 0)
    .map((point) => ({
      date: point.date,
      returnBps: BigInt(Math.round(((point.value - base) / base) * 10000))
    }));
}

function renderAnalysisRisk(analysis) {
  if (!analysisElements.analysisRiskMetrics) return;
  analysisElements.analysisRiskMetrics.innerHTML = [
    analysisMiniMetric("最大回撤", formatPercent(analysis.drawdown.maxDrawdownBps), `${analysis.drawdown.maxStartDate} 至 ${analysis.drawdown.maxEndDate}`),
    analysisMiniMetric("当前回撤", formatPercent(analysis.drawdown.currentDrawdownBps), analysis.drawdown.currentDrawdownDays ? `已持续约 ${analysis.drawdown.currentDrawdownDays} 天` : "当前接近阶段高点"),
    analysisMiniMetric("最差单期收益", formatPercent(analysis.drawdown.worstMonthBps), analysis.drawdown.worstMonthLabel),
    analysisMiniMetric("回撤持续天数", `${analysis.drawdown.maxDrawdownDays} 天`, "历史最大回撤区间")
  ].join("");
  analysisElements.analysisDrawdownChart.innerHTML = `${chartSourceLine("估算回撤", "基于持仓成本、当前价格和日期推导的趋势点计算，不等同于真实每日回撤。补齐历史价格后可替换为真实回撤。", "warning")}${renderDrawdownChart(analysis.drawdown.points, buildEvenlySpacedXAxisLabels)}`;
  const highRisk = analysis.drawdown.maxDrawdownBps <= -1500n || analysis.drawdown.currentDrawdownBps <= -1000n;
  analysisElements.analysisRiskNote.innerHTML = highRisk
    ? `你的历史最大回撤为 <strong class="${toneClassForValue(analysis.drawdown.maxDrawdownBps)}">${escapeHtml(formatPercent(analysis.drawdown.maxDrawdownBps))}</strong>，曾持续约 ${analysis.drawdown.maxDrawdownDays} 天。需要提前确认自己是否能接受类似下跌，而不是在回撤中临时改变计划。`
    : `当前回撤处于可观察范围。相比短期涨跌，更值得关注的是未来是否仍能坚持既定配置和复盘节奏。`;
}

function renderAnalysisDataTrust(analysis, dataIssues) {
  if (!analysisElements.analysisRiskNote) return;
  const unexplained = convertUsdToDisplay(
    analysis.attribution.items.find((item) => item.key === "unexplained")?.amountCents || 0n
  );
  const issueSummary = summarizeAnalysisIssues(dataIssues);
  if (!dataIssues.length && unexplained === 0n) {
    analysisElements.analysisRiskNote.innerHTML = `${trustBadge("关键数据完整", "positive")} ${trustBadge(`上次更新：${latestOverviewUpdateLabel()}`)} ${trustBadge(fxRateSummary())} <span>仅供记录与复盘，不构成投资建议。</span>`;
    return;
  }
  analysisElements.analysisRiskNote.innerHTML = `
    <strong>${escapeHtml(dataIssues.length ? `${dataIssues.length} 项数据待核对` : "存在未归因差异")}</strong>
    <span>${issueSummary ? escapeHtml(issueSummary) : `未归因差异 ${escapeHtml(formatSignedCurrency(unexplained))}，建议核对期初价格、当前价格、汇率和费用。`}</span>
    <span class="analysis-trust-inline">${trustBadge("仅供记录与复盘")} ${trustBadge(fxRateSummary())}</span>
  `;
}

function summarizeAnalysisIssues(dataIssues) {
  const rows = dataIssues.slice(0, 3).map(({ asset, issue }) => `${asset.name}：${issue.action || issue.label}`);
  if (!rows.length) return "";
  const suffix = dataIssues.length > rows.length ? `；另有 ${dataIssues.length - rows.length} 项` : "";
  return `${rows.join("；")}${suffix}`;
}

function renderAnalysisAllocation(analysis) {
  if (!analysisElements.analysisAllocationRows) return;
  analysisElements.analysisAllocationChart.innerHTML = `${chartSourceLine("当前录入", "基于当前持仓估值和 MVP 内置目标配置对比，不构成配置建议。", "positive")}${renderAllocationBars(analysis.allocation.rows)}`;
  analysisElements.analysisAllocationRows.innerHTML = analysis.allocation.rows.length
    ? analysis.allocation.rows.map((row) => `
        <tr>
          <td><strong>${escapeHtml(row.type)}</strong><span>${escapeHtml(row.status)}</span></td>
          <td>${formatShare(row.currentBps)}</td>
          <td>${formatShare(row.targetBps)}</td>
          <td class="${row.deviationBps > 0n ? "positive" : row.deviationBps < 0n ? "negative" : ""}">${row.deviationBps > 0n ? "+" : ""}${formatShare(row.deviationBps)}</td>
          <td>${formatDisplayCurrency(row.deviationAmountCents)}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" class="empty-cell">暂无配置数据。先录入资产并同步或补全当前价格后，可查看当前配置与目标配置偏离。</td></tr>`;
  analysisElements.analysisAllocationNote.innerHTML = `${escapeHtml(analysis.allocation.maxDeviationLabel)}。当前高风险资产占比 ${escapeHtml(formatShare(analysis.allocation.highRiskBps))}，现金占比 ${escapeHtml(formatShare(analysis.allocation.cashBps))}。目标配置为 MVP 内置参考，后续可扩展为用户自定义。`;
}

function chartSourceLine(label, description, tone = "") {
  return `
    <div class="chart-source-line compact">
      <span class="chart-source-badge ${escapeHtml(tone)}">${escapeHtml(label)}</span>
      <small>${escapeHtml(description)}</small>
    </div>
  `;
}

function renderAnalysisConcentration(analysis) {
  if (!analysisElements.analysisConcentrationMetrics) return;
  analysisElements.analysisConcentrationMetrics.innerHTML = [
    analysisMiniMetric("Top 1 持仓", formatShare(analysis.concentration.top1WeightBps), analysis.concentration.sorted[0]?.name || "暂无"),
    analysisMiniMetric("Top 5 持仓", formatShare(analysis.concentration.top5WeightBps), "前五大资产合计"),
    analysisMiniMetric("最大市场占比", formatShare(analysis.concentration.market.weightBps), analysis.concentration.market.label),
    analysisMiniMetric("最大账户占比", formatShare(analysis.concentration.account.weightBps), analysis.concentration.account.label)
  ].join("");
  analysisElements.analysisTopHoldings.innerHTML = renderTopHoldings(analysis);
  analysisElements.analysisConcentrationNote.innerHTML = analysis.concentration.status === "high"
    ? `你的前 5 大持仓占总资产 <strong>${escapeHtml(formatShare(analysis.concentration.top5WeightBps))}</strong>。这不一定代表需要卖出，但账户表现会明显受少数资产影响。`
    : `当前集中度暂未触发高风险阈值。后续新增资产时仍建议关注单一资产、市场和账户占比。`;
}

function renderAnalysisCashflow(analysis, startValueCents, contributionCents, investmentResultCents, endValueCents) {
  if (!analysisElements.analysisCashflowChart) return;
  const outflowCents = contributionCents < 0n ? -contributionCents : 0n;
  const inflowCents = contributionCents > 0n ? contributionCents : 0n;
  analysisElements.analysisCashflowChart.innerHTML = renderWaterfallChart([
    { label: "期初资产", value: startValueCents },
    { label: "累计入金", value: inflowCents },
    { label: "累计出金", value: -outflowCents },
    { label: "投资收益", value: investmentResultCents },
    { label: "当前资产", value: endValueCents, total: true }
  ]);
}

function renderTopReturnAssets(analysis) {
  const gainRows = analysis.portfolio.positions
    .filter((position) => position.unrealizedPnlCents > 0n)
    .sort((left, right) => right.unrealizedPnlCents > left.unrealizedPnlCents ? 1 : -1)
    .slice(0, 3);
  const dragRows = analysis.portfolio.positions
    .filter((position) => position.unrealizedPnlCents < 0n)
    .sort((left, right) => left.unrealizedPnlCents < right.unrealizedPnlCents ? 1 : -1)
    .slice(0, 3);
  const rows = [...gainRows, ...dragRows];
  const max = rows.reduce((current, item) => absBigInt(item.unrealizedPnlCents) > current ? absBigInt(item.unrealizedPnlCents) : current, 1n);
  if (!rows.length) return `<p class="empty-state">暂无收益贡献数据。先录入资产并同步或补全当前价格后，再查看贡献最大和拖累最大的资产。</p>`;
  return `
    <div class="contribution-groups">
      ${renderContributionGroup("贡献最大", gainRows, max, "暂无正贡献资产。同步最新价格或补录当前价格后再检查。")}
      ${renderContributionGroup("拖累最大", dragRows, max, "暂无负贡献资产。同步最新价格或补录当前价格后再检查。")}
    </div>
  `;
}

function renderContributionSummary(analysis) {
  if (!analysisElements.analysisContributionSummary) return;
  const dragRows = analysis.portfolio.positions
    .filter((position) => position.unrealizedPnlCents < 0n)
    .sort((left, right) => left.unrealizedPnlCents < right.unrealizedPnlCents ? 1 : -1)
    .slice(0, 2);
  if (!dragRows.length) {
    analysisElements.analysisContributionSummary.textContent = "当前组合暂无明显负贡献资产，后续仍需观察高波动资产是否改变收益来源。";
    return;
  }
  const names = dragRows.map((position) => position.name).join("和");
  const hasHighRisk = dragRows.some((position) => position.type === "数字资产" || inferAssetMarket(position) === "WEB3" || absBigInt(position.returnBps) >= 1000n);
  analysisElements.analysisContributionSummary.textContent = hasHighRisk
    ? `当前组合主要拖累来自${names}，说明组合短期波动主要集中在高风险资产。`
    : `当前组合主要拖累来自${names}，建议结合账户、市场和持仓权重复盘是否需要调整。`;
}

function renderContributionGroup(title, rows, max, emptyText) {
  return `
    <section class="contribution-group" aria-label="${escapeHtml(title)}">
      <h5>${escapeHtml(title)}</h5>
      ${rows.length
        ? rows.map((item) => analysisBarRow(item.name, contributionAssetMeta(item), item.unrealizedPnlCents, max)).join("")
        : `<p class="empty-state compact-empty">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function contributionAssetMeta(position) {
  return [position.account, marketLabel(position.market), position.hasCostBasis ? formatPercent(position.returnBps) : "成本缺失"].filter(Boolean).join(" · ");
}

function renderTopHoldings(analysis) {
  const rows = analysis.concentration.sorted.slice(0, 5);
  const max = rows[0]?.marketValueCents || 1n;
  return rows.length
    ? rows.map((item) => {
        const weight = analysis.portfolio.totals.marketValueCents === 0n ? 0n : roundDivide(item.marketValueCents * 10000n, analysis.portfolio.totals.marketValueCents);
        return analysisBarRow(item.name, `${item.type} · ${marketLabel(item.market)} · ${formatShare(weight)}`, item.marketValueCents, max, false);
      }).join("")
    : `<p class="empty-state">暂无当前持仓。先到“资产”页添加资产，或导入 JSON 备份恢复持仓。</p>`;
}

function analysisDataIssues(assets) {
  return assets.flatMap((asset) =>
    buildAssetDataIssues(asset)
      .filter((issue) => !["missing-buy-reason", "missing-close-reason"].includes(issue.key))
      .map((issue) => ({ asset, issue }))
  );
}

function topHoldingConcentration(positions, totalValueCents) {
  if (!positions.length || totalValueCents === 0n) {
    return { status: "empty", message: "暂无当前持仓，先录入资产后查看集中度", weightBps: 0n };
  }
  const top = [...positions].sort((left, right) => Number(right.marketValueCents - left.marketValueCents))[0];
  const weightBps = roundDivide(top.marketValueCents * 10000n, totalValueCents);
  const status = weightBps >= 4000n ? "high" : weightBps >= 2500n ? "medium" : "low";
  return {
    status,
    weightBps,
    asset: top,
    message: `当前范围内${top.name}占${formatShare(weightBps)}`
  };
}

function renderAnalysisHealthList(concentration, dataIssues, analysis) {
  const unexplained = convertUsdToDisplay(
    analysis.attribution.items.find((item) => item.key === "unexplained")?.amountCents || 0n
  );
  const digitalBps = analysis.allocation.rows.find((item) => item.type === "数字资产")?.currentBps || 0n;
  const qualityStatus = analysis.realReturnBps < 0n || absBigInt(unexplained) > 0n ? "medium" : "low";
  const statusItems = [
    {
      label: "当前回撤较深",
      value: formatPercent(analysis.drawdown.currentDrawdownBps),
      status: analysis.drawdown.currentDrawdownBps <= -1000n ? "high" : analysis.drawdown.currentDrawdownBps <= -500n ? "medium" : "low",
      hint: analysis.drawdown.currentDrawdownDays ? `已持续约 ${analysis.drawdown.currentDrawdownDays} 天` : "当前接近阶段高点"
    },
    {
      label: "数字资产配置偏高",
      value: formatShare(digitalBps),
      status: digitalBps >= 1500n ? "high" : digitalBps >= 800n ? "medium" : "low",
      hint: "目标参考 5%，偏离时建议复核风险暴露"
    },
    {
      label: "Top 5 集中度过高",
      value: formatShare(concentration.top5WeightBps),
      status: concentration.top5WeightBps >= 6000n ? "high" : concentration.top5WeightBps >= 4500n ? "medium" : "low",
      hint: concentration.message
    },
    {
      label: "收益质量",
      value: formatPercent(analysis.realReturnBps),
      status: qualityStatus,
      hint: dataIssues.length ? `${dataIssues.length} 项数据待核对` : "未归因差异",
      hintValue: dataIssues.length ? "" : formatSignedCurrency(unexplained),
      hintClass: dataIssues.length ? "" : toneClassForValue(unexplained)
    }
  ];
  return statusItems
    .map((item) => `
      <article class="analysis-health-item ${analysisStatusClass(item.status)}">
        <div>
          <span>${escapeHtml(item.label)}</span>
          <b class="status-tag ${analysisStatusClass(item.status)}">${escapeHtml(analysisStatusLabel(item.status))}</b>
        </div>
        <strong class="${toneClassForValue(item.value)}">${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.hint)}${item.hintValue ? ` <b class="${escapeHtml(item.hintClass)}">${escapeHtml(item.hintValue)}</b>` : ""}</small>
      </article>
    `)
    .join("");
}

function renderAnalysisContributionRows(portfolio) {
  if (!analysisElements.analysisContributionRows) return;
  const totalValue = portfolio.totals.marketValueCents || 1n;
  const rows = portfolio.positions
    .map((position) => {
      const changeCents = position.marketValueCents - position.previousValueCents;
      const issues = analysisDataIssues([position]);
      return {
        position,
        changeCents,
        weightBps: roundDivide(position.marketValueCents * 10000n, totalValue),
        status: issues.length ? `${issues.length} 项待核对` : "完整"
      };
    })
    .sort((left, right) => {
      const rightAbs = absBigInt(right.changeCents);
      const leftAbs = absBigInt(left.changeCents);
      if (rightAbs === leftAbs) return right.position.name.localeCompare(left.position.name);
      return rightAbs > leftAbs ? 1 : -1;
    })
    .slice(0, 6);
  analysisElements.analysisContributionRows.innerHTML = rows.length
    ? rows
        .map((row) => {
          const changeClass = toneClassForValue(row.changeCents);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(row.position.name)}</strong>
                <span>${escapeHtml([row.position.symbol, marketLabel(row.position.market), row.position.currency].filter(Boolean).join(" · "))}</span>
              </td>
              <td class="${changeClass}">${formatDisplayCurrency(row.changeCents)}</td>
              <td>${formatShare(row.weightBps)}</td>
              <td><span class="status-pill ${row.status === "完整" ? "" : "warning"}">${escapeHtml(row.status)}</span></td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" class="empty-cell">暂无当前资产。先到“资产”页添加资产，或导入 JSON 备份后查看贡献排行。</td></tr>`;
}
