# Task W58-a — full-stack-developer — Polish `src/components/EquityCurve.tsx` + `src/components/AnalyticsPanel.tsx` (premium visual layer)

**Task ID:** W58-a
**Agent:** full-stack-developer
**Date:** 2025
**Scope:** Premium visual polish pass on the two remaining core trading-workstation panels — the real-time Equity Curve chart card and the institutional Performance Analytics KPI panel — to bring them into visual alignment with the W50-57 redesign family (KpiTile / SectionHeader / Tone system / shimmer skeletons / polished empty + error states).

---

## What I read first

- `worklog.md` tail (~150 lines) — confirmed the W58-d entry (CommandPalette + SettingsModal) is the last logged task. No prior `W58-a` entry exists in `worklog.md`; the W58-a polish on EquityCurve + AnalyticsPanel was committed to the working tree by an earlier in-flight pass of this same task but had not yet been logged. This run formalises that polish, applies one final touch-up (`mono tabular-nums` on the EquityCurveChart wrapper to address "tabular-nums on axis labels" explicitly), runs the full verification matrix, and appends the worklog entry.

## Files touched

- `src/components/EquityCurve.tsx` (UI polish pass, 247 → 548 lines, +369 / −68 per `git diff --numstat`)
- `src/components/AnalyticsPanel.tsx` (UI polish pass, 749 → 1178 lines, +536 / −108 per `git diff --numstat`)
- `/home/z/my-project/agent-ctx/W58-a-full-stack-developer.md` (this detailed agent work record)
- `worklog.md` (appended W58-a entry)

---

## EquityCurve.tsx — premium visual polish pass

### 1. Tone system (5-tone vocabulary)

Built a private `TONE: Record<Tone, ToneConfig>` map mirroring the W55-a LeaderboardPanel / W56-a SystemHealthView / W57-a RetentionPanel tone palette:
- `good` → emerald-400 (text / bg / border / bar / dot / halo)
- `warn` → amber-400
- `poor` → red-400
- `info` → cyan-300
- `neutral` → `#dde1ed` / `#1f2335` / `#5a637a`

Each entry is a self-contained static class string so Tailwind 4's JIT scanner picks them up. Used to tone-color the header equity value, PnL badge, drawdown badge, and the SectionHeader icon.

### 2. Shimmer skeleton loading state (`EquitySkeleton`)

Built a private `EquitySkeleton` sub-component that mirrors the live panel layout (chart area + footer summary line) using the existing `skeleton-line-sm` CSS class on `ShimmerBlock` placeholders:
- 3 shimmer lines of varying widths (`w-1/3`, `w-2/3`, `w-1/2`) inside a 85px-tall `border border-[#1f2335] bg-[#0e1015]` chart-area placeholder
- 4 shimmer blocks (`w-14`, `w-14`, `w-14`, `w-12`) in the footer summary row to mirror Base / Min / Peak / lastUpdated

Aria contract: `role="status"` + `aria-live="polite"` + `aria-label="Loading equity timeline"` + `data-testid="equity-loading-skeleton"`. The "Loading equity timeline…" caption is preserved verbatim as a leaf text node above the shimmer rows so the W22-1 / W22-5 test contract `getByText(/Loading equity timeline/)` continues to resolve.

### 3. Polished empty state (`PolishedEmptyState`)

Built a private `PolishedEmptyState` sub-component with a Lucide `TrendingUp` icon (`size-7`, `text-[#5a637a]`, `strokeWidth={1.5}`, `aria-hidden="true"`) above the "Accumulating paper execution points…" title (preserved verbatim as the direct text of a leaf `<div>`) + a dim `text-[10px] text-[#4a5068] tabular-nums` caption showing `Baseline: $X.XX · Operating Capital` so the trader sees the starting capital even when no points have accumulated yet.

Aria contract: `role="status"` + `data-testid="equity-empty-state"`. Title preserved verbatim so the W22-1 / W22-5 test contract `getByText(/Accumulating paper execution points/)` resolves.

### 4. Section header (`SectionHeader`)

Built a private `SectionHeader` sub-component that renders a Lucide icon (`size-3`, tone-colored via `TONE[tone].text`) + an uppercase tracking-wider title (`text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]`) + an optional dim italic description + an optional trailing node (ml-auto shrink-0). Used above the chart area with:
- `icon={TrendingUp}`
- `title="Equity Curve"`
- `description="paper execution timeline"`
- `tone={pnlTone}` — colors the icon to match the profit/loss state of the curve
- trailing `<span className="badge badge-dim text-[9px] tabular-nums">{points.length} pts</span>` — surfaces the live point count

### 5. Tabular-nums on axis labels (final touch-up applied in this run)

The `EquityCurveChart` wrapper div now carries `mono tabular-nums` so the Recharts SVG axis tick labels — `$X.XX` on the Y axis, `HH:MM:SS` on the X axis — inherit a monospace stack with tabular figure variants and stay column-aligned between renders. This mirrors the existing `mono tabular-nums` treatment on the footer summary line (Base / Min / Peak / lastUpdated) and the header PnL / drawdown badges. Recharts renders axis ticks as inline SVG `<text>` elements that inherit `font-family` and `font-variant-numeric` from CSS, so applying the class on the wrapper div is sufficient — no changes to the shared `charts/theme.ts` are needed (which would have affected every other chart in the dashboard).

### 6. Tone-colored curve + header values

- The chart itself already tone-colors the curve via `chartTheme.colors.success` (emerald) for profit and `.danger` (red) for loss (computed from the last point's P&L sign in `EquityCurveChart.tsx`). No change needed.
- The header equity value carries `TONE[pnlTone].text` (emerald when profit, red when loss) + `data-tone={pnlTone}` for downstream CSS targeting.
- The PnL badge carries the existing `badge-green` / `badge-red` classes (preserved verbatim) + `tabular-nums` + `data-tone={pnlTone}`.
- The drawdown badge carries `badge-red` when `maxDrawdownPct > 0` (else `badge-dim`) + `tabular-nums` + `data-tone={ddTone}` (poor when DD > 5%, warn when 0–5%, neutral when 0).

### 7. Refined hover tooltip (`formatEquityTooltip`)

A custom `formatEquityTooltip` callback renders a structured card inside Recharts' `<Tooltip>`:
- Timestamp `HH:MM:SS UTC` (mono, tabular-nums, dim `text-[#7e8aaa]`)
- Equity value (`fmtUsd`, mono tabular-nums, `text-[#dde1ed]`)
- P&L delta with sign + percentage (tone-coloured emerald / red, mono tabular-nums)
- Drawdown depth (red mono tabular-nums)

Card frame: `rounded-md border border-[#1f2335] bg-[#13161e] shadow-[0_4px_12px_rgba(0,0,0,0.35)] px-2.5 py-1.5 text-[11px] min-w-[140px]`.

### 8. Polished error card (`PolishedErrorCard`)

Built a private `PolishedErrorCard` sub-component with a Lucide `AlertTriangle` icon (`w-4 h-4 text-red-400 mt-0.5 shrink-0`, `aria-hidden="true"`) + the wrapped error message (`"Failed to load equity timeline (HTTP 500)"` — preserved verbatim as a leaf text node so the W22-1 test contract `getByText(/Failed to load equity timeline \(HTTP 500\)/)` resolves) + a dim detail line + a Dismiss button (`aria-label="Dismiss equity error"` — preserved verbatim — carrying a Lucide `X` glyph + "Dismiss" text + `data-testid="equity-error-dismiss"`).

Aria contract: `role="alert"` + `data-testid="equity-error-card"`. The Dismiss button calls `dismissError` which sets local state to the current `wrappedError` so the card hides until a fresh error arrives (mirrors the W22-1 dismissable-banner behaviour).

### EquityCurve.tsx — additional refinements

- **Live / Polling badge** preserved verbatim from W22-5 — `● Live` (Badge variant="success") when the WS is connected, `⟳ Polling` (Badge variant="warning") otherwise.
- **W58-a — `data-tone` hook** layered on the header equity value, PnL badge, and drawdown badge so downstream CSS / integration tests can target the tone palette uniformly.
- **`tabular-nums`** applied to every numeric value (header equity, PnL badge, drawdown badge, footer Base / Min / Peak / lastUpdated) so columns don't shift alignment between renders.
- **All Lucide icons** (`Activity`, `AlertTriangle`, `TrendingUp`, `X`) carry `aria-hidden="true"`.

---

## AnalyticsPanel.tsx — premium visual polish pass

### 1. Tone system (5-tone vocabulary)

Same private `TONE` map as EquityCurve (good / warn / poor / info / neutral). Used to tone-color the KpiTile icons, the SectionHeader icons, and as `data-tone` hooks on the KPI cards.

### 2. Shimmer skeleton loading state (`AnalyticsSkeleton`)

Built a private `AnalyticsSkeleton` sub-component that mirrors the live panel layout:
- Header shimmer caption row (`spinner` + "Loading analytics metrics…" — preserved verbatim so the W15-5 test contract `getByText(/Loading analytics/)` resolves)
- 4-card 2x2 KPI strip placeholder — each card has 3 shimmer lines (`w-1/2`, `w-2/3`, `w-1/3`) inside a `kpi-card` frame
- Footer disclaimer + report placeholder — 3 shimmer lines (`w-1/3`, `w-full`, `w-2/3`) under a `border-t border-[#1f2335] pt-2` divider

Aria contract: `role="status"` + `aria-live="polite"` + `aria-label="Loading analytics metrics"` + `data-testid="analytics-loading-skeleton"`.

### 3. Polished empty state (`PolishedEmptyState`)

Built a private `PolishedEmptyState` sub-component using the existing `.empty-state` CSS class with a Lucide `BarChart3` icon (`size={28}`, `text-[#5a637a]`, `aria-hidden="true"`, `.empty-state-icon` class) + "Analytics data unavailable" title (preserved verbatim as a leaf `<div className="empty-state-title">` so the W15-5 test contract `getByText('Analytics data unavailable')` resolves) + dim `.empty-state-desc` description ("The analytics endpoint returned no payload. The trader dashboard will retry on the next 10s poll.").

Aria contract: `role="status"` + `data-testid="analytics-empty-state"`. Used by the soft-failure branch (data is null, no error).

### 4. Section headers (`SectionHeader`)

Same private `SectionHeader` sub-component as EquityCurve, used in 3 places:
- Above the KPI strip — `icon={Gauge}`, `title="Performance KPIs"`, `description="real-time paper-trading metrics"`, `tone="info"`, trailing `N={n}` count badge
- Above the disclaimer bullets — `icon={AlertTriangle}`, `title="Performance Metrics Disclaimer"`, `description="α=0.05 · n≥30 · 95% CI"`, `tone="warn"`, trailing `n={n}` count badge
- Above the report section — `icon={ListChecks}`, `title="Honest Performance Report"`, `description="paper · backtest · walk-forward · live"`, `tone="info"`, trailing "Per-Category" amber badge

### 5. KpiTile pattern for key metrics

Built a private `KpiTile` sub-component that renders the existing `.kpi-card` / `.kpi-label` / `.kpi-value` / `.kpi-sub` class names so the W26-6 / W15-5 test contracts (`closest('.kpi-card')` + `querySelector('.kpi-value')`) continue to resolve, AND adds:
- Lucide icon in the label row (tone-colored via `TONE[tone].text`, `aria-hidden="true"`)
- `tabular-nums` on the value + sub spans
- `data-tone={tone}` hook on the root card for downstream CSS targeting
- Optional `testId` → `data-testid`
- Optional `trailing` node (e.g. significance pill)
- `valueClassName` prop preserves the tone-specific value class (e.g. `text-[#f87171]` for negative expectancy / `text-[#4ade80]` for positive expectancy) so the W26-6 / W15-5 className assertions still match

Used for 7 of the 8 KPI cards (Profit Factor, Trades / Volume, Max Drawdown, Realized P&L, Unrealized P&L, Expectancy / Trade, Sharpe Ratio). The 8th (Avg Win / Avg Loss) keeps its bespoke inline layout because it renders two tone-colored values split by a `/` separator — refactoring it to KpiTile would have lost the two-tone split affordance. The Win Rate card also keeps its bespoke layout because it embeds the `ConfidenceIntervalBadge` + `StatisticalSignificanceBadge` widgets (W26-6) — those are full-width custom widgets, not KpiTile-compatible.

### 6. Tone-colored values + tabular-nums

- Every KpiTile value carries the existing tone-specific value class (`text-[#4ade80]` emerald / `text-[#f87171]` red / `text-[#60a5fa]` blue / `text-[#dde1ed]` neutral) preserved verbatim so the W26-6 / W15-5 className assertions still match, AND a `data-tone` attribute hook layered on top.
- `tabular-nums` applied to every numeric value (KPI values, win rate %, p-values, n trades, max drawdown, profit factor, expectancy, Sharpe ratio, avg win / loss, best return %, best Sharpe, n experiments) so columns don't shift alignment between renders.
- Footer summary line (`Base / Min / Peak / lastUpdated` on EquityCurve — N/A here; the AnalyticsPanel footer is the disclaimer + report sections).

### 7. Polished error card with retry (`PolishedErrorCard`)

Built a private `PolishedErrorCard` sub-component using the existing `.error-state` CSS class with:
- Lucide `AlertTriangle` icon (`size={28}`, `text-red-400`, `aria-hidden="true"`, `.error-state-icon` class)
- Title "Analytics data unavailable" (preserved verbatim as a leaf `<span className="error-state-title">` so the W15-5 test contract `getByText('Analytics data unavailable')` resolves to a single leaf)
- Optional wrapped error string in `.error-state-desc` (inline-style monospace font)
- Retry button — Lucide `RefreshCw` glyph + "Retry" text, `aria-label="Retry analytics fetch"`, `data-testid="analytics-error-retry"`, calls `useRealtimeData.refetch()` on click

Aria contract: `role="alert"` + `data-testid="analytics-error-card"`. Used by the error branch (when `useRealtimeData.error` is set).

### AnalyticsPanel.tsx — additional refinements

- **Live / Polling badge** preserved verbatim from W15-5 — `● Live` / `⟳ Polling` (shadcn Badge variant success / warning).
- **`StaleIndicator`** (W41-3) preserved — surfaces an amber/red pill when the local snapshot is older than 30s.
- **Active Strategies strip** — preserved from W15-5; renders a `badge badge-green` chip for each active strategy ID (mapped via `STRATEGY_LABELS`).
- **Small-sample warning** (W26-6) — preserved verbatim; surfaces `⚠ Small sample size — results may not be reliable (n={n} < 30)` when n < 30.
- **`ConfidenceIntervalBadge` + `StatisticalSignificanceBadge`** (W26-6) — preserved verbatim in the Win Rate KPI card.
- **Wilson 95% CI** rendered via the `ConfidenceIntervalBadge` widget; binomial-test p-value computed client-side via `binomialPValue` (normal-approximation, Abramowitz-Stegun 26.2.17).
- **`MetricsDisclaimerSection`** (W26-6) — 5-bullet performance-metrics disclaimer rendered unconditionally (independent of the PerformanceReport fetch) so the trader is always warned about backtest / paper / live distinction.
- **`PerformanceReportSection`** (W25-6) — honest per-category breakdown (paper / backtest / walk-forward / live) fetched on mount from `/api/performance/report` + `/api/performance/backtest`; silent failure with the disclaimer banner still rendered.
- **All Lucide icons** (`AlertTriangle`, `BarChart3`, `Gauge`, `Layers`, `ListChecks`, `Percent`, `RefreshCw`, `Scale`, `Sigma`, `Target`, `TrendingDown`, `TrendingUp`) carry `aria-hidden="true"`.

---

## Backwards-compat (preserved verbatim)

### EquityCurve.tsx

- **Props**: unchanged (no props — the panel reads its own data via `useRealtimeData`).
- **API surface**: `useRealtimeData<EquityResponse>('/api/history/equity', { wsChannel: 'metrics', pollInterval: 5000, validate: isEquityPayload })` — preserved verbatim.
- **WS channel subscription**: `metrics` channel with the `isEquityPayload` type-guard validator that drops BotSnapshot-shaped payloads (preserved verbatim from W22-5).
- **Class names preserved**: `card`, `card-header`, `card-title`, `badge`, `badge-amber`, `badge-green`, `badge-red`, `badge-dim`, `mono`, `tabular-nums`, `spinner`, `skeleton-line-sm`. New Tailwind utility classes layered additively.
- **Test-matched strings preserved verbatim**: "📈 Equity Curve" / "📈 Portfolio Equity" (card-title — preserved as direct text of `<span className="card-title">`), "Loading equity timeline…" (skeleton caption — preserved as a leaf text node), "Accumulating paper execution points…" (empty-state title — preserved as a leaf text node), "Failed to load equity timeline (HTTP 500)" (error message — preserved as a single leaf text node), "Dismiss" (button text — accessible name matches `/Dismiss equity error/i`), "● Live" / "⟳ Polling" (badge text — preserved verbatim), "Base: $100.00" / "Min: $X.XX" / "Peak: $X.XX" (footer summary — preserved as direct text of leaf `<span>` elements), "Equity Curve" (section header title), "paper execution timeline" (section header description), "pts" (trailing count badge).
- **Aria preserved**: `role="alert"` on error card, `role="status"` on skeleton + empty state, `aria-live="polite"` on skeleton, `aria-label="Loading equity timeline"` on skeleton, `aria-label="Dismiss equity error"` on Dismiss button, `aria-hidden="true"` on every Lucide icon, `data-testid` attributes on every state (`equity-loading-skeleton`, `equity-empty-state`, `equity-error-card`, `equity-error-dismiss`).
- **`'use client'` directive**: preserved at the top of the file (line 62).

### AnalyticsPanel.tsx

- **Props**: unchanged (no props — wrapped in `React.memo`, default shallow compare).
- **API surface**: `useRealtimeData<Analytics>('/api/analytics', { wsChannel: 'metrics', pollInterval: 10000, validate: isAnalyticsPayload })` — preserved verbatim. Plus `useStaleAge(lastUpdated)` (W41-3) and `apiFetch('/api/performance/report')` + `apiFetch('/api/performance/backtest')` in `PerformanceReportSection` (W25-6).
- **WS channel subscription**: `metrics` channel with the `isAnalyticsPayload` type-guard validator (requires both `equity` and `win_rate` numeric fields).
- **Memoisation**: `useMemo` on the `stats` object (binomial-test p-value + Wilson CI logic) hoisted before the early returns so the rules-of-hooks are satisfied (preserved from W41-2).
- **React.memo** wrapper preserved (W9-6) — short-circuits parent-driven re-renders (Command Center grid).
- **Class names preserved**: `card`, `card-header`, `card-title`, `kpi-card`, `kpi-label`, `kpi-value`, `kpi-sub`, `badge`, `badge-amber`, `badge-green`, `badge-dim`, `banner-warning`, `empty-state`, `empty-state-icon`, `empty-state-title`, `empty-state-desc`, `error-state`, `error-state-icon`, `error-state-title`, `error-state-desc`, `mono`, `tabular-nums`, `spinner`, `skeleton-line-sm`. New Tailwind utility classes layered additively.
- **Test-matched strings preserved verbatim**: "📊 Performance Analytics" (card-title — preserved as direct text of `<span className="card-title">`), "PAPER" (mode badge — preserved verbatim), "Loading analytics metrics…" (skeleton caption — preserved as a leaf text node), "Analytics data unavailable" (empty-state + error-state title — preserved as a leaf text node so `getByText('Analytics data unavailable')` resolves), "Retry" (button text — accessible name matches `/Retry analytics fetch/i` via `aria-label`), "● Live" / "⟳ Polling" (badge text), "Performance KPIs" / "Performance Metrics Disclaimer" / "Honest Performance Report" (section header titles — preserved as direct text of leaf `<span>` inside `SectionHeader`), "real-time paper-trading metrics" / "α=0.05 · n≥30 · 95% CI" / "paper · backtest · walk-forward · live" (section header descriptions), all KPI labels ("Win Rate (95% CI)", "Profit Factor", "Trades / Volume", "Max Drawdown", "Realized P&L", "Unrealized P&L", "Expectancy / Trade", "Avg Win / Avg Loss", "Sharpe Ratio", "Paper Trading", "Backtest Summary", "Walk-Forward", "Live Status" — preserved verbatim).
- **Aria preserved**: `role="alert"` on error card, `role="status"` on skeleton + empty state, `aria-live="polite"` on skeleton, `aria-label="Loading analytics metrics"` on skeleton, `aria-label="Retry analytics fetch"` on Retry button, `aria-label="Performance Metrics Disclaimer"` on disclaimer sections, `aria-hidden="true"` on every Lucide icon, `data-testid` attributes on every state and KPI (`analytics-loading-skeleton`, `analytics-empty-state`, `analytics-error-card`, `analytics-error-retry`, `win-rate-kpi`, `analytics-kpi-profit-factor`, `analytics-kpi-trades-volume`, `analytics-kpi-max-drawdown`, `analytics-kpi-realized-pnl`, `analytics-kpi-unrealized-pnl`, `analytics-kpi-expectancy`, `analytics-kpi-avg-win-loss`, `analytics-kpi-sharpe`, `small-sample-warning`, `metrics-sample-note`, `metrics-disclaimer-section`, `performance-report-section`, `performance-disclaimer`).
- **`'use client'` directive**: preserved at the top of the file (line 62).

---

## Verification

```
$ wc -l src/components/EquityCurve.tsx src/components/AnalyticsPanel.tsx
  548 src/components/EquityCurve.tsx
 1178 src/components/AnalyticsPanel.tsx
 1726 total

$ git diff --numstat src/components/EquityCurve.tsx src/components/AnalyticsPanel.tsx
369	68	src/components/EquityCurve.tsx
536	108	src/components/AnalyticsPanel.tsx

$ bun run lint 2>&1 | tail -3
$ eslint .
(exit 0 — clean, no output)

$ bunx eslint src/components/EquityCurve.tsx src/components/AnalyticsPanel.tsx 2>&1; echo "EXIT=$?"
EXIT=0
(clean on both files — exit 0, no output)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3
(exit 0 — no TypeScript errors anywhere in the project,
including the previously-flagged PerformanceReportPanel.tsx
which another concurrent agent has now resolved out-of-band)

$ bunx vitest run src/components/EquityCurve.test.tsx src/components/AnalyticsPanel.test.tsx 2>&1 | tail -10
 ✓ src/components/AnalyticsPanel.test.tsx (27 tests) 928ms
 ✓ src/components/EquityCurve.test.tsx (18 tests) 364ms
 Test Files  2 passed (2)
      Tests  45 passed (45)

$ bunx vitest run src/components/charts/Charts.test.tsx 2>&1 | tail -5
 ✓ src/components/charts/Charts.test.tsx (36 tests) 140ms
 Test Files  1 passed (1)
      Tests  36 passed (36)
(no regressions on the shared chart library — the
`mono tabular-nums` wrapper-class touch-up on EquityCurve.tsx
doesn't touch EquityCurveChart.tsx itself)
```

### Test-contract spot-checks

- `getByText(/Equity Curve/i)` → resolves to the section-header title span (loaded state) and the card-title span (loading / empty / loaded states)
- `getByText(/Loading equity timeline/i)` → resolves to the skeleton caption leaf text node
- `getByText(/Accumulating paper execution points/i)` → resolves to the empty-state title leaf text node
- `getByText(/Failed to load equity timeline \(HTTP 500\)/i)` → resolves to the error-card message leaf text node
- `getByRole('button', { name: /Dismiss equity error/i })` → resolves to the Dismiss button (aria-label preserved verbatim)
- `getByText('● Live')` / `getByText('⟳ Polling')` → resolve to the realtime badge text
- `getByText(/Base: \$100\.00/i)` → resolves to the footer summary leaf span
- `getByText('📊 Performance Analytics')` → resolves to the card-title span
- `getByText('Analytics data unavailable')` → resolves to the error-card title span (error branch) and the empty-state title div (soft-failure branch)
- `getByText(/Loading analytics/i)` → resolves to the skeleton caption leaf text node
- `closest('.kpi-card')` + `querySelector('.kpi-value')` → resolve on every KpiTile (class names preserved verbatim)

---

## Stage Summary

- **Final line count**: EquityCurve 548 lines (was 247 — +369 / −68 per `git diff --numstat`), AnalyticsPanel 1178 lines (was 749 — +536 / −108 per `git diff --numstat`). Combined: 1726 lines (was 996 — +905 / −176 net per `git diff --numstat`).
- **All 8 EquityCurve polish affordances applied** (Tone system, shimmer skeleton, polished empty state with TrendingUp, SectionHeader, tabular-nums on axis labels via the wrapper `mono tabular-nums` class + on every header / footer value, tone-colored curve via the chart's success/danger strokeColor logic, refined hover tooltip, polished error card) + the additional `data-tone` hook refinement.
- **All 7 AnalyticsPanel polish affordances applied** (Tone system, KpiTile pattern for 7 of 8 KPI cards, shimmer skeleton, polished empty state, 3 SectionHeaders, tone-colored values with preserved verbatim class names + `data-tone` hooks, polished error card with Retry) + the additional Live / Polling badge + StaleIndicator + small-sample warning + active-strategies strip + ConfidenceIntervalBadge + StatisticalSignificanceBadge + MetricsDisclaimerSection + PerformanceReportSection refinements (all preserved from prior waves).
- **All existing functionality, class names, test contracts, client component, API surface, WS channel subscriptions, aria-labels, role attributes, memoisation, React.memo wrapper, and the `'use client'` directive preserved.**
- **Lint**: clean on both files (exit 0, no output).
- **TypeScript**: 0 errors anywhere in the project (including the previously-flagged PerformanceReportPanel.tsx, which another concurrent agent has now resolved out-of-band).
- **Tests**: 45/45 pass (18 EquityCurve + 27 AnalyticsPanel — no regressions) + 36/36 on the shared Charts.test.tsx (no regressions on the chart library).

**EquityCurve + AnalyticsPanel are production-ready with the premium W58-a visual layer, visually consistent with the W51-2d MLPanel / W55-a LeaderboardPanel / W56-a SystemHealthView / W57-a RetentionPanel / W57-b DecisionLedgerPanel / W57-c LiveSafetyGatePanel / W57-d AuditLogPanel + RateLimitPanel / W58-d CommandPalette + SettingsModal redesign family.**
