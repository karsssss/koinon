import type { FunctionReturnType } from "convex/server";
import { Link } from "react-router";
import type { api } from "../../../convex/_generated/api";
import { Amount } from "@/components/Amount";
import { Countdown } from "@/components/Countdown";
import { cn } from "@/lib/utils";

export type BetView = FunctionReturnType<typeof api.bets.list>[number];
export type Outcome = "A_WINS" | "B_WINS" | "VOID";

const STATUS: Record<BetView["status"], { label: string; tone: string }> = {
  offered: { label: "Waiting for answer", tone: "bg-warning/15 text-warning" },
  active: { label: "Live", tone: "bg-primary/15 text-primary" },
  reported: { label: "Result reported", tone: "bg-info/15 text-info" },
  disputed: { label: "With the jury", tone: "bg-info/15 text-info" },
  settled: { label: "Settled", tone: "bg-positive/15 text-positive" },
  void: { label: "Void", tone: "bg-surface-2 text-muted-foreground" },
  closed: { label: "No deal", tone: "bg-surface-2 text-muted-foreground" },
};

export function StatusBadge({ status }: { status: BetView["status"] }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-sm px-2 text-xs font-medium", s.tone)}>{s.label}</span>;
}

export function outcomeLabel(bet: Pick<BetView, "proposer" | "counterparty">, outcome: Outcome): string {
  if (outcome === "VOID") return "Void (no winner)";
  return `${(outcome === "A_WINS" ? bet.proposer : bet.counterparty)?.displayName ?? "Former member"} wins`;
}

/** "Ada 50 : 20 Bo" with the pot. */
export function Terms({ bet, className }: { bet: BetView; className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {bet.proposer?.displayName} <Amount value={bet.stakeA} className="text-foreground" /> : <Amount value={bet.stakeB} className="text-foreground" />{" "}
      {bet.counterparty?.displayName} · pot <Amount value={bet.stakeA + bet.stakeB} />
    </p>
  );
}

export function BetRow({ bet }: { bet: BetView }) {
  const waiting = bet.status === "offered" && bet.offer.status === "open";
  return (
    <li>
      <Link to={`/bets/${bet._id}`} className="flex flex-col gap-1 rounded-md px-2 py-3 -mx-2 hover:bg-accent">
        <span className="flex items-start justify-between gap-3">
          <span className="font-medium">{bet.statement}</span>
          <StatusBadge status={bet.status} />
        </span>
        <span className="flex items-center justify-between gap-3">
          <Terms bet={bet} />
          {waiting && <Countdown until={bet.offer.expiresAt} className="text-sm" />}
          {bet.status === "settled" && bet.outcome && <span className="shrink-0 text-sm text-positive">{outcomeLabel(bet, bet.outcome)}</span>}
        </span>
      </Link>
    </li>
  );
}
