import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { CHECKIN_AMOUNT } from "../../../shared/domain/issuance";
import { groupDay, nextRolloverAt } from "../../../shared/domain/time";
import { Amount } from "@/components/Amount";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatDuration, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/useNow";

function CheckInCard() {
  const summary = useQuery(api.wallet.summary);
  const checkIn = useMutation(api.daily.checkIn);
  const now = useNow();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (summary === undefined) return <Card title="Daily check-in" labelledBy="checkin-title"><div className="h-11" /></Card>;

  // Display only: the server decides the group day when claiming.
  const today = groupDay(now, summary.timezone, summary.rolloverHour);
  const claimed = summary.lastCheckInDay === today;
  const resetsIn = formatDuration(nextRolloverAt(now, summary.timezone, summary.rolloverHour) - now);

  const onClick = async () => {
    setPending(true);
    setStatus(null);
    try {
      const r = await checkIn({});
      setStatus(r.status === "claimed" ? `Checked in. +${r.amount} coins.` : "Already checked in today.");
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Daily check-in" labelledBy="checkin-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{claimed ? `Done for today. Next check-in in ${resetsIn}.` : `Resets in ${resetsIn}.`}</p>
        <Button onClick={onClick} disabled={claimed || pending} className="min-w-40">
          {claimed ? "Checked in ✓" : pending ? "Checking in…" : `Check in · +${CHECKIN_AMOUNT}`}
        </Button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
    </Card>
  );
}

function BalanceCard() {
  const summary = useQuery(api.wallet.summary);
  return (
    <Card className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground">Your balance</h2>
        <p className="mt-1 text-display font-semibold leading-none" data-testid="home-balance">
          {summary === undefined ? <span className="text-muted-foreground">–</span> : <Amount value={summary.balance} />}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">coins</p>
      </div>
      <Button asChild variant="secondary">
        <Link to="/wallet">Wallet</Link>
      </Button>
    </Card>
  );
}

function GroupBalances() {
  const members = useQuery(api.members.list);
  const me = useQuery(api.wallet.summary)?.me._id;
  return (
    <Card title="Group balances" labelledBy="balances-title">
      <ol className="divide-y" data-testid="group-balances">
        {(members ?? []).map((m, i) => (
          <li key={m._id} className="flex items-center gap-3 py-2" data-member={m.displayName}>
            <span className="w-5 text-right text-sm tabular-nums text-muted-foreground">{i + 1}</span>
            <Avatar emoji={m.avatar} className="size-9 text-lg" />
            <span className="flex-1 truncate">
              {m.displayName}
              {m._id === me && <span className="ml-2 text-xs text-muted-foreground">you</span>}
            </span>
            <Amount value={m.balance} className="font-medium" />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ActivityFeed() {
  const events = useQuery(api.feed.recent);
  const now = useNow();
  return (
    <Card title="Recent activity" labelledBy="activity-title">
      {events !== undefined && events.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet today.</p>}
      <ul className="divide-y" data-testid="activity-feed">
        {(events ?? []).map((e) => (
          <li key={e._id} className="flex items-center gap-3 py-2.5">
            <Avatar emoji={e.actor?.avatar ?? "❔"} className="size-9 text-lg" />
            <p className="flex-1 text-sm">
              <span className="font-medium">{e.actor?.displayName ?? "Someone"}</span>{" "}
              {e.type === "joined" && "joined the group"}
              {e.type === "checkin" && "checked in"}
              {e.type === "transfer" && (
                <>
                  sent coins to <span className="font-medium">{e.target?.displayName ?? "someone"}</span>
                </>
              )}
              <span className="block text-xs text-muted-foreground">{timeAgo(e.at, now)}</span>
            </p>
            {e.amount !== null && <Amount value={e.amount} signed={e.type === "checkin"} className="text-sm" />}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function HomePage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <h1 className="sr-only">Home</h1>
      <div className="grid gap-4">
        <BalanceCard />
        <CheckInCard />
        <ActivityFeed />
      </div>
      <GroupBalances />
    </div>
  );
}
