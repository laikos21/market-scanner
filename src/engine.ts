import { formatNewYork, newYorkDateKey } from "./calendar";
import { advanceIndicator, emptyIndicatorState } from "./indicators";
import { evaluateSignalQuality, type SignalQuality } from "./quality";
import type {
  Bar,
  EventDraft,
  ScannerSetup,
  SetupRuntimeState,
} from "./types";

export const MIN_WARMUP_BARS = 60;

export function emptyRuntimeState(): SetupRuntimeState {
  return {
    phase: "priming",
    indicator: emptyIndicatorState(),
    macdCrossBarTs: null,
    macdCrossPrice: null,
    confirmationBarsElapsed: 0,
    triggerCount: 0,
    lastAlertAt: null,
    lastEvalAt: null,
    status: "ok",
    detail: `needs ${MIN_WARMUP_BARS} closed 5-minute bars for warm-up`,
  };
}

function number(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(4);
}

function contextLine(setup: ScannerSetup): string[] {
  return setup.note ? [`Contexto: ${setup.note}`] : [];
}

function qualityLine(quality: SignalQuality): string {
  const readiness = quality.ready ? "" : " · historial calentando";
  return `Calidad ${quality.grade} (${quality.score}/4)${readiness}: ${quality.summary}`;
}

function alreadyAlertedThisSession(setup: ScannerSetup, bar: Bar): boolean {
  return Boolean(
    setup.state.lastAlertAt &&
      newYorkDateKey(setup.state.lastAlertAt) === newYorkDateKey(bar.ts),
  );
}

function earlyEvent(
  setup: ScannerSetup,
  bar: Bar,
  now: Date,
  quality: SignalQuality,
): EventDraft {
  const indicator = setup.state.indicator;
  return {
    setupId: setup.id,
    kind: "early",
    symbol: setup.symbol,
    barTsUtc: bar.ts,
    createdAtUtc: now.toISOString(),
    price: bar.close,
    message: [
      `🟡 620 temprano — ${setup.symbol}`,
      "",
      `MACD 6/20/${setup.signalPeriod} hizo bullish cross.`,
      "EMA6 todavía está debajo de EMA20.",
      "",
      `Cierre: ${bar.close.toFixed(2)}`,
      `MACD: ${number(indicator.macd)} | Señal: ${number(indicator.signal)}`,
      `EMA6: ${number(indicator.ema6)} | EMA20: ${number(indicator.ema20)}`,
      qualityLine(quality),
      `Vela cerrada: ${formatNewYork(bar.ts)}`,
      ...contextLine(setup),
      "",
      `Esperando confirmación durante ${setup.confirmationWindowBars} velas.`,
    ].join("\n"),
  };
}

function confirmedEvent(
  setup: ScannerSetup,
  bar: Bar,
  now: Date,
  sameBar: boolean,
  quality: SignalQuality,
): EventDraft {
  const indicator = setup.state.indicator;
  const elapsed = setup.state.confirmationBarsElapsed;
  return {
    setupId: setup.id,
    kind: "confirmed",
    symbol: setup.symbol,
    barTsUtc: bar.ts,
    createdAtUtc: now.toISOString(),
    price: bar.close,
    message: [
      `🟢 620 confirmado — ${setup.symbol}`,
      "",
      "✓ MACD bullish",
      "✓ EMA6 cruzó sobre EMA20",
      "",
      `Cierre: ${bar.close.toFixed(2)}`,
      `MACD: ${number(indicator.macd)} | Señal: ${number(indicator.signal)}`,
      `EMA6: ${number(indicator.ema6)} | EMA20: ${number(indicator.ema20)}`,
      qualityLine(quality),
      sameBar
        ? "Confirmación: ambos cruces ocurrieron en la misma vela"
        : `Confirmación: ${elapsed} vela(s) después del MACD cross`,
      `Vela cerrada: ${formatNewYork(bar.ts)}`,
      ...contextLine(setup),
    ].join("\n"),
  };
}

export interface ProcessResult {
  setup: ScannerSetup;
  events: EventDraft[];
  barsProcessed: number;
  primed: boolean;
}

export function processClosedBars(
  source: ScannerSetup,
  bars: Bar[],
  now = new Date(),
  minQuality = 0,
): ProcessResult {
  const setup = structuredClone(source);
  const events: EventDraft[] = [];
  let barsProcessed = 0;
  let primed = false;
  const primingBatch = !setup.state.indicator.initialized;
  const ordered = [...bars]
    .filter((bar) =>
      !setup.state.indicator.lastBarTs ||
      new Date(bar.ts).getTime() > new Date(setup.state.indicator.lastBarTs).getTime(),
    )
    .sort((left, right) => left.ts.localeCompare(right.ts));

  for (const bar of ordered) {
    const step = advanceIndicator(
      setup.state.indicator,
      bar.close,
      bar.ts,
      setup.signalPeriod,
      { high: bar.high, volume: bar.volume },
    );
    setup.state.indicator = step.current;
    const quality = evaluateSignalQuality(setup.state.indicator, bar);
    setup.state.lastEvalAt = now.toISOString();
    setup.state.status = "ok";
    barsProcessed += 1;

    if (primingBatch) {
      setup.state.detail =
        `warming up (${Math.min(step.current.samples, MIN_WARMUP_BARS)}/${MIN_WARMUP_BARS} closed bars)`;
      continue;
    }

    if (setup.state.phase === "confirmed") {
      if (
        setup.state.indicator.macd! <= setup.state.indicator.signal! &&
        setup.state.indicator.ema6! <= setup.state.indicator.ema20!
      ) {
        setup.state.phase = "waiting_macd";
        setup.state.detail = "reset after momentum rolled over; waiting for a new sequence";
        setup.state.macdCrossBarTs = null;
        setup.state.macdCrossPrice = null;
        setup.state.confirmationBarsElapsed = 0;
      }
      continue;
    }

    if (setup.state.phase === "waiting_ema") {
      if (step.bullishEmaCross) {
        setup.state.confirmationBarsElapsed += 1;
        setup.state.phase = "confirmed";
        setup.state.triggerCount += 1;
        setup.state.lastAlertAt = now.toISOString();
        const accepted = !quality.ready || quality.score >= minQuality;
        setup.state.detail = accepted
          ? `620 confirmed · quality ${quality.grade}`
          : `620 confirmed but alert filtered by quality ${quality.grade} (${quality.score}/${4})`;
        if (accepted) events.push(confirmedEvent(setup, bar, now, false, quality));
        continue;
      }
      if (step.bearishMacdCross) {
        setup.state.phase = "waiting_macd";
        setup.state.detail = "MACD cross invalidated before EMA confirmation";
        setup.state.macdCrossBarTs = null;
        setup.state.macdCrossPrice = null;
        setup.state.confirmationBarsElapsed = 0;
        continue;
      }
      setup.state.confirmationBarsElapsed += 1;
      if (setup.state.confirmationBarsElapsed >= setup.confirmationWindowBars) {
        setup.state.phase = "waiting_macd";
        setup.state.detail =
          `confirmation expired after ${setup.confirmationWindowBars} bars`;
        setup.state.macdCrossBarTs = null;
        setup.state.macdCrossPrice = null;
        setup.state.confirmationBarsElapsed = 0;
      }
      continue;
    }

    if (step.bullishMacdCross) {
      if (alreadyAlertedThisSession(setup, bar)) {
        setup.state.detail = "one 620 sequence per session; waiting for the next session";
        continue;
      }
      if (step.bullishEmaCross) {
        setup.state.phase = "confirmed";
        setup.state.macdCrossBarTs = bar.ts;
        setup.state.macdCrossPrice = bar.close;
        setup.state.confirmationBarsElapsed = 0;
        setup.state.triggerCount += 1;
        setup.state.lastAlertAt = now.toISOString();
        const accepted = !quality.ready || quality.score >= minQuality;
        setup.state.detail = accepted
          ? `620 confirmed in one bar · quality ${quality.grade}`
          : `620 confirmed in one bar but alert filtered by quality ${quality.grade} (${quality.score}/${4})`;
        if (accepted) events.push(confirmedEvent(setup, bar, now, true, quality));
      } else if (setup.state.indicator.ema6! <= setup.state.indicator.ema20!) {
        setup.state.phase = "waiting_ema";
        setup.state.macdCrossBarTs = bar.ts;
        setup.state.macdCrossPrice = bar.close;
        setup.state.confirmationBarsElapsed = 0;
        setup.state.lastAlertAt = now.toISOString();
        const accepted = !quality.ready || quality.score >= minQuality;
        setup.state.detail = accepted
          ? "bullish MACD cross; waiting for EMA6/EMA20 confirmation"
          : `bullish MACD cross; early alert filtered by quality ${quality.grade} (${quality.score}/${4})`;
        if (accepted) events.push(earlyEvent(setup, bar, now, quality));
      } else {
        setup.state.detail =
          "bullish MACD cross ignored because EMA6 was already above EMA20";
      }
    } else {
      setup.state.detail = "waiting for a new bullish MACD cross";
    }
  }

  if (primingBatch && setup.state.indicator.samples >= MIN_WARMUP_BARS) {
    setup.state.indicator.initialized = true;
    setup.state.phase = "waiting_macd";
    setup.state.detail = "primed; waiting for a new bullish MACD cross";
    primed = true;
  }

  return { setup, events, barsProcessed, primed };
}

export function markSetupStale(source: ScannerSetup, detail: string): ScannerSetup {
  const setup = structuredClone(source);
  setup.state.status = "stale";
  setup.state.detail = detail;
  return setup;
}
