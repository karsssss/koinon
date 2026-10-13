# Koinon — Design System

Status: **Draft v0.1** · The visual direction is dark-first, premium and minimal: mostly typography and spacing, with one accent colour.

## 1. Principles

1. **Calm by default; emphasise only what needs action.** Countdowns, offers waiting on you, and unclaimed coins are the only things that get the accent colour.
2. **Numbers come first.** Every amount uses tabular figures and an explicit sign, and colour is never the only cue.
3. **One-handed use.** Primary actions sit in the bottom third of the screen. Sheets are used instead of new pages for short tasks.
4. **Motion confirms an action; it never decorates.** Every animation is 320 ms or shorter, and all of it respects reduced motion.
5. **Secrets stay hidden on screen.** Role cards are hidden until you tap to reveal them, so they're safe from shoulder-surfing.

## 2. Design tokens

These are CSS custom properties, exposed to Tailwind v4 through `@theme`, and the shadcn/ui variables map onto them. Colours are written in OKLCH. Dark is the default; a light theme is not in the MVP.

### Color

| Token | Value (dark) | Use |
|---|---|---|
| `--bg` | `oklch(0.145 0.005 270)` | App background |
| `--surface-1` | `oklch(0.185 0.006 270)` | Cards, sheets |
| `--surface-2` | `oklch(0.225 0.007 270)` | Raised and hover states, inputs |
| `--border` | `oklch(0.30 0.008 270)` | Hairlines (1px) |
| `--text` | `oklch(0.96 0.003 270)` | Primary text |
| `--text-muted` | `oklch(0.72 0.010 270)` | Secondary text (meets AA on `--bg` and `--surface-1`) |
| `--accent` | `oklch(0.82 0.13 85)` | "Coin gold": primary actions, highlights |
| `--accent-fg` | `oklch(0.20 0.02 85)` | Text on the accent colour |
| `--positive` | `oklch(0.78 0.14 155)` | Credits, wins |
| `--negative` | `oklch(0.70 0.17 25)` | Debits, losses, destructive actions |
| `--warning` | `oklch(0.83 0.14 75)` | Expiring soon (< 60 s) |
| `--info` | `oklch(0.75 0.11 240)` | Neutral system notices |
| `--focus` | `var(--accent)` | 2px focus ring, 2px offset |

Every text and background pair is checked automatically in CI with a contrast script: at least 4.5:1 for text and at least 3:1 for UI boundaries.

### Typography

- **Font:** Inter Variable, self-hosted, Latin subset, `font-display: swap`. The fallback is `system-ui`. Numbers use `font-variant-numeric: tabular-nums`.
- **Scale (rem, base 16):**

  | Token | Size | Use |
  |---|---|---|
  | `xs` | 0.75 | |
  | `sm` | 0.875 | |
  | `base` | 1 | |
  | `lg` | 1.25 | |
  | `xl` | 1.5 | |
  | `2xl` | 2 | |
  | `display` | 3 | Balance hero |

- **Weights:** 400, 500 and 600. Line heights are 1.5 for body text and 1.15 for display.

### Space, shape, elevation, motion

| Group | Tokens |
|---|---|
| Spacing | 4px base: 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | `sm` 6px, `md` 10px, `lg` 16px (cards and sheets), `full` |
| Elevation | Dark mode uses borders and surface steps rather than shadows. One shadow, `--shadow-sheet`, is used for sheets and dialogs. |
| Motion | `fast` 120ms, `base` 200ms, `slow` 320ms. Easing is `cubic-bezier(0.2, 0.8, 0.2, 1)`. Balance count-ups run for at most 600ms. |
| Reduced motion | Transforms and count-ups are disabled; only opacity fades of 120ms or less remain. |
| Breakpoints | Mobile is the default. `md` is 768px; `lg` is 1024px and switches to the desktop layout. |
| Touch | Targets are at least 44×44px, with at least 8px between targets. |

## 3. Component inventory (MVP)

Built on shadcn/ui and Radix wherever possible. The custom components are marked ★.

| Group | Components |
|---|---|
| Actions | Button (primary, secondary, ghost, destructive), IconButton |
| Containers and overlays | Card, ListRow, Sheet/Drawer (bottom sheet on mobile), Dialog, Tabs, Segmented control |
| Inputs | Input, Textarea, ★AmountInput (stepper, "max" shortcut, shows the balance after the action) |
| Status and feedback | Toast (sonner), Badge, Skeleton, EmptyState, ★Countdown (deadline-aware; turns warning-coloured under 60 s), ★Progress (milestone) |
| Data display | ★Amount (sign, tabular figures, colour, and screen-reader text such as "plus 20 coins"), Avatar (emoji or initials) |
| Social | ★ReactionBar, ★CommentThread |
| Ranking and games | ★LeaderboardRow, ★RoleCard (tap to reveal), ★VotePanel |
| Navigation | ★BottomNav, ★SideNav |

## 4. Information architecture

### Mobile (default): five-tab bottom nav

| Tab | Content |
|---|---|
| **Today** | Claims (check-in, digest) with the rollover countdown · **Action required**: offers waiting on you (with countdowns), outcomes to confirm, payment requests, votes due · season status card · recent feed |
| **Bets** | Segments: Offers, Active, Resolving, History · floating "New bet" button that opens a bottom-sheet form |
| **Season** | With a game running: the phase header and countdown, the role card, Town Square, the vote or action panel, and the player list. With no game running: the next season, opt-in, and past results. |
| **Wallet** | Balance hero (available and in escrow) · Send / Request buttons · ledger history, grouped by group day |
| **People** | Members · leaderboards (Wallet, Season, Lifetime) · milestone · full feed · settings · admin (admins only) |

The top bar shows the screen title, an inbox bell with an unread count, and the member's avatar, which opens the profile.

### Desktop (≥1024px)

- A left side nav replaces the bottom nav.
- The main column is at most 640px wide. On the Season tab it widens to 960px, with chat on the left and players and votes on the right.
- A right rail holds "Action required" and the live feed.

### Key flows and their screens

The user journeys are in [PRD.md §7](PRD.md#7-user-journeys).

| Flow | Screens |
|---|---|
| Sign-in | Email entry → code entry |
| Onboarding | Name and avatar → genesis "+1" moment → install guide (on iOS) → notifications permission |
| Bet creation | One bottom sheet: statement → who → stakes (with an odds preview) → resolve-by → judge (optional) → review |

## 5. Content style

- Short and plain. Say "coins", never "money", "cash", "$", "deposit", or "withdraw" (H3).
- Every ledger line answers *why*. For example: "Check-in · Tue 14 Oct", "Bet won: 'Marathon < 4h' vs Alex".
- Errors say what happened and what to do next. Expected states such as "Already claimed today" are not presented as errors.

## 6. Accessibility and performance targets

### Accessibility: WCAG 2.2 AA

- Contrast follows §2, and colour is never the only signal: amounts use +/− and text, statuses use labels.
- The app is fully keyboard-operable, with visible focus. Dialogs and sheets trap focus and restore it when they close (Radix handles this).
- **Screen readers:**
  - Amounts and countdowns have accessible text.
  - Countdowns announce only at 60 s and at 10 s, in a polite live region.
  - Toasts are announced politely.
- **Sizing and layout:**
  - Layouts work at 200% text zoom and at a 320px viewport width.
  - Sizes use rem units, and there are no fixed-height text containers.
- Reduced motion is respected, see §2.
- **Automated checks:** axe runs in every Playwright E2E. Lighthouse accessibility must score ≥ 95 on the key screens.

### Performance (measured with mobile Lighthouse, mid-range Android, Slow 4G)

| Metric | Target |
|---|---|
| LCP, cold | ≤ 2.5 s |
| LCP, warm (shell served by the service worker) | ≤ 1.0 s |
| INP (p75) | ≤ 200 ms |
| CLS | ≤ 0.05 |
| Initial JS (gzip) | ≤ 170 KB, enforced in CI. Season, admin, and the bet form are split into separate routes. |
| Fonts | ≤ 50 KB total |
| First data after the shell | ≤ 1.5 s on 4G (Convex WebSocket) |
| PWA | Installable in Lighthouse; `standalone`; maskable icon |
