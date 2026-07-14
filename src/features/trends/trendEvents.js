import { addDays, addMonths } from "../../utils/date.js";
import { latestTrendControlDate } from "./trendModel.js";

let ctx = {};

export function configureTrendEvents(context) {
  ctx = context;
}

export function initTrendEvents(context) {
  configureTrendEvents(context);
  const { elements } = ctx;
  elements.trendRange.addEventListener("change", () => {
    if (elements.trendRange.value === "custom") {
      ctx.renderTrendDependentViews();
      return;
    }
    applyTrendPreset(elements.trendRange.value);
  });

  document.querySelectorAll("[data-range-value]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.trendRange.value = button.dataset.rangeValue;
      if (elements.trendRange.value === "custom") {
        ctx.renderTrendDependentViews();
        return;
      }
      applyTrendPreset(elements.trendRange.value);
    });
  });

  elements.trendMetric.addEventListener("change", ctx.renderTrendDependentViews);

  elements.trendStart.addEventListener("change", () => {
    elements.trendRange.value = "custom";
    ctx.renderTrendDependentViews();
  });
  elements.trendEnd.addEventListener("change", () => {
    elements.trendRange.value = "custom";
    ctx.renderTrendDependentViews();
  });
  elements.trendStart.addEventListener("input", () => {
    elements.trendRange.value = "custom";
    ctx.renderTrendDependentViews();
  });
  elements.trendEnd.addEventListener("input", () => {
    elements.trendRange.value = "custom";
    ctx.renderTrendDependentViews();
  });
}

export function initializeTrendControls() {
  const { elements } = ctx;
  const latest = latestTrendControlDate();
  elements.trendRange.value = "ytd";
  elements.trendStart.value = `${latest.slice(0, 4)}-01-01`;
  elements.trendEnd.value = latest;
  elements.trendStart.max = latest;
  elements.trendEnd.max = latest;
  syncRangePills();
}

export function applyTrendPreset(range) {
  const { elements } = ctx;
  const end = elements.trendEnd.value || latestTrendControlDate();
  if (range === "day") {
    elements.trendStart.value = addDays(end, -1);
  } else if (range === "ytd") {
    elements.trendStart.value = `${end.slice(0, 4)}-01-01`;
  } else {
    elements.trendStart.value = addMonths(end, -Number(range || 12));
  }
  elements.trendEnd.value = end;
  ctx.renderTrendDependentViews();
}

export function syncRangePills() {
  const { elements } = ctx;
  document.querySelectorAll("[data-range-value]").forEach((button) => {
    const active = button.dataset.rangeValue === elements.trendRange.value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll(".custom-date").forEach((field) => {
    field.classList.toggle("is-visible", elements.trendRange.value === "custom");
  });
}
