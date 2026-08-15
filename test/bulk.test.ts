import { describe, expect, it } from "vitest";

import { parseBulkSymbols } from "../src/bulk";

describe("bulk screener import", () => {
  it("extracts uppercase tickers from rich PULSE-like card text", () => {
    const result = parseBulkSymbols(`
      NTAP
      NetApp
      AI Infrastructure
      MOM 93
      EXTENDED
      APR 2026
      PANW
      CRWD
      + Watchlist
    `);
    expect(result.symbols).toEqual(["NTAP", "PANW", "CRWD"]);
    expect(result.symbols).not.toContain("NETAPP");
    expect(result.symbols).not.toContain("AI");
  });

  it("supports a simple lowercase list and reports duplicates", () => {
    const result = parseBulkSymbols("nvda\nPANW\nNVDA\n$CRWD\nPANW");
    expect(result.symbols).toEqual(["NVDA", "PANW", "CRWD"]);
    expect(result.duplicates).toEqual(["NVDA", "PANW"]);
  });

  it("recovers tickers when card copy concatenates ticker and company", () => {
    const result = parseBulkSymbols("NTAPNetAppAI\nPANWPaloAltoNetworks\nREGNRegeneronBiotechMOM");
    expect(result.symbols).toEqual(["NTAP", "PANW", "REGN"]);
  });

  it("removes the EXITED status concatenated by PULSE cards", () => {
    const result = parseBulkSymbols("AAOIEXITED\nAEHREXITED\nAFMEXITED\nANETEXITED\nBEXITED\nEXITED");
    expect(result.symbols).toEqual(["AAOI", "AEHR", "AFM", "ANET", "B"]);
    expect(result.invalid).toEqual([]);
  });

  it("removes the ENTERED status concatenated by PULSE cards", () => {
    const result = parseBulkSymbols("ESTCENTERED\nAEMENTERED\nENTERED");
    expect(result.symbols).toEqual(["ESTC", "AEM"]);
    expect(result.invalid).toEqual([]);
  });

  it("does not treat screener labels as symbols", () => {
    const result = parseBulkSymbols("PULSE Leaders\nLIQUID Leaders\nEMA Pullback\nMOM 93");
    expect(result.symbols).toEqual([]);
  });
});
