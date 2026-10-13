import { useMutation, useQuery } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { STATEMENT_MAX, challengeTermsError } from "../../../shared/domain/bets";
import { Amount } from "@/components/Amount";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/lib/useNow";

const fieldClass = "h-11 w-full rounded-md border border-input bg-surface-2 px-3 text-base text-foreground";

/** datetime-local value for a timestamp, in the viewer's local time. */
function localInputValue(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

const int = (s: string) => (/^\d+$/.test(s) ? Number(s) : Number.NaN);

export function NewChallengeDialog({ open, onOpenChange, meId, balance }: { open: boolean; onOpenChange: (o: boolean) => void; meId: Id<"members">; balance: number }) {
  return open ? <ChallengeForm onOpenChange={onOpenChange} meId={meId} balance={balance} /> : null;
}

function ChallengeForm({ onOpenChange, meId, balance }: { onOpenChange: (o: boolean) => void; meId: Id<"members">; balance: number }) {
  const members = useQuery(api.members.list);
  const create = useMutation(api.bets.create);
  const navigate = useNavigate();
  const [requestId] = useState(() => crypto.randomUUID());
  const [who, setWho] = useState("");
  const [statement, setStatement] = useState("");
  const [mine, setMine] = useState("");
  const [theirs, setTheirs] = useState("");
  const [resolveBy, setResolveBy] = useState(() => localInputValue(Date.now() + 24 * 60 * 60 * 1000));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { who: useId(), statement: useId(), mine: useId(), theirs: useId(), resolveBy: useId(), error: useId() };
  const now = useNow(15_000);

  const myStake = int(mine);
  const theirStake = int(theirs);
  const resolveAt = new Date(resolveBy).getTime();
  const complete = who !== "" && statement.trim() !== "" && mine !== "" && theirs !== "";
  const validation = complete ? challengeTermsError({ statement, stakeA: myStake, stakeB: theirStake, resolveBy: resolveAt, now }) : null;
  const shownError = error ?? validation ?? (complete && myStake > balance ? "That's more than your balance." : null);
  const canSend = complete && shownError === null && !pending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setPending(true);
    setError(null);
    try {
      const { betId } = await create({ counterpartyId: who as Id<"members">, statement: statement.trim(), myStake, theirStake, resolveBy: resolveAt, requestId });
      onOpenChange(false);
      navigate(`/bets/${betId}`);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl">
        <DialogHeader>
          <DialogTitle>New challenge</DialogTitle>
          <DialogDescription>They get 5 minutes to accept, counter or decline. Your stake is locked until then.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor={ids.who}>Challenge</Label>
            <select id={ids.who} value={who} onChange={(e) => setWho(e.target.value)} className={fieldClass}>
              <option value="" disabled>
                Choose a member
              </option>
              {(members ?? [])
                .filter((m) => m._id !== meId)
                .map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.avatar} {m.displayName}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={ids.statement}>I bet that…</Label>
            <Input id={ids.statement} value={statement} maxLength={STATEMENT_MAX} onChange={(e) => setStatement(e.target.value)} placeholder="it rains on Saturday" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor={ids.mine}>My stake</Label>
              <Input id={ids.mine} inputMode="numeric" autoComplete="off" value={mine} onChange={(e) => setMine(e.target.value.trim())} className="tabular-nums" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={ids.theirs}>Their stake</Label>
              <Input id={ids.theirs} inputMode="numeric" autoComplete="off" value={theirs} onChange={(e) => setTheirs(e.target.value.trim())} className="tabular-nums" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={ids.resolveBy}>Decided by</Label>
            <Input id={ids.resolveBy} type="datetime-local" value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} />
          </div>
          {complete && Number.isSafeInteger(myStake) && Number.isSafeInteger(theirStake) && (
            <p className="text-sm text-muted-foreground">
              Win: +<Amount value={theirStake} /> · Lose: −<Amount value={myStake} /> · Pot <Amount value={myStake + theirStake} />
            </p>
          )}
          <p id={ids.error} role="alert" className="min-h-5 text-sm text-negative">
            {shownError}
          </p>
          <DialogFooter>
            <Button type="submit" disabled={!canSend} className="w-full sm:w-auto">
              {pending ? "Sending…" : "Send challenge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
