const coins = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCoins(n: number): string {
  return coins.format(n);
}

export function formatSigned(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${coins.format(Math.abs(n))}`;
}

/** Screen-reader text for an amount, e.g. "plus 10 coins". */
export function spokenAmount(n: number, signed: boolean): string {
  const unit = Math.abs(n) === 1 ? "coin" : "coins";
  if (!signed || n === 0) return `${coins.format(n)} ${unit}`;
  return `${n > 0 ? "plus" : "minus"} ${coins.format(Math.abs(n))} ${unit}`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(at: number, now: number): string {
  const s = Math.round((at - now) / 1000);
  if (Math.abs(s) < 45) return "just now";
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return relative.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return relative.format(h, "hour");
  return relative.format(Math.round(h / 24), "day");
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatGroupDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
