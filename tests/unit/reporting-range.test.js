import assert from "node:assert/strict";
import test from "node:test";

import {
  earliestRecordedDate,
  reportingPresetBounds
} from "../../src/domain/reportingRange.js";

test("uses the earliest selected asset holding record for record-to-date ranges", () => {
  assert.equal(
    earliestRecordedDate({
      assets: [
        { purchaseDate: "2025-08-10", updatedAt: "2025-08-11T08:00:00.000Z" },
        {
          purchaseDate: "2025-05-10",
          buyRecords: [{ boughtAt: "2025-04-28T09:00:00.000Z" }]
        }
      ],
      snapshots: [{ date: "2024-01-01" }]
    }),
    "2025-04-28"
  );
});

test("uses snapshots only when selected assets have no usable record date", () => {
  assert.equal(
    earliestRecordedDate({
      assets: [{ purchaseDate: "", updatedAt: "" }],
      snapshots: [{ date: "2025-03-01" }, { date: "2025-02-01" }]
    }),
    "2025-02-01"
  );
});

test("builds record-to-date bounds and keeps a bounded fallback", () => {
  assert.deepEqual(
    reportingPresetBounds("all", {
      end: "2026-07-28",
      assets: [{ purchaseDate: "2023-11-06" }]
    }),
    { startDate: "2023-11-06", endDate: "2026-07-28" }
  );
  assert.deepEqual(
    reportingPresetBounds("all", { end: "2026-07-28" }),
    { startDate: "2025-07-28", endDate: "2026-07-28" }
  );
});
