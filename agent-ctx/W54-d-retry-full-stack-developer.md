# Task ID: W54-d-retry

**Agent**: full-stack-developer
**Task**: Polish `src/components/ShadowInferencePanel.tsx` — shadow-mode
predictions (counterfactual signals recorded but never executed) visual
consistency pass with the W50-54 redesign family. Verify the prior W54-d
polish pass is complete + correct, fill any gaps, and record the work
(a prior W54-d agent did the file edits but never appended a worklog
entry — this retry closes that gap).

## Context

Read `/home/z/my-project/worklog.md` (last ~400 lines) to map the
W50-54 design-system vocabulary:
- W51-2d MLPanel / AIMLCommandCenter — `Tone` system (good/warn/poor/
  info/neutral), `PulseDot`, `SectionHeader` (icon + uppercase title +
  dim description + trailing node), `KpiTile` (tone-tinted bg + quality
  bar + trend glyph + tabular-nums value).
- W52-a MarketsPanel / W52-b OrderFlowPanel — `data-tone` hooks,
  `SortIndicator` (Lucide ArrowUp/ArrowDown on active column, ArrowUpDown
  on inactive), row-hover accent bar (`border-l-2 border-l-transparent
  hover:border-l-cyan-400/60`), `tabular-nums` everywhere, polished
  empty/error states via the `.empty-state` / `.error-state` CSS classes
  from globals.css.
- W53-a StrategyMatrix — shimmer loading skeleton grid, `ErrorCard` with
  `RotateCcw` Retry glyph + Dismiss X button + role=alert.
- W53-c StrategyPerformancePanel — `KpiTile` with quality bar + trend
  glyph, `ComparisonRow` side-by-side pattern.
- W54-a DeepAnalysisView — `PolishedEmptyState` (Lucide icon + title +
  dim helper copy), `ErrorCard` with retry + dismiss, tone thresholds
  (accuracy ≥0.85 good / 0.75-0.85 warn / <0.75 poor; brier <0.15 good /
  0.15-0.22 warn / ≥0.22 poor).
- W54-e MLValidationPanel — `ValidationSkeleton` structured shimmer that
  mirrors the loaded layout, `SectionHeader` with icon + uppercase
  tracking-wider title, per-fold table row-hover accent.

Reference implementations consulted:
- `src/components/ShadowInferencePanel.tsx` (the target — 2256 lines,
  prior W54-d polish already in the working tree).
- `src/components/ShadowInferencePanel.test.tsx` (10 tests — W28-3
  contract: loading skeleton "Shadow Inference" title + "Loading…"
  badge, loaded "Shadow Inference + Counterfactual Journal" header,
  Refresh-now button via title="Refresh now", Live/Paused toggle via
  title=/auto-refresh every 20s/i, "Champion: {version}" badge,
  "Unable to reach any shadow-inference backend" error string,
  Authorization header passed via apiFetch on initial poll).

## Verification of the prior W54-d polish pass

Read the full 2256-line file end-to-end and cross-checked each of the 9
spec items against the working tree:

1. **KpiTile pattern for shadow metrics** — ✅ present at lines 1246-1293.
   New 3-tile KPI strip (`§0 Shadow Metrics`) renders between the
   `ModelStatusStrip` and the Challenger Models section: Predictions
   Count (info tone, quality=min(100,count)), Accuracy (tone via
   `accuracyTone` — good ≥0.85 / warn 0.75-0.85 / poor <0.75, quality=
   round(acc*100), trend up/flat/down), Brier Score (tone via
   `brierTone` — good <0.15 / warn 0.15-0.22 / poor ≥0.22, quality=
   round((1-brier/0.25)*100), trend up/flat/down). Each tile has the
   tone-tinted bg + uppercase label + large tabular-nums value + dim
   hint + quality bar + trend glyph. testids: `shadow-kpi-predictions`,
   `shadow-kpi-accuracy`, `shadow-kpi-brier`.

2. **Shimmer skeleton loading state** — ✅ present at lines 1069-1126.
   Early-return renders a structured loading skeleton that mirrors the
   loaded layout: header (Ghost icon + "Shadow Inference" title +
   "Loading…" badge) → `ShadowKpiSkeleton` (3-tile KPI strip with
   `skeleton-line-sm` / `skeleton-line-lg` shimmer + quality bar
   placeholder) → side-by-side scatter card skeleton (`skeleton-card`
   with 6 shimmer lines) + comparison card skeleton (5 shimmer rows) →
   `ShadowTableSkeleton` (header row + 5 data rows × 9 columns).
   role=status + aria-live=polite + data-testid="shadow-loading-skeleton".
   The "Shadow Inference" title is a single leaf text node (required by
   W28-3 test #2) and "Loading…" is a single leaf text node (required
   by W28-3 test #3).

3. **Polished empty state with Lucide icon + "No shadow predictions yet"**
   — ✅ present at lines 1869-1874. `PolishedEmptyState` with `Inbox`
   icon + title="No shadow predictions yet" + dim helper copy
   ("Counterfactual trades appear here when trading_mode == 'shadow'…").
   Uses the `.empty-state` / `.empty-state-icon` / `.empty-state-title`
   / `.empty-state-desc` CSS classes from globals.css. role=status +
   data-testid="shadow-trades-empty". A second empty state
   (`PolishedEmptyState` with `Search` icon) renders when the filter
   matches 0 rows (testid="shadow-trades-filtered-empty").

4. **Section headers with icon + uppercase title** — ✅ present. Shared
   `SectionHeader` sub-component (lines 475-506) renders a Lucide icon
   + uppercase tracking-wider 11px title in its own `<span>` (so RTL
   `getByText` resolves to a single leaf) + optional dim italic
   description + optional trailing node. Used 5 times: Shadow Metrics
   (Sparkles), Challenger Models (Swords), Champion vs Challenger P(YES)
   (Target), Shadow vs Real Performance (Activity), Shadow Trades (Boxes),
   Per-Strategy Breakdown (Hash).

5. **Refined predictions table** — ✅ present. All 9 column headers use
   `h-7 text-[9.5px] uppercase tracking-wider text-[#5a637a] font-bold`.
   `SortIndicator` (lines 510-525) on the Age column with `active
   direction="desc"` (Lucide ArrowDown in cyan). Row hover accent: every
   shadow-trades row carries `border-l-2 border-l-transparent
   hover:border-l-cyan-400/60 transition-colors` (line 1936).
   `tabular-nums` on every numeric cell (Age, Token, Price, Size,
   predicted_edge, AI Conf., challenger table Preds/Accuracy/LogLoss/
   Brier/AUC, per-strategy counts/edges/P&L).

6. **Tone-colored accuracy** — ✅ present. `accuracyTone(acc)` helper
   (lines 448-452) returns good/warn/poor for ≥0.85/0.75-0.85/<0.75.
   Applied to the KpiTile tone (line 1266) + the challenger table
   accuracy cell `data-tone` attribute (line 1514) with the conditional
   `text-emerald-400` / `text-amber-400` / `text-red-400` classes
   (lines 1508-1513). Brier tone mirrors the same thresholds.

7. **Comparison display: shadow prediction vs actual outcome** — ✅
   present. Two complementary surfaces:
   - **Shadow trades table** (lines 1836-1862): "AI Pred. Edge" column
     header carries a `Sparkles` icon + `text-blue-300` tone +
     `border-l border-blue-900/40` left divider, signalling the
     model-side prediction. "Outcome" column header carries a `Target`
     icon + `text-emerald-300` tone + `border-l border-emerald-900/40`
     divider, signalling the inferred actual outcome. The two columns
     are visually grouped (blue tone for prediction, emerald tone for
     outcome) with a vertical divider between them. Row cells echo the
     tone: predicted_edge renders in `text-blue-300` (positive) /
     `text-purple-300` (negative) with a small Sparkles glyph (line
     1970); outcome renders as a green/red/amber Badge with
     TrendingUp/TrendingDown/Clock glyph.
   - **`ComparisonRow` sub-component** (lines 2191-2256): 3-column grid
     (label / shadow / real) with the shadow column tinted cyan
     (`bg-cyan-950/20` + `border-l border-cyan-900/30` + "Shadow" label
     with Sparkles glyph) and the real column tinted emerald
     (`bg-emerald-950/20` + `border-l border-emerald-900/30` + "Real"
     label with Target glyph). `data-side="shadow"` / `data-side="real"`
     + `data-tone={positive|negative|neutral}` attributes for downstream
     CSS targeting.

8. **Error state: polished error card with retry** — ✅ present.
   `ErrorCard` sub-component (lines 610-668) renders an `AlertTriangle`
   icon + the error string as the title (direct text node — required by
   W28-3 test #9 regex `getByText(/Unable to reach any shadow-inference
   backend/)`) + dim subtitle + Retry button (RotateCcw glyph) + Dismiss
   X button. role=alert + data-testid="shadow-error-card" +
   data-tone="poor". Wired at line 1211 with `onRetry={() => fetchAll()}`
   and `onDismiss={() => setError(null)}`. The header error indicator
   (small AlertCircle at line 1153) is preserved as a secondary signal.

9. **Refined controls (filters, refresh)** — ✅ present.
   - **Filter input** (lines 1792-1804): `Input` with a `Search` Lucide
     icon absolutely-positioned inside, `aria-label="Filter shadow
     trades"`, placeholder="Filter token / strategy / side", focus ring
     in cyan. Filters by case-insensitive substring on the union of
     token_id + strategy + side (lines 963-970). KPI metrics are
     computed from the unfiltered set so headline numbers don't change
     as the trader types.
   - **Refresh button** (lines 1177-1185): `Button` variant=outline
     size=icon with `RefreshCw` icon + `title="Refresh now"` (required
     by W28-3 test #6). Calls `fetchAll()`.
   - **Live/Paused toggle** (lines 1164-1176): badge-styled button with
     `PulseDot` (good tone when Live, neutral + no pulse when Paused) +
     "Live"/"Paused" text + title "Auto-refresh every 20s — click to
     pause" (required by W28-3 test #7). Toggles the `polling` state.
   - **Register Challenger button** (lines 1303-1311): `Button` variant=
     outline with `PlusCircle` icon, toggles the collapsible register
     form.

## Additional polish affordances verified

- **Tone system** (lines 422-457): self-contained `Tone` type + `TONE`
  config record (bg / border / text / bar / dot / label / halo for good
  / warn / poor / info / neutral). Static class strings so Tailwind 4's
  scanner picks them up. `accuracyTone` + `brierTone` helpers share the
  W53-c thresholds.
- **PulseDot** (lines 460-470): animate-ping halo + solid dot + glow
  shadow. Used by the Live/Paused toggle.
- **NotAGuaranteeInline banner** (line 1227): permanent disclaimer at
  the top of the body, rendered before the first fetch resolves.
- **ModelStatusStrip** (lines 1231-1237): champion version + training
  time + drift level + calibration + feature freshness, all in one
  compact strip.
- **WhyExplanation** (lines 1586-1593): top-3 SHAP-style feature
  contributions + champion-vs-challenger agreement, collapsible.
- **Promote-to-champion AlertDialog** (lines 2088-2175): operator
  override with target metrics summary + REJECTED-safety-gate warning.
  POST /api/ml/rollback on confirm.
- **Register new challenger form** (lines 1332-1411): collapsible form
  with Model Name / Path / Ensemble Weight fields + graceful 404/405
  notice if the backend route isn't wired yet.
- **Promote / Register toasts** (lines 1190-1201): auto-clear after 5s.
- **Footer note** (lines 2079-2084): documents the backend modules
  (`ml/shadow_inference.py`, `core/shadow_trading.py`) + endpoints +
  polling cadence.
- **tabular-nums everywhere**: KpiTile values, all table numeric cells,
  header timestamps, comparison row values, footer cadence.

## Backwards-compat verification

- **API calls preserved**: `apiFetch` GET /api/ml/versions,
  /api/shadow/trades?limit=50, /api/shadow/comparison, /api/ml/metrics
  (4 parallel `Promise.allSettled` on mount + every 20s); POST
  /api/ml/rollback?v=X on promote; POST /api/ml/register on register.
- **Polling preserved**: 20s `setInterval` + clear on unmount + pause
  when `document.hidden` + immediate refresh on resume via
  `visibilitychange` listener.
- **Class names preserved**: `card`, `card-header`, `card-title`, `badge`
  + `badge-green` / `badge-dim`, `btn` (via shadcn Button), `input`,
  `mono`, `scrollbar-thin`, `spinner`, `skeleton-*`, `empty-state` (+
  `-icon` / `-title` / `-desc`), `error-state` (+ `-icon` / `-title` /
  `-desc`).
- **aria-labels / roles preserved**: role=status on loading skeleton +
  empty states, role=alert on error card, aria-label on filter input +
  dismiss buttons, title attributes on Refresh + Live/Paused toggle.
- **Test-matched strings preserved**: "Shadow Inference" (loading
  skeleton title, single leaf text node), "Loading…" (badge, single
  leaf text node), "Shadow Inference + Counterfactual Journal" (loaded
  header, single leaf text node), "Refresh now" (button title),
  "Auto-refresh every 20s — click to pause" (toggle title), "Champion:
  {version}" (badge text), "Unable to reach any shadow-inference
  backend. Retrying…" (error string, rendered as ErrorCard title direct
  text node so the W28-3 regex resolves to a single leaf).
- **'use client' directive preserved** (line 75).

## Verification results

```
$ bun run lint 2>&1 | tail -3
$ eslint .
(exit 0 — clean)

$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3
(exit 0 — 0 errors)

$ bunx vitest run src/components/ShadowInferencePanel.test.tsx 2>&1 | tail -8
 ✓ src/components/ShadowInferencePanel.test.tsx (10 tests) 618ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

All 10 W28-3 tests pass:
1. ✅ renders the panel container without crashing
2. ✅ renders the loading-state header title "Shadow Inference"
3. ✅ renders the "Loading…" badge while waiting for the first fetch
4. ✅ renders without crashing when the fetch never resolves (stays loading)
5. ✅ renders the "Shadow Inference + Counterfactual Journal" header after data loads
6. ✅ renders the Refresh-now button (title="Refresh now") after data loads
7. ✅ renders the Live/Paused polling toggle button
8. ✅ renders the Champion badge once a champion model version is resolved
9. ✅ renders the "Unable to reach any shadow-inference backend" error message
10. ✅ passes the Authorization header via apiFetch on the initial poll

## Files touched

- `/home/z/my-project/agent-ctx/W54-d-retry-full-stack-developer.md`
  (this work record).
- `/home/z/my-project/worklog.md` (appended W54-d-retry entry).

No source-file edits were required — the prior W54-d agent's polish
pass was already complete and correct in the working tree. This retry
verified completeness, ran the full verification suite (lint + tsc +
tests all green), and closed the missing-worklog-entry gap.

## Final status

- **Polish**: complete — all 9 spec items verified present and correct.
- **Backwards-compat**: full — all API calls, polling, class names,
  testids, role attributes, aria-labels, test-matched strings, and the
  'use client' directive preserved. 10/10 tests pass.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors.
- **Tests**: 10/10 pass.

**ShadowInferencePanel is production-ready with the premium W54-d
visual layer, visually consistent with the W50-54 MarketsPanel /
PositionsPanel / MLPanel / AIMLCommandCenter / OrderFlowPanel /
StrategyPerformancePanel / StrategyMatrix / DeepAnalysisView /
MLValidationPanel redesign family.**
