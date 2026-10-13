import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { NewChallengeDialog } from "./NewChallengeDialog";
import { BetRow, type BetView } from "./shared";

const LIVE = new Set<BetView["status"]>(["offered", "active", "reported", "disputed"]);

function Section({ title, id, bets, empty }: { title: string; id: string; bets: BetView[]; empty?: string }) {
  if (bets.length === 0 && !empty) return null;
  return (
    <Card title={title} labelledBy={id}>
      {bets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y" data-testid={id}>
          {bets.map((b) => (
            <BetRow key={b._id} bet={b} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function BetsPage() {
  const bets = useQuery(api.bets.list);
  const summary = useQuery(api.wallet.summary);
  const [open, setOpen] = useState(false);
  const all = bets ?? [];
  const needsMe = all.filter((b) => b.needsMe);
  const mine = all.filter((b) => !b.needsMe && b.myRole !== null && LIVE.has(b.status));
  const rest = all.filter((b) => !needsMe.includes(b) && !mine.includes(b));

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Challenges</h1>
        <Button onClick={() => setOpen(true)} disabled={summary === undefined}>
          New challenge
        </Button>
      </div>
      <Section title="Needs you" id="bets-needs-me" bets={needsMe} />
      <Section title="Your live challenges" id="bets-mine" bets={mine} empty={bets === undefined ? "Loading…" : "Nothing live. Challenge someone!"} />
      <Section title="Group history" id="bets-history" bets={rest} />
      {summary !== undefined && <NewChallengeDialog open={open} onOpenChange={setOpen} meId={summary.me._id} balance={summary.balance} />}
    </div>
  );
}
