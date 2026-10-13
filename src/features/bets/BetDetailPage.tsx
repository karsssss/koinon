import { useMutation, useQuery } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Amount } from "@/components/Amount";
import { Card } from "@/components/Card";
import { Countdown, useExpired } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { StatusBadge, Terms, outcomeLabel, type BetView, type Outcome } from "./shared";

const OUTCOMES: Outcome[] = ["A_WINS", "B_WINS", "VOID"];
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Runs a mutation, tracking pending state and a user-facing error. */
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}

function CounterForm({ bet, onDone }: { bet: BetView; onDone: () => void }) {
  const counter = useMutation(api.bets.counter);
  const { pending, error, run } = useAction();
  const meIsA = bet.myRole === "A";
  const [mine, setMine] = useState(String(meIsA ? bet.stakeA : bet.stakeB));
  const [theirs, setTheirs] = useState(String(meIsA ? bet.stakeB : bet.stakeA));
  const ids = { mine: useId(), theirs: useId() };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = Number(mine);
    const t = Number(theirs);
    void run(async () => {
      await counter({ betId: bet._id, stakeA: meIsA ? m : t, stakeB: meIsA ? t : m });
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={ids.mine}>My stake</Label>
          <Input id={ids.mine} inputMode="numeric" value={mine} onChange={(e) => setMine(e.target.value.trim())} className="tabular-nums" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={ids.theirs}>Their stake</Label>
          <Input id={ids.theirs} inputMode="numeric" value={theirs} onChange={(e) => setTheirs(e.target.value.trim())} className="tabular-nums" />
        </div>
      </div>
      <p role="alert" className="min-h-5 text-sm text-negative">
        {error}
      </p>
      <Button type="submit" disabled={pending || !/^\d+$/.test(mine) || !/^\d+$/.test(theirs)}>
        Send counter-offer
      </Button>
    </form>
  );
}

function Actions({ bet }: { bet: BetView }) {
  const m = {
    accept: useMutation(api.bets.accept),
    decline: useMutation(api.bets.decline),
    withdraw: useMutation(api.bets.withdraw),
    report: useMutation(api.bets.report),
    confirm: useMutation(api.bets.confirm),
    dispute: useMutation(api.bets.dispute),
    vote: useMutation(api.bets.vote),
    adminVoid: useMutation(api.bets.adminVoid),
  };
  const { pending, error, run } = useAction();
  const [countering, setCountering] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const expired = useExpired(bet.status === "offered" ? bet.offer.expiresAt : null);
  const betId = bet._id;
  const { can } = bet;
  const respondable = !expired;

  const sections = [];
  if ((can.accept || can.decline) && respondable) {
    sections.push(
      <div key="respond" className="grid gap-3">
        <p className="text-sm">
          {bet.offer.makerId === bet.proposer?._id ? bet.proposer.displayName : bet.counterparty?.displayName} offered these terms. You stake{" "}
          <Amount value={bet.myRole === "A" ? bet.stakeA : bet.stakeB} /> to win <Amount value={bet.myRole === "A" ? bet.stakeB : bet.stakeA} />.
        </p>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
          <Button disabled={pending} onClick={() => run(() => m.accept({ betId }))}>
            Accept
          </Button>
          {can.counter && (
            <Button variant="secondary" disabled={pending} onClick={() => setCountering((c) => !c)} aria-expanded={countering}>
              Counter
            </Button>
          )}
          <Button variant="outline" disabled={pending} onClick={() => run(() => m.decline({ betId }))}>
            Decline
          </Button>
        </div>
        {countering && <CounterForm bet={bet} onDone={() => setCountering(false)} />}
      </div>,
    );
  }
  if (can.withdraw && respondable) {
    sections.push(
      <div key="withdraw" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Waiting for {bet.offer.takerId === bet.proposer?._id ? bet.proposer.displayName : bet.counterparty?.displayName} to answer.</p>
        <Button variant="outline" disabled={pending} onClick={() => run(() => m.withdraw({ betId }))}>
          Withdraw
        </Button>
      </div>,
    );
  }
  if (can.report) {
    sections.push(
      <div key="report" className="grid gap-2">
        <p className="text-sm">How did it end? The other side confirms, or it goes to a jury.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OUTCOMES.map((o) => (
            <Button key={o} variant={o === "VOID" ? "outline" : "secondary"} disabled={pending} onClick={() => run(() => m.report({ betId, outcome: o }))}>
              {outcomeLabel(bet, o)}
            </Button>
          ))}
        </div>
      </div>,
    );
  }
  if (can.confirm && bet.reportedOutcome) {
    sections.push(
      <div key="confirm" className="grid gap-2">
        <p className="text-sm">
          Reported result: <strong>{outcomeLabel(bet, bet.reportedOutcome)}</strong>. If you don't answer, it's confirmed automatically after 48 hours.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button disabled={pending} onClick={() => run(() => m.confirm({ betId }))}>
            Confirm
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => run(() => m.dispute({ betId }))}>
            Dispute (send to jury)
          </Button>
        </div>
      </div>,
    );
  }
  if (can.vote) {
    sections.push(
      <div key="vote" className="grid gap-2">
        <p className="text-sm">You're on the jury. What happened? Your vote is final and revealed after the jury closes.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OUTCOMES.map((o) => (
            <Button key={o} variant="secondary" disabled={pending} onClick={() => run(() => m.vote({ betId, choice: o }))}>
              {outcomeLabel(bet, o)}
            </Button>
          ))}
        </div>
      </div>,
    );
  }
  if (can.adminVoid) {
    sections.push(
      <details key="admin" className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">Admin: void this challenge</summary>
        <div className="mt-3 grid gap-2">
          <Label htmlFor={reasonId}>Reason (shown to everyone)</Label>
          <Input id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => run(() => m.adminVoid({ betId, reason }))}>
            Void and refund
          </Button>
        </div>
      </details>,
    );
  }
  if (sections.length === 0) return null;
  return (
    <Card title="Your move" labelledBy="bet-actions">
      <div className="grid gap-4">{sections}</div>
      <p role="alert" className="text-sm text-negative empty:hidden">
        {error}
      </p>
    </Card>
  );
}

function StatusLine({ bet }: { bet: BetView }) {
  switch (bet.status) {
    case "offered":
      return bet.offer.status === "open" ? (
        <p>
          Offer expires in <Countdown until={bet.offer.expiresAt} className="font-medium" />
        </p>
      ) : null;
    case "active":
      return <p>Live. Decided by {when(bet.resolveBy)}.</p>;
    case "reported":
      return bet.reportedOutcome && <p>Reported: {outcomeLabel(bet, bet.reportedOutcome)}. Waiting for confirmation.</p>;
    case "disputed":
      return bet.juryClosesAt && <p>Disputed. The jury closes {when(bet.juryClosesAt)}.</p>;
    case "settled":
      return bet.outcome && <p>{outcomeLabel(bet, bet.outcome)} the pot of <Amount value={bet.stakeA + bet.stakeB} />.</p>;
    case "void":
      return <p>Void. Both stakes were returned{bet.voidReason ? `: ${bet.voidReason}` : "."}</p>;
    case "closed":
      return <p>No deal ({bet.offer.status}). The stake was returned.</p>;
  }
}

export function BetDetailPage() {
  const { betId } = useParams();
  const bet = useQuery(api.bets.get, betId ? { betId: betId as Id<"bets"> } : "skip");
  if (bet === undefined) return <p className="text-muted-foreground">Loading…</p>;
  if (bet === null) return <p>That challenge doesn't exist. <Link to="/bets" className="underline">Back to challenges</Link></p>;

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <Link to="/bets" className="inline-flex h-11 items-center text-sm text-muted-foreground hover:text-foreground">
        ← All challenges
      </Link>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">{bet.statement}</h1>
          <StatusBadge status={bet.status} />
        </div>
        <Terms bet={bet} className="mt-2" />
        <div className="mt-3 text-sm" data-testid="bet-status">
          <StatusLine bet={bet} />
        </div>
      </Card>
      <Actions bet={bet} />
      {bet.jury && (
        <Card title="Jury" labelledBy="bet-jury">
          <p className="text-sm text-muted-foreground">
            {bet.jury.cast} of {bet.jury.eligible} jurors voted. A result needs at least 3 votes and a majority.
          </p>
          {bet.jury.votes && (
            <ul className="mt-2 text-sm">
              {bet.jury.votes.map((v) => (
                <li key={v.voter}>
                  {v.voter}: {outcomeLabel(bet, v.choice)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Card title="Negotiation" labelledBy="bet-offers">
        <ol className="grid gap-1 text-sm text-muted-foreground">
          {bet.offers.map((o) => (
            <li key={o.seq}>
              {o.seq}. {o.makerId === bet.proposer?._id ? bet.proposer.displayName : bet.counterparty?.displayName} offered <Amount value={o.stakeA} /> : <Amount value={o.stakeB} /> · {o.status}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
