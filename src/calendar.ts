import marketCalendar from "./market_calendar.json";

type Calendar = {
  _covers: [number, number];
  closed: Record<string, string>;
  early_close: Record<string, string>;
};

const calendar = marketCalendar as unknown as Calendar;

interface NewYorkTime {
  dateKey: string;
  weekday: string;
  minutes: number;
  year: number;
}

function newYorkTime(date: Date): NewYorkTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    year: Number(parts.year),
  };
}

function requireCoverage(year: number): void {
  if (year < calendar._covers[0] || year > calendar._covers[1]) {
    throw new Error(
      `market calendar does not cover ${year}; covered ${calendar._covers[0]}-${calendar._covers[1]}`,
    );
  }
}

function regularSession(date: Date): { open: number; close: number } | null {
  const local = newYorkTime(date);
  requireCoverage(local.year);
  if (local.weekday === "Sat" || local.weekday === "Sun") return null;
  if (local.dateKey in calendar.closed) return null;
  return {
    open: 9 * 60 + 30,
    close: local.dateKey in calendar.early_close ? 13 * 60 : 16 * 60,
  };
}

export function isScannerWindow(date: Date): boolean {
  const session = regularSession(date);
  if (!session) return false;
  const minutes = newYorkTime(date).minutes;
  // First 5-minute candle closes at 09:35. Keep two minutes after the close
  // so the 15:55 candle can be consumed by the 16:01 UTC-aligned cron run.
  return minutes >= session.open + 5 && minutes <= session.close + 2;
}

export function isRegularBarStart(date: Date): boolean {
  const session = regularSession(date);
  if (!session) return false;
  const minutes = newYorkTime(date).minutes;
  return minutes >= session.open && minutes < session.close && minutes % 5 === 0;
}

export function latestClosedBarStart(now: Date): Date {
  const fiveMinutes = 5 * 60_000;
  return new Date(Math.floor((now.getTime() - fiveMinutes) / fiveMinutes) * fiveMinutes);
}

export function formatNewYork(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function newYorkDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return newYorkTime(date).dateKey;
}
