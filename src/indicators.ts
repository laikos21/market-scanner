import type { IndicatorState } from "./types";

export interface IndicatorStep {
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
    recentOpens: [],
    recentHighs: [],
    recentLows: [],
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
  context: { open?: number; high?: number; low?: number; volume?: number } = {},
): IndicatorStep {
  if (!Number.isFinite(close) || close <= 0) throw new Error("bar close must be positive");
  if (!Number.isFinite(new Date(barTs).getTime())) throw new Error("bar timestamp is invalid");
  const previousMacd = state.macd;
  const previousSignal = state.signal;
  const previousEma6 = state.ema6;
  const previousEma20 = state.ema20;
  const ema6 = ema(state.ema6, close, 6);
  const ema20 = ema(state.ema20, close, 20);
  const macd = ema6 - ema20;
  const signal = ema(state.signal, macd, signalPeriod);
  const recentCloses = [...(state.recentCloses ?? []), close].slice(-6);
  const recentOpens = [...(state.recentOpens ?? []), context.open ?? close].slice(-6);
  const recentHighs = [...(state.recentHighs ?? []), context.high ?? close].slice(-6);
  const recentLows = [...(state.recentLows ?? []), context.low ?? close].slice(-6);
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
    recentOpens,
    recentHighs,
    recentLows,
    recentVolumes,
    recentEma20,
    recentHistograms,
  };
  const comparable =
    previousMacd !== null &&
    previousSignal !== null &&
    previousEma6 !== null &&
    previousEma20 !== null;
  return {
    current,
    bullishMacdCross:
      comparable && previousMacd <= previousSignal && macd > signal,
    bearishMacdCross:
      comparable && previousMacd >= previousSignal && macd < signal,
    bullishEmaCross:
      comparable && previousEma6 <= previousEma20 && ema6 > ema20,
  };
}
