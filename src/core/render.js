let ctx = {};

export function configureRender(context = {}) {
  ctx = { ...ctx, ...context };
}

export function renderApp() {
  ctx.syncRangePills();
  ctx.renderMetricsView(ctx.homeElements, ctx.homeRenderContext());
  ctx.renderBenchmarkPerformance();
  ctx.renderCategoryBreakdown();
  ctx.renderHomeDashboardView(ctx.homeElements, ctx.homeRenderContext());
  ctx.renderTrendChart();
  ctx.renderMarketDistribution();
  ctx.renderOverviewBreakdownDetail();
  ctx.renderAccounts();
  ctx.renderAccountPicker();
  ctx.renderPortfolio();
  ctx.renderAttribution();
  ctx.renderNotes();
  ctx.renderPosts();
  ctx.renderAuthState();
}

export function renderTrendDependentViews() {
  ctx.syncRangePills();
  ctx.renderMetricsView(ctx.homeElements, ctx.homeRenderContext());
  ctx.renderTrendChart();
  ctx.renderMarketDistribution();
  ctx.renderOverviewBreakdownDetail();
  ctx.renderAccounts();
}
