import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Amount } from "@/components/Amount";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { formatGroupDay } from "@/lib/format";
import { TransferDialog } from "./TransferDialog";

const KIND_LABEL: Record<string, string> = {
  GENESIS: "Welcome coin",
  CHECKIN: "Daily check-in",
  DIGEST: "Daily digest",
  SEASON_REWARD: "Season reward",
  BET_ESCROW: "Stake locked",
  BET_REFUND: "Stake returned",
  BET_PAYOUT: "Challenge won",
  ADJUSTMENT: "Adjustment",
};

function History() {
  const { results, status, loadMore } = usePaginatedQuery(api.wallet.history, {}, { initialNumItems: 20 });
  return (
    <Card title="History" labelledBy="history-title">
      {status === "LoadingFirstPage" && <p className="text-sm text-muted-foreground">Loading…</p>}
      <ul className="divide-y" data-testid="wallet-history">
        {results.map((e) => {
          const label =
            e.kind === "TRANSFER"
              ? `${e.delta < 0 ? "Sent to" : "Received from"} ${e.counterparty?.displayName ?? "a former member"}`
              : (KIND_LABEL[e.kind] ?? e.kind);
          return (
            <li key={e._id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">{label}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {formatGroupDay(e.groupDay)}
                  {e.memo && ` · “${e.memo}”`}
                  {e.bet && ` · “${e.bet.statement}”`}
                </p>
              </div>
              <Amount value={e.delta} signed className="font-medium" />
            </li>
          );
        })}
      </ul>
      {status === "CanLoadMore" && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => loadMore(20)}>
          Load more
        </Button>
      )}
    </Card>
  );
}

export function WalletPage() {
  const summary = useQuery(api.wallet.summary);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <h1 className="sr-only">Wallet</h1>
      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Balance</h2>
          <p className="mt-1 text-display font-semibold leading-none" data-testid="wallet-balance">
            {summary === undefined ? <span className="text-muted-foreground">–</span> : <Amount value={summary.balance} />}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            coins
            {summary !== undefined && summary.escrowed > 0 && (
              <span data-testid="wallet-escrowed">
                {" "}· <Amount value={summary.escrowed} /> locked in challenges
              </span>
            )}
          </p>
        </div>
        <Button size="lg" onClick={() => setOpen(true)} disabled={summary === undefined}>
          Send coins
        </Button>
      </Card>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {summary !== undefined && (
        <TransferDialog open={open} onOpenChange={setOpen} balance={summary.balance} meId={summary.me._id} onSent={setAnnouncement} />
      )}
      <History />
    </div>
  );
}
