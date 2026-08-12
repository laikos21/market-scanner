import { describe, expect, it } from "vitest";

import { emptyIndicatorState } from "../src/indicators";
import { evaluateSignalQuality } from "../src/quality";
import type { Bar } from "../src/types";

function bar(close: number, volume: number): Bar {
  return {
    symbol: "VLO",
    ts: "2026-08-12T13:40:00Z",
    open: close - 0.5,
    high: close,
    low: close - 1,
    close,
    volume,
  };
}

describe("620 quality gate", () => {
  it("recognizes aligned trend, breakout, volume and momentum", () => {
    const indicator = {
      ...emptyIndicatorState(),
      ema20: 101,
      macd: 1,
      signal: 0,
      recentEma20: [99, 99.5, 100, 101],
      recentHighs: [99, 100, 101, 102],
      recentVolumes: [100, 100, 100, 100, 100, 130],
      recentHistograms: [-0.1, 0.1, 0.2, 0.4, 0.7, 1],
    };
    const result = evaluateSignalQuality(indicator, bar(105, 130));
    expect(result.ready).toBe(true);
    expect(result.score).toBe(4);
    expect(result.grade).toBe("A");
  });

  it("marks a weak cross as quality C", () => {
    const indicator = {
      ...emptyIndicatorState(),
      ema20: 99,
      macd: 0.01,
      signal: 0,
      recentEma20: [101, 100.5, 100, 99],
      recentHighs: [105, 104, 103, 102],
      recentVolumes: [100, 100, 100, 100, 100, 80],
      recentHistograms: [0.2, 0.15, 0.1, 0.05, 0.001, 0.01],
    };
    const result = evaluateSignalQuality(indicator, bar(100, 80));
    expect(result.score).toBe(0);
    expect(result.grade).toBe("C");
  });
});
