# Task ID: W55-a

**Agent**: full-stack-developer
**Task**: Polish `src/components/LeaderboardPanel.tsx` (strategy/performer
ranking panel) for visual consistency with the W51-2d MLPanel /
AIMLCommandCenter / W54-e MLValidationPanel redesign family.

## Context

Read `/home/z/my-project/worklog.md` (last ~200 lines) to map the W50-54
design-system vocabulary:
- W51-2d MLPanel / AIMLCommandCenter — `Tone` system (good/warn/fail/info/
  neutral), `PulseDot`, `SectionHeader`, `KpiTile` (tone-tinted bg + quality
  bar + trend glyph + tabular-nums value), `PsiGauge`, `ShimmerBlock`, Model
  Status Banner, refined calibration curve + SHAP bars.
- W52-a MarketScreener — `data-tone` hooks, `SortIndicator` (ArrowUp/
  ArrowDown glyph on active sort column, empty 10px slot on inactive to
  prevent layout shift), `ScreenerSkeletonRows` shimmer loading, row-hover
  accent bar (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.65)]`),
  polished error card with `RotateCcw` Retry glyph + Dismiss X.
- W54-e MLValidationPanel — `PolishedEmptyState` + `PolishedErrorState` +
  `ValidationSkeleton` + `SectionHeader` + tone-tinted KPI tiles + walk-
  forward table with uppercase headers + tabular-nums + row-hover accent
  bar + tone-aware sparkline + focus-metric selector.

Reference implementations consulted:
- `src/components/MLValidationPanel.tsx` (W54-e, 1576 lines — SectionHeader +
  PolishedEmptyState + PolishedErrorState + ShimmerBlock + ValidationSkeleton
  + TONE map + SortIndicator pattern).
- `src/components/MarketScreener.tsx` (W52-a, 1367 lines — SortIndicator +
  ScreenerSkeletonRows + ErrorCard with Retry + Dismiss).
- `src/components/LeaderboardPanel.test.tsx` (21 tests — W22-5 + W22-1
  contract).

## Test contract mapping

Enumerated every test-matched string from `LeaderboardPanel.test.tsx`:

| Test | Matched string | How it resolves |
|---|---|---|
| Renders the loading state | `/Loading leaderboard/` regex | `<span>Loading leaderboard…</span>` leaf text node preserved in `LeaderboardSkeleton` caption |
| Renders the empty-state placeholder | `No closed trades yet` exact | `<div class="empty-state-title">No closed trades yet</div>` direct text node |
| Renders the strategy leaderboard header | `/Strategy Leaderboard/` regex | `<span class="card-title">🏆 Strategy Leaderboard</span>` direct text node |
| Renders a row per strategy | `mm_avellaneda_stoikov` + `arb_binary_dutch_book` exact | `<span title={strategy}>` direct text node |
| Renders the gold medal for top-ranked strategy | `🥇` + `🥈` exact | `<span aria-label="Rank 1">🥇</span>` single-text-node element (no nested children, so `findByText` doesn't throw "multiple elements") |
| Renders the win rate as a percentage | `80%` + `33%` exact | `<span class="mono ...">{(r.win_rate*100).toFixed(0)}%</span>` direct text node |
| Renders the profit factor | `PF 2.10` + `PF —` exact | `<span class="badge badge-blue">PF {profit_factor.toFixed(2)}</span>` / `<span class="badge badge-dim">PF —</span>` |
| Renders the closed-trades count with W suffix | `5W` + `3W` exact | `<span class="mono ...">{closed_trades}W</span>` direct text node |
| Renders the net P&L with sign + colour | `+$7.50` + `-$2.00` exact | `<span class="mono ...">{pnl>=0?'+':'-'}${Math.abs(pnl).toFixed(2)}</span>` direct text node |
| Renders the risk-adjusted score with sign + colour | `+1.85` + `-0.45` exact | `<span class="mono ...">{score>=0?'+':''}{score.toFixed(2)}</span>` direct text node |
| Renders the max drawdown as a dollar value | `DD $-1.20` + `DD $-0.80` exact | `<span class="mono ...">DD ${dd.toFixed(2)}</span>` direct text node |
| Renders the "Polling" badge by default | `⟳ Polling` exact | `<Badge variant="warning">⟳ Polling</Badge>` direct text node |
| Flips to the "Live" badge when WS connects | `● Live` exact | `<Badge variant="success">● Live</Badge>` direct text node |
| Accepts a metrics-channel WS payload `{ranked: []}` | row appears after WS push | `validate: isLeaderboardPayload` predicate preserved |
| Drops a BotSnapshot payload | empty state preserved | same predicate |
| Ignores WS messages on wrong channel | empty state preserved | same predicate |
| Falls back to REST when WS not connected | row from REST renders | `useRealtimeData` REST prefetch preserved |
| Shows leaderboard error banner on HTTP 500 | `/Leaderboard:/i` + `/HTTP 500/i` | `<div class="text-red-200 ...">{wrappedError}</div>` where wrappedError = `Leaderboard: HTTP 500` |
| Shows leaderboard error banner on network error | `/Network error: ECONNREFUSED/i` | same div renders wrappedError = `Leaderboard: Network error: ECONNREFUSED` |
| Dismiss button aria-label | `getByRole('button', { name: /Dismiss leaderboard error/i })` | `<button aria-label="Dismiss leaderboard error">` preserved verbatim |
| Dismisses error banner on click | banner disappears | `dismissError` setter preserved |
| Renders error banner in empty-state branch | `/Strategy Leaderboard/i` + `/Leaderboard:/i` | shared `header` JSX renders in all 3 branches (loading/empty/loaded) |

## Build

Added 5 new inline sub-components (kept private to the panel so test mocks
+ ts-isolation stay clean):

- `SortIndicator({ active, ascending })` — Lucide `ArrowUp` / `ArrowDown`
  glyph on the active sort column, or an empty 10px slot on inactive
  columns so the layout doesn't shift on sort toggle. aria-hidden because
  the sort state is already exposed via the parent button's `aria-label`
  ("Sort by …"). Mirrors the W52-a MarketScreener SortIndicator.
- `ShimmerBlock({ className })` — thin skeleton-line-sm placeholder that
  can be sized via the className prop. aria-hidden so screen readers don't
  pick it up. Mirrors MLPanel / MLValidationPanel ShimmerBlock.
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 9.5px title + optional dim italic
  description + optional trailing node (badge / count). Mirrors MLPanel /
  MLValidationPanel SectionHeader. Used by the Rankings sub-section above
  the table.
- `LeaderboardSkeleton({ rowCount })` — structured loading placeholder
  that mirrors the loaded table layout (caption + skeleton header row
  mirroring the 7-column Rank | Strategy | Win | PF | DD | P&L | Score
  layout + N skeleton rows). role=status + aria-live=polite +
  data-testid="leaderboard-loading-skeleton". The "Loading leaderboard…"
  caption is preserved verbatim above the skeleton rows so the W22-1
  test contract `getByText(/Loading leaderboard/)` resolves.
- `PolishedEmptyState()` — friendly empty-state with Lucide Trophy icon
  (28px, dim) + .empty-state-title direct text node "No closed trades yet"
  + .empty-state-desc dim description. role=status +
  data-testid="leaderboard-empty-state". Replaces the bare 🏆 emoji +
  plain text node.
- `PolishedErrorCard({ message, detail, onRetry, onDismiss })` — red-
  tinted error card with AlertTriangle icon + the full wrapped error
  string ("Leaderboard: HTTP 500") rendered as the card's title (so the
  W22-1 test contracts `findByText(/Leaderboard:/i)` +
  `getByText(/HTTP 500/i)` still resolve) + dim detail + Retry button
  (RefreshCw glyph, calls `useRealtimeData.refetch()`) + the existing
  Dismiss button (aria-label="Dismiss leaderboard error" preserved
  verbatim). role=alert + data-testid="leaderboard-error-card" +
  "-retry" / "-dismiss" suffixes on the buttons. Replaces the bare
  inline `banner-danger` strip.

Applied the W51-2d Tone system locally (`Tone = good | warn | fail | info
| neutral`) with self-contained text-color class strings (static so
Tailwind 4's scanner picks them up). Used for tone-coloring the win rate
(emerald >=50%, amber 40-50%, red <40%), net P&L (emerald profit / red
loss), and risk-adjusted score (emerald positive / red negative).

## All 9 polish affordances applied

1. **Shimmer skeleton loading state** — the bare `spinner + "Loading
   leaderboard…"` placeholder is wrapped in `<LeaderboardSkeleton/>`
   which renders the caption (preserved verbatim) + a skeleton header
   row mirroring the live 7-column table layout + 4 skeleton rows. Uses
   the existing `.skeleton-line-sm` class from globals.css. aria-hidden
   on the skeleton rows (caption + role=status + aria-live=polite cover
   the screen-reader announcement).

2. **Polished empty state with Lucide icon + message** — the bare 🏆
   emoji is replaced with a Lucide `Trophy` icon (size 28px, dim text
   color) + .empty-state-title direct text node "No closed trades yet"
   (preserved verbatim) + .empty-state-desc dim description "Rankings
   populate as strategies close positions and bank P&L." role=status +
   data-testid="leaderboard-empty-state".

3. **Refined table — uppercase headers + SortIndicator + row-hover accent
   bar** — the bare `flex` rows now have a proper uppercase 11px
   tracking-wider font-bold text-[#5a637a] header row with a SortIndicator
   glyph on every sortable column (Win / PF / DD / P&L / Score). The
   `#` and `Strategy` columns are non-sortable captions. The header row
   carries `hover:bg-transparent` so it doesn't pick up the row-hover
   accent. Each row carries `hover:bg-cyan-500/[0.04]` (subtle background
   lift; cyan reads as the panel's accent rather than the old
   `hover:border-blue-500/30`) layered with `hover:shadow-[inset_3px_0_0_0_…]`
   (left-edge accent bar via inset shadow — no layout shift). The accent
   bar color varies by rank: gold for #1, slate for #2, bronze for #3,
   cyan for the rest.

4. **Rank badges (gold #1 / silver #2 / bronze #3 / muted rest)** — the
   bare `🥇` / `🥈` / `🥉` / `${i+1}.` medal text now sits inside a
   styled rank badge span with tone-tinted bg + ring + glow shadow:
   - Rank 1: amber-500/15 bg + amber-300 text + amber-500/40 ring +
     `shadow-[0_0_6px_rgba(251,191,36,0.30)]` gold glow.
   - Rank 2: slate-300/15 bg + slate-200 text + slate-300/40 ring.
   - Rank 3: orange-700/20 bg + orange-300 text + orange-600/40 ring.
   - Rank 4+: `bg-[#1f2335]` muted bg + `text-[#7e8aaa]` muted text +
     `ring-[#2a2f45]` muted ring.
   The medal emoji is preserved as the SOLE textContent of the badge span
   (no nested children) so `findByText('🥇')` resolves to exactly one
   element. Each badge carries `data-tone={good|neutral|warn|neutral}`
   based on rank for downstream CSS targeting.

5. **Tabular-nums on all numeric columns** — closed trades (`5W`), win
   rate (`80%`), profit factor (`PF 2.10`), max drawdown (`DD $-1.20`),
   net P&L (`+$7.50`), risk-adjusted score (`+1.85`), AND the strategy
   count badge in the SectionHeader trailing slot now all carry
   `tabular-nums` so columns don't shift alignment when values change
   between renders. The medal badge also carries `tabular-nums` so the
   numeric ranks (4, 5, 6, …) align cleanly.

6. **Tone-colored P&L values** — net P&L: emerald (`text-emerald-400`)
   when profit, red (`text-red-400`) when loss. Risk-adjusted score:
   same emerald/red mapping. Win rate: emerald >=50%, amber 40-50%, red
   <40% so a trader reads pass/warn/fail at a glance. Max drawdown: red
   when negative (always, since drawdowns are negative by convention),
   muted otherwise. Each tone-colored cell carries `data-tone={good|warn|
   fail|neutral}` for downstream CSS targeting.

7. **Section header with icon + uppercase title** — a `SectionHeader`
   sub-component (mirrors MLPanel / MLValidationPanel) renders above the
   table body with a Lucide `ListOrdered` icon + uppercase tracking-wider
   9.5px "Rankings" title + dim italic "risk-adjusted net performance"
   description + a trailing `.badge .badge-dim` strategy-count badge
   ("2 strategies"). tone=info (cyan) to match the panel's accent.

8. **Refined podium/top-3 display** — the top-3 rows carry tone-tinted
   rank badges (gold/silver/bronze) AND a tone-tinted left-edge accent
   bar on hover (gold/slate/bronze) so the trader can immediately spot
   the podium. The medal emoji (🥇/🥈/🥉) is preserved inside the badge
   so the existing test contract (`findByText('🥇')` + `getByText('🥈')`)
   resolves. The accent bar uses an inset shadow rather than a border
   so it doesn't shift the row's layout on hover.

9. **Error state: polished error card with Retry** — the bare
   `banner-danger` strip is replaced with `<PolishedErrorCard/>` — a
   red-tinted card with `AlertTriangle` icon + the full wrapped error
   string ("Leaderboard: HTTP 500") rendered as the card's title (so
   the W22-1 test contracts `findByText(/Leaderboard:/i)` +
   `getByText(/HTTP 500/i)` still resolve) + dim detail ("Leaderboard
   API couldn't be reached. Check connectivity and retry.") + a Retry
   button (`RefreshCw` glyph, calls `useRealtimeData.refetch()`) + the
   existing Dismiss button (aria-label="Dismiss leaderboard error"
   preserved verbatim, X glyph). role=alert +
   data-testid="leaderboard-error-card" + "-retry" / "-dismiss"
   suffixes on the buttons.

## Additional refinements (beyond the 9 spec items)

- **Header polish**: the panel header now has a Lucide `Trophy` icon
  (size-3.5, amber) next to the existing "🏆 Strategy Leaderboard" card-
  title text. The 🏆 emoji prefix is preserved verbatim so the test
  contract `getByText(/Strategy Leaderboard/)` regex still matches the
  text node. The header is unified across all 3 branches (loading / empty
  / loaded) so the `getByText(/Strategy Leaderboard/)` test resolves
  regardless of fetch state.
- **Local sort state** — added a `sortBy` (default `'score'`) + `sortAsc`
  (default `false`) state pair so the trader can re-sort the table by
  Win / PF / DD / P&L / Score by clicking any sortable header. The
  default `score desc` matches the backend's pre-ranking so the initial
  render preserves the original order (and the test contract that 🥇
  maps to the highest-scoring strategy on first render).
- **Original-rank tracking** — each row is tagged with its `originalRank`
  (the index in the backend's `ranked` array) so the medal emoji always
  reflects the strategy's OFFICIAL rank, even after the trader re-sorts
  the table by P&L / win rate / etc. (e.g. sorting by P&L asc puts the
  worst performer at the top of the view, but the 🥇 still maps to the
  highest-scoring strategy — the badge reads "Rank 1 of N" by aria-label
  + title attribute so the trader doesn't confuse the view position with
  the official rank).
- **Sorted-rows memoization** — `sortedRanked` is memoized via
  `useMemo(..., [rankedRows, sortBy, sortAsc])` so re-sorts don't
  trigger unnecessary re-renders.
- **Truncated strategy names with tooltip** — long strategy names
  (e.g. `mm_avellaneda_stoikov`) carry `truncate` + `title={strategy}` so
  the trader can hover to see the full name if it gets clipped on a
  narrow viewport.
- **Tooltip on every numeric cell** — each numeric cell carries a
  `title="..."` tooltip with the human-readable metric name + raw value
  (e.g. `title="Win rate 80.0%"`, `title="Net P&L $7.50"`,
  `title="Max drawdown $-1.20"`, `title="Rank 1 of 2"`).
- **Row container with max-h-96 + custom scrollbar** — the rows
  container carries `max-h-96 overflow-y-auto scrollbar-thin` so a long
  leaderboard (10+ strategies) scrolls inside the panel rather than
  stretching the card vertically. Mirrors the W51-2d MLPanel scrollable
  list pattern.
- **New CSS hooks added** (for downstream CSS layer to target):
  - `data-testid="leaderboard-loading-skeleton"` on the loading wrapper.
  - `data-testid="leaderboard-empty-state"` on the empty-state wrapper.
  - `data-testid="leaderboard-error-card"` on the error card (+ `-retry`
    + `-dismiss` suffixes on the buttons).
  - `data-tone={good|warn|fail|info|neutral}` on the win-rate cell,
    net-P&L cell, risk-adjusted-score cell, max-drawdown cell, and the
    rank-badge span.

## What was preserved

- All existing functionality: `useRealtimeData('/api/leaderboard', {
  wsChannel: 'metrics', pollInterval: 10000, validate:
  isLeaderboardPayload })` REST prefetch + WS subscription + polling
  fallback + Live/Polling badge.
- All existing class names retained: `.card`, `.card-header`, `.card-
  title`, `.badge` + `.badge-amber` / `.badge-blue` / `.badge-dim`,
  `.banner-danger` (no longer used directly — replaced by the polished
  error card), `.spinner`, `.mono`, `.scrollbar-thin`, `.empty-state`
  (+ `-icon` / `-title` / `-desc`), `.skeleton-line-sm`, `.btn` + `.btn-
  xs`.
- All existing accessibility roles/labels preserved: `role=status` on
  loading + empty states, `role=alert` on error card, `aria-live=polite`
  on loading wrapper, `aria-label="Dismiss leaderboard error"` on the
  dismiss button, `aria-label="Retry leaderboard fetch"` on the new
  retry button, `aria-label="Sort by …"` on each sortable header button,
  `aria-label="Rank {N}"` on each rank badge.
- All test-matched strings preserved verbatim:
  - "Loading leaderboard…" caption (regex `/Loading leaderboard/`).
  - "No closed trades yet" exact (empty-state title).
  - "🏆 Strategy Leaderboard" header text (regex `/Strategy Leaderboard/`).
  - "🥇" + "🥈" + "🥉" medal emojis (exact match — sole textContent of
    their badge span).
  - "80%" + "33%" win rate (exact).
  - "PF 2.10" + "PF —" profit factor (exact).
  - "5W" + "3W" closed trades (exact).
  - "+$7.50" + "-$2.00" net P&L (exact).
  - "+1.85" + "-0.45" risk-adjusted score (exact).
  - "DD $-1.20" + "DD $-0.80" max drawdown (exact).
  - "● Live" + "⟳ Polling" realtime badges (exact).
  - "Leaderboard: HTTP 500" wrapped error text (regex `/Leaderboard:/i`
    + `/HTTP 500/i`).
- 'use client' directive preserved at the top of the file.
- All inline sub-components kept private to the file (not exported) so
  test mocks + ts-isolation stay clean.

## Verification

```
$ wc -l src/components/LeaderboardPanel.tsx
621 src/components/LeaderboardPanel.tsx

$ git diff --stat HEAD src/components/LeaderboardPanel.tsx
 src/components/LeaderboardPanel.tsx | 586 +++++++++++++++++++++++++++++++-----
 1 file changed, 508 insertions(+), 78 deletions(-)

$ bun run lint 2>&1 | tail -3
$ eslint .
(clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3
(0 errors — exit 0, no output)

$ bunx vitest run src/components/LeaderboardPanel.test.tsx 2>&1 | tail -5
 ✓ src/components/LeaderboardPanel.test.tsx (21 tests) 672ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```

## Stage Summary

- **Final line count**: 621 lines (was 191 — +508 insertions / −78
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving the existing
  props, API calls (`useRealtimeData('/api/leaderboard', {...})` REST +
  WS + 10s polling + `refetch()` on Retry), polling, class names,
  accessibility roles/labels, test contracts, and the 'use client'
  directive.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors (exit 0, no output).
- **Tests**: 21/21 pass (was 21/21 — no regressions).

**LeaderboardPanel is production-ready with the premium W55-a visual
layer, visually consistent with the W51-2d MLPanel / AIMLCommandCenter
/ W54-e MLValidationPanel redesign family.**

## Files touched

- `src/components/LeaderboardPanel.tsx` (UI polish pass, 191 → 621 lines,
  +508 / −78 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W55-a-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended W55-a entry).
