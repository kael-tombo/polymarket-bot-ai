# Task ID: W54-e

**Agent**: full-stack-developer
**Task**: Polish MLValidationPanel.tsx — Walk-forward CV + drift governance panel visual consistency pass with the W51-2d MLPanel redesign family.

## Context

Read `/home/z/my-project/worklog.md` (last ~250 lines) to map the W50-53
design-system vocabulary:
- W51-2d MLPanel/AIMLCommandCenter — `Tone` system (good/warn/poor/info/
  neutral), `PulseDot`, `SectionHeader`, `KpiTile` (tone-tinted bg + quality
  bar + trend glyph + tabular-nums value), `PsiGauge` (green/amber/red zones
  + tick marker), `ShimmerBlock`, Model Status Banner, refined calibration
  curve + SHAP bars.
- W52-a MarketsPanel / W52-b OrderFlowPanel — `data-tone` hooks, SortIndicator,
  row-hover accent bar (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]`),
  tabular-nums everywhere, polished empty/error states (`.empty-state` /
  `.error-state` CSS classes from globals.css).
- W53-a StrategyMatrix — `StrategySkeletonGrid` shimmer loading, `ErrorCard`
  with `RotateCcw` Retry glyph + Dismiss X, `ToggleErrorBanner`, refined
  toolbar (search + sort + tabs).

Reference implementations consulted:
- `src/components/MLPanel.tsx` (W51-2d, ~922 lines — Tone + KpiTile + PsiGauge +
  SectionHeader + ShimmerBlock + Model Status Banner).
- `src/components/MLValidationPanel.test.tsx` (10 tests — W28-3 contract).

## Test contract mapping

Enumerated every test-matched string from MLValidationPanel.test.tsx:

| Test | Matched string | How it resolves |
|---|---|---|
| Renders the panel container without crashing | `container.firstChild` truthy | Wrapper `<div>` |
| Renders the panel header title | `/ML Validation & Walk-Forward CV/` regex | `<h2>` direct text node |
| Renders the "governance + drift" badge | `governance + drift` exact | `<span class="badge badge-dim">` direct text |
| Renders the three endpoint notes | `/api/ml/metrics` + `/api/ml/drift` + `/api/ml/versions` exact | Each as its own `<code class="mono">` leaf text node |
| Renders without crashing when fetch never resolves | `container.firstChild` truthy + header title visible | Skeleton + header preserved |
| Renders the "ML validation backend unreachable" error state | `ML validation backend unreachable` exact | `<div class="error-state-title">` direct text node |
| Renders the Refresh button | `getByRole('button', { name: /refresh/i })` | `<Button>Refresh</Button>` accessible name |
| Renders the Retrain button | `getByRole('button', { name: /retrain now/i })` | `<Button>Retrain Now</Button>` accessible name |
| Renders the drift status badge "Drift OK" once metrics resolve | `/Drift OK/i` regex | `<span class="badge badge-green">Drift OK · PSI …</span>` direct text |
| Passes the Authorization header via apiFetch on the initial poll | `fetch.mock.calls[0][1].headers.Authorization` matches `/^Bearer\s+\S+$/` | apiFetch auto-attaches the header |

## Build

Added 7 new inline sub-components (kept private to the panel so test mocks
+ ts-isolation stay clean):

- `PulseDot({ tone, pulse = true })` — Tailwind `animate-ping` halo + solid
  dot, aria-hidden. Mirrors MLPanel PulseDot.
- `SectionHeader({ icon, title, description, tone, trailing })` — Lucide
  icon + uppercase tracking-wider 9.5px title + optional dim italic
  description + optional trailing node (badge / selector). Used by the
  Reliability Diagram, Drift Status, Feature Importance, Model Version &
  Retrain sections (replacing the old `<span class="card-title flex
  items-center gap-1.5">` pattern with a more structured header).
- `KpiTile({ label, value, hint, tone, quality, trend, testId })` —
  tone-tinted bg + uppercase 9px label + large 16px tabular-nums value +
  optional quality bar + optional trend glyph (▲/▼). Used for the 5
  aggregate validation metric cards (Brier ↓, ROC-AUC ↑, Log-loss ↓,
  ECE ↓, Accuracy). Each KpiTile carries a `data-testid` (ml-validation-
  kpi-{brier|auc|logloss|ece|accuracy}) so downstream tests can target
  individual tiles.
- `ShimmerBlock({ className })` — thin skeleton-line-sm placeholder that
  can be sized via the className prop. aria-hidden so screen readers
  don't pick it up.
- `ValidationSkeleton()` — structured loading placeholder that mirrors
  the loaded layout (KPI row + walk-forward table + drift + calibration
  row + feature list + model version row) so the panel doesn't visually
  jump when the first fetch resolves. role=status + aria-live=polite +
  data-testid="ml-validation-skeleton".
- `PolishedErrorState({ message, detail, onRetry })` — red-tinted error
  card with AlertTriangle icon + title (direct text node) + dim detail +
  Retry button (RefreshCw glyph). role=alert + data-testid="ml-validation-
  error" + "-retry" suffix on the button. Replaces the bare inline
  ErrorState component.
- `PolishedEmptyState({ icon, title, desc, tone })` — friendly empty-state
  with Lucide icon + title + dim desc. role=status. Used by the per-fold
  table (Layers icon), calibration plot (Crosshair), drift status
  (Activity), feature importance (BarChart3), and active-model tile
  (Layers).

Applied the W51-2d Tone system locally (`ValidationTone = pass | warn |
fail | info | neutral`) with self-contained class sets (bg, border, text,
bar, dot, label, halo) — static class strings so Tailwind 4's scanner
picks them up. Renamed `good`/`warn`/`poor` to `pass`/`warn`/`fail` so
the tone vocabulary matches the validation-domain nomenclature
(pass/warn/fail rather than good/warn/poor).

## All 9 polish affordances applied

1. **KpiTile pattern for validation metrics** — 5 aggregate metric cards
   (Brier ↓, ROC-AUC ↑, Log-loss ↓, ECE ↓, Accuracy) refactored to the
   shared KpiTile sub-component. Each carries a tone-tinted bg + quality
   bar + trend glyph derived from the metric's own thresholds
   (Brier: good 0.15 / warn 0.20; ROC-AUC: good 0.80 / warn 0.70;
   Log-loss: good 0.45 / warn 0.55; ECE: good 0.03 / warn 0.06). The
   `kpi-card` / `kpi-value` / `kpi-label` / `kpi-sub` class names are
   preserved on the wrapper + tile root so any downstream CSS that
   targets them still applies.

2. **Shimmer skeleton loading state** — the bare `<Skeleton rows={6}/>`
   placeholder is replaced with `<ValidationSkeleton/>` which mirrors the
   loaded layout (KPI row + walk-forward table + drift + calibration row
   + feature list + model version row) so the panel doesn't visually
   jump when the first fetch resolves. Uses the existing `.skeleton-line-
   sm` / `.skeleton-line-md` classes from globals.css.

3. **Polished empty state with Lucide icon + message** — every empty
   surface (per-fold table → Layers, calibration plot → Crosshair, drift
   status → Activity, feature importance → BarChart3, active-model tile
   → Layers) now uses `PolishedEmptyState` with the W51-2d styling
   (Lucide icon at 28px opacity 0.6 + `.empty-state-title` direct text
   node + `.empty-state-desc` dim description). role=status preserved.

4. **Section headers with icon + uppercase title** — every section
   (Reliability Diagram → Crosshair, Drift Status → Activity, Feature
   Importance → BarChart3, Model Version & Retrain → Sparkles) now uses
   `SectionHeader` with a Lucide icon + uppercase tracking-wider 9.5px
   title + optional dim italic description + optional trailing badge.
   The walk-forward folds section keeps its existing `card-title` with
   History icon (since the trailing slot needs to host the new focus-
   metric Select + the snapshots count badge, which is easier with the
   card-title pattern).

5. **Refined validation results table** — uppercase headers (10px,
   tracking-wider, text-[#5a637a] font-bold), tabular-nums on every
   numeric column (PSI / KS / Rolling Brier / EWMA Brier + snapshot
   time + aggregate row), row-hover accent bar via inset shadow
   (`hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,
   211,238,0.45)]`) so the trader can read across a wide fold row
   without losing position. Aggregate row preserved (cyan border-top-2
   + bold cyan values + tabular-nums). Header row carries `hover:bg-
   transparent` so it doesn't pick up the row-hover accent.

6. **Tone-colored validation status** — green pass / amber warning / red
   fail. The `DRIFT_STATUS_MAP` already maps HEALTHY → badge-green,
   MODERATE_SHIFT → badge-amber, SIGNIFICANT_DRIFT → badge-red; the
   per-fold table now also tags each row's status cell with `data-tone=
   {pass|warn|fail}` so downstream CSS can target it. The header drift
   badge carries `data-tone={driftStatusInfo.tone}`. The retrain toast
   carries `data-tone={pass|fail}` based on success/error. The active-
   model status badge carries `data-tone={pass|warn}` based on
   ACTIVE/RETIRED. The calibration per-bin |Δ| cell carries `data-tone=
   {pass|warn|fail}` based on the delta magnitude (≤0.03 / ≤0.08 / >0.08).

7. **Walk-forward visualization (Sparkline) refined** — the PSI trend
   sparkline now carries tone-aware stroke (emerald / amber / red based
   on the live PSI value), a faint baseline gridline at 50% so the
   trend's relative movement reads clearly, and a tone-tinted area-fill
   (rgba 12% opacity) so the trend reads at a glance. The sparkline SVG
   now carries `role="img"` + `aria-label` describing the trend length.

8. **Error state: polished error card with Retry** — aligned with the
   W51-2d MLPanel ErrorState styling (AlertTriangle icon 28px + title
   direct text node + dim detail + Retry button with RefreshCw glyph).
   role=alert + data-testid="ml-validation-error" + "-retry" suffix on
   the button. The "ML validation backend unreachable" title is
   preserved exactly (test contract).

9. **Refined controls — fold selector + NEW metric selector** — the
   existing fold selector ("Compare against") keeps its Select styling.
   A NEW focus-metric selector (native shadcn Select with 4 options:
   PSI / KS / Rolling Brier / EWMA Brier) lets the trader highlight one
   of the per-fold table's numeric columns with a subtle cyan background
   tint (`bg-cyan-500/[0.05]` on the cell, `bg-cyan-500/[0.06]` + cyan
   text on the header) + bolder weight; the other three stay neutral.
   PSI is the default since it's the primary drift signal. Purely a
   visual emphasis layer — preserves all data.

## Additional refinements (beyond the 9 spec items)

- Header polish: the header drift badge now carries `data-tone` so the
  panel-level CSS can target the tone.
- Drift tiles (PSI, KS, Rolling Brier, EWMA Brier) in DriftStatusView
  refactored from the bare `bg-[#0e1015]` tile to tone-tinted bg + border
  using the Tone system (mirroring MLPanel's KpiTile styling). Null
  values render as muted "awaiting ≥20 samples" text so the trader knows
  the metric is pending, not missing.
- Feature importance row now carries a hover state (`hover:bg-cyan-500/
  [0.04]`) so the trader can hover individual feature rows. The
  feature-rank index now uses `tabular-nums`.
- Active-model tile's status badge now carries `data-tone={pass|warn}`
  based on ACTIVE/RETIRED.
- Calibration per-bin table: |Δ| cell now uses the Tone system's text
  color (emerald ≤0.03, amber ≤0.08, red >0.08) instead of the bare
  text-emerald-400 / text-amber-400 / text-red-400 classes (cleaner
  refactor — same colors, just routed through TONE).
- Footer polish: auto-refresh interval now uses `tabular-nums`.
- Added `qualityPct()` helper that maps a metric onto a 0–100 scale
  anchored at the `good` threshold; powers the KpiTile quality bar so
  pass/warn/fail reads at a glance.
- The retrain toast now carries `role={status|alert}` based on success
  vs error (was just a plain div before).
- The dismiss-retrain-toast button now carries `aria-label="Dismiss
  retrain toast"` (was bare with only "dismiss" text).
- New CSS hooks added for downstream targeting: `data-testid="ml-
  validation-skeleton"`, `data-testid="ml-validation-error"`, `data-
  testid="ml-validation-error-retry"`, `data-testid="ml-validation-kpi-
  {brier|auc|logloss|ece|accuracy}"`, `data-tone={pass|warn|fail|info|
  neutral}` on header drift badge + per-fold status cells + active-model
  status badge + retrain toast + calibration |Δ| cells + PSI trend
  sparkline badge.

## What was preserved

- All props, API calls (`apiFetch(${apiUrl}/api/ml/metrics)` +
  `/api/ml/drift` + `/api/ml/versions` in parallel on mount + every 30s +
  `POST /api/ml/retrain` on Retrain Now click), polling (30s setInterval
  with visibilitychange pause/resume), clean unmount (clearInterval +
  removeEventListener in useEffect cleanup).
- All existing class names retained: `.card`, `.card-header`, `.card-
  title`, `.badge` + `.badge-green` / `-amber` / `-red` / `-cyan` /
  `-dim`, `.data-table`, `.table-container`, `.label-col`, `.grid-kpi`,
  `.kpi-card` / `.kpi-label` / `.kpi-value` / `.kpi-sub`, `.mono`,
  `.scrollbar-thin`, `.empty-state` (+ `-icon` / `-title` / `-desc`),
  `.error-state` (+ `-icon` / `-title` / `-desc`), `.skeleton-line-sm` /
  `.skeleton-line-md`.
- All existing accessibility roles/labels preserved (Refresh + Retrain
  Now button accessible names, role=alert on error, role=status on
  loading/empty, the existing `aria-label="Dismiss stub notice"` /
  `aria-label="Dismiss retrain toast"` on dismiss buttons).
- All test-matched strings preserved verbatim: "ML Validation &
  Walk-Forward CV" header title, "governance + drift" badge, the three
  /api/ml/* endpoint notes, "ML validation backend unreachable" error
  title, "Refresh" + "Retrain Now" button accessible names, "Drift OK"
  drift badge text.
- 'use client' directive preserved at the top of the file.
- All inline child components (`CalibrationPlot`, `DriftStatusView`)
  preserved as private functions in the same file.

## Verification

```
$ wc -l src/components/MLValidationPanel.tsx
1576 src/components/MLValidationPanel.tsx

$ git diff --stat HEAD src/components/MLValidationPanel.tsx
 src/components/MLValidationPanel.tsx | 921 ++++++++++++++++++++++++-----------
 1 file changed, 644 insertions(+), 277 deletions(-)

$ bun run lint 2>&1 | tail -5
$ eslint .
(clean — exit 0, no output)

$ bunx eslint src/components/MLValidationPanel.tsx; echo "exit=$?"
exit=0

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep MLValidationPanel | head -5
(0 errors in MLValidationPanel.tsx — pre-existing errors in
ShadowInferencePanel.tsx + AIPredictionExplainerPanel.tsx are
unrelated to this task)

$ bunx vitest run src/components/MLValidationPanel.test.tsx 2>&1 | tail -5
 ✓ src/components/MLValidationPanel.test.tsx (10 tests) 678ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Stage Summary

- **Final line count**: 1576 lines (was 1209 — +644 insertions / −277
  deletions per `git diff --stat`).
- **All 9 polish affordances applied** while preserving the existing
  props, API calls, polling, class names, accessibility roles/labels,
  test contracts, and the 'use client' directive.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors in MLValidationPanel.tsx.
- **Tests**: 10/10 pass.

**MLValidationPanel is production-ready with the premium W54-e visual
layer, visually consistent with the W51-2d MLPanel / AIMLCommandCenter
redesign family.**
