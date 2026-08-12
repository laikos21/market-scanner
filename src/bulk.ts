import { integerSetting } from "./config";
import { emptyRuntimeState } from "./engine";
import { commitState, loadState, StateConflictError } from "./storage";
import type { Env, ScannerSetup } from "./types";

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.\-]{0,15}$/;
const MAX_IMPORT_TEXT = 30_000;

// Words commonly found in a copied screener card, but which are not tickers.
// This is deliberately conservative: a user can still paste an explicit $TICKER.
const SCREENING_WORDS = new Set([
  "AI",
  "ADR",
  "APR",
  "ATR",
  "AUG",
  "BREAKOUT",
  "BROKEN",
  "CLOSE",
  "CONFIRMED",
  "DAY",
  "DEVELOPING",
  "EMA",
  "EXTENDED",
  "FRI",
  "HOLD",
  "LEADERS",
  "LIQUID",
  "MACD",
  "MOM",
  "MON",
  "MONTH",
  "PULSE",
  "RECLAIMED",
  "RTH",
  "RVOL",
  "SAT",
  "SMA",
  "SUN",
  "THU",
  "TREND",
  "TUE",
  "VOLUME",
  "WATCHLIST",
  "WED",
  "WEEK",
  "YEAR",
  "YTD",
]);

export interface ParsedBulkSymbols {
  symbols: string[];
  duplicates: string[];
  invalid: string[];
}

function cleanCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[`'"$]+/, "")
    .replace(/[,';:!?`'".)]+$/, "")
    .toUpperCase();
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

/**
 * Extracts symbols from either a simple list or rich text copied from a screener.
 * Rich text only accepts uppercase standalone candidates, which avoids turning
 * company names such as "NetApp" into a fictitious NETAPP ticker.
 */
export function parseBulkSymbols(text: string): ParsedBulkSymbols {
  const symbols: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const rawLines = text.replace(/\u00a0/g, " ").split(/[\r\n,;|]+/g);
  const nonEmpty = rawLines.map((line) => line.trim()).filter(Boolean);
  const simpleList =
    nonEmpty.length > 0 &&
    nonEmpty.every((line) => /^\$?[A-Za-z][A-Za-z0-9.\-]{0,15}$/.test(line.replace(/^[-*•]\s*/, "")));

  for (const rawLine of rawLines) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    const explicit = line.match(/\$([A-Za-z][A-Za-z0-9.\-]{0,15})\b/);
    const firstToken = line.split(/\s+/)[0];
    // Some card layouts concatenate the ticker and company name when copied
    // (for example "NTAPNetApp"). Recover the leading all-caps ticker only
    // when it is immediately followed by a capitalized word.
    const compact = line.match(/^([A-Z][A-Z0-9.\-]{0,15})(?=[A-Z][a-z])/);
    const token = cleanCandidate(explicit?.[1] ?? compact?.[1] ?? firstToken);
    const originalToken = explicit?.[1] ?? firstToken.replace(/^[`'"$]+/, "");
    const uppercaseToken = originalToken === originalToken.toUpperCase();
    const acceptedCase = Boolean(explicit) || Boolean(compact) || simpleList || uppercaseToken;

    if (!acceptedCase || !token) continue;
    if (SCREENING_WORDS.has(token)) continue;
    if (SYMBOL_PATTERN.test(token)) {
      if (symbols.includes(token)) pushUnique(duplicates, token);
      else symbols.push(token);
    } else if (/^[A-Z]/.test(token)) {
      pushUnique(invalid, token.slice(0, 32));
    }
  }

  return { symbols, duplicates, invalid };
}

export interface BulkImportInput {
  text: string;
  signalPeriod: 9 | 10;
  confirmationWindowBars: number;
  note: string;
  source: string;
}

export interface BulkPreview {
  symbols: string[];
  newSymbols: string[];
  existingSymbols: string[];
  duplicates: string[];
  invalid: string[];
  enabledSetups: number;
  limit: number;
  availableSlots: number;
  canImport: boolean;
}

export interface BulkImportResult {
  preview: BulkPreview;
  created: ScannerSetup[];
}

function setupLimit(env: Env): number {
  return integerSetting("SCANNER_SETUP_LIMIT", env.SCANNER_SETUP_LIMIT, 60, 1, 100);
}

function makePreview(env: Env, input: BulkImportInput, symbols: ParsedBulkSymbols, existing: ScannerSetup[]): BulkPreview {
  const existingSymbols = symbols.symbols.filter((symbol) =>
    existing.some((setup) => setup.symbol === symbol),
  );
  const newSymbols = symbols.symbols.filter((symbol) => !existingSymbols.includes(symbol));
  const limit = setupLimit(env);
  const enabledSetups = existing.filter((setup) => setup.enabled).length;
  const availableSlots = Math.max(0, limit - enabledSetups);
  return {
    symbols: symbols.symbols,
    newSymbols,
    existingSymbols,
    duplicates: symbols.duplicates,
    invalid: symbols.invalid,
    enabledSetups,
    limit,
    availableSlots,
    canImport: newSymbols.length > 0 && newSymbols.length <= availableSlots,
  };
}

export async function previewBulkImport(env: Env, input: BulkImportInput): Promise<BulkPreview> {
  if (input.text.length > MAX_IMPORT_TEXT) throw new Error("bulk import text cannot exceed 30000 characters");
  const parsed = parseBulkSymbols(input.text);
  const loaded = await loadState(env.DB);
  return makePreview(env, input, parsed, loaded.document.setups);
}

export async function importBulkSetups(
  env: Env,
  input: BulkImportInput,
  now = new Date(),
): Promise<BulkImportResult> {
  if (input.text.length > MAX_IMPORT_TEXT) throw new Error("bulk import text cannot exceed 30000 characters");
  const parsed = parseBulkSymbols(input.text);
  if (!parsed.symbols.length) throw new Error("no valid ticker symbols were found in the pasted text");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadState(env.DB);
    const preview = makePreview(env, input, parsed, loaded.document.setups);
    if (preview.newSymbols.length > preview.availableSlots) {
      throw new Error(
        `bulk import would exceed enabled setup limit (${preview.availableSlots} available, ${preview.newSymbols.length} requested)`,
      );
    }
    if (!preview.newSymbols.length) return { preview, created: [] };

    const created: ScannerSetup[] = preview.newSymbols.map((symbol, index) => ({
      id: loaded.document.nextSetupId + index,
      symbol,
      enabled: true,
      signalPeriod: input.signalPeriod,
      confirmationWindowBars: input.confirmationWindowBars,
      note: input.note,
      source: input.source || undefined,
      createdAt: now.toISOString(),
      state: emptyRuntimeState(),
    }));
    loaded.document.nextSetupId += created.length;
    loaded.document.setups.push(...created);
    try {
      await commitState(env.DB, loaded.row, loaded.document);
      return { preview, created };
    } catch (error) {
      if (!(error instanceof StateConflictError) || attempt === 2) throw error;
    }
  }
  throw new StateConflictError();
}

export const BULK_IMPORT_MAX_TEXT = MAX_IMPORT_TEXT;
