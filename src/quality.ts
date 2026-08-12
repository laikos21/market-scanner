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
