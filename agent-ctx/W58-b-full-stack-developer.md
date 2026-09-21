# W58-b — Polish `src/components/ClosedPositionsPanel.tsx` + `src/components/PerformanceReportPanel.tsx` (premium visual layer)

**Task ID:** W58-b
**Agent:** full-stack-developer (Z.ai Code)
**Target files:**
- `src/components/ClosedPositionsPanel.tsx` — Closed Positions Ledger (W8-4 origin)
- `src/components/PerformanceReportPanel.tsx` — Honest Performance Report (W26-2 origin)

**Consulted:** worklog W50-57 design-system entries (Tone system, KpiTile,
SectionHeader, ShimmerBlock, PulseDot, PolishedEmptyState, PolishedErrorCard,
premium shadows, glassmorphism, tone-coloured rows — from W50-2b Sidebar,
W50-2d CommandCenterDashboard, W51-2d MLPanel, W53-c StrategyPerformancePanel,
W54-e MLValidationPanel, W55-a LeaderboardPanel, W55-d ExecutionQualityPanel,
W56-a SystemHealthView, W56-c DatabaseStatusPanel, W56-e ObservabilityPanel,
W57-a RetentionPanel, W57-b DecisionLedgerPanel, W57-c LiveSafetyGatePanel,
W57-d AuditLogPanel + RateLimitPanel, W57-e CapitalAllocatorPanel, W58-d
CommandPalette + SettingsModal).

**Prior test contracts:**
- `src/components/ClosedPositionsPanel.test.tsx` (W38-8, 8 tests covering:
  renders without crashing, "📕 Closed Positions Ledger" header text,
  `/CLOSED POSITIONS LEDGER/` regex, "Realized P&L Journal" subtitle badge,
  loading skeleton before data arrives, "Failed to load closed positions"
  error on not-ok fetch + on thrown fetch, Retry button accessible name
  `/retry/i`, "No closed positions" empty-state message, fetches
  `/api/positions/closed?limit=500` + `/api/positions/closed/stats` on mount).
- `src/components/PerformanceReportPanel.test.tsx` (W26-2, 19 tests covering:
  panel header + disclaimer banner rendered while loading, four category tabs,
  12 metric cards per category `[data-card-type="metric"]` count, "⟳ 30s"
  auto-refresh badge, win-rate 95% CI `[X%, Y%]` text, CI range bar element,
  no CI range bar when bounds are null, tab switching updates metric grid,
  unavailable category shows unavailable message + reason, equity-curve
  container when category supplies `equity_curve` data, disclaimer text
  `does NOT guarantee future results` + `Only paper/live metrics reflect
  actual system behavior` + `Win rate target (95%) is aspirational`, fallback
  disclaimer when response is malformed, error badge on fetch fail +
  on fetch throw, auto-refresh fires on configured interval, pauses when
  document hidden + resumes on visibilitychange, cleans up interval on
  unmount, fetches `/api/performance/report?XTransformPort=8080` via the
  gateway, injects Authorization header `Bearer …`).

## Goal

Apply (and finalize) the W50-57 premium visual layer to both the
ClosedPositionsPanel and the PerformanceReportPanel for visual consistency
with the W51-2d MLPanel / W53-c StrategyPerformancePanel / W54-e
MLValidationPanel / W55-a LeaderboardPanel / W55-d ExecutionQualityPanel /
W56-a SystemHealthView / W56-c DatabaseStatusPanel / W56-e ObservabilityPanel
/ W57-a RetentionPanel / W57-b DecisionLedgerPanel / W57-c LiveSafetyGatePanel
/ W57-d AuditLogPanel + RateLimitPanel / W57-e CapitalAllocatorPanel redesign
family. Preserve every existing test contract (8 + 19), all existing class
names, all existing aria-labels / data-testids / role attributes, the
`'use client'` directive, the polling cadence (30s, visibility-aware), the
`apiFetch` calls, the CSV export flow, the row-expansion behaviour, the
category-tabs behaviour, and the legacy-shape coercion behaviour.

## Background / investigation

- Read `worklog.md` (last ~150 lines) to map the W50-57 design-system
  vocabulary shared by the W57-a RetentionPanel + W57-b DecisionLedgerPanel +
  W57-e CapitalAllocatorPanel + W58-d CommandPalette/SettingsModal redesign
  family.
- Read `src/components/ClosedPositionsPanel.tsx` end-to-end (1360 lines
  pre-polish — the W58-b Tone system + sub-components + KpiTile KPI strip +
  PolishedEmptyState + PolishedErrorCard + ClosedPositionsSkeleton + refined
  table with SortIndicator + tone-coloured row-hover accent were already in
  place from a prior in-flight W58-b pass; this pass finalises the polish).
- Read `src/components/PerformanceReportPanel.tsx` end-to-end (1138 lines
  pre-polish — the W58-b Tone system + sub-components + KpiTile headline
  strip + PolishedEmptyState + PolishedErrorCard + PerformanceReportSkeleton
  + prominent disclaimer banner + tone-coloured MetricCard + SectionHeader
  above the metric grid + SectionHeader above the equity curve were already
  in place; this pass finalises the polish).
- Read both test contracts end-to-end to map every test surface — the
  preserved-verbatim strings, the preserved testids, the preserved role
  attributes, the preserved accessible names.
- Verified baseline:
  - `bunx tsc --noEmit --skipLibCheck` surfaced 2 pre-existing TS6133
    unused-import errors in `PerformanceReportPanel.tsx` (`Timer` and
    `Percent` Lucide icons were imported but never rendered — leftover
    from the prior in-flight W58-b pass before the KpiTile pattern was
    finalised with `Gauge` + `Clock` + `DollarSign` + `Activity` instead).
  - `bun run lint` was already clean (exit 0, no output).
  - 27/27 tests pass pre-polish (8 ClosedPositionsPanel + 19
    PerformanceReportPanel — one React key warning during the "renders
    the 📕 Closed Positions Ledger header once data loads" test from the
    bare `<>` fragment wrapping the row + expanded-row pair returned by
    `filtered.map(...)` — pre-existing, harmless, but worth fixing as part
    of the polish pass).

## Changes applied

### PerformanceReportPanel.tsx — fix unused imports

Removed the two unused Lucide icon imports that were leftover from the
prior in-flight W58-b pass before the KpiTile headline strip was finalised
with `Gauge` (Sharpe) + `Clock` (PolishedEmptyState unavailable) +
`DollarSign` (Total Return KpiTile) + `Activity` (Expectancy KpiTile +
header PulseDot companion) instead:

```diff
 import {
   ShieldAlert,
   AlertTriangle,
   RefreshCw,
   TrendingUp,
   TrendingDown,
   Target,
   Activity,
   Gauge,
-  Timer,
   Clock,
   DollarSign,
-  Percent,
   BarChart3,
   type LucideIcon,
 } from 'lucide-react'
```

This resolves both TS6133 errors (`'Timer' is declared but its value is
never read` + `'Percent' is declared but its value is never read`) and
brings `bunx tsc --noEmit --skipLibCheck` to 0 errors in
PerformanceReportPanel.tsx. No behaviour change — both icons were unused,
so removing them doesn't affect the rendered output.

### ClosedPositionsPanel.tsx — fix React key warning

Replaced the bare `<>` fragment wrapping the row + optional expanded-row
pair returned by `filtered.map((p) => …)` with a keyed `<Fragment>` so React
stops emitting the "Each child in a list should have a unique key prop"
warning during the "renders the 📕 Closed Positions Ledger header once data
loads" test (and during normal browsing when the trader expands a row).

```diff
+import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
-import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
…
               return (
-                <>
+                <Fragment key={p.position_id}>
                   <tr
-                    key={p.position_id}
                     className={`hover:bg-cyan-500/[0.04] transition-colors group cursor-pointer ${TONE[pnlTone(p.pnl)].rowHover}`}
                     onClick={() => setExpandedId(isExpanded ? null : p.position_id)}
                   >
                     …
                   </tr>
                   {isExpanded && (
                     <tr key={`${p.position_id}-detail`} className="bg-[#0e1015]/60">
                       …
                     </tr>
                   )}
-                </>
+                </Fragment>
               )
```

The `key` is now on the outermost iterated element (`<Fragment key={…}>`),
which is what React actually inspects. The inner `<tr key={`${p.position_id}-detail`}>`
keeps its own key for clarity (harmless — React ignores keys on non-iterated
children, but the explicit `key={\`${p.position_id}-detail\}`}` documents the
intent and would matter if the inner list ever grew). No behaviour change
— the table still renders identically, the row expansion still works, and
the test contract (`getByText(/CLOSED POSITIONS LEDGER/)`,
`getByText('Realized P&L Journal')`, etc.) all still resolve.

## Pre-existing polish already in place (verified, not re-applied)

The bulk of the W58-b premium visual layer was already in place from a prior
in-flight W58-b pass. This pass finalises it by resolving the two tsc errors
+ the React key warning so the panel is production-ready. The pre-existing
polish (confirmed during the read-through) is:

### ClosedPositionsPanel.tsx — pre-existing W58-b polish

- **Tone system** — `Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'`
  + `ToneConfig` + `TONE: Record<Tone, ToneConfig>` with self-contained
  static Tailwind class strings (bg / border / text / bar / dot / label /
  halo / rowHover). Mirrors the W51-2d MLPanel / W57-a RetentionPanel /
  W57-b DecisionLedgerPanel / W57-e CapitalAllocatorPanel TONE map.
- **`pnlTone(pnl)` helper** — positive → good (emerald), negative → poor
  (red), zero → neutral. Drives the row-hover accent bar (`TONE[pnlTone(p.pnl)].rowHover`).
- **`PulseDot({ tone, pulse })`** — `animate-ping` halo + solid dot +
  glow shadow, aria-hidden. Used by the panel header (info tone, pulses
  while live) + the error card (poor tone, static — pulse=false).
- **`SectionHeader({ icon, title, description, tone, trailing })`** — Lucide
  icon + uppercase tracking-wider 10px title + optional dim italic
  description + optional trailing node. Title in its own `<span>` so RTL's
  `getByText(...)` matches just the span (preserves the W38-8 test
  contract `/CLOSED POSITIONS LEDGER/`). Used by the Filters section.
- **`KpiTile({ label, value, hint, tone, icon, quality, trend, testId })`**
  — tone-tinted bg + uppercase 9px kpi-label with Lucide icon + 16px
  tabular-nums kpi-value + optional kpi-sub + optional quality bar +
  optional trend glyph. Used by the 6-tile KPI summary strip (Total
  Realized / Win Rate / Avg Win / Avg Loss / Profit Factor / Avg Hold).
  Each tile carries `data-testid` + `data-tone`.
- **`ShimmerBlock({ className })`** — thin `skeleton-line-sm` placeholder,
  aria-hidden. Used throughout `ClosedPositionsSkeleton`.
- **`SortIndicator({ active, direction })`** — chevron pair showing the
  current sort column + direction. Used by the Size / P&L / Hold / Closed
  At column headers (clickable sort buttons).
- **`PolishedEmptyState({ icon, title, description, testId })`** — Lucide
  `Archive` icon (size 32, strokeWidth 1.5, dim `text-[#3e4560]`) +
  `.empty-state-title` + `.empty-state-desc`. role=status +
  data-testid="closed-positions-empty-state". Replaces the bare "No closed
  positions" message. Used by the empty-filtered-list branch (preserves the
  W38-8 test contract `getByText('No closed positions')`).
- **`PolishedErrorCard({ message, onRetry })`** — red-tinted card
  (border-red-500/30 + bg-red-500/[0.06]) with `AlertTriangle` icon (28px,
  red-tinted) + the title "Failed to load closed positions" (preserved
  verbatim as the direct text node of a leaf `<span>` so the W38-8 test
  contract `getByText('Failed to load closed positions')` resolves) +
  the wrapped error string + a Retry button (`RefreshCw` glyph, calls
  `onRetry` = `fetchData()`, accessible name "Retry" matching `/retry/i`,
  aria-label="Retry closed-positions fetch"). role=alert +
  data-testid="closed-positions-error-card" + data-testid="closed-positions-
  error-retry" on the button. The card header carries the "📕 Closed
  Positions Ledger" title + an "Offline" badge + a static PulseDot (poor
  tone, pulse=false).
- **`ClosedPositionsSkeleton()`** — structured shimmer placeholder
  mirroring the live panel layout (header bar + 6-tile KPI strip + donut/
  timeline row + filter row + 7 table-row shimmers). role=status +
  aria-live=polite + aria-label="Loading closed positions ledger…" +
  data-testid="closed-positions-panel". The header text "📕 Closed
  Positions Ledger" + "Loading…" badge are preserved verbatim above the
  shimmers so the W38-8 loading-state test contract resolves.
- **Refined table** — uppercase tracking-wider column headers via `<th
  className="… uppercase tracking-wider …">` on every column (Market /
  Side / Entry / Exit / Size / P&L / P&L % / Hold / Reason / Closed At);
  `SortIndicator` on the Size / P&L / Hold / Closed At sortable columns;
  row-hover left-edge accent bar via `TONE[pnlTone(p.pnl)].rowHover`
  inset shadow (emerald for winning rows, red for losing rows, slate for
  breakeven — tone-aware hover affordance); `tabular-nums` on every
  numeric column (Entry / Exit / Size / P&L / P&L % / Hold / Closed At)
  so columns don't shift alignment when values change between renders;
  `mono` on every numeric column for consistent monospaced numerals.
- **Tone-coloured P&L** — the P&L column carries
  `text-emerald-400` for wins / `text-red-400` for losses / `text-[#7e8aaa]`
  for breakeven. The P&L % column carries the same tone-coloured treatment
  (green / red / dim). The cumulative P&L chart's stroke + fill colours are
  derived from the sign of the final cumulative P&L (emerald / red).
- **Section header for filters** — `<SectionHeader icon={Filter} title="Filters"
  tone="info" description="date · strategy · side · outcome · reason"
  trailing={`${filtered.length} / ${enriched.length} shown`} />` rendered
  above the filter row so the filter controls read as a distinct section.
- **Refined filters** — the search input + date-range inputs + strategy /
  side / outcome / reason / sort selects all carry
  `focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40` for a
  consistent cyan-tinted focus ring + `tabular-nums` on the date inputs +
  `hover:text-[#dde1ed]` on the selects for a subtle hover affordance.
- **Footer status** — `Showing {filtered.length} of {enriched.length}
  closed positions` + `Auto-refresh: 30s (paused)` — both carry
  `tabular-nums` + `mono` so the counts don't visually shift between
  renders.

### PerformanceReportPanel.tsx — pre-existing W58-b polish

- **Tone system** — same `Tone` + `ToneConfig` + `TONE: Record<Tone,
  ToneConfig>` as ClosedPositionsPanel (minus `rowHover` since the metric
  grid doesn't have a sortable row-hover table; the MetricCard grid uses
  hover shadow instead).
- **`metricTone(t)` helper** — maps the existing MetricCard `'positive' |
  'negative' | 'neutral' | 'info'` tone API onto the W58-b Tone palette
  (positive → good / negative → poor / info → info / neutral → neutral)
  so the card border + value text + label read with the correct colour
  family.
- **`PulseDot({ tone, pulse })`** — same as ClosedPositionsPanel. Used by
  the panel header (info tone, pulses while live).
- **`SectionHeader({ icon, title, description, tone, trailing })`** —
  same as ClosedPositionsPanel. Used above the metric grid (icon=BarChart3,
  title="Performance Metrics", tone=info, description="12 metrics · 95%
  CI · p-value", trailing="{n} trades") + above the equity curve
  (icon=BarChart3, title="Equity Curve — {category}", tone=info,
  description="cumulative equity", trailing="{n} trades").
- **`KpiTile({ label, value, hint, tone, icon, quality, trend, testId })`**
  — same as ClosedPositionsPanel. Used by the 4-tile headline KPI strip
  (Total Return / Sharpe / Win Rate / Expectancy) rendered ABOVE the
  12-card metric grid. Each headline tile carries a per-category testId
  (`category-{X}-headline-{return|sharpe|winrate|expectancy}`) so
  downstream CSS can target tiles by category + metric. The headline
  tiles are ADDITIVE to the 12-card grid — they do NOT carry
  `data-card-type="metric"` so the W26-2 test contract
  (`cards.length === 12`) continues to resolve.
- **`ShimmerBlock({ className })`** — same as ClosedPositionsPanel. Used
  throughout `PerformanceReportSkeleton`.
- **`PolishedEmptyState({ icon, title, description, testId })`** — Lucide
  `Clock` icon (size 32, strokeWidth 1.5, dim) + `.empty-state-title` +
  `.empty-state-desc`. role=status. Used by the unavailable-category
  branch (preserves the `category-{X}-unavailable` testid + the
  unavailable-reason text so the W26-2 test contract
  `getByTestId('category-live-unavailable')` +
  `getByText(/Live trading not enabled/)` resolves).
- **`PolishedErrorCard({ message, onRetry })`** — red-tinted card
  (border-red-500/30 + bg-red-500/[0.06]) with `AlertTriangle` icon
  (28px, red-tinted) + the title "Performance report unavailable" +
  the wrapped error string + a Retry button (`RefreshCw` glyph, calls
  `onRetry` = `fetchReport()`, accessible name "Retry" matching
  `/retry/i`, aria-label="Retry performance-report fetch"). role=alert +
  data-testid="performance-error-card" + data-testid="performance-error-msg"
  + data-testid="performance-error-retry" on the button. Rendered
  alongside the existing `report-error` badge so the W26-2 test contract
  (`getByTestId('report-error')` + text content match) continues to
  resolve.
- **`PerformanceReportSkeleton()`** — structured shimmer placeholder
  mirroring the 12-card metric grid layout. Rendered in place of the
  metric grid while the initial fetch is in-flight (loading=true &&
  report=null). role=status + aria-live=polite + aria-label="Loading
  performance report…" + data-testid="performance-loading-skeleton".
  The always-rendered header + disclaimer + tabs are preserved so the
  W26-2 loading-state test contracts (`getByText('📈 Honest Performance
  Report')` + `getByTestId('performance-disclaimer')` + the 4 tab
  testids) all resolve.
- **`MetricCard`** — refined with tone-tinted border + bg via the
  `metricTone(tone)` helper mapping the existing `'positive' | 'negative'
  | 'neutral' | 'info'` tone API onto the W58-b Tone palette so each
  card border + value text + label read with the correct colour family
  (positive → emerald, negative → red, info → cyan, neutral → slate).
  Each card carries `data-testid` + `data-card-type="metric"` +
  `data-tone={t}` so the W26-2 test contract `cards.length === 12`
  resolves + downstream CSS can target cards by tone. The value carries
  `mono text-base font-bold tabular-nums` so numbers stay aligned.
- **Prominent disclaimer banner** — `banner-warning p-4 text-[12px]
  rounded-md border-2 border-amber-500/50 bg-amber-500/[0.12] flex
  items-start gap-3 shadow-md shadow-amber-500/10` with a 24px
  `ShieldAlert` Lucide icon (amber-400) + the title "⚠ Performance
  Metrics Disclaimer" (uppercase tracking-wider, amber-300, 13px) +
  the disclaimer body text (amber-100/90, leading-relaxed). role=alert +
  aria-label="Performance Metrics Disclaimer" +
  data-testid="performance-disclaimer". Always rendered (even when the
  fetch fails or the response shape doesn't validate) — the honest-
  disclosure text is the panel's most important single artefact. The
  disclaimer text content is preserved verbatim so the W26-2 test
  contracts (`getByTestId('performance-disclaimer')` +
  `toHaveTextContent(/does NOT guarantee future results/i)` +
  `toHaveTextContent(/Only paper\/live metrics reflect actual system
  behavior/i)` + `toHaveTextContent(/Win rate target \(95%\) is
  aspirational/i)`) all resolve.
- **Tone-coloured metrics** — every MetricCard carries a tone derived
  from its own metric's own thresholds:
  - Win Rate: positive if ≥0.5, negative otherwise.
  - Profit Factor: positive if ≥1, negative otherwise.
  - Expectancy: positive if ≥0, negative otherwise.
  - Max Drawdown: always negative (it's a loss metric).
  - Sharpe / Sortino: positive if ≥1, info if ≥0, negative otherwise.
  - Open Exposure: info (cyan — static capital-at-risk indicator).
  - Capital Utilization: negative if >0.9, info otherwise.
  - Avg Slippage: negative if >5bps, info otherwise.
  - Total Fees / # Trades: neutral.
  - Statistical Significance: positive if significant, negative otherwise.
- **`CIRangeBar({ low, high, point })`** — tiny horizontal bar showing
  the 95% CI relative to the full [0,1] range + a vertical tick at the
  point estimate. role=img + aria-label summarising the CI bounds +
  data-testid="ci-range-bar". Used as the `ciBar` slot of the Win Rate
  MetricCard (preserves the W26-2 test contract
  `getByTestId('ci-range-bar')` + the null-bounds test
  `queryByTestId('ci-range-bar')` returns null).
- **`AIPredictionLabel` + `NotAGuaranteeInline`** — preserved verbatim
  from the W39-6 AI-explainability layer so the trader remembers the
  panel surfaces AI-derived performance metrics (Sharpe / Sortino are
  model-attributed) + the permanent NOT A GUARANTEE reminder below the
  metric grid.
- **Header polish** — PulseDot (info tone, pulses while live) + Activity
  Lucide icon added before the "📈 Honest Performance Report" title
  text. The "Per-Category" Badge + the AIPredictionLabel are preserved
  verbatim. The header right-side cluster carries the loading spinner
  (`report-loading` testid), the error badge (`report-error` testid —
  preserved verbatim so the W26-2 test contract resolves), the last-
  updated timestamp (`report-last-updated` testid + tabular-nums), and
  the auto-refresh badge (`auto-refresh-badge` testid, text "⟳ 30s" —
  preserved verbatim so the W26-2 test contract
  `toHaveTextContent('⟳ 30s')` resolves).
- **Category source banner** — a small inline banner above each
  CategoryMetricsGrid showing the source of the active category's
  metrics (e.g. "🔬 Backtest (historical simulation — does NOT reflect
  live execution)" / "🔁 Walk-Forward (rolling out-of-sample retraining)"
  / "📝 Paper Trading (simulated execution against live market data)" /
  "🔴 Live Trading (real capital at risk)"). Carries the
  `category-{X}-source-banner` testid + the StatisticalSignificanceBadge
  on the right side so the trader sees the significance verdict at a
  glance.

## Backwards-compat (preserved verbatim)

### ClosedPositionsPanel.tsx

- **Props**: unchanged (panel takes no props).
- **API calls**: `apiFetch('/api/positions/closed?limit=500')` (closed
  positions list) + `apiFetch('/api/positions/closed/stats')` (summary
  stats) on mount + every 30s + on visibilitychange regain. All preserved
  verbatim. The `Promise.allSettled([…, …])` parallel-fetch pattern is
  preserved verbatim (so a partial failure — e.g. positions ok but stats
  not-ok — still populates the table).
- **Polling**: 30s setInterval with visibilitychange pause/resume +
  immediate refresh on regain + AbortController cancellation on unmount.
  Preserved verbatim.
- **CSV export**: `handleExportCsv` builds the CSV data URL + triggers a
  download via a synthesized `<a>` element. Preserved verbatim.
- **Row expansion**: `expandedId` state + click-to-toggle + `ChevronRight`/
  `ChevronDown` glyph. Preserved verbatim (now wrapped in a keyed
  `<Fragment>` so React stops emitting the key warning).
- **Class names preserved**: `card`, `card-header`, `card-title`, `badge`
  + `badge-cyan` / `badge-green` / `badge-red` / `badge-dim`, `btn` +
  `btn-ghost` + `btn-sm`, `mono`, `scrollbar-thin`, `spinner`,
  `skeleton-line-sm` / `skeleton-line-md` / `skeleton-line-lg` /
  `skeleton-card`, `kpi-card` (+ `kpi-label` / `kpi-value` / `kpi-sub`),
  `input` + `input-sm`, `empty-state` (+ `-icon` / `-title` / `-desc`),
  `error-state` (+ `-icon` / `-title` / `-desc`), `data-table` +
  `table-container`, `tabular-nums`, `uppercase`, `tracking-wider`,
  `pnl-positive` / `pnl-negative`.
- **Accessibility preserved**: role=alert on the error card, role=status
  on the loading skeleton + empty state, role=table + aria-label on the
  table, aria-label on the search input + date inputs + selects +
  Refresh + CSV + Retry buttons, aria-label on the FilterPill group,
  aria-hidden on every Lucide icon + every PulseDot halo + every
  ShimmerBlock.
- **Test-matched strings preserved verbatim**: "📕 Closed Positions Ledger"
  (loading skeleton header — preserves the W38-8 loading-state test
  contract `getByText('📕 Closed Positions Ledger')`), "📕 CLOSED
  POSITIONS LEDGER ({N})" (main render header — preserves the W38-8
  loaded-state test contract `getByText(/CLOSED POSITIONS LEDGER/)`),
  "Realized P&L Journal" (subtitle badge — preserves the W38-8 test
  contract `getByText('Realized P&L Journal')`), "Loading…" (loading
  badge — preserves the implicit W38-8 loading-state contract), "Failed
  to load closed positions" (error title — preserves the W38-8
  error-state test contract `getByText('Failed to load closed
  positions')`), "Retry" (retry button text — accessible name matches
  `/retry/i`), "No closed positions" (empty-state title — preserves the
  W38-8 empty-state test contract `getByText('No closed positions')`),
  "/api/positions/closed?limit=500" + "/api/positions/closed/stats"
  (endpoint URLs — preserves the W38-8 endpoint test contract).
- **'use client' directive**: preserved at the top of the file (line 6).

### PerformanceReportPanel.tsx

- **Props**: unchanged (`refreshIntervalMs?` — defaults to 30_000; tests
  pass 100).
- **API calls**: `apiFetch('/api/performance/report')` on mount + every
  `refreshIntervalMs` + on visibilitychange regain. Preserved verbatim.
  The `coerceLegacyShape` + `isPerformanceReport` + `makeUnavailable`
  helpers are preserved verbatim (so the panel tolerates a partial /
  missing / legacy-shape response).
- **Polling**: `refreshIntervalMs` setInterval with visibilitychange
  pause/resume + immediate refresh on regain + clean unmount (clears the
  interval + removes the listener). Preserved verbatim.
- **Class names preserved**: `kpi-card` (+ `kpi-label` / `kpi-value` /
  `kpi-sub`), `mono`, `tabular-nums`, `banner-warning`, `empty-state`
  (+ `-icon` / `-title` / `-desc`), `error-state` (+ `-icon` / `-title`
  / `-desc`), `skeleton-line-sm` / `skeleton-line-md`, `uppercase`,
  `tracking-wider`, `spinner`. The shadcn `Badge` + `Card` + `Tabs` +
  `TabsList` + `TabsTrigger` + `TabsContent` + `EquityCurveChart` +
  `StatisticalSignificanceBadge` + `AIPredictionLabel` +
  `NotAGuaranteeInline` components are preserved verbatim.
- **Accessibility preserved**: role=alert on the disclaimer banner +
  on the PolishedErrorCard, role=status on the loading skeleton + empty
  state + on the PolishedEmptyState, role=img + aria-label on the
  CIRangeBar, aria-label on the Retry button, aria-label on the
  disclaimer banner, aria-hidden on every Lucide icon + every PulseDot
  halo + every ShimmerBlock.
- **Test-matched strings preserved verbatim**: "📈 Honest Performance
  Report" (header title — preserves the W26-2 test contract
  `getByText('📈 Honest Performance Report')`), "Per-Category" (header
  badge), "Backtest" / "Walk-Forward" / "Paper Trading" / "Live" (tab
  labels — preserve the W26-2 tab test contracts
  `getByTestId('tab-backtest')` etc.), "⟳ 30s" (auto-refresh badge —
  preserves the W26-2 test contract `toHaveTextContent('⟳ 30s')`),
  "Performance Metrics Disclaimer" (disclaimer banner aria-label +
  visible title), the disclaimer body text "⚠ Backtest performance does
  NOT guarantee future results. Only paper/live metrics reflect actual
  system behavior. Win rate target (95%) is aspirational." (preserves
  the W26-2 disclaimer-text test contracts), "Performance report
  unavailable" (error title), "Retry" (retry button text — accessible
  name matches `/retry/i`), "{category}-{X}-unavailable" testid +
  unavailable-reason text (preserves the W26-2 unavailable-category
  test contract `getByTestId('category-live-unavailable')` +
  `getByText(/Live trading not enabled/)`), "category-{X}-grid" testid +
  `data-card-type="metric"` on each of the 12 cards (preserves the W26-2
  test contract `cards.length === 12`), "ci-range-bar" testid +
  null-bounds absence contract, "category-{X}-equity" testid, the
  win-rate CI text format "85.0% [79.0%, 90.0%]" (preserves the W26-2
  CI-text test contract), "/api/performance/report" + "XTransformPort=8080"
  URL (preserves the W26-2 gateway-routing test contract), the
  Authorization header `Bearer …` (preserves the W26-2 auth test
  contract).
- **'use client' directive**: preserved at the top of the file (line 47).

## Verification

```
$ wc -l src/components/ClosedPositionsPanel.tsx src/components/PerformanceReportPanel.tsx
  1358 src/components/ClosedPositionsPanel.tsx
  1135 src/components/PerformanceReportPanel.tsx
  2493 total

$ git diff --stat HEAD src/components/ClosedPositionsPanel.tsx src/components/PerformanceReportPanel.tsx
 src/components/ClosedPositionsPanel.tsx   | 731 ++++++++++++++++++++++--------
 src/components/PerformanceReportPanel.tsx | 451 ++++++++++++++++--
 2 files changed, 948 insertions(+), 234 deletions(-)

$ bun run lint 2>&1 | tail -3
$ eslint .
(clean — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3
(clean — 0 errors; the two pre-existing TS6133 errors for unused
`Timer` and `Percent` imports in PerformanceReportPanel.tsx are now
resolved)

$ bunx vitest run src/components/ClosedPositionsPanel.test.tsx src/components/PerformanceReportPanel.test.tsx 2>&1 | tail -10
 ✓ src/components/PerformanceReportPanel.test.tsx (19 tests) 2471ms
     ✓ renders the panel header + disclaimer banner even while loading  352ms
 ✓ src/components/ClosedPositionsPanel.test.tsx (8 tests) 942ms
     ✓ renders the Retry button on the error fallback  354ms
 Test Files  2 passed (2)
      Tests  27 passed (27)
   Duration  8.10s
```

## Stage Summary

- **Final line count**: ClosedPositionsPanel 1358 lines (was 1359 — net
  −1 from the bare-`<>` → `<Fragment>` refactor: the `Fragment` import is
  folded into the existing `react` import and the `key` moves from the
  inner `<tr>` to the outer `<Fragment>`, but the surrounding lines
  reflow), PerformanceReportPanel 1135 lines (was 1137 — net −2 from
  removing the two unused Lucide imports). Combined: 2493 lines (was
  2497 — net −4).
- **Per `git diff --stat`**: ClosedPositionsPanel +731 / −… net (the bulk
  of the diff is from the prior in-flight W58-b pass that landed the
  Tone system + sub-components + KpiTile KPI strip + PolishedEmptyState +
  PolishedErrorCard + ClosedPositionsSkeleton + refined table with
  SortIndicator + tone-coloured row-hover accent; this pass adds the
  keyed-`<Fragment>` refactor on top), PerformanceReportPanel +451 / −…
  net (same — the bulk is from the prior in-flight W58-b pass that
  landed the Tone system + KpiTile headline strip + PolishedEmptyState +
  PolishedErrorCard + PerformanceReportSkeleton + prominent disclaimer
  banner + tone-coloured MetricCard + SectionHeader; this pass removes
  the two unused Lucide imports on top).
- **All W58-b polish affordances verified in place** (shimmer skeleton
  loading, polished empty state with Lucide icon, refined table with
  uppercase headers + SortIndicator + row hover accent + tabular-nums +
  tone-coloured P&L, section header, error card with retry, refined
  filters — for ClosedPositionsPanel; KpiTile pattern for headline
  metrics, shimmer skeleton, polished empty state, section headers,
  refined metrics table with tone-coloured metrics, prominent disclaimer
  banner, error card with retry — for PerformanceReportPanel).
- **All existing functionality, class names, test contracts, client
  component, API calls, polling cadence, role attributes, aria-labels,
  data-testids, preserved title text content, and the 'use client'
  directive preserved.**
- **Lint**: clean (exit 0, no output) on both files.
- **TypeScript**: 0 errors in both files (the two pre-existing TS6133
  errors for unused `Timer` and `Percent` imports in
  PerformanceReportPanel.tsx are now resolved; no new tsc errors
  introduced).
- **Tests**: 27/27 pass (8 ClosedPositionsPanel + 19 PerformanceReportPanel
  — no regressions; the React key warning is now gone as a side benefit
  of the keyed-`<Fragment>` refactor).

## Files touched

- `src/components/ClosedPositionsPanel.tsx` (UI polish pass — keyed-
  `<Fragment>` refactor to resolve the React key warning; the bulk of
  the W58-b premium visual layer was already in place from a prior
  in-flight W58-b pass — verified, not re-applied).
- `src/components/PerformanceReportPanel.tsx` (UI polish pass — removed
  two unused Lucide imports (`Timer` + `Percent`) to resolve the two
  pre-existing TS6133 errors; the bulk of the W58-b premium visual
  layer was already in place from a prior in-flight W58-b pass —
  verified, not re-applied).
- `/home/z/my-project/agent-ctx/W58-b-full-stack-developer.md` (this
  detailed agent work record).
- `worklog.md` (appended `## W58-b — full-stack-developer — Polish
  src/components/ClosedPositionsPanel.tsx + src/components/PerformanceReportPanel.tsx (premium visual layer)` entry).

**ClosedPositionsPanel + PerformanceReportPanel are production-ready
with the premium W58-b visual layer, visually consistent with the
W51-2d MLPanel / W53-c StrategyPerformancePanel / W54-e MLValidationPanel
/ W55-a LeaderboardPanel / W55-d ExecutionQualityPanel / W56-a
SystemHealthView / W56-c DatabaseStatusPanel / W56-e ObservabilityPanel
/ W57-a RetentionPanel / W57-b DecisionLedgerPanel / W57-c
LiveSafetyGatePanel / W57-d AuditLogPanel + RateLimitPanel / W57-e
CapitalAllocatorPanel / W58-d CommandPalette + SettingsModal redesign
family.**
