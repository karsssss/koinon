# CLAUDE.md — Koinon repository rules

Koinon is a private social-gaming PWA for 8 friends, built around a play-money economy. The specs live in `docs/`, and current status lives in `CURRENT.md`. Read both before working.

## Phase gate
- Implement only what `CURRENT.md` marks as the active slice. Don't start the next phase without the owner's approval.
- Never silently invent a product or economy rule. If a spec is ambiguous, add or update an entry in `docs/DECISIONS.md` (Open decisions) and ask.

## Hard rules (economy and security)
- Coins are integers. Never introduce floats or fractions into amounts.
- **Only `convex/ledger/post.ts` (`postTransaction`) may write `accounts`, `transactions`, or `postings`.** The ledger is append-only, and corrections are reversing `ADJUSTMENT` transactions.
- Every ledger-affecting mutation has an idempotency key. Natural mints derive their key on the server (`checkin:<member>:<groupDay>`).
- Time and `groupDay` come from the server only. Never trust client time, amounts the client doesn't own, roles, or outcomes.
- Public Convex functions use the `memberQuery`/`memberMutation` wrappers and `args` validators. Scheduler and cron targets are `internal*`.
- Secret game data is filtered in server queries, never hidden only in the UI.
- Never use real-money language or features: no "cash", "$", "deposit", "withdraw", payments, or redemption.

## Code
- Business rules are pure functions in `shared/domain/`, with no Convex or React imports. Convex, the UI, and `sim/` all call them.
- TypeScript is strict. Avoid `any`, and avoid non-null `!` unless you justify it in a comment.
- UI work uses the design tokens and components in `docs/DESIGN.md`. Use no ad-hoc colours. Use tabular numbers for amounts, and keep touch targets at 44px or more.
- Keep dependencies minimal. Adding a runtime dependency needs one line of justification in the PR.

## Testing (required before claiming done)
- `npm run typecheck && npm run lint && npm test` must pass. Run `npm run e2e` for UI flows.
- Economy changes need: domain unit tests, convex-test integration tests with the invariant check (`assertLedgerInvariants`), and an idempotent-replay test.
- Any change to a monetary rule updates `docs/ECONOMY.md` in the same change.

## Workflow
- Use npm and Node 24. Use conventional commit messages. Branch off `main`, and open PRs into `main`.
- Update `CURRENT.md` (status, next step, blockers) at the end of each work session.
