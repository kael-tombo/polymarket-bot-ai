# W65-b — Cyan accent hex migration (#22d3ee → var(--accent))

## Task
Audit all `#22d3ee` (cyan-400) hex literals in `src/components/*.tsx`
and `src/app/*.tsx`; classify each as (A) accent use, (B) semantic
info tone, or (C) chart data; replace accent uses with `var(--accent)`
(green #059669 in the green-variant light theme); keep semantic and
chart-data cyan colors per spec EXCEPTIONS.

## Scope
- 23 occurrences of `#22d3ee` found in `src/components/*.tsx` (0 in
  `src/app/*.tsx`).
- Related hexes re-audited:
  - `#0891b2` (cyan-600): 0 occurrences.
  - `#06b6d4` (cyan-500): 7 occurrences in semantic contexts
    (STRATEGY_COLORS palette, chartTheme.colors.info, design-tokens.ts,
    globals.css, charts/Sparkline.tsx JSDoc, charts/theme.ts,
    CapitalAllocatorPanel.tsx mode.shadow) — none modified.

## Outcome — 19 replaced / 4 kept

### Category A — REPLACED (19 occurrences across 7 files)
| File | Line | Context | Replacement |
| --- | --- | --- | --- |
| ObservabilityPanel.tsx | 238 | `stroke: '#22d3ee'` (FALLBACK_META) | `'var(--accent)'` |
| PortfolioRiskPanel.tsx | 374, 586, 633 | `Layers` icon (3× panel-header) | `text-[var(--accent)]` |
| PortfolioRiskPanel.tsx | 745 | 🔥 P&L Heatmap glyph | `text-[var(--accent)]` |
| PortfolioRiskPanel.tsx | 777 | ⊞ Correlation Matrix glyph | `text-[var(--accent)]` |
| PortfolioRiskPanel.tsx | 899 | position-size bar default background | `'var(--accent)'` |
| ui/motion.stories.tsx | 207 | NumberTicker demo color | `'var(--accent)'` |
| AttributionPanel.tsx | 586, 720, 811 | `PieChart` icon (3× panel-header) | `text-[var(--accent)]` |
| AttributionPanel.tsx | 954, 961, 968 | `TabsTrigger` active text (3×) | `data-[state=active]:text-[var(--accent)]` |
| RiskStatusPanel.tsx | 321, 494, 526 | `Shield` icon (3× panel-header) | `text-[var(--accent)]` |
| AnalyticsPanel.tsx | 732 | "Trades / Volume" sub-value span | `text-[var(--accent)]` |
| CapitalAllocatorPanel.tsx | 659 | saturating-curve SVG stroke | `stroke="var(--accent)"` |

### Category B — KEPT (semantic info tone, 2 occurrences)
- `BacktestLabView.tsx:196` — `stroke: '#22d3ee'` inside the `info: { … }`
  tone definition block (per spec's EXCEPTIONS clause).
- `MLValidationPanel.tsx:511` — `: '#22d3ee'` is the default branch of
  the PSI-trend sparkline stroke ternary (pass=green / warn=amber /
  fail=red / else=cyan). Cyan is the "info" semantic stroke.

### Category C — KEPT (chart data / palette, 2 occurrences)
- `IngestionHealthPanel.tsx:1781` — `color="#22d3ee"` is the throughput-
  trend `RechartsSparkline` line color. Sibling LIVE-EPS sparkline uses
  semantic status colors (green=realtime, amber=delayed); throughput is
  a neutral info series.
- `AttributionPanel.tsx:320` — `cyan: 'text-[#22d3ee]'` is one entry in
  the categorical `accentText` palette
  (`blue: var(--accent-fg) | purple: #c084fc | cyan: #22d3ee | amber:
  #fbbf24 | green: #4ade80`), each distinguishing an attribution
  dimension (Strategy, ML Confidence, Predicted Edge, etc.).

## Verification
- ESLint: clean (exit 0, no warnings/errors).
  `bun run lint 2>&1 | tail -5` → `$ eslint .`
- TypeScript: 0 errors (exit 0).
  `bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3` → empty output
- Remaining `#22d3ee` in `src/components/*.tsx`: 4 (all intentional KEPTs).
- No test files modified — no tests assert on `#22d3ee` or
  `text-[#22…]` class strings (only `chartTheme.colors.info` on
  `#06b6d4`, which was not modified).
- No component logic changed — only color values swapped.
- No existing class names renamed/deleted — only hex value inside
  `text-[...]`, `data-[state=active]:text-[...]`, `stroke="..."`, and
  `color: '...'` patterns swapped to `var(--accent)`.

## Net effect
The workstation's accent surface (panel-header icons, tab active-state
text, section glyphs, KPI sub-values, fallback observability category
stroke, CapitalAllocator saturating-curve stroke, NumberTicker demo
color, PortfolioRisk bar default color) now routes 100% through
`var(--accent)`. Semantic info-tone definitions and chart-data cyan
colors are preserved per spec EXCEPTIONS, maintaining the visual
distinction between accent (green) and semantic info (cyan) in chart
legends, tone badges, and categorical palettes.
