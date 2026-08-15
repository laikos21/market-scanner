import type { Bar, IndicatorState } from "./types";

export type QualityGrade = "A" | "B" | "C";

export interface SignalQuality {
  score: number;
  grade: QualityGrade;
  ready: boolean;
  ema20SlopeUp: boolean;
  breakout: boolean;
  volumeSupport: boolean;
  momentumStrength: boolean;
  summary: string;
}

export interface PbaEntryQuality {
  ready: boolean;
  eligible: boolean;
  baseLow: number | null;
  baseBars: number;
  riskPerShare: number | null;
  riskPct: number | null;
  stabilized: boolean;
  recoveryCandle: boolean;
  microBreakout: boolean;
  closeNearHigh: boolean;
  histogramRounding: boolean;
  summary: string;
}

export function evaluatePbaEntry(
  indicator: IndicatorState,
  bar: Bar,
  maxRiskPct: number,
): PbaEntryQuality {
  const recentOpens = indicator.recentOpens ?? [];
  const recentHighs = indicator.recentHighs ?? [];
  const recentLows = indicator.recentLows ?? [];
  const recentCloses = indicator.recentCloses ?? [];
  const recentHistograms = indicator.recentHistograms ?? [];
  const ready =
    recentOpens.length >= 6 &&
    recentHighs.length >= 6 &&
    recentLows.length >= 6 &&
    recentCloses.length >= 6 &&
    recentHistograms.length >= 4;
  const previousHigh = recentHighs.at(-2) ?? null;
  const previousClose = recentCloses.at(-2) ?? null;
  const previousLows = recentLows.slice(0, -1).slice(-5);
  const baseLow = previousLows.length ? Math.min(...previousLows) : null;
  const baseLowIndex = baseLow === null ? -1 : previousLows.lastIndexOf(baseLow);
  const baseBars = baseLowIndex < 0 ? 0 : previousLows.length - baseLowIndex;
  const riskPerShare = baseLow === null ? null : Math.max(0, bar.close - baseLow);
  const riskPct =
    riskPerShare === null || bar.close <= 0 ? null : (riskPerShare / bar.close) * 100;
  const stabilized = baseLow !== null && baseBars >= 2 && bar.low > baseLow;
  const recoveryCandle =
    previousClose !== null && bar.close > bar.open && bar.close > previousClose;
  const microBreakout = previousHigh !== null && bar.close > previousHigh;
  const closeLocation =
    bar.high > bar.low ? (bar.close - bar.low) / (bar.high - bar.low) : 1;
  const closeNearHigh = closeLocation >= 0.65;
  const roundingWindow = recentHistograms.slice(-4);
  const histogramRounding =
    roundingWindow.length === 4 &&
    roundingWindow.every(
      (histogram, index) => index === 0 || histogram > roundingWindow[index - 1],
    );
  const lowRisk = riskPct !== null && riskPct <= maxRiskPct;
  const eligible =
    ready &&
    stabilized &&
    recoveryCandle &&
    microBreakout &&
    closeNearHigh &&
    histogramRounding &&
    lowRisk;
  const riskLabel = riskPct === null ? "riesgo n/a" : `riesgo ${riskPct.toFixed(2)}%`;
  const flags = [
    stabilized ? `base ${baseBars} velas` : "sin base estable",
    histogramRounding ? "histograma redondeando" : "histograma irregular",
    recoveryCandle ? "vela de recuperación" : "sin recuperación",
    microBreakout ? "micropivote" : "sin micropivote",
    closeNearHigh ? "cierre firme" : "cierre débil",
    lowRisk ? riskLabel : `${riskLabel} > ${maxRiskPct.toFixed(2)}%`,
  ];
  return {
    ready,
    eligible,
    baseLow,
    baseBars,
    riskPerShare,
    riskPct,
    stabilized,
    recoveryCandle,
    microBreakout,
    closeNearHigh,
    histogramRounding,
    summary: flags.join(" · "),
  };
}

export function evaluateSignalQuality(
  indicator: IndicatorState,
  bar: Bar,
): SignalQuality {
  const recentEma20 = indicator.recentEma20 ?? [];
  const recentHighs = indicator.recentHighs ?? [];
  const recentVolumes = indicator.recentVolumes ?? [];
  const recentHistograms = indicator.recentHistograms ?? [];
  const previousHighs = recentHighs.slice(0, -1).slice(-3);
  const previousVolumes = recentVolumes.slice(0, -1).slice(-5);
  const previousHistogram = recentHistograms.at(-2) ?? null;
  const currentHistogram = (indicator.macd ?? 0) - (indicator.signal ?? 0);
  const ready =
    recentEma20.length >= 4 &&
    previousHighs.length >= 3 &&
    previousVolumes.length >= 5 &&
    previousHistogram !== null;
  const ema20SlopeUp =
    recentEma20.length >= 4 &&
    (recentEma20.at(-1) ?? 0) > (recentEma20.at(-4) ?? Number.POSITIVE_INFINITY);
  const breakout = previousHighs.length >= 3 && bar.close > Math.max(...previousHighs);
  const averageVolume = previousVolumes.length
    ? previousVolumes.reduce((total, volume) => total + volume, 0) / previousVolumes.length
    : Number.POSITIVE_INFINITY;
  const volumeSupport = previousVolumes.length >= 5 && bar.volume >= averageVolume * 1.1;
  const momentumStrength =
    currentHistogram > 0 &&
    (previousHistogram === null || currentHistogram > previousHistogram) &&
    currentHistogram / bar.close >= 0.0005;
  const score = [ema20SlopeUp, breakout, volumeSupport, momentumStrength].filter(Boolean).length;
  const grade: QualityGrade = score >= 3 ? "A" : score >= 2 ? "B" : "C";
  const flags = [
    ema20SlopeUp ? "EMA20↑" : "EMA20→/↓",
    breakout ? "breakout" : "sin breakout",
    volumeSupport ? "volumen" : "volumen flojo",
    momentumStrength ? "momentum" : "momentum débil",
  ];
  return {
    score,
    grade,
    ready,
    ema20SlopeUp,
    breakout,
    volumeSupport,
    momentumStrength,
    summary: flags.join(" · "),
  };
}
