# W55-b — Polishing BacktestLabView.tsx

**Task ID:** W55-b
**Agent:** full-stack-developer
**Scope:** Polish `src/components/BacktestLabView.tsx` (backtest configuration + results + equity curve) for visual consistency with the W50-54 design system.

## Background / investigation

- Read `/home/z/my-project/worklog.md` (last ~400 lines) to map the W50-54 design-system vocabulary:
  - **Tone system** (good / warn / poor / info / neutral) with self-contained class strings (bg / border / text / bar / dot / label / halo / stroke / fill) — static so Tailwind 4's JIT scanner picks them up.
  - **KpiTile** pattern (large value, tone-tinted bg, quality bar, optional trend glyph, `data-tone` hook).
  - **SectionHeader** (Lucide icon + uppercase tracking-wider 9.5px title + optional dim italic description + optional trailing node).
  - **PulseDot** (`animate-ping` halo + solid dot + glow shadow, aria-hidden).
  - **Shimmer skeleton** mirroring the live dashboard layout (KPI strip + chart + table).
  - **PolishedEmptyState** (Lucide icon + title + dim description, uses `.empty-state` CSS classes).
  - **ErrorCard** (Lucide AlertTriangle + title direct text node + dim subtitle + Retry button with RotateCcw glyph, role=alert).
  - **Tabular-nums** on every numeric cell.
  - **Row hover accent bar** via inset shadow (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`).
  - **Refined SVG chart** (proper axes, dashed gridlines, tone-coloured stroke + area-fill, baseline reference, hover dot).
  - Reference implementations consulted: `StrategyPerformancePanel.tsx` (W53-c, 1609 lines — KpiTile + EquityCurveSkeleton + ComparisonTableSkeleton + SortIndicator + Tone system), `DeepAnalysisView.tsx` (W54-a, 1072 lines — LoadingSkeleton + KpiTile strip + ErrorCard + SectionHeader), `MLValidationPanel.tsx` (W54-e, 1576 lines — ValidationSkeleton + PolishedErrorState + walk-forward CV sparkline).
- Read `BacktestLabView.tsx` (322 lines, W22-2 origin) + the 18-test contract (`BacktestLabView.test.tsx`, 357 lines) to map every test surface that MUST NOT break:
  1. Title text `Quantitative Backtest & Binary Payoff Simulation Lab` (regex /i, single match)
  2. `Kelly Sizing Model` badge text (single match)
  3. `Monte Carlo path modeling` subheading text (single match — preserved verbatim in the header `<p>` element)
  4. 6 POPULAR_STRATS `<option>` text contents (exact text — `Avellaneda-Stoikov Market Maker (Active)`, `Binary Dutch Book Arbitrage (Active)`, `Random Forest Quant Ensemble (Active)`, `EMA Crossover Trend Follower (Research)`, `Bollinger Bands Mean Reversion (Research)`, `Whale Block Order Follower (Research)`)
  5. `Starting Capital` label text (single match — must avoid duplicating the phrase in the empty state description)
  6. `Simulation Horizon` label text (single match — same caveat)
  7. 2 `input[type=number]` elements: capital input (`min=10 max=100000`), days input (`min=1 max=365`)
  8. `Run Monte Carlo Backtest` button accessible name (regex /i)
  9. `Running Simulation` text node when running state is active (single match — must not duplicate in an SR-only span)
  10. POST `/api/backtest/run` with body containing `strategy_id`, `initial_capital`, `days`, `slippage_bps=5` (preserved `slippage` state)
  11. Authorization `Bearer <token>` header via `apiFetch` on every fetch
  12. KPI grid labels (each a single match): `Total Return (ROI)`, `Sharpe Ratio`, `Calmar Ratio` (regex /i), `Max Drawdown` (multi-match OK — `getAllByText >= 1`), `Value at Risk (95%)`, `Simulation Brier`
  13. Sharpe value `'1.85'` (exact string match — single match — must avoid rendering `sharpe_ratio.toFixed(2)` in more than one tile)
  14. Max drawdown value `/-8\.50%/i` regex match (single match sufficient)
  15. Equity curve SVG with `aria-label="Simulated Equity Curve"` (single match)
  16. `Final Capital:` text (single match)
  17. `Monthly Returns Heatmap` text (single match)
  18. Month labels `2024-01` / `2024-02` / `2024-03` / `2024-04` (each a single match)
  19. `4 periods` text (regex match against `{N} periods`)
  20. Error strings (each a single match): `Backtest simulation failed (HTTP 500)` and `Network error connecting to simulation runner`
  21. `strategy_id` changes when the `<select>` changes
  22. Capital input updates when changed
  23. Days input updates when changed
- Verified empirically (via RTL failure-mode testing during this task) that `getByText('1.85')` is an exact-string match against each element's normalized textContent. The KpiTile value div renders `{value}` as a direct text node alongside an optional trend icon (SVG with no text). Both the value div AND any parent kpi-card div whose textContent also normalises to `"1.85"` would match — but since the kpi-card div contains the label + value + hint (text content `"Total Return (ROI)1.85P&L: +$34.50"`), only the inner value div matches. The critical constraint is that the SAME value string must NOT be rendered in MORE THAN ONE tile (e.g. I initially added a headline KPI strip that duplicated `result.sharpe_ratio.toFixed(2)` = `"1.85"` — that broke the single-match contract; I removed the headline strip and merged Win Rate into the institutional KPI grid instead).

## Inline sub-components added (kept private to the panel)

1. **Tone system** (`good | warn | poor | info | neutral`) with self-contained class strings (bg / border / text / bar / dot / label / halo / stroke / fill) — static so Tailwind 4's JIT scanner picks them up. Mirrors W53-c Tone + extends it with `stroke` (SVG stroke color) and `fill` (SVG area-fill rgba string) for the refined equity curve.
2. **Tone helpers**: `roiTone(v)` (good ≥10 / info ≥0 / warn ≥-10 / poor <-10 / neutral null), `sharpeTone(v)` (good ≥1.5 / warn ≥0.5 / poor <0.5 / neutral null), `drawdownTone(v)` (poor ≥15 / warn ≥5 / info <5 / neutral null), `winRateTone(v)` (good ≥0.55 / warn ≥0.45 / poor <0.45 / neutral null), `profitFactorTone(v)` (good ≥1.5 / warn ≥1.0 / poor <1.0 / neutral null), `calmarTone(v)` (good ≥1.0 / warn ≥0.3 / poor <0.3 / neutral null).
3. **PulseDot({ tone, pulse })** — Tailwind `animate-ping` halo + solid dot + glow shadow. aria-hidden. Used by the Run button's loading state trailing indicator + the config bar's "running…" status.
4. **SectionHeader({ icon, title, description, tone, trailing })** — Lucide icon + uppercase tracking-wider title (direct text node so RTL resolves to a single leaf) + optional dim italic description + optional trailing node. Mirrors W53-c / W54-a SectionHeader. Title preserved verbatim so `getByText(/Quantitative Backtest/i)` still resolves to a single element.
5. **KpiTile({ label, value, hint, tone, quality, trend, testId })** — refined KPI card (large value, tone-tinted bg, quality bar, optional trend glyph, `data-tone` attribute). Used for all 7 institutional KPI grid tiles (Total Return / Sharpe / Max Drawdown / Win Rate / Calmar / VaR / Brier). Value rendered as a direct text node alongside the optional trend icon (SVG with no text), so `getByText('1.85')` resolves to exactly one element.
6. **PolishedEmptyState({ icon, title, description, className, testId })** — Lucide `FlaskConical` icon + "Run a backtest to see results" title + helper copy using `.empty-state` CSS classes. role=status. Renders when no result + no error + not running.
7. **ErrorCard({ error, onRetry })** — polished error state with Lucide AlertTriangle + the error string as the title (direct text node so the W22-1 regexes `Backtest simulation failed (HTTP 500)` + `Network error connecting to simulation runner` resolve to a single leaf) + dim subtitle + Retry button with RotateCcw glyph. role=alert. `data-testid="backtest-error"` + `-msg` on the message span + `-retry` on the button.
8. **ResultsSkeleton()** — structured shimmer placeholder mirroring the live results dashboard (6-tile KPI strip + equity chart + trade stats table + monthly heatmap rows). role=status + aria-live=polite + `data-testid="backtest-loading"`. Uses `.kpi-card`, `.skeleton-card`, `.skeleton-line-sm`, `.skeleton-line-md` classes from globals.css.
9. **Equity geometry helper** (`computeEquityGeometry`) — pre-computes the SVG path strings + min/max equity + Y-axis ticks for the refined equity curve chart. Returns null when the curve has < 2 points (graceful empty handling).
10. **Monte Carlo outcome distribution helper** (`computeMonteCarloBuckets`) — NEW derived visualization. Buckets the per-step equity deltas into 7 quantile bins (P5 → P95), each tagged with a Tone (poor → warn → info → good) so the worst buckets read red and the best read emerald. Returns an empty array when the curve has < 2 points.
11. **Trade stats table builder** (`buildTradeStatRows`) — aggregates the per-trade metrics (Net P&L / Final Equity / CAGR / Profit Factor / Sortino / Expectancy / VaR / Brier / Total Trades) into a clean 2-column "Metric | Value | Hint" row list with per-row Tone. Critically, the `Calmar Ratio`, `Value at Risk (95%)`, and `Simulation Brier` labels are NOT used here (relabeled to `Brier Score` and `VaR (95%)`) because the institutional KPI grid already surfaces the full labels — duplicating them would break the W22-2 single-match `getByText` test contract.

## Polish affordances applied (per W55-b spec)

1. **KpiTile pattern for backtest metrics (total return, Sharpe, max drawdown, win rate)** — 7-tile institutional KPI grid refactored to the shared KpiTile sub-component with tone-tinted bg + quality bar + trend glyph. The headline metrics from the spec (total return, Sharpe, max drawdown, win rate) are surfaced as the first 4 tiles; Calmar / VaR / Brier follow. Each tile carries `data-tone={good|warn|poor|info|neutral}` + a per-tile testId (`backtest-kpi-{roi|sharpe|drawdown|winrate|calmar|var|brier}`). Initial attempt added a duplicate headline KPI strip — removed because it broke `getByText('1.85')` single-match contract.

2. **Shimmer skeleton loading state for results** — `<ResultsSkeleton />` replaces the bare spinner-only placeholder. Structured shimmer mirroring the live dashboard (KPI strip + equity chart + trade stats table + monthly heatmap). role=status + aria-live=polite + `data-testid="backtest-loading"`. CRITICAL: the visible "Running Simulation…" text node lives inside the Run button (which switches to the spinner state when `running=true`), so the skeleton doesn't need its own SR-only label.

3. **Polished empty state with Lucide icon + message ("Run a backtest to see results")** — `<PolishedEmptyState />` with Lucide `FlaskConical` icon + the exact spec'd title + helper copy using `.empty-state` CSS classes. role=status. Renders when `!result && !error && !running`. Empty state description carefully avoids the phrases "Starting Capital" and "Simulation Horizon" so the W22-2 single-match label tests still resolve.

4. **Refined equity curve chart (proper axes, gridlines, tone colors)** — the SVG equity curve gains:
   - 3 horizontal + 3 vertical dashed gridlines (`#1f2335`, dasharray "2 3").
   - Y-axis tick labels (3 — top/middle/bottom equity values in `$X.XX` format, monospace).
   - X-axis tick labels (3 — Day 0 / Day N/2 / Day N with start + end equity in parens, monospace).
   - Tone-coloured stroke (emerald when `total_pnl >= 0`, red when negative) + tone-tinted area-fill (rgba 22% opacity via SVG linearGradient).
   - Baseline reference line at the initial capital (dashed muted `#7e8aaa`, 0.45 opacity) so the trader can immediately see if equity is above or below the starting point.
   - Hover dot at the final equity point (small outer halo + solid inner dot in the tone color).
   - 4-corner chart padding (38px left for Y-axis labels, 12px right, 12px top, 18px bottom for X-axis labels) so labels don't clip.
   - `aria-label="Simulated Equity Curve"` preserved verbatim.
   - "Final Capital:" text preserved verbatim in the SectionHeader trailing node (single match — was previously a bare span, now in a SectionHeader trailing div, still resolves to a single text node).

5. **Refined results table (uppercase headers, row hover, tabular-nums)** — NEW `<table data-testid="backtest-trade-stats-table">` with:
   - Uppercase tracking-wider 9.5px font-bold headers (Metric / Value / Hint).
   - Header row carries `hover:bg-transparent` so it doesn't pick up the row-hover accent.
   - Each row carries `hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-colors` so hovering shows a subtle cyan left accent bar.
   - `tabular-nums` on every numeric cell for clean decimal alignment.
   - Tone-coloured values per row (each row carries `data-tone={good|warn|poor|info|neutral}`).
   - Hint column hidden on mobile (`hidden sm:table-cell`).

6. **Section headers with icon + uppercase title** — 5 SectionHeader instances: Backtest Configuration (Settings2 icon, info tone, "Pick a strategy archetype + horizon…" description, `running…` PulseDot trailing or `ready`); Simulated Equity Growth & Drawdown Curve (LineChart icon, good/poor tone by ROI sign, "Final Capital: $X" trailing); Monte Carlo Outcome Distribution (Layers icon, info tone, "{N} steps" trailing); Trade Statistics & Risk Metrics (BarChart3 icon, info tone, "{N} metrics" trailing); Monthly Returns Heatmap (CalendarClock icon, info tone, "{N} periods" trailing). Each title rendered in its own `<span>` so RTL's `getByText` resolves to a single leaf element.

7. **Refined backtest config form (consistent inputs, focus rings)** — Select + 2 number inputs all share the same `bg-[#13161e] border border-[#1f2335] text-xs rounded p-2 outline-none cursor-pointer transition-colors` styling. Each input gains:
   - Focus ring: `focus:ring-1 focus:ring-cyan-500/20 focus:border-cyan-500/40`.
   - Hover border: `hover:border-[#2a3047]`.
   - `tabular-nums` on the number inputs for clean numeric alignment.
   - Lucide icon inside the `<label>` (Settings2 for archetype, DollarSign for capital, CalendarClock for horizon) with `text-[#5a637a]` + `size-3`.
   - Capital input keeps `min=10 max=100000` (preserves the W22-2 DOM query).
   - Days input keeps `min=1 max=365` (preserves the W22-2 DOM query).
   - Run button gets a Lucide Activity icon (when not running) / spinner (when running) + `aria-label="Run Monte Carlo Backtest"` (preserved verbatim) + shadow glow on hover.

8. **Tone-colored metrics (green good, red poor)** — every KpiTile + trade stats row + equity curve stroke + Monte Carlo bucket carries a Tone based on the metric's quality. Good → emerald, warn → amber, poor → red, info → cyan, neutral → muted. Each surface also carries `data-tone={tone}` attribute for downstream CSS targeting. Tone helpers (roiTone / sharpeTone / drawdownTone / winRateTone / profitFactorTone / calmarTone) encapsulate the threshold logic so the trader reads pass/warn/fail at a glance.

9. **Error state: polished error card with retry** — `<ErrorCard />` replaces the bare red-tinted banner. Lucide AlertTriangle icon (w-8 h-8, text-red-400/80) + the error string as the title (direct text node so the W22-1 regexes "Backtest simulation failed (HTTP 500)" + "Network error connecting to simulation runner" resolve to a single leaf) + dim subtitle ("The simulation runner is unreachable or rejected the run. Verify the strategy archetype + horizon, then retry.") + Retry button with Lucide RotateCcw icon + "Retry Backtest" text + `aria-label="Retry backtest"`. role=alert. `data-testid="backtest-error"` + `-msg` on the message span + `-retry` on the button. Re-fires `handleRun` (the same POST /api/backtest/run handler).

10. **Walk-forward / Monte Carlo results display (refined visualization)** — NEW `<div data-testid="backtest-monte-carlo">` card. Derives a 7-bucket outcome distribution from the per-step equity deltas (P5 → P95 quantile edges). Each bucket renders as a vertical bar with:
    - Tone-coloured fill (poor buckets = red, warn = amber, info = cyan, good = emerald).
    - Per-bucket mid-$ label (e.g. "+$1.50" / "-$2.00") in mono tabular-nums underneath.
    - Per-bucket count + percentage (count + tooltip).
    - Hover-brighten (`group-hover:brightness-125`).
    - Tone-tinted x-axis caption "P5 → P95 Equity Outcome Bucket" + "← Worst" / "Best →" tone-tinted endpoint labels.
    - `role="img"` + `aria-label` describing the bucket count.
    - Height scaled to the per-bucket max count so the visualization is always legible regardless of trade volume.

## Test-contract preservation audit

All 18 tests in `BacktestLabView.test.tsx` pass. Critical constraints preserved:
- Title text `Quantitative Backtest & Binary Payoff Simulation Lab` — single match (rendered in a `<span>` direct text node, the FlaskConical icon is a sibling SVG with no text).
- `Kelly Sizing Model` badge — single match (badge span).
- `Monte Carlo path modeling` subheading — single match (preserved verbatim in the header `<p>` element; the new wording in the empty state description carefully avoids this phrase).
- 6 POPULAR_STRATS options — exact text preserved verbatim (the 6 `<option>` text contents match the W22-2 contract — including the jsdom-rendered "Binary Dutch Book Arbitrage (Active)" form).
- `Starting Capital` label — single match (the empty state description was reworded to avoid "starting capital").
- `Simulation Horizon` label — single match (same caveat).
- 2 `input[type=number]` — `min=10 max=100000` on capital, `min=1 max=365` on days.
- `Run Monte Carlo Backtest` button — accessible name preserved verbatim (the Lucide Activity icon is a sibling SVG with no text, so the button's accessible name still matches the regex).
- `Running Simulation` text — single match (the SR-only duplicate span was removed after the initial run revealed a multi-match failure; the visible button text "Running Simulation…" is the sole match).
- POST `/api/backtest/run` body — `strategy_id` + `initial_capital` + `days` + `slippage_bps=5` preserved (slippage state default = 5, not exposed in the UI — preserved exactly as the original).
- Authorization `Bearer <token>` header via `apiFetch` — preserved verbatim.
- KPI labels — each a single match: `Total Return (ROI)`, `Sharpe Ratio`, `Calmar Ratio`, `Value at Risk (95%)`, `Simulation Brier` (the trade stats table was reworded to `VaR (95%)` and `Brier Score` to avoid duplicating these labels).
- `Max Drawdown` — multi-match OK (KPI grid label + Calmar hint "ROI / Max Drawdown"); test uses `getAllByText >= 1`.
- Sharpe value `'1.85'` — single match (the headline KPI strip was removed after the initial run revealed a multi-match failure because it duplicated `result.sharpe_ratio.toFixed(2)`).
- Max drawdown value `/-8\.50%/i` — single match (KPI grid "Max Drawdown" tile value).
- Equity curve SVG `aria-label="Simulated Equity Curve"` — preserved verbatim.
- `Final Capital:` text — single match (now in a SectionHeader trailing span, still resolves to a single text node).
- `Monthly Returns Heatmap` text — single match (SectionHeader title).
- Month labels `2024-01` / `2024-02` / `2024-03` / `2024-04` — each a single match (preserved verbatim via `month.slice(0, 7)`).
- `4 periods` regex — preserved via the SectionHeader trailing span `{entries.length} periods`.
- Error strings — each a single match (rendered as the ErrorCard's title direct text node).
- `strategy_id` updates when the `<select>` changes — preserved.
- Capital input updates — preserved.
- Days input updates — preserved.
- `'use client'` directive — preserved.

## Additional refinements (beyond the 10 spec items)

- Header polish: replaced the `🧪` emoji with Lucide `FlaskConical` icon (size-5, text-cyan-300) — consistent with the W53-c / W54-a header-icon pattern. aria-hidden.
- Config bar: SectionHeader with `running…` PulseDot (warn tone) trailing when running, `ready` text when idle — gives the trader immediate visual feedback on the simulation lifecycle.
- Monthly heatmap: each cell gains `transition-transform hover:scale-105` for subtle hover lift.
- Trade stats table: 2-column layout (Metric | Value) on mobile, 3-column (Metric | Value | Hint) on `sm:` and up.
- Walk-forward / Monte Carlo card: tone-tinted endpoint labels (`← Worst` red / `Best →` emerald) so the trader immediately reads which side is "good".

## New CSS hooks added (for downstream CSS layer to target)

- `data-testid="backtest-loading"` on the loading skeleton wrapper.
- `data-testid="backtest-empty-state"` on the empty state.
- `data-testid="backtest-error"` on the error card (`+ -msg` on the message span, `+ -retry` on the button).
- `data-testid="backtest-kpi-{roi|sharpe|drawdown|winrate|calmar|var|brier}"` on each KpiTile.
- `data-testid="backtest-trade-stats-table"` on the trade statistics table.
- `data-testid="backtest-monte-carlo"` on the Monte Carlo outcome distribution viz.
- `data-tone="{good|warn|poor|info|neutral}"` on each KpiTile, each trade stats row, each Monte Carlo bucket bar, and the equity curve's `<path>` stroke (via the Tone cfg's `stroke` field).

## Verification

```
$ wc -l src/components/BacktestLabView.tsx
1206 src/components/BacktestLabView.tsx
$ git diff --stat src/components/BacktestLabView.tsx
 src/components/BacktestLabView.tsx | 1134 ++++++++++++++++++++++++++++++++----
 1 file changed, 1009 insertions(+), 125 deletions(-)
$ bun run lint
$ echo "lint exit: $?"
lint exit: 0
$ bunx tsc --noEmit --skipLibCheck
$ echo "tsc exit: $?"
tsc exit: 0
$ bunx vitest run src/components/BacktestLabView.test.tsx
 ✓ src/components/BacktestLabView.test.tsx (18 tests) 814ms
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

## Files touched

- `src/components/BacktestLabView.tsx` (UI polish pass, 322 → 1206 lines, +1009 / −125 per `git diff --stat`).
- `/home/z/my-project/agent-ctx/W55-b-full-stack-developer.md` (this detailed agent work record).
- `worklog.md` (W55-b appended entry).

## Final status

- **Polish**: complete — all 10 spec items + 4 additional refinements applied (header FlaskConical icon, config bar PulseDot trailing, monthly heatmap hover lift, trade stats responsive 2/3-column layout, MC card tone-tinted endpoint labels).
- **Backwards-compat**: full — all props, API calls (POST /api/backtest/run via apiFetch with Bearer token), all existing class names (card, badge + badge-purple, btn + btn-primary + btn-sm, mono, scrollbar-thin, kpi-card + kpi-label + kpi-value + kpi-sub, heatmap-cell-pos-3/-2/-1/zero/neg-1/-2/-3, spinner, shadow-2xl), all existing role attributes (role=img + aria-label="Simulated Equity Curve" on the equity curve SVG, role=alert on the error card, role=status on the loading skeleton + empty state), all existing aria-labels, all 6 POPULAR_STRATS option text contents, all KPI labels (single-match), the Sharpe "1.85" + max drawdown "-8.50%" values, the "Final Capital:" text, the "Monthly Returns Heatmap" title + month labels + "N periods" badge, the "Monte Carlo path modeling" subheading, and the 'use client' directive preserved. All 18 tests pass.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors.
- **Tests**: 18/18 pass.

**BacktestLabView is production-ready with the premium W55-b visual layer, visually consistent with the W50-54 MarketsPanel / PositionsPanel / MarketScreener / OrderFlowPanel / StrategyMatrix / StrategyPerformancePanel / MLValidationPanel / DeepAnalysisView redesign family.**
