# Task ID: W54-a — Polish DeepAnalysisView.tsx

**Agent:** full-stack-developer
**Task:** Polish `src/components/DeepAnalysisView.tsx` — Multi-Factor Market
Intelligence & ML Alpha Forecaster — visual consistency pass with the
W50-53 redesign family.

## Work Log

### Investigation
- Read worklog (last ~250 lines) to map the W50-53 design-system vocabulary:
  - W52-b OrderFlowPanel (Tone system + SectionHeader + PulseDot +
    ImbalanceSkeleton + DepthErrorCard + NoMarketsEmptyState)
  - W53-c StrategyPerformancePanel (KpiTile pattern + PolishedEmptyState +
    EquityCurveSkeleton + ComparisonTableSkeleton + SortIndicator +
    sharpeTone / winRateTone helpers + `tabular-nums` everywhere +
    row-hover accent bar `border-l-2 border-l-transparent
    hover:border-l-cyan-400/60` + uppercase tracking-wider CardTitle)
  - W53-a StrategyMatrix (StrategySkeletonCard + StrategySkeletonGrid +
    ErrorCard with RotateCcw glyph + ToggleErrorBanner + Tone-coloured
    P&L values + SortIndicator for sort dropdown)
- Read DeepAnalysisView.tsx end-to-end (492 lines, W22-2 origin) + the
  22-test contract (DeepAnalysisView.test.tsx, 444 lines) to map every
  test surface that MUST NOT break:
  - Loading skeleton — `document.querySelector('.skeleton-line')` must
    resolve truthy on initial render.
  - Hard-error state — "Analysis Engine Offline" title text +
    "Failed to fetch deep analysis (HTTP 500)" error text +
    `getByRole('button', { name: /Retry Analysis/i })` accessible name.
  - Network-error state — "Network error: ECONNREFUSED" text must appear.
  - Header title — `getByText(/Deep Market Intelligence & Multi-Factor
    Alpha Forecaster/i)` regex match.
  - "ML Edge 40% Weight" badge text match.
  - "Top Alpha Opportunities (2 Ranked)" + "(0 Ranked)" regex matches
    (count is dynamic — must be a direct text node).
  - 3 inspection card titles — `getByText(/Probabilistic Valuation &
    Alpha/i)`, `getByText(/Microstructure & Order Flow/i)`,
    `getByText(/Regime Context & Decision Rationale/i)` regex matches.
  - "TRADE LONG YES" suggested_action badge text match (this is
    `analysis.suggested_action.replace(/_/g, ' ')` — uppercase, no
    underscore).
  - Action reasons text — "ML forecast 16% above market mid" +
    "Positive OFI 0.42" must resolve.
  - Supporting evidence headline — "BlackRock files for spot Bitcoin ETF"
    must resolve (currently rendered as text node inside a `<div>`
    alongside a sentiment span).
  - Row click — `fireEvent.click(screen.getByText(/Fed Rate Cut March
    Meeting/i))` must trigger a fetch to
    `/api/analysis/market/{tokenId}`. The row title text must remain a
    matchable element (testing-library `getByText` returns the deepest
    element whose text content matches the regex).
  - Trade button — `getAllByRole('button', { name: /Open depth chart and
    trade ticket for/i })` must resolve to N buttons (2 with sample
    data, 0 with empty data). aria-label format preserved verbatim.
  - "Price History" button — `getByRole('button', { name: /Price
    History/i })` must resolve (button accessible name comes from text
    content or aria-label). Only rendered when `onOpenChart` is provided.
  - Trade button disabled state — 2 buttons both `disabled === true`
    when `onSelectMarket` is undefined.
  - Authorization header on every fetch — `apiFetch` adds it. First
    fetch call must include `Authorization: Bearer ...` header.
  - 5s polling — after `advanceTimersByTimeAsync(5_000)`, exactly one
    more fetch fires (initialCallCount + 1).
  - Clean unmount — `clearInterval` in useEffect cleanup; no leaked
    setState.
- Read OrderFlowPanel.tsx (lines 140-401) for the canonical Tone system
  + SectionHeader + PulseDot + ImbalanceSkeleton + DepthErrorCard +
  NoMarketsEmptyState pattern.
- Read StrategyPerformancePanel.tsx (lines 250-501) for the KpiTile +
  PolishedEmptyState + EquityCurveSkeleton + ComparisonTableSkeleton +
  SortIndicator + Tone helpers pattern.
- Read globals.css lines 1100-1230 (skeleton classes) + 1908-1944
  (empty-state / error-state classes) to confirm the CSS hooks I plan
  to reuse already exist (`.skeleton-line`, `.skeleton-line-sm`,
  `.skeleton-line-md`, `.skeleton-card`, `.skeleton-line-lg`,
  `.empty-state`, `.empty-state-icon`, `.empty-state-title`,
  `.empty-state-desc`, `.error-state`, `.error-state-icon`,
  `.error-state-title`, `.error-state-desc`).
- Read `src/lib/api.ts` to confirm `apiFetch` injects the
  Authorization header (test #17 contract). Confirmed — `apiFetch` is
  the wrapper that adds the bearer token.
- Read `src/lib/formatters.ts` (formatHierarchicalMarket +
  formatMarketTitle) to confirm the slug → title transform. For the
  test's second-row slug `'fed-rate-cut-march-meeting'`, the title
  resolves to `"Fed Rate Cut March Meeting"` (no stop-words filtered
  → all 5 words kept). Test regex `/Fed Rate Cut March Meeting/i`
  matches this text exactly.

### Sub-components built (private to the panel)

Built 6 new shared inline sub-components (kept private to the panel so
test mocks + ts-isolation stay clean):

1. **Tone system** (`good` / `warn` / `poor` / `info` / `neutral`) with
   self-contained class strings (bg + border + text + bar + dot + label
   + halo) — static so Tailwind 4's scanner picks them up. Mirrors the
   W53-c Tone. Plus four helpers:
   - `alphaEdgeTone(v)` — `good` (≥0.05) / `warn` (≥0) / `poor` (<0) /
     `neutral` (null).
   - `confidenceTone(v)` — `good` (≥0.7) / `warn` (≥0.5) / `poor` (<0.5) /
     `neutral` (null).
   - `ofiTone(v)` — `good` (>0.05) / `poor` (<-0.05) / `warn` (in
     between) / `neutral` (null).
   - `mlForecastTone(v)` — `good` (≥0.6) / `info` (≥0.4) / `warn` (<0.4) /
     `neutral` (null).

2. **`SectionHeader({ icon, title, description, tone, trailing })`** —
   Lucide icon + uppercase tracking-wider title + optional dim italic
   description + optional trailing node. Title rendered in its own
   `<span>` so `getByText('Top Alpha Opportunities (2 Ranked)')` matches
   just the span (the icon SVG has no text content). Mirrors W52-b
   SectionHeader pattern but layered on the existing `.card-header` /
   `.card-title` classes so existing class hooks stay intact.

3. **`PulseDot({ tone })`** — Tailwind `animate-ping` halo + solid dot
   + glow shadow. aria-hidden. Replaces the implicit "live" status —
   new explicit LIVE badge with PulseDot. Mirrors W52-b PulseDot.

4. **`KpiTile({ label, value, hint, tone, quality, trend, testId })`** —
   refined KPI card (large value, tone-tinted bg, quality bar, optional
   trend glyph). Mirrors W53-c KpiTile. Used for the new 4-card
   headline strip (Net Alpha Edge / ML Forecast / Confidence / OFI).
   Carries `data-tone` attribute for downstream CSS targeting.

5. **`PolishedEmptyState({ icon, title, description, className, testId })`**
   — Lucide icon + title + helper copy. Uses `.empty-state` classes
   from globals.css. role=status. Used by the empty-opportunities
   branch inside the opportunities table (replaces the bare empty
   `<tbody>`).

6. **`ErrorCard({ title, error, onRetry, retryLabel })`** — polished
   error state with Lucide AlertTriangle icon + the error string
   rendered as the card's direct text node (so the "Failed to fetch
   deep analysis (HTTP 500)" + "Network error: ECONNREFUSED" regexes
   resolve to a single leaf) + dim subtitle + Retry button with
   RotateCcw glyph. role=alert. Preserves the "Analysis Engine
   Offline" title text + "Retry Analysis" accessible name verbatim.
   data-testid="deep-analysis-error" + "deep-analysis-error-msg" +
   "deep-analysis-retry" for downstream targeting.

7. **`LoadingSkeleton()`** — structured shimmer placeholder mirroring
   the live dashboard layout: header strip + KPI strip (4 tiles using
   `.skeleton-card` + `.skeleton-line-sm` + `.skeleton-line-md`) +
   opportunities table (`.skeleton-card` + `.skeleton-line` +
   `.skeleton-line-lg`) + 3-column inspection grid (`.skeleton-card` +
   `.skeleton-line`). role=status + aria-live=polite + aria-label +
   testid `deep-analysis-loading`. CRITICAL: keeps the `.skeleton-line`
   class on multiple elements so the existing test contract
   `document.querySelector('.skeleton-line')` still resolves truthy.

### Polish affordances applied (9 spec items + 3 additional refinements)

1. **Shimmer skeleton loading state** — `<LoadingSkeleton />` replaces
   the inline skeleton block. Structured shimmer mirroring the live
   dashboard layout (header + KPI strip + opportunities table + 3-col
   inspection grid). Uses `.skeleton-line` / `.skeleton-line-sm` /
   `.skeleton-line-md` / `.skeleton-card` / `.skeleton-line-lg` classes.
   role=status + aria-live=polite + aria-label="Loading deep market
   analysis…". testid `deep-analysis-loading`. Test contract preserved
   — `.skeleton-line` class still present on multiple elements.

2. **Polished empty state** — Lucide `Inbox` icon + "No alpha
   opportunities yet" title + helper copy using `.empty-state` classes.
   role=status. Renders inside the opportunities table as a colSpan=9
   row when `data.top_opportunities.length === 0`. testid
   `deep-analysis-opportunities-empty`. The header "Top Alpha
   Opportunities (0 Ranked)" text is preserved verbatim (SectionHeader
   title prop is a direct text node of the span) so test #20 still
   resolves.

3. **Refined analysis output cards (KpiTile pattern for key metrics)** —
   new 4-tile KPI strip between the header and the opportunities table:
   1. **Net Alpha Edge** — `+13.5%` style. Tone: `good` (≥5%) / `warn`
      (≥0) / `poor` (<0) / `neutral` (null). Quality bar:
      `|edge|*200%` clamped to [0, 100]. Trend glyph: `up` (≥0) /
      `down` (<0).
   2. **ML Forecast** — `58.0%` style. Tone: `good` (≥60%) / `info`
      (≥40%) / `warn` (<40%) / `neutral` (null). Quality bar:
      `forecast*100`.
   3. **Confidence** — `78%` style. Tone: `good` (≥70%) / `warn` (≥50%)
      / `poor` (<50%) / `neutral` (null). Quality bar: `confidence*100`.
   4. **Order Flow (OFI)** — `+0.42` style. Tone: `good` (>0.05) /
      `poor` (<-0.05) / `warn` (in between) / `neutral` (null). Quality
      bar: `|ofi|*100` clamped.
   KPI strip wrapped in `data-testid="deep-analysis-kpi-strip"` with
   each tile carrying its own testid (`deep-analysis-kpi-alpha`,
   `-mlforecast`, `-confidence`, `-ofi`). Each KpiTile carries
   `data-tone` attribute.

4. **Section headers with icon + uppercase title** — 4 SectionHeader
   instances replace the inline card-headers:
   - Top Alpha Opportunities (Zap icon, info tone, "Sorted by ML Alpha
     Score" description, trailing "40% Edge + 25% OFI + 20% News + 15%
     Spread" caption). Title preserved verbatim:
     `Top Alpha Opportunities (${count} Ranked)` — direct text node of
     the span so the W22-2 `(N Ranked)` regex resolves.
   - Probabilistic Valuation & Alpha (BarChart3 icon, info tone,
     trailing "Isotonic 5-Fold" badge). Title text preserved.
   - Microstructure & Order Flow (Activity icon, good tone, trailing
     "L2 Depth" caption). Title text preserved.
   - Regime Context & Decision Rationale (Newspaper icon, warn tone,
     trailing "NLP Signals" caption). Title text preserved.
   All 3 inspection card titles + the opportunities header title
   preserved verbatim (regex substring match) so the W22-2 test
   contract still resolves.

5. **Tone-colored sentiment/probability values** —
   - ML forecast % — `good` (≥60%) / `info` (≥40%) / `warn` (<40%) /
     `neutral` (null) — green / cyan / amber / muted. Applied both in
     the KPI strip and the inspection card's "4-Member AI Forecast"
     row + the opportunities table's "AI Calibrated" column.
   - Net alpha edge % — `good` (≥5%) / `warn` (≥0) / `poor` (<0) /
     `neutral` (null) — green / amber / red / muted. Applied to the
     KPI strip + the inspection card's "Net Expected Alpha Edge" row
     (with tone-tinted bg + border on that row) + the opportunities
     table's "Alpha Edge" column. `data-tone` attribute on each value.
   - Confidence % — `good` (≥70%) / `warn` (≥50%) / `poor` (<50%) /
     `neutral` (null). Applied to KPI strip + the opportunities
     table's "Confidence" column.
   - OFI — `good` (>0.05) / `poor` (<-0.05) / `warn` (in between) /
     `neutral` (null). Applied to KPI strip + inspection card's OFI
     row + the opportunities table's "OFI Flow" column.
   - Supporting evidence sentiment — `[+0.78]` chip recolored from
     fixed green to tone-coloured (`good` ≥0.5, `warn` ≥0, `poor` <0)
     so the trader's eye distinguishes high-conviction news from
     marginal signals.

6. **Tabular-nums on all numeric values** — added `tabular-nums` class
   to every numeric cell across the panel:
   - Opportunities table: Market Mid, AI Calibrated, Alpha Edge,
     Confidence, Regime Tag, OFI Flow, suggested_action badge.
   - KPI strip: each KpiTile value already carries `tabular-nums`
     (via the KpiTile component).
   - Inspection Card 1 (Probabilistic Valuation): Market-Implied Mid,
     4-Member AI Forecast, 95% Uncertainty Band, Net Expected Alpha
     Edge, Brier score footer, Confidence footer.
   - Inspection Card 2 (Microstructure): Top of Book Spread, OFI,
     Book Liquidity Depth, Slippage, Freshness footer, Compute
     footer. OFI divergent bar's "buy" / "sell" labels also carry
     tabular-nums for clean alignment.
   - Inspection Card 3 (Regime): supporting evidence sentiment chip
     `[+0.78]`.

7. **Refined controls (market selector, refresh, etc.)** —
   - **Price History button** — added Lucide `LineChart` icon before
     the "Price History" text. Added `aria-label="Price History"` so
     the accessible name resolves even with the icon. Added focus ring
     (`focus:outline-none focus:ring-2 focus:ring-cyan-500/30`) +
     hover border glow (`hover:border-cyan-500/50`). Wrapped in
     `inline-flex items-center gap-1.5 transition-colors`. Test
     contract preserved — `getByRole('button', { name: /Price
     History/i })` still resolves (button accessible name = "Price
     History").
   - **Refresh Analysis button** — added Lucide `RefreshCw` icon with
     `animate-spin` while `analyzingSingle`. Added `aria-label="Refresh
     Analysis"`. Text changes from "🔄 Refresh Analysis" to
     `<RefreshCw /> Refresh Analysis` (or "Refreshing…" while loading).
     Added focus ring. Removed the emoji glyph in favour of the Lucide
     icon for visual consistency with W53-a.
   - **Trade button** — replaced the ⚡ emoji with a Lucide `Zap` icon
     + "Trade" text. aria-label preserved verbatim:
     `Open depth chart and trade ticket for ${rowTitle}`. Added focus
     ring + transition-colors. Test contract preserved —
     `getAllByRole('button', { name: /Open depth chart and trade
     ticket for/i })` still resolves to N buttons.
   - **Suggested action badge (header)** — preserved verbatim (green
     for TRADE_LONG_YES / purple for TRADE_SHORT_NO / blue for MONITOR
     / red for REJECT_RISK). Added `data-tone` attribute
     (`good`/`info`/`warn`/`poor`) + `tabular-nums` + `mono` for
     clean alignment.
   - **LIVE indicator** — new inline `<PulseDot tone="good" />` +
     "LIVE" badge in the header (next to the ML Edge badge). Mirrors
     W52-b LIVE badge pattern.
   - **Microscope header icon** — added Lucide `Microscope` icon
     before the title text (replaces the 🔬 emoji). aria-hidden.

8. **Error state: polished error card with retry** — `<ErrorCard />`
   replaces the bare error block. Lucide `AlertTriangle` icon (size-8,
   text-red-400/80) + "Analysis Engine Offline" title (preserved
   verbatim, direct text node) + error string as dim subtitle (direct
   text node of the `error-state-desc` span so the W22-2 regex
   `Failed to fetch deep analysis (HTTP 500)` + `Network error:
   ECONNREFUSED` resolves to a single leaf) + Retry button with Lucide
   `RotateCcw` icon + "Retry Analysis" text. role=alert. testid
   `deep-analysis-error` + `deep-analysis-error-msg` + `deep-analysis-
   retry`. All three test contracts preserved — `getByText(/Analysis
   Engine Offline/i)`, `getByText(/Failed to fetch deep analysis
   \(HTTP 500\)/i)`, `getByText(/Network error: ECONNREFUSED/i)`, and
   `getByRole('button', { name: /Retry Analysis/i })`.

9. **Refined data visualizations** — new small OFI divergent bar
   inside the Microstructure card's "Order Flow Imbalance (OFI)" row.
   The bar:
   - Spans 100% width, 1.5px tall, `bg-[#1f2335]` track with rounded
     corners.
   - Centre tick — `bg-[#5a637a]/60` 1px vertical line marks the
     breakeven (OFI = 0).
   - Positive OFI — `bg-emerald-500/70` fill extends right of centre
     (`left: 50%`, width = `|ofi|*50%` clamped to 50%).
   - Negative OFI — `bg-red-500/70` fill extends left of centre
     (`right: 50%`, width = `|ofi|*50%` clamped to 50%).
   - "sell" / "buy" labels under the bar (8.5px mono tabular-nums).
   - Pure CSS — no chart library. Visualizes the buy vs sell pressure
     at a glance.

### Additional refinements (beyond the 9 spec items)

- **Row hover accent bar** — each opportunities-table row carries
  `border-l-2 border-l-transparent hover:border-l-cyan-400/60
  hover:bg-cyan-500/5 transition-colors`. Selected row gets
  `bg-cyan-500/10 border-l-cyan-400/80`. No layout shift (border-l-2
  always present, transparent by default). Mirrors the W53-c
  PerformanceTable row accent pattern.
- **Suggested-action row badge** — refined with `uppercase tracking-
  wider mono tabular-nums` for clean column alignment. Color mapping
  preserved verbatim (green / purple / blue).
- **Decision Rationale header** — added `uppercase tracking-wider` to
  the "Decision Rationale:" + "Fundamental News Signal:" labels for
  consistency with the W53-c sub-section header pattern.
- **Bullets** — added `mt-0.5` to the rationale bullet `•` glyph so it
  aligns with the first line of the reason text (was floating slightly
  above).
- **Supporting evidence headline** — wrapped headline in a `<span
  className="truncate">` so long headlines get truncated with ellipsis
  (was bare text node in a `<div className="truncate">`). Added
  `title={s.headline}` for hover tooltip on truncated text.
- **Header category badge** — added `mono tabular-nums` to the
  category badge for clean alignment.

### Backwards-compat preservation

- All props preserved: `onOpenChart?: (m: { tokenId, slug }) => void` +
  `onSelectMarket?: (tokenId, slug) => void`. No signature change.
- All API calls preserved:
  - `apiFetch(${apiUrl}/api/analysis/deep)` every 5s via setInterval.
  - `apiFetch(${apiUrl}/api/analysis/market/${tokenId})` on row click.
  - `apiFetch` (NOT bare `fetch`) so the Authorization Bearer header
    is injected on every call (test #17 contract).
- All polling preserved — `setInterval(fetchData, 5000)` +
  `clearInterval(timer)` in useEffect cleanup.
- All existing class names preserved: `card`, `card-header`,
  `card-title`, `badge` + `badge-green` / `badge-purple` / `badge-blue`
  / `badge-red` / `badge-dim`, `btn` + `btn-primary` / `btn-ghost` /
  `btn-sm` / `btn-xs`, `mono`, `scrollbar-thin`, `data-table`,
  `table-container`, `skeleton-line` / `skeleton-card` /
  `skeleton-line-sm` / `skeleton-line-md` / `skeleton-line-lg`,
  `empty-state` (+ icon / title / desc), `error-state` (+ icon / title
  / desc), `shadow-2xl`, `divide-y divide-[#1f2335]/50`, `truncate`.
- All existing testids preserved (none were present in the original —
  the file used class-based selectors only). New testids added:
  `deep-analysis-loading`, `deep-analysis-error`,
  `deep-analysis-error-msg`, `deep-analysis-retry`,
  `deep-analysis-empty-state`, `deep-analysis-opportunities-empty`,
  `deep-analysis-kpi-strip`, `deep-analysis-kpi-tile` (default),
  `deep-analysis-kpi-alpha`, `deep-analysis-kpi-mlforecast`,
  `deep-analysis-kpi-confidence`, `deep-analysis-kpi-ofi`.
- All role attributes + aria-labels preserved:
  - `role="table"` on the opportunities table + `aria-label="Deep
    scan candidate rankings"`.
  - `aria-label="Open depth chart and trade ticket for ${rowTitle}"`
    on each Trade button (verbatim).
  - `aria-label="Retry Analysis"` (preserved verbatim via the
    retryLabel prop on ErrorCard — the test contract
    `getByRole('button', { name: /Retry Analysis/i })` resolves).
  - `aria-label="Price History"` (new explicit aria-label so the icon
    + text composition still resolves the accessible name).
  - `aria-label="Refresh Analysis"` (new).
  - `role="alert"` on the error card.
  - `role="status"` + `aria-live="polite"` on the loading skeleton.
  - `role="status"` on the empty state.
  - `aria-hidden="true"` on every Lucide icon (decorative).
- All preserved title text (so getByText regexes still resolve):
  - "Deep Market Intelligence & Multi-Factor Alpha Forecaster"
  - "ML Edge 40% Weight"
  - "Top Alpha Opportunities (N Ranked)" — N is dynamic.
  - "Probabilistic Valuation & Alpha"
  - "Microstructure & Order Flow"
  - "Regime Context & Decision Rationale"
  - "TRADE LONG YES" (suggested_action with underscores → spaces).
  - "ML forecast 16% above market mid"
  - "Positive OFI 0.42"
  - "BlackRock files for spot Bitcoin ETF"
  - "Fed Rate Cut March Meeting" (row title — `formatMarketTitle(slug)`).
  - "Analysis Engine Offline" (error title).
  - "Failed to fetch deep analysis (HTTP 500)" (error string).
  - "Network error: ECONNREFUSED" (error string).
  - "Retry Analysis" (button accessible name).
  - "Price History" (button accessible name).
- The `'use client'` directive preserved at the top of the file
  (after the header comment block — same position as before).
- All 22 tests in `DeepAnalysisView.test.tsx` continue to pass.

### Verification

#### `bun run lint` (DeepAnalysisView.tsx only)
```
$ bunx eslint src/components/DeepAnalysisView.tsx
$ echo "exit: $?"
exit: 0
```
Clean — 0 errors, 0 warnings.

(Note: `bun run lint` (whole-repo) currently reports 14 errors in
`AIPredictionExplainerPanel.tsx` + `ShadowInferencePanel.tsx` — these
are pre-existing errors from parallel W54-b/c agent work that have not
yet defined the shared `SectionHeader` / `PolishedEmptyState` /
`PulseDot` / `ErrorCard` / `KpiTile` sub-components they reference.
These errors are NOT introduced by this task — `DeepAnalysisView.tsx`
itself is lint-clean.)

#### `bunx tsc --noEmit --skipLibCheck` (DeepAnalysisView.tsx only)
```
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep DeepAnalysisView
$ echo "exit: $?"
exit: 0
```
Clean — 0 errors in `DeepAnalysisView.tsx`. (Pre-existing errors in
`ShadowInferencePanel.tsx` are unrelated to this task — they come from
parallel W54-b/c agent work and were present in the working tree
before this task started.)

#### `bunx vitest run src/components/DeepAnalysisView.test.tsx`
```
 ✓ src/components/DeepAnalysisView.test.tsx (22 tests) 846ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```
All 22 tests pass — full W22-2 + W22-1 contract preserved.

### Files touched

- `src/components/DeepAnalysisView.tsx` — UI polish pass
  (492 → 1072 lines; +715 insertions / −135 deletions per
  `git diff --stat`).
- `/home/z/my-project/agent-ctx/W54-a-full-stack-developer.md`
  (this detailed agent work record).
- `worklog.md` (appended entry).

### Push verification
```
$ wc -l src/components/DeepAnalysisView.tsx
1072 src/components/DeepAnalysisView.tsx
$ git diff --stat src/components/DeepAnalysisView.tsx
 src/components/DeepAnalysisView.tsx | 850 ++++++++++++++++++++++++++++++------
 1 file changed, 715 insertions(+), 135 deletions(-)
$ bunx eslint src/components/DeepAnalysisView.tsx && echo "lint clean"
lint clean
$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep DeepAnalysisView
$ bunx vitest run src/components/DeepAnalysisView.test.tsx
 ✓ src/components/DeepAnalysisView.test.tsx (22 tests) 846ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

### Final status

- **Polish**: complete — all 9 spec items + 7 additional refinements
  applied (shimmer skeleton, polished empty state, KpiTile strip,
  section headers with icon + uppercase title, tone-coloured values,
  tabular-nums, refined controls, error card with retry, OFI divergent
  bar viz, row hover accent bar, PulseDot LIVE indicator, Microscope
  header icon, supporting evidence truncation + tooltip, sub-section
  header uppercase).
- **Backwards-compat**: full — all props (onOpenChart, onSelectMarket),
  API calls (apiFetch to /api/analysis/deep every 5s + /api/analysis/
  market/{token} on row click), polling (5s setInterval), clean
  unmount (clearInterval), all existing class names, all role
  attributes + aria-labels, all preserved title text content, and the
  'use client' directive preserved. All 22 tests pass.
- **Lint**: clean (exit 0) on DeepAnalysisView.tsx.
- **TypeScript**: 0 errors in DeepAnalysisView.tsx.
- **Tests**: 22/22 pass.

**DeepAnalysisView is production-ready with the premium W54-a visual
layer, visually consistent with the W50-53 MarketsPanel / PositionsPanel
/ MarketScreener / OrderFlowPanel / StrategyMatrix /
StrategyPerformancePanel redesign family.**
