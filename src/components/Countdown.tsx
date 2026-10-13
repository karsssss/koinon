import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Seconds-precision countdown to a server deadline (DESIGN.md §3). Turns warning-coloured under 60 s.
 * Screen readers are told only at 60 s and 10 s, so they aren't flooded. The server re-checks every deadline.
 */
export function Countdown({ until, className }: { until: number; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const text = left === 0 ? "expired" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const announce = left === 0 ? "Time is up." : left <= 10 ? "10 seconds left." : left <= 60 ? "1 minute left." : "";
  return (
    <span className={cn("tabular-nums", left > 0 && left <= 60 && "text-warning", left === 0 && "text-muted-foreground", className)}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{left === 0 ? "expired" : `${Math.floor(left / 60)} minutes ${left % 60} seconds left`}</span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </span>
  );
}

/** True once the deadline has passed (re-renders every second while mounted). */
export function useExpired(until: number | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until !== null && now >= until;
}
