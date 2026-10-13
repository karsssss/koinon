import { useMutation, useQuery } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { TRANSFER_NOTE_MAX } from "../../../shared/domain/issuance";
import { Amount } from "@/components/Amount";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly balance: number;
  readonly meId: Id<"members">;
  readonly onSent: (message: string) => void;
}

/** One request ID per opened form, so a retried submit can never send twice (ECONOMY.md §4). */
export function TransferDialog(props: Props) {
  // Remount on each open: fresh fields and a fresh request ID.
  return props.open ? <TransferForm {...props} /> : <Dialog open={false} onOpenChange={props.onOpenChange} />;
}

function TransferForm({ onOpenChange, balance, meId, onSent }: Props) {
  const members = useQuery(api.members.list);
  const transfer = useMutation(api.wallet.transfer);
  const [requestId] = useState(() => crypto.randomUUID());
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ids = { to: useId(), amount: useId(), note: useId(), error: useId() };

  const others = (members ?? []).filter((m) => m._id !== meId);
  const amount = /^\d+$/.test(amountText) ? Number(amountText) : NaN;
  const amountError =
    amountText === "" ? null : !Number.isSafeInteger(amount) || amount < 1 ? "Enter a whole number of coins." : amount > balance ? "That's more than your balance." : null;
  const canSend = to !== "" && amountText !== "" && amountError === null && !pending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setPending(true);
    setError(null);
    try {
      await transfer({ toMemberId: to as Id<"members">, amount, requestId, ...(note.trim() && { note: note.trim() }) });
      const name = others.find((m) => m._id === to)?.displayName ?? "them";
      onSent(`Sent ${amount} coins to ${name}.`);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  };

  const shownError = error ?? amountError;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl">
        <DialogHeader>
          <DialogTitle>Send coins</DialogTitle>
          <DialogDescription>
            Transfers are final. You have <Amount value={balance} /> coins.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-2">
            <Label htmlFor={ids.to}>To</Label>
            <select
              id={ids.to}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              className="h-11 w-full rounded-md border border-input bg-surface-2 px-3 text-base text-foreground"
            >
              <option value="" disabled>
                Choose a member
              </option>
              {others.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.avatar} {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={ids.amount}>Amount</Label>
            <div className="flex gap-2">
              <Input
                id={ids.amount}
                inputMode="numeric"
                autoComplete="off"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.trim())}
                aria-invalid={amountError !== null}
                aria-describedby={shownError ? ids.error : undefined}
                className="tabular-nums"
              />
              <Button type="button" variant="secondary" onClick={() => setAmountText(String(balance))} disabled={balance < 1}>
                Max
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={ids.note}>Note (optional)</Label>
            <Input id={ids.note} value={note} maxLength={TRANSFER_NOTE_MAX} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p id={ids.error} role="alert" className="min-h-5 text-sm text-negative">
            {shownError}
          </p>
          {canSend && (
            <p className="text-sm text-muted-foreground">
              Balance after: <Amount value={balance - amount} />
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!canSend} className="w-full sm:w-auto">
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
