import { formatArgentina, newYorkDateKey } from "./calendar";
import { advanceIndicator, emptyIndicatorState } from "./indicators";
import {
  evaluatePbaEntry,
  evaluateSignalQuality,
  type PbaEntryQuality,
  type SignalQuality,
} from "./quality";
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
    macdCrossBaseLow: null,
    macdCrossRiskPct: null,
    earlyAlertSent: false,
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

function pbaRiskLines(pba: PbaEntryQuality): string[] {
  if (pba.baseLow === null || pba.riskPerShare === null || pba.riskPct === null) {
    return [`PBA low-risk: ${pba.summary}`];
  }
  return [
    `Base low: ${pba.baseLow.toFixed(2)} | Riesgo: ${pba.riskPerShare.toFixed(2)} (${pba.riskPct.toFixed(2)}%)`,
    `PBA low-risk: ${pba.summary}`,
  ];
}

function storedRiskLines(setup: ScannerSetup): string[] {
  const baseLow = setup.state.macdCrossBaseLow ?? null;
  const riskPct = setup.state.macdCrossRiskPct ?? null;
  const crossPrice = setup.state.macdCrossPrice;
  if (baseLow === null || riskPct === null || crossPrice === null) return [];
  return [
    `Entrada temprana: ${crossPrice.toFixed(2)} | Base low: ${baseLow.toFixed(2)} | Riesgo: ${riskPct.toFixed(2)}%`,
  ];
}

function clearPendingSequence(setup: ScannerSetup): void {
  setup.state.macdCrossBarTs = null;
  setup.state.macdCrossPrice = null;
  setup.state.macdCrossBaseLow = null;
  setup.state.macdCrossRiskPct = null;
  setup.state.earlyAlertSent = false;
  setup.state.confirmationBarsElapsed = 0;
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
  pba: PbaEntryQuality,
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
      `🟡 PBA 620 low-risk — ${setup.symbol}`,
      "",
      `MACD 6/20/${setup.signalPeriod} hizo bullish cross.`,
      "EMA6 todavía está debajo de EMA20.",
      "",
      `Cierre: ${bar.close.toFixed(2)}`,
      `MACD: ${number(indicator.macd)} | Señal: ${number(indicator.signal)}`,
      `EMA6: ${number(indicator.ema6)} | EMA20: ${number(indicator.ema20)}`,
      ...pbaRiskLines(pba),
      qualityLine(quality),
      `Vela cerrada: ${formatArgentina(bar.ts)}`,
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
  pba: PbaEntryQuality | null,
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
      ...(pba ? pbaRiskLines(pba) : storedRiskLines(setup)),
      qualityLine(quality),
      sameBar
        ? "Confirmación: ambos cruces ocurrieron en la misma vela"
        : `Confirmación: ${elapsed} vela(s) después del MACD cross`,
      `Vela cerrada: ${formatArgentina(bar.ts)}`,
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
  pbaMaxRiskPct = 1.25,
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
      { open: bar.open, high: bar.high, low: bar.low, volume: bar.volume },
    );
    setup.state.indicator = step.current;
    const quality = evaluateSignalQuality(setup.state.indicator, bar);
    const pba = evaluatePbaEntry(setup.state.indicator, bar, pbaMaxRiskPct);
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
        clearPendingSequence(setup);
      }
      continue;
    }

    if (setup.state.phase === "waiting_ema") {
      if (step.bullishEmaCross) {
        setup.state.confirmationBarsElapsed += 1;
        setup.state.phase = "confirmed";
        setup.state.triggerCount += 1;
        const accepted =
          setup.state.earlyAlertSent === true || !quality.ready || quality.score >= minQuality;
        if (accepted) setup.state.lastAlertAt = now.toISOString();
        setup.state.detail = accepted
          ? setup.state.earlyAlertSent === true
            ? `PBA 620 confirmed after low-risk entry · quality ${quality.grade}`
            : `620 confirmed · quality ${quality.grade}`
          : `620 confirmed but alert filtered by quality ${quality.grade} (${quality.score}/${4})`;
        if (accepted) events.push(confirmedEvent(setup, bar, now, false, quality, null));
        continue;
      }
      if (step.bearishMacdCross) {
        setup.state.phase = "waiting_macd";
        setup.state.detail = "MACD cross invalidated before EMA confirmation";
        clearPendingSequence(setup);
        continue;
      }
      setup.state.confirmationBarsElapsed += 1;
      if (setup.state.confirmationBarsElapsed >= setup.confirmationWindowBars) {
        setup.state.phase = "waiting_macd";
        setup.state.detail =
          `confirmation expired after ${setup.confirmationWindowBars} bars`;
        clearPendingSequence(setup);
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
        setup.state.macdCrossBaseLow = pba.baseLow;
        setup.state.macdCrossRiskPct = pba.riskPct;
        setup.state.earlyAlertSent = false;
        setup.state.confirmationBarsElapsed = 0;
        setup.state.triggerCount += 1;
        const accepted = pba.eligible || !quality.ready || quality.score >= minQuality;
        if (accepted) setup.state.lastAlertAt = now.toISOString();
        setup.state.detail = accepted
          ? pba.eligible
            ? `PBA 620 confirmed in one bar · risk ${pba.riskPct?.toFixed(2)}%`
            : `620 confirmed in one bar · quality ${quality.grade}`
          : `620 confirmed in one bar but alert filtered by quality ${quality.grade} (${quality.score}/${4})`;
        if (accepted) events.push(confirmedEvent(setup, bar, now, true, quality, pba));
      } else if (setup.state.indicator.ema6! <= setup.state.indicator.ema20!) {
        setup.state.phase = "waiting_ema";
        setup.state.macdCrossBarTs = bar.ts;
        setup.state.macdCrossPrice = bar.close;
        setup.state.macdCrossBaseLow = pba.baseLow;
        setup.state.macdCrossRiskPct = pba.riskPct;
        setup.state.confirmationBarsElapsed = 0;
        const accepted = pba.eligible;
        setup.state.earlyAlertSent = accepted;
        if (accepted) setup.state.lastAlertAt = now.toISOString();
        setup.state.detail = accepted
          ? `PBA low-risk cross; waiting for EMA6/EMA20 confirmation · risk ${pba.riskPct?.toFixed(2)}%`
          : `bullish MACD cross; PBA early alert filtered: ${pba.summary}`;
        if (accepted) events.push(earlyEvent(setup, bar, now, quality, pba));
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
