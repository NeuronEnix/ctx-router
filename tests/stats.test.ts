import { describe, it, expect } from "vitest";
import { STATS, STATS_INTERVAL_MS } from "../src/common/const";
import { updateStatsIfStale } from "../src/common/helper";

describe("process stats sampling", () => {
  it("importing the helper has no side effects (stats stay -1 until sampled)", () => {
    expect(STATS.cpu).toBe(-1);
    expect(STATS.mem).toBe(-1);
  });

  it("samples stats on first call", () => {
    updateStatsIfStale(Date.now());
    expect(STATS.mem).toBeGreaterThan(0);
    expect(STATS.cpu).toBeGreaterThanOrEqual(0);
  });

  it("skips resampling within the interval and resamples after it", () => {
    const now = Date.now();
    updateStatsIfStale(now);

    STATS.mem = -999; // sentinel to detect an (unwanted) resample
    updateStatsIfStale(now + 1);
    expect(STATS.mem).toBe(-999); // within interval: untouched

    updateStatsIfStale(now + STATS_INTERVAL_MS + 1);
    expect(STATS.mem).toBeGreaterThan(0); // past interval: resampled
  });
});
