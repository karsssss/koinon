// Group day (ECONOMY.md §5.1, ADR-006): the local calendar date in the group's IANA timezone,
// where the day starts at `rolloverHour` local wall-clock time. Always computed on the server.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function wallClock(epochMs: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(epochMs)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function isoDate(year: number, month: number, day: number): string {
  // Date.UTC normalises overflow (day 0 → last day of the previous month).
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The group day (YYYY-MM-DD) containing `epochMs`. */
export function groupDay(epochMs: number, timeZone: string, rolloverHour: number): string {
  const w = wallClock(epochMs, timeZone);
  return isoDate(w.year, w.month, w.hour < rolloverHour ? w.day - 1 : w.day);
}

/** UTC offset of the zone at an instant, in ms (local = utc + offset). */
function offsetAt(epochMs: number, timeZone: string): number {
  const w = wallClock(epochMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** The instant at which the group day containing `epochMs` ends (the next rollover). */
export function nextRolloverAt(epochMs: number, timeZone: string, rolloverHour: number): number {
  const [y, m, d] = groupDay(epochMs, timeZone, rolloverHour).split("-").map(Number) as [number, number, number];
  const localTarget = Date.UTC(y, m - 1, d + 1, rolloverHour);
  // Resolve local wall time to UTC. Two passes settle the offset across a DST change.
  let guess = localTarget - offsetAt(localTarget, timeZone);
  guess = localTarget - offsetAt(guess, timeZone);
  return guess;
}
