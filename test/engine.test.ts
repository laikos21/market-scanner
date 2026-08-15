import { describe, expect, it } from "vitest";

import { emptyRuntimeState, processClosedBars } from "../src/engine";
import { selectCycleSetups } from "../src/cycle";
import type { Bar, ScannerSetup } from "../src/types";

function bars(closes: number[], startIndex = 0): Bar[] {
  return closes.map((close, index) => ({
    symbol: "NVDA",
    ts: new Date(Date.UTC(2026, 7, 11, 13, 30 + (startIndex + index) * 5)).toISOString(),
    open: close - 0.05,
    high: close,
    low: close - 0.05,
    close,
    volume: 1000,
  }));
}

function setup(): ScannerSetup {
  return {
    id: 1,
    symbol: "NVDA",
    enabled: true,
    signalPeriod: 10,
    confirmationWindowBars: 6,
    note: "pullback to daily EMA21",
    createdAt: "2026-08-11T13:00:00Z",
    state: emptyRuntimeState(),
  };
}

describe("620 state machine", () => {
  it("limits expensive warm-up work while retaining initialized setups", () => {
    const initialized = setup();
    initialized.id = 10;
    initialized.symbol = "MSFT";
    initialized.state.indicator.initialized = true;
    const pending = ["NVDA", "VLO", "PANW"].map((symbol, index) => {
      const candidate = setup();
      candidate.id = index + 1;
      candidate.symbol = symbol;
      return candidate;
    });

    const selection = selectCycleSetups([initialized, ...pending], 2);

    expect(selection.incremental.map((candidate) => candidate.symbol)).toEqual(["MSFT"]);
    expect(selection.warmup.map((candidate) => candidate.symbol)).toEqual(["NVDA", "VLO"]);
    expect(selection.deferredWarmup).toBe(1);
  });

  it("primes without emitting a historical signal", () => {
    const historical = [
      ...Array(60).fill(100),
      99,
      99,
      99,
      99.2,
      99.4,
      99.6,
      99.8,
      100,
      100.2,
    ];
    const result = processClosedBars(setup(), bars(historical));
    expect(result.primed).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.setup.state.phase).toBe("waiting_macd");
    expect(result.setup.state.indicator.initialized).toBe(true);
  });

  it("emits an early MACD event and later an EMA confirmation", () => {
    let current = processClosedBars(setup(), bars(Array(60).fill(100))).setup;
    const sequence = [99, 99, 99, 99.2, 99.4, 99.6, 99.8, 100, 100.2];
    const events = [];
    for (let index = 0; index < sequence.length; index += 1) {
      const result = processClosedBars(current, bars([sequence[index]], 60 + index), undefined, 4);
      current = result.setup;
      events.push(...result.events);
    }
    expect(events.map((event) => event.kind)).toEqual(["early", "confirmed"]);
    expect(events[0].message).toContain("PBA 620 low-risk — NVDA");
    expect(events[0].message).toContain("Base low:");
    expect(events[1].message).toContain("2 vela(s) después");
    expect(current.state.phase).toBe("confirmed");
    expect(current.state.triggerCount).toBe(1);
  });

  it("does not process the same closed bar twice", () => {
    const initial = processClosedBars(setup(), bars(Array(60).fill(100))).setup;
    const first = processClosedBars(initial, bars([99], 60));
    const duplicate = processClosedBars(first.setup, bars([99], 60));
    expect(first.barsProcessed).toBe(1);
    expect(duplicate.barsProcessed).toBe(0);
    expect(duplicate.events).toEqual([]);
  });

  it("confirms once when MACD and EMA cross on the same bar", () => {
    let current = processClosedBars(setup(), bars(Array(60).fill(100))).setup;
    current = processClosedBars(current, bars([99], 60)).setup;
    const result = processClosedBars(current, bars([101], 61));
    expect(result.events).toHaveLength(1);
    expect(result.events[0].kind).toBe("confirmed");
    expect(result.events[0].message).toContain("misma vela");
  });

  it("does not re-arm a second sequence during the same New York session", () => {
    let current = processClosedBars(setup(), bars(Array(60).fill(100))).setup;
    current.state.lastAlertAt = "2026-08-11T14:00:00.000Z";
    const result = processClosedBars(current, bars([99, 99, 99, 99.2, 99.4, 99.6, 99.8, 100, 100.2], 60));
    expect(result.events).toEqual([]);
  });

  it("does not consume the session when a raw early cross fails the PBA risk gate", () => {
    let current = processClosedBars(setup(), bars(Array(60).fill(100))).setup;
    const sequence = [99, 99, 99, 99.2, 99.4, 99.6, 99.8, 100, 100.2];
    for (let index = 0; index < sequence.length; index += 1) {
      current = processClosedBars(
        current,
        bars([sequence[index]], 60 + index),
        undefined,
        0,
        0.1,
      ).setup;
      if (current.state.phase === "waiting_ema") break;
    }
    expect(current.state.phase).toBe("waiting_ema");
    expect(current.state.earlyAlertSent).toBe(false);
    expect(current.state.lastAlertAt).toBeNull();
    expect(current.state.detail).toContain("PBA early alert filtered");
  });
});
