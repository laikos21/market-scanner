import type { Bar, Env } from "./types";

type Fetcher = typeof fetch;

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBar(symbol: string, value: unknown): Bar | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  const ts = typeof node.t === "string" ? node.t : "";
  const open = finiteNumber(node.o);
  const high = finiteNumber(node.h);
  const low = finiteNumber(node.l);
  const close = finiteNumber(node.c);
  const volume = finiteNumber(node.v);
  if (
    !ts ||
    !Number.isFinite(new Date(ts).getTime()) ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    volume < 0
  ) {
    return null;
  }
  return { symbol, ts, open, high, low, close, volume };
}

interface AlpacaBarsPayload {
  bars?: Record<string, unknown>;
  next_page_token?: string | null;
}

export async function fetchAlpacaBars(
  symbols: string[],
  start: Date,
  end: Date,
  env: Env,
  fetcher: Fetcher = fetch,
): Promise<{ bars: Map<string, Bar[]>; requests: number }> {
  if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) {
    throw new Error("ALPACA_KEY_ID/ALPACA_SECRET_KEY are not configured");
  }
  const unique = [...new Set(symbols)].sort();
  if (!unique.length) return { bars: new Map(), requests: 0 };
  const collected = new Map<string, Map<string, Bar>>(
    unique.map((symbol) => [symbol, new Map()]),
  );
  let pageToken: string | null = null;
  let requests = 0;

  do {
    if (requests >= 10) {
      throw new Error("Alpaca bars pagination exceeded the 10-request safety limit");
    }
    const url = new URL("/v2/stocks/bars", env.ALPACA_DATA_URL);
    url.searchParams.set("symbols", unique.join(","));
    url.searchParams.set("timeframe", "5Min");
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    url.searchParams.set("limit", "10000");
    url.searchParams.set("adjustment", "raw");
    url.searchParams.set("feed", env.ALPACA_FEED || "iex");
    url.searchParams.set("sort", "asc");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetcher(url, {
      headers: {
        "APCA-API-KEY-ID": env.ALPACA_KEY_ID,
        "APCA-API-SECRET-KEY": env.ALPACA_SECRET_KEY,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    requests += 1;
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      const requestId = response.headers.get("x-request-id");
      throw new Error(
        `Alpaca bars HTTP ${response.status}: ${detail}` +
          (requestId ? ` (request ${requestId})` : ""),
      );
    }
    const payload = (await response.json()) as AlpacaBarsPayload;
    if (payload.bars && typeof payload.bars === "object") {
      for (const [symbol, rawBars] of Object.entries(payload.bars)) {
        if (!Array.isArray(rawBars)) continue;
        const target = collected.get(symbol);
        if (!target) continue;
        for (const rawBar of rawBars) {
          const bar = parseBar(symbol, rawBar);
          if (bar) target.set(bar.ts, bar);
        }
      }
    }
    pageToken =
      typeof payload.next_page_token === "string" && payload.next_page_token
        ? payload.next_page_token
        : null;
  } while (pageToken);

  const bars = new Map<string, Bar[]>();
  for (const [symbol, values] of collected) {
    bars.set(symbol, [...values.values()].sort((left, right) => left.ts.localeCompare(right.ts)));
  }
  return { bars, requests };
}

