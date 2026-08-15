import { fetchAlpacaBars } from "./alpaca";
import {
  formatArgentina,
  isRegularBarStart,
  isScannerWindow,
  latestClosedBarStart,
} from "./calendar";
import { integerSetting, numberSetting, requireRuntimeSecrets } from "./config";
import { markSetupStale, MIN_WARMUP_BARS, processClosedBars } from "./engine";
import { deliverEvent, recoverPendingDeliveries, sendTelegram } from "./notify";
import { commitState, loadState, StateConflictError } from "./storage";
import type {
  Bar,
  CycleSummary,
  Env,
  EventDraft,
  ScannerSetup,
  ScannerStateDocument,
} from "./types";

export interface CycleResult extends CycleSummary {
  revision: number;
  d1RowsRead: number;
  d1RowsWritten: number;
  recoveredDeliveries: number;
  deliveryFailures: number;
}

function stateSize(document: ScannerStateDocument): number {
  return new TextEncoder().encode(JSON.stringify(document)).byteLength;
}

function baseSummary(now: Date): CycleSummary {
  return {
    startedAt: now.toISOString(),
    result: "ok",
    detail: "",
    enabledSetups: 0,
    symbols: 0,
    barsFetched: 0,
    barsProcessed: 0,
    alpacaRequests: 0,
    primed: 0,
    earlySignals: 0,
    confirmedSignals: 0,
    stale: 0,
    missing: 0,
    stateBytes: 0,
    processingMsBeforeCommit: 0,
  };
}

async function commitSummary(
  env: Env,
  loaded: Awaited<ReturnType<typeof loadState>>,
  summary: CycleSummary,
  events: EventDraft[] = [],
): Promise<CycleResult> {
  loaded.document.lastCycle = summary;
  summary.stateBytes = stateSize(loaded.document);
  const committed = await commitState(env.DB, loaded.row, loaded.document, events);
  let deliveryFailures = 0;
  for (const eventId of committed.eventIds) {
    const delivered = await deliverEvent(env.DB, eventId, env);
    if (delivered && !delivered.ok) deliveryFailures += 1;
  }
  return {
    ...summary,
    revision: committed.revision,
    d1RowsRead: loaded.rowsRead,
    d1RowsWritten: committed.rowsWritten,
    recoveredDeliveries: 0,
    deliveryFailures,
  };
}

function fetchStart(active: ScannerSetup[], now: Date, lookbackDays: number): Date {
  if (active.some((setup) => !setup.state.indicator.initialized)) {
    return new Date(now.getTime() - lookbackDays * 86_400_000);
  }
  const timestamps = active
    .map((setup) => setup.state.indicator.lastBarTs)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  return timestamps.length
    ? new Date(Math.min(...timestamps))
    : new Date(now.getTime() - lookbackDays * 86_400_000);
}

export interface CycleSetupSelection {
  incremental: ScannerSetup[];
  warmup: ScannerSetup[];
  deferredWarmup: number;
}

export function selectCycleSetups(
  active: ScannerSetup[],
  warmupBatchSize: number,
): CycleSetupSelection {
  const incremental = active.filter((setup) => setup.state.indicator.initialized);
  const pendingWarmup = active.filter((setup) => !setup.state.indicator.initialized);
  const warmup = pendingWarmup.slice(0, warmupBatchSize);
  return {
    incremental,
    warmup,
    deferredWarmup: pendingWarmup.length - warmup.length,
  };
}

export async function runCycle(
  env: Env,
  now = new Date(),
  force = false,
): Promise<CycleResult> {
  const started = performance.now();
  requireRuntimeSecrets(env);
  const recovered = await recoverPendingDeliveries(env.DB, env, now);
  const loaded = await loadState(env.DB);
  const summary = baseSummary(now);
  const active = loaded.document.setups.filter((setup) => setup.enabled);
  summary.enabledSetups = active.length;

  if (!force && !isScannerWindow(now)) {
    summary.result = "skipped_session_closed";
    summary.detail = "outside the 5-minute RTH scanner window";
    summary.processingMsBeforeCommit = Math.round(performance.now() - started);
    const result = await commitSummary(env, loaded, summary);
    result.recoveredDeliveries = recovered.length;
    return result;
  }
  if (!active.length) {
    summary.result = "skipped_no_setups";
    summary.detail = "no enabled 620 setups";
    summary.processingMsBeforeCommit = Math.round(performance.now() - started);
    const result = await commitSummary(env, loaded, summary);
    result.recoveredDeliveries = recovered.length;
    return result;
  }

  const lookbackDays = integerSetting(
    "SCANNER_LOOKBACK_DAYS",
    env.SCANNER_LOOKBACK_DAYS,
    7,
    3,
    14,
  );
  const warmupBatchSize = integerSetting(
    "SCANNER_WARMUP_BATCH_SIZE",
    env.SCANNER_WARMUP_BATCH_SIZE,
    3,
    1,
    20,
  );
  const selection = selectCycleSetups(active, warmupBatchSize);
  const selected = [...selection.incremental, ...selection.warmup];
  const symbols = selected.map((setup) => setup.symbol).sort();
  summary.symbols = symbols.length;
  const fetchedGroups = [];
  if (selection.incremental.length) {
    fetchedGroups.push(
      await fetchAlpacaBars(
        selection.incremental.map((setup) => setup.symbol),
        fetchStart(selection.incremental, now, lookbackDays),
        now,
        env,
      ),
    );
  }
  if (selection.warmup.length) {
    fetchedGroups.push(
      await fetchAlpacaBars(
        selection.warmup.map((setup) => setup.symbol),
        new Date(now.getTime() - lookbackDays * 86_400_000),
        now,
        env,
      ),
    );
  }
  summary.alpacaRequests = fetchedGroups.reduce((total, fetched) => total + fetched.requests, 0);
  const fetchedBars = new Map<string, Bar[]>();
  for (const fetched of fetchedGroups) {
    for (const [symbol, bars] of fetched.bars) fetchedBars.set(symbol, bars);
  }
  const cutoff = latestClosedBarStart(now).getTime();
  const warmupSymbols = new Set(selection.warmup.map((setup) => setup.symbol));
  const closedBars = new Map(
    [...fetchedBars.entries()].map(([symbol, bars]) => {
      const eligible = bars.filter((bar) => {
        const timestamp = new Date(bar.ts);
        return timestamp.getTime() <= cutoff && isRegularBarStart(timestamp);
      });
      return [
        symbol,
        warmupSymbols.has(symbol) ? eligible.slice(-(MIN_WARMUP_BARS + 30)) : eligible,
      ];
    }),
  );
  summary.barsFetched = [...closedBars.values()].reduce((total, bars) => total + bars.length, 0);
  const staleMinutes = integerSetting(
    "STALE_THRESHOLD_MIN",
    env.STALE_THRESHOLD_MIN,
    15,
    10,
    60,
  );
  const minQuality = integerSetting(
    "SCANNER_MIN_QUALITY",
    env.SCANNER_MIN_QUALITY,
    3,
    1,
    4,
  );
  const pbaMaxRiskPct = numberSetting(
    "SCANNER_PBA_MAX_RISK_PCT",
    env.SCANNER_PBA_MAX_RISK_PCT,
    1.25,
    0.25,
    5,
  );
  const events: EventDraft[] = [];
  const replacements = new Map<number, ScannerSetup>();

  for (const setup of selected) {
    const bars = closedBars.get(setup.symbol) ?? [];
    const latest = bars.at(-1);
    if (!latest) {
      summary.missing += 1;
      replacements.set(setup.id, markSetupStale(setup, "no closed RTH bars returned by Alpaca"));
      continue;
    }
    const ageMinutes = (now.getTime() - new Date(latest.ts).getTime()) / 60_000;
    const historicalWarmup = force && warmupSymbols.has(setup.symbol);
    if (!Number.isFinite(ageMinutes) || (ageMinutes > staleMinutes && !historicalWarmup)) {
      summary.stale += 1;
      replacements.set(
        setup.id,
        markSetupStale(
          setup,
          `latest closed bar is ${Math.floor(ageMinutes)} minutes old; state was not advanced`,
        ),
      );
      continue;
    }
    const processed = processClosedBars(setup, bars, now, minQuality, pbaMaxRiskPct);
    replacements.set(setup.id, processed.setup);
    summary.barsProcessed += processed.barsProcessed;
    if (processed.primed) summary.primed += 1;
    for (const event of processed.events) {
      events.push(event);
      if (event.kind === "early") summary.earlySignals += 1;
      if (event.kind === "confirmed") summary.confirmedSignals += 1;
    }
  }

  loaded.document.setups = loaded.document.setups.map(
    (setup) => replacements.get(setup.id) ?? setup,
  );
  summary.detail = selection.deferredWarmup
    ? `closed 5-minute bars evaluated and committed; ${selection.deferredWarmup} setup(s) queued for warm-up`
    : "closed 5-minute bars evaluated and committed";
  summary.processingMsBeforeCommit = Math.round(performance.now() - started);
  const result = await commitSummary(env, loaded, summary, events);
  result.recoveredDeliveries = recovered.length;
  return result;
}

function safeError(error: unknown): string {
  return `${error instanceof Error ? error.name : "Error"}: ${
    error instanceof Error ? error.message : String(error)
  }`.slice(0, 300);
}

export async function recordCycleFailure(
  env: Env,
  error: unknown,
  now = new Date(),
): Promise<void> {
  const detail = safeError(error);
  const summary = { ...baseSummary(now), result: "error" as const, detail };
  const message = [
    "🔴 MarketScanner cycle failed",
    detail,
    "",
    "Time: " + formatArgentina(now.toISOString()),
  ].join("\n");
  try {
    const loaded = await loadState(env.DB);
    summary.enabledSetups = loaded.document.setups.filter((setup) => setup.enabled).length;
    summary.stateBytes = stateSize(loaded.document);
    await commitSummary(env, loaded, summary, [
      {
        setupId: null,
        kind: "system",
        symbol: "",
        barTsUtc: null,
        createdAtUtc: now.toISOString(),
        price: null,
        message,
      },
    ]);
  } catch (recordError) {
    console.error("cycle_failure_could_not_be_persisted", {
      original: detail,
      recordError: safeError(recordError),
    });
    await sendTelegram(message, env);
  }
}

export async function sendTestNotification(
  env: Env,
  now = new Date(),
): Promise<{ eventId: number; deliveryOk: boolean }> {
  const message = [
    "🧪 MarketScanner TEST",
    "Cloudflare → D1 → Telegram funciona.",
    "No se detectó ningún setup real.",
    "Time: " + formatArgentina(now.toISOString()),
  ].join("\n");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadState(env.DB);
    try {
      const committed = await commitState(env.DB, loaded.row, loaded.document, [
        {
          setupId: null,
          kind: "system",
          symbol: "",
          barTsUtc: null,
          createdAtUtc: now.toISOString(),
          price: null,
          message,
        },
      ]);
      const eventId = committed.eventIds[0];
      if (!eventId) throw new Error("test event was not committed");
      const delivery = await deliverEvent(env.DB, eventId, env, now);
      return { eventId, deliveryOk: delivery?.ok === true };
    } catch (error) {
      if (!(error instanceof StateConflictError) || attempt === 2) throw error;
    }
  }
  throw new StateConflictError();
}
