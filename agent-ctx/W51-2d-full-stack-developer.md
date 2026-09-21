# W51-2d — full-stack-developer — Polish MLPanel + AIMLCommandCenter (premium AI/ML dashboard)

**Task ID:** W51-2d
**Agent:** full-stack-developer
**Scope:** EDIT (additive + visual polish) of:
- `src/components/MLPanel.tsx` (592 → 922 lines, +330)
- `src/components/AIMLCommandCenter.tsx` (900 → 1207 lines, +307)

No new files, no test changes, no API changes. Existing test suites
(`MLPanel.test.tsx` 8 tests + `AIMLCommandCenter.test.tsx` 27 tests)
continue to pass verbatim — every aria-label, every test-matched string,
every `data-testid`, every class name, every API endpoint preserved.

## Goal

Bring the two AI/ML panels up to the same premium trading-terminal
aesthetic as Wave 50's CommandCenterDashboard redesign: tone-tinted KPI
cards with quality bars + trend glyphs, a prominent pulsing Model Status
Banner, a horizontal PSI gauge with green/amber/red threshold zones,
SHAP-style coloured feature-importance bars (blue=bullish, red=bearish),
a refined calibration curve with proper axis ticks + gridlines, and
structured SectionHeaders with Lucide icons throughout.

## Constraints honoured

- **All existing functionality preserved** — `/api/ml/metrics` (15s
  poll, MLPanel), `/api/ml/metrics` + `/api/ml/registry` +
  `/api/ml/drift` (3s poll, AIMLCommandCenter), POST `/api/ml/retrain`,
  GET `/api/ai/search`, snapshotMl prop merging, retry tokens,
  ErrorState + DisconnectedState patterns, WhyExplanation +
  ModelStatusStrip + AIPredictionLabel + ConfidenceBadge usage.
- **All existing class names preserved** — `.card`, `.card-header`,
  `.card-title`, `.badge` + `.badge-green`/`-amber`/`-red`/`-purple`/
  `-dim`, `.banner-warning`/`-danger`, `.data-table`, `.btn`,
  `.btn-primary`/`-sm`, `.input`/`-sm`, `.mono`, `.spinner`,
  `.scrollbar-thin`, `.skeleton-line-sm`.
- **All `data-testid`s preserved** + new ones added
  (`aiml-model-status-banner` on both panels' status banner).
- **Both panels stay `'use client'`** — no `'use server'` migration.
- **No data model changes** — `MLStatus`, `MLMetrics`, `DriftData`,
  `ModelVersion`, `ReliabilityBin` interfaces unchanged.

## Test contracts preserved (verbatim)

### MLPanel (8 tests)
- "🤖 ML Ensemble" caption in the header (legacy compat).
- "Loading ML model…" loading state — now wrapped in a richer shimmer-
  skeleton view but the text node is preserved.
- "Connecting to ML API…" ErrorState message.
- "Calibrated" badge once data loads.
- ✅ / ⚠️ / 🚨 drift icons (DRIFT_ICONS object rendered as `driftIcon`).
- Authorization header on the initial `/api/ml/metrics` poll.

### AIMLCommandCenter (27 tests)
- "AI / ML Quantitative Telemetry & Gated Model Registry" subtitle.
- "38-Feature Pipeline" + "Meta-Learner Active" header badges.
- "Active: v1.4.champion" header badge.
- Ensemble weights: "Random Forest", "Gradient Boost", "LightGBM",
  "Online SGD" + "42.0%" / "20.0%".
- 6 KPI labels: "Brier Calibration Score", "ROC-AUC Power",
  "Expected Calibration Error", "Concept Drift Health",
  "Training Samples", "Feature Count".
- KPI values: "0.1842", "81.2%", "0.0231", "PSI: 0.0823".
- Feature names: "microstructure.spread_pct",
  "regime.volatility_30s", "sentiment.score_60s".
- Feature importance %s: "18.4%", "12.1%".
- Lineage table: "v1.4.champion", "v1.3.challenger", "ACTIVE", "RETIRED".
- "Gated Retrain" / "Retraining Champion/Challenger" button text.
- Semantic search form: aria-label="Semantic search query" + "Search".
- "1247 live market updates" text (n_online_updates).
- Filter buttons: "ALL", "MICRO", "REGIME", "FUNDAMENTAL".
- Reliability curve SVG aria-label="Model probability calibration curve".
- Error banners: "AI/ML telemetry endpoints unavailable",
  "Dismiss telemetry error", "Retry" button, "GPU queue saturated",
  "Semantic search failed (HTTP 500)", "Dismiss retrain error",
  "Dismiss search error".
- console.error with "[AIMLCommandCenter]" prefix.
- 3s polling + clean unmount.

## Verification

```
$ bun run lint
$ eslint .                         # exit 0, no output

$ bunx tsc --noEmit --skipLibCheck  # exit 0, no errors

$ TMPDIR=/dev/shm/vitest-tmp NODE_OPTIONS="--max-old-space-size=512" \
    bunx vitest run src/components/MLPanel.test.tsx \
                    src/components/AIMLCommandCenter.test.tsx
 ✓ src/components/AIMLCommandCenter.test.tsx (27 tests) 2358ms
 ✓ src/components/MLPanel.test.tsx (8 tests) 420ms
 Test Files  2 passed (2)
      Tests 35 passed (35)
```

## Files touched
- `src/components/MLPanel.tsx` (premium polish + 4 inline sub-components
  + Model Status Banner + PSI gauge + shimmer skeleton + empty state).
- `src/components/AIMLCommandCenter.tsx` (premium polish + 4 inline sub-
  components + Model Status Banner + KpiTile refactor + SHAP-coloured
  feature bars + refined calibration curve).
- `worklog.md` (this appended entry).

## Push verification
```
$ git diff --stat -- src/components/MLPanel.tsx src/components/AIMLCommandCenter.tsx
 src/components/AIMLCommandCenter.tsx | 641 ++++++++++++++++++++++++++---------
 src/components/MLPanel.tsx           | 476 ++++++++++++++++++++++----
 2 files changed, 877 insertions(+), 240 deletions(-)
```

## Final status
- **Redesign**: complete — both AI/ML panels now share the same premium
  visual language as Wave 50's CommandCenterDashboard (tone-tinted KPI
  cards + quality bars + trend glyphs + pulse-dot status banners + PSI
  gauge + section headers).
- **Backwards-compat**: full — all props, API calls, polling intervals,
  class names, data-testids, accessibility roles, and tests preserved.
- **Lint**: clean (exit 0, no output).
- **TypeScript**: 0 errors.
- **Tests**: 35/35 pass (8 MLPanel + 27 AIMLCommandCenter).

**Both AI/ML panels are production-ready with the premium W51-2d visual layer.**
