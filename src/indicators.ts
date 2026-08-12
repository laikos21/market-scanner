import type { IndicatorState } from "./types";

export interface IndicatorStep {
  previous: IndicatorState;
  current: IndicatorState;
  bullishMacdCross: boolean;
  bearishMacdCross: boolean;
  bullishEmaCross: boolean;
}

export function emptyIndicatorState(): IndicatorState {
  return {
    initialized: false,
    samples: 0,
    ema6: null,
    ema20: null,
    signal: null,
    macd: null,
    lastBarTs: null,
    recentCloses: [],
    recentHighs: [],
    recentVolumes: [],
    recentEma20: [],
    recentHistograms: [],
  };
}

function ema(previous: number | null, value: number, period: number): number {
  if (previous === null) return value;
  const alpha = 2 / (period + 1);
  return alpha * value + (1 - alpha) * previous;
}

export function advanceIndicator(
  state: IndicatorState,
  close: number,
  barTs: string,
  signalPeriod: 9 | 10,
  context: { high?: number; volume?: number } = {},
): IndicatorStep {
  if (!Number.isFinite(close) || close <= 0) throw new Error("bar close must be positive");
  if (!Number.isFinite(new Date(barTs).getTime())) throw new Error("bar timestamp is invalid");
  const previous = structuredClone(state);
  const ema6 = ema(state.ema6, close, 6);
  const ema20 = ema(state.ema20, close, 20);
  const macd = ema6 - ema20;
  const signal = ema(state.signal, macd, signalPeriod);
  const recentCloses = [...(state.recentCloses ?? []), close].slice(-6);
  const recentHighs = [...(state.recentHighs ?? []), context.high ?? close].slice(-6);
  const recentVolumes = [...(state.recentVolumes ?? []), context.volume ?? 0].slice(-6);
  const recentEma20 = [...(state.recentEma20 ?? []), ema20].slice(-6);
  const recentHistograms = [...(state.recentHistograms ?? []), macd - signal].slice(-6);
  const current: IndicatorState = {
    initialized: state.initialized,
    samples: state.samples + 1,
    ema6,
    ema20,
    signal,
    macd,
    lastBarTs: barTs,
    recentCloses,
    recentHighs,
    recentVolumes,
    recentEma20,
    recentHistograms,
  };
  const comparable =
    previous.macd !== null &&
    previous.signal !== null &&
    previous.ema6 !== null &&
    previous.ema20 !== null;
  return {
    previous,
    current,
    bullishMacdCross:
      comparable && previous.macd! <= previous.signal! && macd > signal,
    bearishMacdCross:
      comparable && previous.macd! >= previous.signal! && macd < signal,
    bullishEmaCross:
      comparable && previous.ema6! <= previous.ema20! && ema6 > ema20,
  };
}
