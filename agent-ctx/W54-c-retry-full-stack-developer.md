# Task ID: W54-c-retry

**Agent**: full-stack-developer
**Task**: Polish `src/components/AIPredictionExplainerPanel.tsx` — SHAP explainability + prediction history + reliability diagram panel — visual consistency pass with the W51-2d MLPanel / AIMLCommandCenter / W54-e MLValidationPanel redesign family.

## Context

Read `/home/z/my-project/worklog.md` (last ~500 lines) to map the W50–54
design-system vocabulary:
- W51-2d MLPanel/AIMLCommandCenter — `Tone` system (good/warn/poor/info/
  neutral), `PulseDot`, `SectionHeader`, `KpiTile` (tone-tinted bg + quality
  bar + trend glyph + tabular-nums value), `PsiGauge`, `ShimmerBlock`,
  Model Status Banner, SHAP bars (blue→cyan bullish / red→amber bearish).
- W54-a DeepAnalysisView — `data-tone` hooks, `PulseDot` LIVE indicator,
  row-hover accent bar (`hover:shadow-[inset_3px_0_0_0_rgba(...)]`),
  polished empty/error states, sub-section uppercase headers.
- W54-e MLValidationPanel — `KpiTile` pattern for aggregate metrics,
  `ValidationSkeleton` shimmer, `PolishedEmptyState`, `SectionHeader` on
  every section, `PolishedErrorState` with retry, `data-tone` on every
  tone-derived surface.

Reference implementations consulted:
- `src/components/AIPredictionExplainerPanel.tsx` (existing — already had
  W54-c Tone/KpiTile/SectionHeader/PsiGauge/ShimmerBlock/PolishedEmptyState/
  PolishedErrorCard/PredictionHeadline/ModelVsMarket/WhyExplainer/
  PredictionHistoryTable/CalibrationCard inline sub-components + the
  status-strip StatusPill pattern).
- `src/components/AIPredictionExplainerPanel.test.tsx` (20 tests —
  W38-5 contract).
- `src/components/MLPanel.tsx`, `src/components/AIMLCommandCenter.tsx`,
  `src/components/MLValidationPanel.tsx` (W51-2d / W54-a / W54-e reference
  implementations).

## State on entry

Verified on entry that the panel already had the W54-c polish layer
applied (Tone system, KpiTile, SHAP bars, shimmer skeleton, polished
empty/error states, SectionHeader, tabular-nums, prediction-history
row-hover accent bar, error card with retry). All 20 tests passed.
Lint clean. TSC clean for the panel (3 pre-existing errors live in
`BacktestLabView.tsx` — unrelated to this task).

The W54-c-retry brief asks for a focused pass that **reinforces** the
existing polish with semantic `data-tone` hooks + a11y improvements +
PulseDot LIVE indicator on the polling toggle, mirroring the
MLPanel/AIMLCommandCenter/MLValidationPanel visual vocabulary. The
retry deliberately does NOT touch the existing Tone system, KpiTile,
SHAP bar gradient, shimmer layout, or test-matched strings — only
adds new surface-area enhancements that improve downstream CSS
targeting + screen-reader behaviour without breaking the test
contract.

## Test contract mapping

Enumerated every test-matched string from
AIPredictionExplainerPanel.test.tsx (20 tests):

| Test | Matched string / selector | How it resolves |
|---|---|---|
| renders without crashing | `container.firstChild` truthy | Wrapper `<div>` |
| renders the title | `/Explainable AI \/ ML Prediction/i` | `<span class="card-title">` direct text node |
| renders the "NOT A GUARANTEE" disclaimer banner | `/NOT A GUARANTEE/i` + `getByRole('alert', { name: /AI prediction disclaimer/i })` | `<div class="banner-warning" role="alert" aria-label="AI prediction disclaimer">` direct text |
| fetches all six backend endpoints on mount | `/api/ml/metrics`, `/api/ml/drift`, `/api/ml/versions`, `/api/snapshot`, `/api/shadow/trades`, `/api/data-quality` URL fragments in fetch calls | apiFetch calls |
| renders the prediction headline as "X% YES (confidence: Y)" — NOT just "X%" | `screen.getByText('65%')`, `screen.getByText('YES')`, `screen.getByText(/confidence:/i)`, `screen.getAllByText('0.72')`, `screen.getAllByText(/AI Prediction/i)`, `screen.getByText(/model-generated/i)` | Headline spans |
| renders the 95% confidence interval range bar | `screen.getByTestId('ai-ci-range-bar')` + `screen.getByText(/95% confidence interval/i)` | CIRangeBar div + headline label |
| renders the "Model vs Market" comparison card with the edge labelled | `screen.getByTestId('model-vs-market-card')`, `screen.getByText('AI Model')`, `screen.getByText('Market')`, `screen.getAllByText('Edge')`, `screen.getAllByText('+2.00pp')` | Card + cells |
| renders the status header strip with all required audit fields | `screen.getByTestId('ai-status-strip')` + each label "Model Status" / "Model Version" / "Training Data" / "Feature Freshness" / "Prediction P(YES)" / "Confidence" / "Calibration" / "Market-Implied" / "Edge Estimate" / "Drift Status" / "Data Quality" / "Training Samples" + values "v1.4.champion", "OK", "healthy" | 12 StatusPills in the strip |
| renders the "Why? — Explainability" collapsible card | `screen.getByTestId('why-explainer-card')` + `screen.getByTestId('why-explainer-trigger')` + `screen.getByText(/Drift OK/i)` + `screen.getByText('Champion')` + `screen.getByText('Challenger')` (after click) | Collapsible card + trigger + drift badge + champion/challenger mini-strip |
| fetches /api/ml/explain/{token_id} when expanded | fetch call includes `/api/ml/explain/` after click | apiFetch call |
| renders the prediction history table | `screen.getByTestId('prediction-history-card')` + `screen.getByText(/Prediction History \(last 20\)/i)` + `screen.getAllByText('ml_edge')` + `screen.getByTestId('prediction-history-row-101')` + `screen.getByTestId('prediction-history-row-100')` | Card + SectionHeader title + row testids |
| renders the calibration curve card with ECE badge | `screen.getByTestId('calibration-card')` + `screen.getByTestId('ece-badge')` has text `ECE 0.0231` + `screen.getByText(/Calibration Curve/i)` | Card + Badge + SectionHeader title |
| renders an empty-state history table when no shadow trades exist | `screen.getByText(/No predictions recorded yet/i)` | PolishedEmptyState title |
| surfaces the partial-outage error when ALL endpoints fail | `screen.getByText(/Unable to reach any AI\/ML backend endpoint/i)` | PolishedErrorCard message |
| surfaces a partial-outage notice when some endpoints fail | `screen.queryByText(/Partial outage/i)` not in document when ONLY /api/data-quality fails | data-quality treated as optional |
| passes the Authorization header via apiFetch on every fetch | `headers.get('Authorization')` matches `/^Bearer\s+\S+$/` | apiFetch auto-attaches |
| polls every 20s | fetch count increases after `vi.advanceTimersByTimeAsync(20_000)` | setInterval |
| clears the polling interval on unmount (no leaked setState) | fetch count unchanged after unmount + 120s advance | clearInterval cleanup |
| renders the data quality warnings list when warnings exist | `screen.getByTestId('data-quality-warnings')` + `screen.getByText('spread_anomaly')` | Warnings div |
| uses blue/purple color tones for AI-generated content | `headline.className` contains `border-blue-500` + first "AI Prediction" match `.className` contains `text-blue-300` + at least one '0.72' element `.className` contains `text-purple-300` | Headline card + label + headline confidence span |

## What changed in W54-c-retry

### 1. StatusPill: optional `dataTone` prop → semantic `data-tone` attribute

The existing `StatusPill` rendered a single hardcoded `data-testid="ai-status-pill"` and expressed its tone only via the small colored dot prefix + the value text color classes. The W54-c-retry brief asked for downstream CSS to be able to target pills by their **underlying semantic tone** (e.g. the Confidence pill currently renders its value as blue/purple text per the AI-accent convention, but downstream CSS should be able to tag the pill as `data-tone="good"` when confidence ≥ 0.7 without breaking the AI-color test contract).

Added an optional `dataTone?: Tone` prop to `StatusPillProps`. When provided, it is rendered as a `data-tone` attribute on the root div (using a spread so the attribute is absent — not `"undefined"` — when `dataTone` is not provided). The visible color classes on the value text are NOT changed (preserves the AI-accent blue/purple convention and the test that requires '0.72' to have `text-purple-300`).

Then threaded `dataTone` through every tone-derived StatusPill in the status strip:

| Pill | `tone` (visible) | `dataTone` (semantic) |
|---|---|---|
| Model Status | `ok`/`warn`/`neutral` | `good`/`warn`/`neutral` |
| Model Version | `ai` | `info` |
| Feature Freshness | `ok`/`warn`/`crit`/`neutral` | `good`/`warn`/`poor`/`neutral` |
| Prediction P(YES) | `ai` | `info` |
| **Confidence** | `ai` (visible blue/purple) | `confidenceTone(headlineConfidence)` → `good` ≥0.7 / `warn` ≥0.5 / `poor` <0.5 / `neutral` null — **the key retry enhancement**, surfaces the spec's "Tone-colored prediction confidence (green high, amber medium, red low)" semantics via data-tone without breaking the AI-accent test contract |
| Calibration | `ok`/`warn`/`crit`/`neutral` | `good`/`warn`/`poor`/`neutral` |
| Edge Estimate | `ok`/`crit`/`neutral` | `good`/`poor`/`neutral` |
| Drift Status | `ok`/`warn`/`crit`/`neutral` | `good`/`warn`/`poor`/`neutral` |
| Data Quality | `ok`/`warn`/`crit`/`neutral` | `good`/`warn`/`poor`/`neutral` |

Training Data, Market-Implied, and Training Samples have no semantic tone
mapping (they're informational / numeric counters) so they correctly
render without the `data-tone` attribute.

Also added a subtle `transition-colors hover:border-[#2a3045]` on the
StatusPill root so hovering a pill slightly lifts its border — mirrors
the MLValidationPanel drift-tile hover affordance.

### 2. CalibrationCard: `data-tone` on ECE Badge

The ECE badge (`<Badge data-testid="ece-badge">ECE 0.0231</Badge>`) now
also carries `data-tone={calStatus.tone}` so downstream CSS can target
the ECE badge by its underlying calibration tone (good/warn/poor/neutral)
in addition to the cal-status chip already carrying `data-tone`.

### 3. Polling toggle: PulseDot LIVE indicator + a11y

The polling toggle (`explainer-poll-toggle`) previously rendered just
the text "Live" / "Paused" with only a `title` attribute for screen
readers. Added:

- **PulseDot LIVE indicator** — when `polling === true`, a small
  `PulseDot tone="good" pulse={false}` (solid emerald dot, no ping
  animation, kept static so it doesn't add visual noise alongside the
  `Live` text) renders before the text. Mirrors the W54-a DeepAnalysisView
  + W51-2d MLPanel header LIVE indicator pattern.
- **`aria-label`** — `polling ? 'Auto-refresh every 20s — click to pause' : 'Paused — click to resume auto-refresh'` so screen readers announce the toggle's purpose + next action.
- **`aria-pressed={polling}`** — marks the toggle as a pressable button with on/off state.
- **`data-tone={polling ? 'good' : 'neutral'}`** — semantic tone hook for downstream CSS.
- Layout: `inline-flex items-center gap-1` so the dot + text align cleanly.

### 4. Refresh button: a11y polish

The refresh button (`explainer-refresh`) previously had only a `title`
attribute and a `<RefreshCw>` icon with no `aria-hidden`. Since the
button has no text content, screen readers had no accessible name. Added:

- **`aria-label="Refresh now"`** — explicit accessible name matching the
  `title`.
- **`aria-hidden="true"` on the `<RefreshCw>` icon** — the icon is now
  decorative (the accessible name carries the meaning), so it's hidden
  from screen readers to avoid duplicate announcements.

## What was preserved

- All props, API calls (`apiFetch` to `/api/ml/metrics` + `/api/ml/drift` +
  `/api/ml/versions` + `/api/snapshot` + `/api/shadow/trades?limit=20` +
  `/api/data-quality` in parallel on mount + every 20s + `apiFetch` to
  `/api/ml/explain/{token_id}?top_n=3` on Why? expand), polling (20s
  setInterval with visibilitychange pause/resume), clean unmount
  (clearInterval + removeEventListener in useEffect cleanup).
- All existing class names retained: `.card`, `.card-header`, `.card-title`,
  `.badge` + `.badge-green` / `-amber` / `-red` / `-cyan` / `-dim`,
  `.btn` + `.btn-primary` / `.btn-sm`, `.mono`, `.scrollbar-thin`,
  `.empty-state` (+ `-icon` / `-title` / `-desc`), `.error-state` (+
  `-icon` / `-title` / `-desc`), `.skeleton-line-sm`, `.banner-warning`,
  `.data-table` / `.table-container` (via shadcn Table), `.tabular-nums`,
  `.truncate`.
- All accessibility roles/labels preserved: `role="alert"` on
  banner-warning + error card + NOT A GUARANTEE inline banner, `role="status"`
  on loading skeleton + empty state + model status banner, `aria-label` on
  CI range bar + AI prediction disclaimer banner + model status banner,
  `aria-hidden` on every Lucide icon (newly added on RefreshCw too),
  `aria-expanded` + `aria-controls` on the Why? collapsible trigger.
- All test-matched strings preserved verbatim:
  - "Explainable AI / ML Prediction" header title.
  - "NOT A GUARANTEE" disclaimer.
  - "65%", "YES", "0.72", "AI Prediction", "(model-generated)".
  - "95% confidence interval".
  - "Model vs Market", "AI Model", "Market", "Edge", "+2.00pp".
  - "Model Status", "Model Version", "Training Data", "Feature Freshness",
    "Prediction P(YES)", "Confidence", "Calibration", "Market-Implied",
    "Edge Estimate", "Drift Status", "Data Quality", "Training Samples".
  - "v1.4.champion", "OK", "healthy".
  - "Drift OK", "Champion", "Challenger".
  - "Prediction History (last 20)", "ml_edge".
  - "calibration-card", "ece-badge" text "ECE 0.0231", "Calibration Curve".
  - "No predictions recorded yet."
  - "Unable to reach any AI/ML backend endpoint".
- The 'use client' directive at the top of the file.
- All inline child components (`PulseDot`, `SectionHeader`, `KpiTile`,
  `PsiGauge`, `ShimmerBlock`, `PolishedEmptyState`, `PolishedErrorCard`,
  `StatusPill`, `CIRangeBar`, `PredictionHeadline`, `ModelVsMarket`,
  `WhyExplainer`, `PredictionHistoryTable`, `CalibrationCard`) preserved
  as private functions in the same file.

## Verification

```
$ wc -l src/components/AIPredictionExplainerPanel.tsx
2153 src/components/AIPredictionExplainerPanel.tsx

$ git diff --stat src/components/AIPredictionExplainerPanel.tsx
 src/components/AIPredictionExplainerPanel.tsx | 87 +++++++++++++++++++++++++--
 1 file changed, 81 insertions(+), 6 deletions(-)

$ bun run lint 2>&1 | tail -3
$ eslint .
exit=0

$ bunx eslint src/components/AIPredictionExplainerPanel.tsx; echo "exit=$?"
exit=0

$ bunx tsc --noEmit --skipLibCheck 2>&1 | grep AIPredictionExplainerPanel | head -5
(0 errors in AIPredictionExplainerPanel.tsx — 3 pre-existing errors live in
BacktestLabView.tsx and are unrelated to this task)

$ bunx vitest run src/components/AIPredictionExplainerPanel.test.tsx 2>&1 | tail -10
 ✓ src/components/AIPredictionExplainerPanel.test.tsx (20 tests) 4253ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

## Stage Summary

- **Final line count**: 2153 lines (was 2078 — +81 insertions / −6 deletions per `git diff --stat`).
- **All 10 W54-c-retry spec items verified present and reinforced**:
  1. KpiTile pattern for prediction metrics (confidence, probability, Brier) — present (unchanged) ✓
  2. SHAP-style feature importance bars (blue bullish, red bearish) — present (unchanged) ✓
  3. Refined reliability diagram (calibration curve with axes, gridlines, diagonal) — present via shared `ReliabilityDiagram` component (unchanged) ✓
  4. Shimmer skeleton loading state — present (unchanged) ✓
  5. Polished empty state with Lucide icon + message — present (unchanged) ✓
  6. Section headers with icon + uppercase title — present (unchanged) ✓
  7. Tone-colored prediction confidence (green high, amber medium, red low) — present in PredictionHeadline confChip + Confidence KpiTile (unchanged); now ALSO surfaced via `data-tone` on the Confidence StatusPill so downstream CSS can target it without breaking the AI-accent blue/purple test contract ✓
  8. Tabular-nums on all numeric values — present (unchanged) ✓
  9. Prediction history table (refined headers, row hover, tabular-nums) — present (unchanged) ✓
  10. Error state: polished error card with retry — present (unchanged) ✓
- **New retry enhancements**:
  - `dataTone` prop on `StatusPill` → semantic `data-tone` attribute threaded through 9 tone-derived pills (Model Status, Model Version, Feature Freshness, Prediction P(YES), Confidence, Calibration, Edge Estimate, Drift Status, Data Quality).
  - `data-tone` on ECE badge in CalibrationCard.
  - PulseDot LIVE indicator on the polling toggle + `aria-label` + `aria-pressed` + `data-tone`.
  - `aria-label="Refresh now"` on the refresh button + `aria-hidden` on the RefreshCw icon.
  - Subtle `hover:border-[#2a3045]` transition on every StatusPill.
- **Backwards-compat**: full — all props, API calls, polling, class names, testids, role attributes, aria-labels, preserved title text content, and the 'use client' directive preserved. All 20 tests pass.
- **Lint**: clean (exit 0).
- **TypeScript**: 0 errors in AIPredictionExplainerPanel.tsx.
- **Tests**: 20/20 pass.

**AIPredictionExplainerPanel is production-ready with the reinforced W54-c-retry
visual layer, visually consistent with the W51-2d MLPanel / AIMLCommandCenter /
W54-e MLValidationPanel redesign family.**
