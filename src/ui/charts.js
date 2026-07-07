import { categoryColors } from "../constants/appConstants.js";
import { escapeHtml } from "../utils/dom.js";
import { formatShare } from "./formatters.js";

export function renderDonutChart(categories, label = "占比图") {
  let accumulated = 0;
  const radius = 70;
  const chartWidth = 340;
  const minLabelGap = 18;
  const visibleCategories = categories.filter((category) => Number(category.weightBps) > 0);
  const chartHeight = Math.max(240, 56 + visibleCategories.length * minLabelGap);
  const centerX = 170;
  const centerY = chartHeight / 2;
  const segments = visibleCategories
    .map((category, index) => {
      const portion = Number(category.weightBps) / 10000;
      const start = accumulated;
      const end = accumulated + portion;
      accumulated = end;
      return describePieSlice(centerX, centerY, radius, start, end, categoryColors[index % categoryColors.length]);
    })
    .join("");
  accumulated = 0;
  const calloutItems = visibleCategories
    .map((category, index) => {
      const portion = Number(category.weightBps) / 10000;
      const start = accumulated;
      const end = accumulated + portion;
      const middle = start + portion / 2;
      accumulated = end;
      const color = categoryColors[index % categoryColors.length];
      const edge = polarToCartesian(centerX, centerY, radius, middle);
      const elbow = polarToCartesian(centerX, centerY, radius + 16, middle);
      const isRight = elbow.x >= centerX;
      const labelX = isRight ? Math.min(318, elbow.x + 30) : Math.max(22, elbow.x - 30);
      const textAnchor = isRight ? "start" : "end";
      return {
        color,
        dotX: isRight ? labelX - 12 : labelX + 12,
        edge,
        elbow,
        index,
        labelX,
        rawY: elbow.y,
        side: isRight ? "right" : "left",
        text: `${category.label} ${formatShare(category.weightBps)}`,
        textAnchor
      };
    });
  const calloutLayout = layoutDonutCallouts(calloutItems, 24, chartHeight - 24, minLabelGap);
  const callouts = calloutLayout
    .map((item) => {
      const { color, dotX, edge, elbow, labelX, labelY, text, textAnchor } = item;
      return `
        <path class="donut-callout-line" d="M ${edge.x.toFixed(1)} ${edge.y.toFixed(1)} L ${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)} L ${dotX.toFixed(1)} ${labelY.toFixed(1)}" stroke="${color}"></path>
        <circle class="donut-callout-dot" cx="${dotX.toFixed(1)}" cy="${labelY.toFixed(1)}" r="5.5" stroke="${color}"></circle>
        <text class="donut-callout-label" x="${labelX.toFixed(1)}" y="${(labelY + 4).toFixed(1)}" text-anchor="${textAnchor}">
          ${escapeHtml(text)}
        </text>
      `;
    })
    .join("");
  const centerLabel = label.replace("占比图", "") || "分布";

  return `
    <svg class="pie-chart donut-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" style="aspect-ratio: ${chartWidth} / ${chartHeight}" role="img" aria-label="${escapeHtml(label)}">
      ${segments}
      <circle cx="${centerX}" cy="${centerY}" r="43" class="pie-hole"></circle>
      <text x="${centerX}" y="${centerY - 4}" text-anchor="middle" class="donut-center-label">${escapeHtml(centerLabel)}</text>
      <text x="${centerX}" y="${centerY + 13}" text-anchor="middle" class="donut-center-count">${visibleCategories.length} 项</text>
      ${callouts}
    </svg>
  `;
}

export function buildSmoothLinePath(points) {
  if (!Array.isArray(points) || !points.length) return "";
  if (points.length === 1) return `M ${formatPoint(points[0])}`;
  if (points.length === 2) return `M ${formatPoint(points[0])} L ${formatPoint(points[1])}`;

  const commands = [`M ${formatPoint(points[0])}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const nextNext = points[Math.min(points.length - 1, index + 2)];
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6
    };
    const controlTwo = {
      x: next.x - (nextNext.x - current.x) / 6,
      y: next.y - (nextNext.y - current.y) / 6
    };
    commands.push(`C ${formatPoint(controlOne)} ${formatPoint(controlTwo)} ${formatPoint(next)}`);
  }
  return commands.join(" ");
}

export function buildSmoothAreaPath(points, baselineY, leftX, rightX) {
  const linePath = buildSmoothLinePath(points);
  if (!linePath) return "";
  return `M ${leftX.toFixed(1)},${baselineY.toFixed(1)} ${linePath.replace(/^M /u, "L ")} L ${rightX.toFixed(1)},${baselineY.toFixed(1)} Z`;
}

function formatPoint(point) {
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function layoutDonutCallouts(items, minY, maxY, minGap) {
  const arranged = [...items];
  ["left", "right"].forEach((side) => {
    const sideItems = arranged
      .filter((item) => item.side === side)
      .sort((a, b) => a.rawY - b.rawY);
    const positioned = distributeVerticalLabels(sideItems, minY, maxY, minGap);
    positioned.forEach((item) => {
      arranged[item.index] = item;
    });
  });
  return arranged;
}

function distributeVerticalLabels(items, minY, maxY, minGap) {
  if (!items.length) return items;
  const positioned = items.map((item) => ({
    ...item,
    labelY: Math.max(minY, Math.min(maxY, item.rawY))
  }));
  for (let index = 1; index < positioned.length; index += 1) {
    positioned[index].labelY = Math.max(positioned[index].labelY, positioned[index - 1].labelY + minGap);
  }
  const overflow = positioned[positioned.length - 1].labelY - maxY;
  if (overflow > 0) {
    positioned.forEach((item) => {
      item.labelY -= overflow;
    });
  }
  for (let index = positioned.length - 2; index >= 0; index -= 1) {
    positioned[index].labelY = Math.min(positioned[index].labelY, positioned[index + 1].labelY - minGap);
  }
  if (positioned[0].labelY < minY) {
    const underflow = minY - positioned[0].labelY;
    positioned.forEach((item) => {
      item.labelY += underflow;
    });
  }
  return positioned;
}

function describePieSlice(cx, cy, radius, startRatio, endRatio, color) {
  if (endRatio - startRatio >= 0.9999) {
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"></circle>`;
  }
  const start = polarToCartesian(cx, cy, radius, startRatio);
  const end = polarToCartesian(cx, cy, radius, endRatio);
  const largeArcFlag = endRatio - startRatio > 0.5 ? 1 : 0;
  return `
    <path
      d="M ${cx} ${cy} L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z"
      fill="${color}"
    ></path>
  `;
}

function polarToCartesian(cx, cy, radius, ratio) {
  const angle = ratio * Math.PI * 2 - Math.PI / 2;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}
