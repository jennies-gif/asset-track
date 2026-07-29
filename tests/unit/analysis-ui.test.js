import assert from "node:assert/strict";
import test from "node:test";

import { buildNicePercentScale } from "../../src/features/analysis/analysisUi.js";

function assertScaleContains(scale, values) {
  for (const value of values) {
    assert.ok(BigInt(value) >= scale.min);
    assert.ok(BigInt(value) <= scale.max);
  }
  assert.ok(scale.ticks.includes(0n));
  assert.ok(scale.ticks.length >= 4);
  assert.ok(scale.ticks.length <= 7);
  for (let index = 1; index < scale.ticks.length; index += 1) {
    assert.equal(scale.ticks[index] - scale.ticks[index - 1], scale.step);
  }
}

test("builds an evenly spaced percent scale for positive benchmark returns", () => {
  const scale = buildNicePercentScale([0n, 5811n]);

  assertScaleContains(scale, [0n, 5811n]);
  assert.equal(scale.min, 0n);
  assert.ok(scale.max > 5811n);
});

test("builds an evenly spaced percent scale for negative benchmark returns", () => {
  const scale = buildNicePercentScale([-1840n, -320n, 0n]);

  assertScaleContains(scale, [-1840n, -320n, 0n]);
  assert.equal(scale.max, 0n);
  assert.ok(scale.min < -1840n);
});

test("builds a zero-centered scale for mixed benchmark returns", () => {
  const scale = buildNicePercentScale([-315n, 0n, 742n]);

  assertScaleContains(scale, [-315n, 0n, 742n]);
  assert.ok(scale.min < -315n);
  assert.ok(scale.max > 742n);
});

test("builds a stable scale when all benchmark returns are flat", () => {
  const scale = buildNicePercentScale([0n, 0n]);

  assertScaleContains(scale, [0n]);
  assert.ok(scale.max > scale.min);
});
