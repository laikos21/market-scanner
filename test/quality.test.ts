import { describe, expect, it } from "vitest";

import { emptyIndicatorState } from "../src/indicators";
import { evaluatePbaEntry, evaluateSignalQuality } from "../src/quality";
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

describe("PBA low-risk entry", () => {
  it("recognizes a rounded MACD turn above an established base with tight risk", () => {
    const currentBar: Bar = {
      symbol: "PL",
      ts: "2026-08-12T15:30:00Z",
      open: 24.35,
      high: 24.52,
      low: 24.32,
      close: 24.49,
      volume: 1300,
    };
    const indicator = {
      ...emptyIndicatorState(),
      recentOpens: [24.32, 24.31, 24.34, 24.36, 24.38, 24.35],
      recentHighs: [24.38, 24.37, 24.39, 24.41, 24.43, 24.52],
      recentLows: [24.28, 24.3, 24.31, 24.33, 24.34, 24.32],
      recentCloses: [24.34, 24.33, 24.37, 24.39, 24.41, 24.49],
      recentHistograms: [-0.12, -0.09, -0.06, -0.03, -0.01, 0.02],
    };

    const result = evaluatePbaEntry(indicator, currentBar, 1.25);

    expect(result.eligible).toBe(true);
    expect(result.baseLow).toBe(24.28);
    expect(result.baseBars).toBe(5);
    expect(result.riskPct).toBeCloseTo(0.86, 1);
  });

  it("rejects an otherwise valid turn when the base is too far away", () => {
    const currentBar: Bar = {
      symbol: "PL",
      ts: "2026-08-12T15:30:00Z",
      open: 24.8,
      high: 25.05,
      low: 24.78,
      close: 25,
      volume: 1300,
    };
    const indicator = {
      ...emptyIndicatorState(),
      recentOpens: [24.32, 24.31, 24.34, 24.36, 24.7, 24.8],
      recentHighs: [24.38, 24.37, 24.39, 24.41, 24.75, 25.05],
      recentLows: [24.28, 24.3, 24.31, 24.33, 24.65, 24.78],
      recentCloses: [24.34, 24.33, 24.37, 24.39, 24.72, 25],
      recentHistograms: [-0.12, -0.09, -0.06, -0.03, -0.01, 0.02],
    };

    const result = evaluatePbaEntry(indicator, currentBar, 1.25);

    expect(result.eligible).toBe(false);
    expect(result.riskPct).toBeGreaterThan(1.25);
    expect(result.summary).toContain("> 1.25%");
  });
});
