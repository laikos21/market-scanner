export type SetupPhase =
  | "priming"
  | "waiting_macd"
  | "waiting_ema"
  | "confirmed";

export interface Env {
  DB: D1Database;
  ALPACA_KEY_ID: string;
  ALPACA_SECRET_KEY: string;
  ALPACA_DATA_URL: string;
  ALPACA_FEED: string;
  TELEGRAM_API_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  API_TOKEN: string;
  WEB_PASSWORD: string;
  WEB_SESSION_TTL_DAYS: string;
  SCANNER_SETUP_LIMIT: string;
  SCANNER_MIN_QUALITY: string;
  SCANNER_LOOKBACK_DAYS: string;
  STALE_THRESHOLD_MIN: string;
  NOTIFY_MAX_ATTEMPTS: string;
  NOTIFY_RETRY_BACKOFF_MS: string;
}

export interface Bar {
  symbol: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorState {
  initialized: boolean;
  samples: number;
  ema6: number | null;
  ema20: number | null;
  signal: number | null;
  macd: number | null;
  lastBarTs: string | null;
  recentCloses: number[];
  recentHighs: number[];
  recentVolumes: number[];
  recentEma20: number[];
  recentHistograms: number[];
}

export interface SetupRuntimeState {
  phase: SetupPhase;
  indicator: IndicatorState;
  macdCrossBarTs: string | null;
  macdCrossPrice: number | null;
  confirmationBarsElapsed: number;
  triggerCount: number;
  lastAlertAt: string | null;
  lastEvalAt: string | null;
  status: "ok" | "stale" | "error";
  detail: string;
}

export interface ScannerSetup {
  id: number;
  symbol: string;
  enabled: boolean;
  signalPeriod: 9 | 10;
  confirmationWindowBars: number;
  note: string;
  /** Optional provenance label, e.g. "PULSE Leaders". */
  source?: string;
  createdAt: string;
  state: SetupRuntimeState;
}

export interface CycleSummary {
  startedAt: string;
  result: "ok" | "skipped_session_closed" | "skipped_no_setups" | "error";
  detail: string;
  enabledSetups: number;
  symbols: number;
  barsFetched: number;
  barsProcessed: number;
  alpacaRequests: number;
  primed: number;
  earlySignals: number;
  confirmedSignals: number;
  stale: number;
  missing: number;
  stateBytes: number;
  processingMsBeforeCommit: number;
}

export interface ScannerStateDocument {
  schemaVersion: 1;
  nextSetupId: number;
  setups: ScannerSetup[];
  lastCycle: CycleSummary | null;
}

export interface StateRow {
  revision: number;
  state_json: string;
  commit_token: string;
}

export interface EventDraft {
  setupId: number | null;
  kind: "early" | "confirmed" | "system";
  symbol: string;
  barTsUtc: string | null;
  createdAtUtc: string;
  price: number | null;
  message: string;
}

export interface EventRow {
  id: number;
  setup_id: number | null;
  kind: "early" | "confirmed" | "system";
  symbol: string;
  bar_ts_utc: string | null;
  created_at_utc: string;
  price: number | null;
  message: string;
  delivery_status: "pending" | "sending" | "delivered" | "failed";
  delivery_lease_until: string | null;
  delivery_json: string;
}

export interface DeliveryResult {
  channel: "telegram";
  ok: boolean;
  attempts: number;
  latencyMs: number;
  error: string;
}
