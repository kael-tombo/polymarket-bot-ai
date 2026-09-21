# Task W53-c — full-stack-developer — Polish StrategyPerformancePanel

**Task ID:** W53-c
**Agent:** full-stack-developer
**Target:** `src/components/StrategyPerformancePanel.tsx`
**Wave context:** W50-52 design system (Tone system, KpiTile pattern, shimmer
skeleton, polished empty/error states, PulseDot, SortIndicator, tabular-nums,
row hover accent bar, section headers with icon + uppercase title).

---

## Work Log

### 0. Pre-flight recon
- Read `worklog.md` tail (~200 lines) to map the W50-52 design-system
  vocabulary. Confirmed the inline sub-component pattern (`Tone` system +
  `SectionHeader` + `PulseDot` + `KpiTile`) from W51-2b PositionsPanel,
  W51-2c OrdersPanel/TradesPanel, W51-2d MLPanel/AIMLCommandCenter, W52-b
  OrderFlowPanel. Confirmed `.skeleton-line-sm`, `.skeleton-line-md`,
  `.skeleton-table`, `.skeleton-row`, `.skeleton-cell`, `.kpi-skeleton`,
  `.empty-state`, `.error-state`, `.scrollbar-thin`, `.banner-danger`,
  `.badge-dim`, `.card-header`, `.spinner` CSS classes are present in
  `src/app/globals.css`.
- Read `StrategyPerformancePanel.tsx` end-to-end (1199 lines, W23-5 origin).
- Read `StrategyPerformancePanel.test.tsx` end-to-end (750 lines, 25 tests)
  to enumerate every test contract that MUST NOT break. Verified the test
  surface:
  - Loading: `getByText('Loading Strategy Performance…')` + `.spinner` element.
  - Title: `getByText('Strategy Performance Dashboard')`.
  - Header total P&L: `getByText('+$14.80')` (exact text node).
  - Header counts badge: regex `/2 active.*3 impl.*1 planned/`.
  - Header "30s poll" badge: `getByText('30s poll')`.
  - Header Refresh button: `getByRole('button', { name: /refresh strategy performance/i })`.
  - Strategy cards: `getAllByTestId('strategy-card')` → 3 cards (activeRows
    filter excludes PLANNED Bollinger). Card names via `getAllByText(...)`.
    Card badges via `data-testid="strategy-status-badge"` → "IMPLEMENTED".
    Card toggle via `getAllByTestId('strategy-toggle')` → 3 toggles.
  - Per-strategy P&L values: `getAllByText('+$12.45')`, `getAllByText('+$4.20')`,
    `getAllByText('−$1.85')` (Unicode U+2212 minus — preserved in `fmtUsd`).
  - Stat tile values: `getAllByText('63.2%')`, `getAllByText('2.14')`,
    `getAllByText('1.85')`, `getAllByText('38')`.
  - Toggle POST: fires POST `/api/strategies/toggle`.
  - Toggle failure: `getByText(/Toggle failed/)`, `getByText(/Risk gate rejected toggle/)`,
    Dismiss button `getByRole('button', { name: /dismiss toggle error/i })`.
  - Comparison table: `getByText('Performance Comparison')` (single match),
    `getAllByTestId('performance-table-row')` → 4 rows, `getByText('Bollinger Bands Reversion')`,
    `getAllByText('Net P&L').length > 0`, `getAllByText('Sharpe').length > 0`,
    `getAllByText('Sortino').length > 0`, `getAllByText('Calmar').length > 0`.
    Default sort by net_pnl desc → rows[0]='Avellaneda', rows[3]='Random Forest'.
    Click 'Win %' header (single match) re-sorts.
  - Attribution chart: `getByText('P&L Attribution by Strategy')` (single),
    `getByTestId('attribution-chart')`.
  - Risk ranking: `getByText('Risk-Adjusted Ranking')` (single),
    `getByRole('button', { name: 'Sharpe' })` (single button),
    `getByRole('button', { name: 'Sortino' })` (single button),
    `aria-pressed` toggles on click, `getAllByTestId('risk-ranking-row')` > 0,
    first ranked row → 'Avellaneda-Stoikov Market Maker'.
  - Equity overlay: `getByText('Equity Curves Overlay (cumulative P&L)')` (single),
    `getByTestId('equity-overlay-chart')`.
  - Empty state: no `strategy-card` testids, `getByText(/No active strategies/)`,
    `getByText(/No closed positions yet/)`.
  - Error state: `getByText('Strategy performance endpoint unavailable')` (single),
    `getByRole('button', { name: /retry strategy performance fetch/i })`,
    `getByText(/Network failure: ECONNREFUSED/)`.
  - Polling: 30s cadence, `getByText('+$14.80')` then `getByText('+$22.50')`,
    paused when `document.hidden`, cleared on unmount.

### 1. StrategyPerformancePanel.tsx — polish pass (1199 → 1608 lines, +409)

#### Tone system (5 tones)
- Added `type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'` with a
  self-contained `TONE: Record<Tone, ToneConfig>` map. Each entry exposes
  `{ bg, border, text, bar, dot, label, halo }` as static class strings
  (Tailwind 4 JIT-safe). Mirrors W51-2d MLPanel/AIMLCommandCenter Tone.
- Added `sharpeTone(v)` and `winRateTone(v)` helpers mapping numeric values
  to tones for KPI tinting.

#### New inline sub-components (additive, all in same file)
1. **`PulseDot({ tone, pulse })`** — animated status dot with halo + ping.
   `animate-ping` halo + solid dot + glow shadow. aria-hidden. Replaces the
   bare `animate-pulse` dot on running strategy cards.
2. **`SortIndicator({ active, direction })`** — extracted from the inline
   `renderSortHeader` sort glyph. Renders ArrowUp / ArrowDown (cyan) when
   active, ArrowUpDown (muted) when inactive. aria-hidden.
3. **`KpiTile({ label, value, hint, tone, quality, trend, testId })`** —
   refined KPI card (large value, tone-tinted bg, quality bar, optional
   trend glyph). Mirrors W51-2d MLPanel KpiTile. Used for the new 4-card
   headline strip.
4. **`PolishedEmptyState({ icon, title, description, className, testId })`**
   — Lucide icon + title + helper copy. Uses `.empty-state` CSS classes.
   role=status. Used by 5 empty branches (cards grid, attribution, equity,
   ranking, table).
5. **`EquityCurveSkeleton()`** — shimmer placeholder mirroring the live
   equity overlay chart shape. Uses `.skeleton-line-sm` / `.skeleton-line-md`
   classes. role=status, aria-live=polite, testid `strategy-equity-skeleton`.
6. **`ComparisonTableSkeleton({ rowCount })`** — shimmer placeholder
   mirroring the live comparison table shape (12 columns × N rows). Uses
   `.skeleton-table` / `.skeleton-row` / `.skeleton-cell` classes.
   role=status, aria-live=polite, testid `strategy-table-skeleton`.

#### Aggregate helpers
- `avgNonNull(values: Array<number | null>)` — mean of non-null finite
  values, returns null if empty. Used for Avg Sharpe / Sortino / Calmar.
- `weightedWinRate(rows)` — closed-trades-weighted average of win_rate.
  Returns null if no traded strategies.

#### StrategyCard refinement
- Replaced the bare `<span className="w-2 h-2 rounded-full bg-green-400
  animate-pulse inline-block" title="Running live execution loop"
  aria-label="Running" />` with `<PulseDot tone="good" />`. PulseDot has
  no text content, so the existing card test (which matches on text
  'IMPLEMENTED' via status badge, not on the running indicator) still
  passes.
- Added `tabular-nums` to the strategy_id/version line for clean version
  alignment.

#### StatTile refinement
- Added `tabular-nums` to the value span and the hint span for clean
  decimal alignment across the 3-column grid.

#### PnlValue refinement
- Added `tabular-nums` to the value span. Tone-coloring preserved (green /
  red / muted by sign).

#### AttributionChart refinement
- Empty branch now uses `<PolishedEmptyState icon={BarChart3}
  title="No closed positions yet" description="Attribution will appear
  here once trades are realised." testId="strategy-attribution-empty" />`.
  The title text "No closed positions yet" is preserved (the existing
  test asserts `getByText(/No closed positions yet/)`), only the styling
  is upgraded.

#### EquityOverlayChart refinement
- **Y domain** — computed symmetric around 0 (min padded down 5%,
  max padded up 5%, min 1-unit pad) so gains/losses read symmetrically.
  Avoids the previous default `['auto', 'auto']` which could clip the
  chart at extreme values.
- **ReferenceLine at y=0** — muted dashed stroke (`chartTheme.colors.muted`
  with `strokeDasharray="2 4" strokeOpacity={0.5}`) marks the breakeven
  baseline. Reads as a reference, not a data line.
- **Tooltip cursor** — added `cursor={tooltipCursor}` so hovering the
  chart shows a subtle dashed vertical guide line (cyan, 0.45 opacity).
- **Tone-coloured strokes** — preserved STRATEGY_COLORS palette (emerald,
  cyan, amber, purple, pink, lime, blue, orange) so each strategy's line
  keeps its stable colour across renders.
- **Empty state** — uses `<PolishedEmptyState icon={LineChartIcon}
  title="No equity data yet" description="Curves populate as strategies
  close positions." testId="strategy-equity-empty" />`. Preserves the
  existing "No equity data yet" message text.

#### PerformanceTable refinement
- **Uppercase tracking-wider headers** — added `uppercase tracking-wider`
  to the existing `text-[10px] uppercase tracking-wider text-[#7e8aaa]
  font-bold` className (already uppercase, just made it explicit).
- **SortIndicator** — extracted the inline sort glyph logic into the
  shared `SortIndicator` sub-component. The glyph is now tone-coloured
  (cyan for active column) instead of plain ArrowUp/ArrowDown. The
  `cursor-pointer select-none hover:bg-[#1a1e2c]` classes are preserved.
- **Row hover accent bar** — added `border-l-2 border-l-transparent
  hover:border-l-cyan-400/60 transition-colors` to each TableRow so
  hovering a row shows a subtle cyan left accent bar.
- **tabular-nums** — added to every numeric TableCell (net_pnl, win_rate,
  profit_factor, expectancy, sharpe, sortino, calmar, max_drawdown,
  closed_trades, avg_hold_hours). The strategy_id and name cells already
  had `mono` for monospace, now they have `tabular-nums` too.
- **Empty row state** — uses `<PolishedEmptyState icon={Inbox}
  title="No strategies to display" description="..." testId=
  "strategy-table-empty" />` inside a colSpan=12 TableCell. Replaces
  the bare "No strategies to display" text span.

#### RiskRankingPanel refinement
- **Empty state** — uses `<PolishedEmptyState icon={Trophy}
  title="No risk-ranked strategies yet" description="Close trades to
  populate risk-adjusted metrics." testId="strategy-ranking-empty" />`.
  Title text preserved ("No risk-ranked strategies yet").
- **Row hover accent bar** — added `border-l-2 border-l-transparent
  hover:border-l-cyan-400/60` to each ranking row.
- **tabular-nums** — added to the medal column, the closed-trades count,
  and the metric value span for clean decimal alignment.
- The 3 risk metric toggle buttons (`Sharpe` / `Sortino` / `Calmar`)
  are preserved verbatim — same `aria-pressed` attribute, same class
  names, same accessible name. Adding the KPI strip with labels "Avg
  Sharpe" / "Avg Sortino" / "Avg Calmar" does NOT conflict because the
  test uses `getByRole('button', { name: 'Sharpe' })` (only buttons
  match, and the KPI tiles are `<div>`s, not buttons).

#### LoadingSkeleton refinement
- Replaced the bare 5-row `.skeleton h-XX w-full rounded-md` placeholders
  with structured shimmer layouts that mirror the live dashboard:
  - Header strip skeleton (`.skeleton h-8 w-full`).
  - KPI strip skeleton — 4 `.kpi-skeleton rounded-lg` tiles (uses the
    existing `.kpi-skeleton` CSS class with `kpi-skeleton-shimmer`
    animation).
  - Strategy cards skeleton — 6 `.skeleton-card rounded-lg p-3` cards,
    each with `.skeleton-line-sm` + `.skeleton-line-md` + a 60%-width
    `.skeleton-line-sm`.
  - Attribution + ranking row skeleton — 2-card grid mirroring the live
    layout (2/3 width chart card + 1/3 width ranking card).
  - `EquityCurveSkeleton` instance — chart-shape shimmer.
  - `ComparisonTableSkeleton` instance — table-shape shimmer.
- The whole skeleton now carries `role="status"`, `aria-live="polite"`,
  `aria-label="Loading strategy performance dashboard…"`, and
  `data-testid="strategy-loading-skeleton"` for assistive tech + tests.

#### ErrorState (preserved)
- The existing `ErrorState` component was already polished (`.error-state`
  CSS, Lucide AlertTriangle icon, Retry button with `aria-label="Retry
  strategy performance fetch"`). No structural change — the W53-c spec
  calls for a "polished error card with retry", which already existed.
  Preserved verbatim.

#### Main panel additions
- **KPI strip section** — new `<section>` between the header and the
  Strategy Overview cards. Renders a `Trophy` icon + uppercase
  "Risk-Adjusted KPIs" h2 + a 4-tile grid (`grid-cols-2 md:grid-cols-4`):
  1. **Avg Sharpe** — mean of non-null `sharpe_ratio` across IMPLEMENTED
     strategies. Tone: good (≥1.5) / warn (≥0.5) / poor (<0.5) / neutral
     (null). Quality bar: scaled to [0, 3] range. Trend glyph: up/flat/down.
  2. **Avg Sortino** — mean of non-null `sortino_ratio`. Same tone rules.
  3. **Avg Calmar** — mean of non-null `calmar_ratio`. Same tone rules.
  4. **Win Rate** — closed-trades-weighted average of `win_rate`. Tone:
     good (≥0.55) / warn (≥0.45) / poor (<0.45) / neutral (null).
- The KPI strip wraps a `data-testid="strategy-kpi-strip"` container with
  4 children, each `data-testid="strategy-kpi-{sharpe|sortino|calmar|winrate}"`.
- **Section headers** — preserved the existing `<CardHeader>` +
  `<CardTitle>` structure. Added `uppercase tracking-wider` to every
  `CardTitle` className to match the W51-2 design vocabulary. Card title
  text content preserved verbatim:
  - "P&L Attribution by Strategy"
  - "Risk-Adjusted Ranking"
  - "Equity Curves Overlay (cumulative P&L)"
  - "Performance Comparison"
  Each title is in its own `<CardTitle>` element, and the wrapping
  `<div>` includes a sibling `<span>` (the "Click any column header to
  sort" hint for the Performance Comparison card) OR has only the icon
  as a non-text sibling — so `getByText('Performance Comparison')` and
  the other 3 single-match tests still resolve to exactly one element.

#### Header comment block
- Added a new "W53-c — Final UI polish pass" section above the existing
  W23-5 docstring, documenting each polish affordance and the constraint
  that existing class names + testids + role attributes + aria-labels +
  API calls + the 'use client' directive are preserved.

### 2. Verification

- **`bun run lint`**: clean (exit 0, no output).
- **`bunx tsc --noEmit --skipLibCheck`**: 0 errors. (Caught one initial
  issue: `ReactNode` was imported but unused after the rewrite — removed
  the import, re-checked, 0 errors.)
- **`bunx vitest run src/components/StrategyPerformancePanel.test.tsx`**:
  25/25 tests pass in ~4s. Confirms the full test contract is preserved:
  - Loading skeleton + spinner ✓
  - Title + total P&L + counts badge ✓
  - Strategy cards (3) + status badges + toggles ✓
  - Per-strategy P&L values (3 distinct) ✓
  - Stat tile values (win rate / PF / Sharpe / trades) ✓
  - Toggle POST + failure banner + dismiss ✓
  - Comparison table (4 rows, headers, default sort, Win % re-sort) ✓
  - Attribution chart section ✓
  - Risk-adjusted ranking (Sharpe default, Sortino toggle) ✓
  - Equity overlay chart section ✓
  - Empty state (no cards + attribution empty message) ✓
  - Error state (title + retry button + network error message) ✓
  - 30s polling + paused when hidden + cleared on unmount ✓
  - Manual refresh button ✓
  - 30s poll cadence badge ✓

### 3. Files touched
- `src/components/StrategyPerformancePanel.tsx` (UI polish pass,
  1199 → 1608 lines, +465 / −56 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W53-c-full-stack-developer.md`
  (this detailed agent work record).
- `worklog.md` (appended entry below).

### 4. Push verification
```
$ wc -l src/components/StrategyPerformancePanel.tsx
1608 src/components/StrategyPerformancePanel.tsx
$ git diff --stat src/components/StrategyPerformancePanel.tsx
 src/components/StrategyPerformancePanel.tsx | 521 +++++++++++++++++++++++++---
 1 file changed, 465 insertions(+), 56 deletions(-)
$ bun run lint
$ bunx tsc --noEmit --skipLibCheck
$ bunx vitest run src/components/StrategyPerformancePanel.test.tsx
 ✓ src/components/StrategyPerformancePanel.test.tsx (25 tests) 3921ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

### 5. Final status
- **Polish**: complete — all 8 spec items applied (KPI cards, shimmer
  skeleton, polished empty state, refined equity chart, refined comparison
  table, tone-colored P&L, section headers with icon + uppercase title,
  error state with retry).
- **Backwards-compat**: full — all props, API calls (useEffect polling
  `/api/strategies/performance` every 30s + POST `/api/strategies/toggle`),
  all existing class names (`bg-[#13161e]`, `border-[#1f2335]`, `shadow-md`,
  `bg-blue-500/20 text-cyan-300 border-blue-500/40`, `bg-cyan-500/15
  text-cyan-300 border-cyan-500/40`, `badge badge-dim`, `banner-danger`,
  `card-header`, `spinner`, `scrollbar-thin`, etc.), all existing testids
  (`strategy-performance-panel`, `strategy-card`, `strategy-status-badge`,
  `strategy-toggle`, `performance-table`, `performance-table-row`,
  `risk-ranking-panel`, `risk-ranking-row`, `attribution-chart`,
  `equity-overlay-chart`, `pnl-value`, `stat-tile`), all role attributes
  + aria-labels, and the `'use client'` directive are preserved.
- **New CSS hooks** for downstream CSS layer to target:
  - `data-tone="{good|warn|poor|info|neutral}"` on the PulseDot's dot span
    and on the KpiTile border/text/quality bar (via TONE config).
  - New testids: `strategy-kpi-strip`, `strategy-kpi-sharpe`,
    `strategy-kpi-sortino`, `strategy-kpi-calmar`, `strategy-kpi-winrate`,
    `strategy-equity-skeleton`, `strategy-table-skeleton`,
    `strategy-attribution-empty`, `strategy-equity-empty`,
    `strategy-ranking-empty`, `strategy-cards-empty`,
    `strategy-table-empty`, `strategy-empty-state`, `strategy-kpi-tile`,
    `strategy-loading-skeleton`.
- **New inline sub-components** (6): Tone system + PulseDot + SortIndicator
  + KpiTile + PolishedEmptyState + EquityCurveSkeleton +
  ComparisonTableSkeleton + aggregate helpers (`avgNonNull`,
  `weightedWinRate`, `sharpeTone`, `winRateTone`). Each is small,
  single-purpose, and aria-hidden / role=status where appropriate.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors.
- **Tests**: 25/25 pass.

**StrategyPerformancePanel is production-ready with the premium W53-c
visual layer, visually consistent with the W50-52 PositionsPanel /
OrdersPanel / TradesPanel / MLPanel / AIMLCommandCenter / OrderFlowPanel
redesign.**
