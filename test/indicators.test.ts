import { describe, expect, it } from "vitest";

import { advanceIndicator, emptyIndicatorState } from "../src/indicators";

describe("620 indicators", () => {
  it("calculates EMA6, EMA20 and the MACD signal incrementally", () => {
    const first = advanceIndicator(
      emptyIndicatorState(),
      100,
      "2026-08-11T13:30:00Z",
      10,
    );
    expect(first.current.ema6).toBe(100);
    expect(first.current.ema20).toBe(100);
    expect(first.current.macd).toBe(0);
    expect(first.current.signal).toBe(0);

    const second = advanceIndicator(
      first.current,
      99,
      "2026-08-11T13:35:00Z",
      10,
    );
    expect(second.current.ema6).toBeCloseTo(99.7142857, 6);
    expect(second.current.ema20).toBeCloseTo(99.9047619, 6);
    expect(second.current.macd).toBeCloseTo(-0.1904762, 6);
    expect(second.current.signal).toBeCloseTo(-0.034632, 6);
    expect(second.bullishMacdCross).toBe(false);
  });

  it("detects a bullish MACD cross before the EMA cross", () => {
    let state = emptyIndicatorState();
    const closes = [100, 99, 99, 99, 99.2, 99.4, 99.6, 99.8];
    let last = advanceIndicator(state, closes[0], "2026-08-11T13:30:00Z", 10);
    state = last.current;
    for (let index = 1; index < closes.length; index += 1) {
      last = advanceIndicator(
        state,
        closes[index],
        new Date(Date.UTC(2026, 7, 11, 13, 30 + index * 5)).toISOString(),
        10,
      );
      state = last.current;
    }
    expect(last.bullishMacdCross).toBe(true);
    expect(last.bullishEmaCross).toBe(false);
    expect(last.current.ema6).toBeLessThan(last.current.ema20!);
  });
});

