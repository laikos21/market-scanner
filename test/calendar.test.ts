import { describe, expect, it } from "vitest";

import {
  isRegularBarStart,
  isScannerWindow,
  latestClosedBarStart,
} from "../src/calendar";

describe("New York scanner calendar", () => {
  it("handles EDT without a hard-coded Argentina or UTC offset", () => {
    expect(isScannerWindow(new Date("2026-08-11T13:34:00Z"))).toBe(false); // 09:34 ET
    expect(isScannerWindow(new Date("2026-08-11T13:36:00Z"))).toBe(true); // 09:36 ET
    expect(isScannerWindow(new Date("2026-08-11T20:01:00Z"))).toBe(true); // final bar
    expect(isScannerWindow(new Date("2026-08-11T20:03:00Z"))).toBe(false);
  });

  it("handles EST and market holidays", () => {
    expect(isScannerWindow(new Date("2026-12-15T14:36:00Z"))).toBe(true); // 09:36 ET
    expect(isScannerWindow(new Date("2026-12-25T15:00:00Z"))).toBe(false);
  });

  it("accepts only five-minute RTH bar starts", () => {
    expect(isRegularBarStart(new Date("2026-08-11T13:30:00Z"))).toBe(true);
    expect(isRegularBarStart(new Date("2026-08-11T13:31:00Z"))).toBe(false);
    expect(isRegularBarStart(new Date("2026-08-11T20:00:00Z"))).toBe(false);
  });

  it("excludes the currently forming bar", () => {
    expect(latestClosedBarStart(new Date("2026-08-11T13:36:00Z")).toISOString()).toBe(
      "2026-08-11T13:30:00.000Z",
    );
  });
});

