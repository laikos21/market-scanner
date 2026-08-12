import { describe, expect, it, vi } from "vitest";

import { fetchAlpacaBars, parseBar } from "../src/alpaca";
import type { Env } from "../src/types";

const env = {
  ALPACA_KEY_ID: "key",
  ALPACA_SECRET_KEY: "secret",
  ALPACA_DATA_URL: "https://data.alpaca.markets",
  ALPACA_FEED: "iex",
} as Env;

describe("Alpaca 5-minute bars", () => {
  it("rejects malformed bars instead of inventing values", () => {
    expect(parseBar("NVDA", { t: "bad", c: 100 })).toBeNull();
    expect(
      parseBar("NVDA", {
        t: "2026-08-11T13:30:00Z",
        o: 100,
        h: 101,
        l: 99,
        c: 100.5,
        v: 500,
      }),
    ).toMatchObject({ symbol: "NVDA", close: 100.5, volume: 500 });
  });

  it("paginates the multi-symbol endpoint and preserves exact symbols", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          bars: {
            NVDA: [
              { t: "2026-08-11T13:30:00Z", o: 100, h: 101, l: 99, c: 100.5, v: 500 },
            ],
          },
          next_page_token: "page-2",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          bars: {
            TSLA: [
              { t: "2026-08-11T13:30:00Z", o: 200, h: 202, l: 198, c: 201, v: 700 },
            ],
          },
          next_page_token: null,
        }),
      );
    const result = await fetchAlpacaBars(
      ["TSLA", "NVDA"],
      new Date("2026-08-11T13:00:00Z"),
      new Date("2026-08-11T14:00:00Z"),
      env,
      fetcher,
    );
    expect(result.requests).toBe(2);
    expect(result.bars.get("NVDA")).toHaveLength(1);
    expect(result.bars.get("TSLA")?.[0].close).toBe(201);
    const firstUrl = new URL(String(fetcher.mock.calls[0][0]));
    const secondUrl = new URL(String(fetcher.mock.calls[1][0]));
    expect(firstUrl.searchParams.get("symbols")).toBe("NVDA,TSLA");
    expect(firstUrl.searchParams.get("timeframe")).toBe("5Min");
    expect(secondUrl.searchParams.get("page_token")).toBe("page-2");
  });
});

