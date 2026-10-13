import { cn } from "@/lib/utils";

/** Emoji avatar. Decorative: the member's name is always shown next to it. */
export function Avatar({ emoji, className }: { emoji: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-xl leading-none", className)}
    >
      {emoji}
    </span>
  );
}
