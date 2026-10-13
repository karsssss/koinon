import { cn } from "@/lib/utils";
import { formatCoins, formatSigned, spokenAmount } from "@/lib/format";

/** An amount with tabular figures, an explicit sign when `signed`, and screen-reader text (DESIGN.md §1). */
export function Amount({ value, signed = false, className }: { value: number; signed?: boolean; className?: string }) {
  return (
    <span
      className={cn("tabular-nums", signed && value > 0 && "text-positive", signed && value < 0 && "text-negative", className)}
    >
      <span aria-hidden="true">{signed ? formatSigned(value) : formatCoins(value)}</span>
      <span className="sr-only">{spokenAmount(value, signed)}</span>
    </span>
  );
}
