# W55-c — full-stack-developer — Polish AttributionPanel.tsx

**Date:** 2026-09-04
**Task ID:** W55-c
**Agent:** full-stack-developer
**Scope:** UI polish pass on `src/components/AttributionPanel.tsx`
(P&L attribution by strategy/market/factor). Additive only —
all existing props, API calls, polling, class names, test contracts,
role attributes, aria-labels preserved.

## Background / investigation
- Read `worklog.md` (last ~400 lines) to map the W50-54 design-system
  vocabulary shared by W53-c StrategyPerformancePanel + W54-a
  DeepAnalysisView + W54-e MLValidationPanel:
  - **Tone system** (`Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'`,
    `TONE: Record<Tone, ToneConfig>` with static `bg` / `border` /
    `text` / `bar` / `dot` / `label` / `halo` class strings so Tailwind
    4's JIT scanner picks them up).
  - **KpiTile** (large value, tone-tinted bg, quality bar, optional
    trend glyph, `data-tone` attribute).
  - **SectionHeader** (Lucide icon + uppercase tracking-wider title +
    optional dim italic description + optional trailing node).
  - **PulseDot** (animated status dot for LIVE indicators).
  - **ShimmerBlock** (thin skeleton placeholder that can be sized via
    className).
  - **PolishedEmptyState** (Lucide icon + title + helper copy,
    role=status).
  - **ErrorCard** (AlertTriangle icon + title + error string + Retry
    button with RotateCcw glyph, role=alert).
  - **LoadingSkeleton** (structured shimmer placeholder mirroring the
    live panel layout, role=status + aria-live=polite).
  - `data-tone="{good|warn|poor|info|neutral}"` attribute hooks on
    every tone-coloured element for downstream CSS targeting.
  - Row hover accent bar via `hover:bg-cyan-500/[0.04]` +
    `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`.
  - `tabular-nums` on every numeric cell.
- Read `src/components/AttributionPanel.tsx` end-to-end (991 lines)
  + the 9-test contract in `src/components/AttributionPanel.test.tsx`:
  - Title "Attribution Analysis" (loading + error + empty states).
  - Title "Performance Attribution" (loaded header).
  - Badge text "7-DIMENSION".
  - Error title "Attribution unavailable".
  - Retry button accessible name `/retry/i` regex.
  - Empty title "No attribution data".
  - Tab labels "Dimensions" / "Waterfall" / "Strategies".
  - Initial fetch URL must contain `/api/attribution` and `range=all`.
  - Loading skeleton shown on first mount before data resolves.
- Verified baseline: 9/9 tests pass pre-polish (vitest 4.1.11, ~1.3s).

## Inline sub-components built (kept private to the panel so test
mocks + ts-isolation stay clean)
- `Tone` + `ToneConfig` + `TONE` — 5-tone vocabulary with self-contained
  static class strings. Mirrors W53-c.
- `PulseDot({ tone = 'good' })` — `animate-ping` halo + solid dot,
  aria-hidden.
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 10px title + optional dim italic 9px
  description + optional trailing node (badge / selector). Title in its
  own `<span>` so RTL `getByText('Performance Attribution')` matches a
  single leaf.
- `KpiTile({ label, value, hint, tone, quality, trend, testId })` —
  tone-tinted bg + uppercase 9px label + large tabular-nums value +
  optional quality bar + optional trend glyph (TrendingUp/Down). Carries
  `data-testid` + `data-tone`.
- `ShimmerBlock({ className })` — thin skeleton placeholder sized via
  className. aria-hidden.
- `PolishedEmptyState({ icon, title, description, className, testId })`
  — Lucide icon + title + dim description. role=status.
- `ErrorCard({ title, error, onRetry })` — AlertTriangle icon + title
  (direct text node) + dim error string + Retry button (RotateCcw
  glyph). role=alert.
- `AttributionSkeleton()` — structured shimmer placeholder mirroring
  the live panel layout (header strip + KPI strip + 7-dimensions list
  + tab strip). role=status + aria-live=polite +
  data-testid="attribution-loading-skeleton".

## Tone helpers
- `pnlTone(v)` — good if >0, poor if <0, neutral if 0/null.
- `coverageTone(v)` — good ≥95, warn ≥80, poor <80.
- `profitFactorTone(v)` — good ≥2, warn ≥1, poor <1.
- `winRateTone(v)` — good ≥0.55, warn ≥0.45, poor <0.45.

## Attribution helpers
- `bestContributor(data)` — scans all 7 dimensions, returns the bucket
  with the highest total_pnl across all dimensions. Powers the
  "Best Contributor" KpiTile.
- `worstContributor(data)` — same, lowest total_pnl. Powers the
  "Worst Contributor" KpiTile.

## State lifecycle
- `dimSort: DimSortKey` (default `'default'`) — NEW state powering the
  sort-by selector in the header. Default preserves the W38-8
  dimensions order so existing tests still pass. Options: Default /
  P&L ↓ / |P&L| ↓. Re-orders the dimensions list in the Dimensions
  tab without changing any data.

## Applied all 9 polish affordances from the W55-c spec
1. **KpiTile pattern for attribution summary** — 4-tile summary strip
   refactored to `KpiTile`:
   - Total P&L (pnlTone) — large value, quality bar, trend glyph.
   - Best Contributor (good tone) — best bucket P&L across all 7
     dimensions, with hint naming the dimension + bucket.
   - Worst Contributor (poor tone) — worst bucket P&L, with hint.
   - Coverage (coverageTone) — coverage %, with hint showing
     reconciliation status (Fully reconciled / Gap) + win rate.
2. **Shimmer skeleton loading state** — bare `<div className="card">`
   with 4 KPI skeletons + 7 dimension skeletons replaced by
   `<AttributionSkeleton/>` which mirrors the live panel layout
   (header strip + KPI strip + 7-dimensions list + tab strip). role=
   status + aria-live=polite.
3. **Polished empty state with Lucide icon + message** — the bare
   `<div className="empty-state">` block replaced by
   `<PolishedEmptyState icon={Inbox} title="No attribution data"
   description="Closed positions will appear here once strategies
   record exits."/>`. Preserves the "No attribution data" title
   exactly. Same treatment for the per-strategy table empty branch
   (Database icon).
4. **Refined attribution table** — Strategies tab table refactored:
   - All 8 column headers get `uppercase tracking-wider text-[10px]
     text-[#5a637a] font-bold`.
   - Every numeric cell carries `tabular-nums`.
   - Tone-coloured P&L values (emerald for positive, red for
     negative, slate for breakeven) on Total P&L / Avg P&L / Win
     Rate / Profit Factor columns. Each cell carries a `data-tone`
     attribute.
   - Each row carries `hover:bg-cyan-500/[0.04]` layered with
     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` so
     hovering a strategy shows a subtle cyan left accent bar (no
     layout shift). Mirrors W53-c PerformanceTable pattern.
5. **Section headers with icon + uppercase title** — each tab content
   area now starts with a `SectionHeader`:
   - Dimensions tab: Layers icon, "Dimension Contribution" title,
     "P&L sliced across 7 orthogonal factors" description, info tone,
     trailing "{N} dimensions".
   - Waterfall tab: TrendingUp icon, "P&L Contribution Waterfall"
     title, "Best bucket per dimension, cumulatively stacked"
     description, info tone, trailing "Best bucket per dimension"
     badge.
   - Strategies tab: Database icon, "Per-Strategy Attribution" title,
     "Closed positions grouped by trading strategy" description,
     info tone, trailing "{N} strategies".
6. **Refined attribution chart/bar visualization** — each dimension's
   contribution bar in the Dimensions tab now uses the Tone system's
   `bar` class (emerald-500 / red-500 / slate-600) instead of the
   fixed `pnlBg` helper, plus a tone-tinted halo shadow
   (`shadow-[0_0_8px] ${cfg.halo}`) so positive vs negative bars read
   at a glance. The expanded per-bucket breakdown bars also use
   Tone colours. The waterfall tab's stacked bar segments likewise
   use Tone colours + halo. The expanded per-bucket "Best/Worst"
   inline summary gets uppercase tracking-wider labels + tone-
   coloured bucket names + tabular-nums values.
7. **Tone-colored values** — green positive / red negative / muted
   breakeven applied to:
   - KPI strip (Total P&L / Best / Worst / Coverage).
   - Dimensions tab: each dimension's P&L value + %, each bucket's
     P&L value, each row's hover state.
   - Waterfall tab: each row's P&L delta + cumulative total.
   - Strategies table: Total P&L / Avg P&L / Win Rate / Profit Factor
     columns.
   Each cell carries `data-tone` for downstream CSS targeting.
8. **Error state: polished error card with retry** — `<ErrorCard />`
   replaces the bare `error-state` block. Lucide AlertTriangle icon
   (size-8, text-red-400/80) + "Attribution unavailable" title
   (preserved verbatim, direct text node of `error-state-title`
   span) + error string as dim subtitle (direct text node of
   `error-state-desc` span so the test contract resolves to a
   single leaf) + Retry button with Lucide RotateCcw icon + "Retry"
   text. role=alert. testid `attribution-error` + `attribution-error-
   msg` + `attribution-retry`.
9. **Refined controls** — Time range selector gets an explicit
   `aria-label="Attribution time range"` + `focus-visible:ring-1
   focus-visible:ring-cyan-400/40` ring. NEW Sort-by selector
   (3 options: Default / P&L ↓ / |P&L| ↓) lets the trader re-order
   the 7 dimensions in the Dimensions tab without changing data.
   Default preserves W38-8 order so existing tests still pass.
   Refresh button keeps RefreshCw spin animation + freshness label
   (now tabular-nums).

## Additional refinements (beyond the 9 spec items)
- **LIVE indicator badge** — new PulseDot (good tone) + "LIVE" text
  badge in the header next to the 7-DIMENSION badge. Mirrors W54-a /
  W53-c PulseDot pattern.
- **Reconciliation hint** — Coverage KpiTile hint now surfaces the
  engine's 100%-attribution design invariant: "Fully reconciled ·
  Win {rate}" when |residual| < 0.01, "Gap {residual} · Win {rate}"
  otherwise. The `residual` variable remains referenced (previously
  surfaced via a dedicated 4th KPI tile).
- **Dimension row hover border** — each dimension's kpi-card wrapper
  carries `hover:border-[#2a3050]` so the row's border lightens on
  hover (subtle visual cue before expansion).
- **Focus-visible ring on dimension toggle** — the dimension toggle
  button gets `focus-visible:outline-none focus-visible:ring-1
  focus-visible:ring-inset focus-visible:ring-cyan-400/40` so
  keyboard users see the active dimension.
- **Best/Worst inline summary in expanded view** — the expanded
  per-bucket breakdown now leads with an uppercase "BEST" / "WORST"
  label pair (instead of "Best:" / "Worst:" sentence) for tighter
  visual hierarchy + tone-coloured bucket names + tabular-nums
  values.
- **Header comment block** updated with a new "W55-c — Final UI polish
  pass" section documenting each polish affordance + the constraint
  that existing class names + testids + role attributes + aria-labels
  + API calls + the 'use client' directive are preserved.

## Backwards-compat
- **Props**: unchanged (panel takes no props).
- **API calls**: `apiFetch(\`/api/attribution?range=${timeRange}\`)` on
  mount + every 30s + on visibilitychange regain. Default `range=all`.
  Preserved verbatim.
- **Polling**: 30s setInterval with visibilitychange pause/resume +
  immediate refresh on regain. Preserved verbatim.
- **Clean unmount**: clearInterval + removeEventListener in useEffect
  cleanup. Preserved verbatim.
- **Class names preserved**: `card`, `card-header`, `card-title`,
  `badge` + `badge-cyan` / `-blue` / `-purple` / `-amber` / `-green` /
  `-dim`, `btn` + `btn-ghost` + `btn-sm`, `mono`, `scrollbar-thin`,
  `data-table`, `table-container`, `table-footer`, `label-col`,
  `empty-state` (+ `-icon` / `-title` / `-desc`), `error-state` (+
  `-icon` / `-title` / `-desc`), `skeleton` / `skeleton-line` /
  `skeleton-line-sm` / `skeleton-line-md` / `skeleton-line-lg` /
  `skeleton-card`, `kpi-card` (+ `kpi-label` / `kpi-value` / `kpi-sub`),
  `banner-warning`, `spinner`, `tabular-nums`.
- **Accessibility preserved**: role=table + aria-label="Per-strategy
  attribution breakdown" on the strategies table, aria-label="Refresh
  attribution" on the refresh button, aria-label="Attribution time
  range" on the time-range selector, aria-label="Retry attribution
  fetch" on the retry button, role=alert on the error card, role=status
  on the loading skeleton + empty state, role=region + aria-label on
  each dimension card, aria-expanded + aria-controls on each dimension
  toggle button, aria-hidden on every Lucide icon.
- **Test-matched strings preserved verbatim**: "Attribution Analysis"
  (loading + error + empty state header), "Performance Attribution"
  (loaded header), "7-DIMENSION" (badge), "Attribution unavailable"
  (error title), "Retry" (retry button text), "No attribution data"
  (empty title), "Dimensions" / "Waterfall" / "Strategies" (tab labels).
- **'use client' directive**: preserved.

## New CSS hooks added (for downstream CSS layer to target)
- `data-testid="attribution-loading-skeleton"` on the loading wrapper.
- `data-testid="attribution-error"` on the error card (+ `-msg` on the
  message span, `-retry` on the retry button).
- `data-testid="attribution-empty-state"` on the empty state.
- `data-testid="attribution-strategies-empty"` on the strategies-table
  empty state row.
- `data-testid="attribution-kpi-tile"` default on KpiTile +
  `attribution-kpi-{total|best|worst|coverage}` on each summary tile +
  `-value` suffix on the value span.
- `data-tone="{good|warn|poor|info|neutral}"` on:
  - each KpiTile wrapper,
  - each dimension's kpi-card wrapper,
  - each waterfall row's wrapper,
  - each strategies-table row (`<tr>`),
  - each expanded per-bucket P&L value cell,
  - each strategies-table P&L / Win Rate / Profit Factor cell.

## Stage Summary
- **Final line count**: 1416 lines (was 991 — +635 insertions / −210
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving all existing
  functionality, class names, test contracts, client component, API
  calls, polling, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive.
- **Verification — `bun run lint`**: clean (exit 0, no output).
- **Verification — `bunx tsc --noEmit --skipLibCheck`**: 0 errors in
  AttributionPanel.tsx (3 pre-existing errors in BacktestLabView.tsx
  are unrelated to this task — they were present in the working tree
  before this task started).
- **Verification — `bunx vitest run src/components/AttributionPanel.test.tsx`**:
  9/9 tests pass in ~580ms. Confirms the full W38-8 test contract is
  preserved.

## Files touched
- `src/components/AttributionPanel.tsx` (UI polish pass, 991 → 1416
  lines, +635 / −210 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W55-c-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended entry below).

## Push verification
```
$ wc -l src/components/AttributionPanel.tsx
1416 src/components/AttributionPanel.tsx
$ git diff --stat src/components/AttributionPanel.tsx
 src/components/AttributionPanel.tsx | 845 +++++++++++++++++++++++++++---------
 1 file changed, 635 insertions(+), 210 deletions(-)
$ bunx eslint src/components/AttributionPanel.tsx && echo "lint clean"
lint clean
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep AttributionPanel
$ bunx vitest run src/components/AttributionPanel.test.tsx
 ✓ src/components/AttributionPanel.test.tsx (9 tests) 578ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

## Final status
- **Polish**: complete — all 9 spec items + 5 additional refinements
  applied (LIVE indicator badge, reconciliation hint, dimension row
  hover border, focus-visible ring on dimension toggle, Best/Worst
  inline summary uppercase labels).
- **Backwards-compat**: full — all props, API calls, polling, class
  names, testids, role attributes, aria-labels, preserved title text
  content, and the 'use client' directive preserved. All 9 tests pass.
- **Lint**: clean (exit 0) on AttributionPanel.tsx.
- **TypeScript**: 0 errors in AttributionPanel.tsx.
- **Tests**: 9/9 pass.

**AttributionPanel is production-ready with the premium W55-c visual
layer, visually consistent with the W53-c StrategyPerformancePanel /
W54-a DeepAnalysisView / W54-e MLValidationPanel redesign family.**
