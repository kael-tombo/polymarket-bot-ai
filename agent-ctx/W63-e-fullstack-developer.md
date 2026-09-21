# W63-e — CSS variable migration: ML / AI / Strategy panel components

**Agent:** css-theme-architect (fullstack-developer)
**Task ID:** W63-e
**Date:** 2026-09-04 (continuation of W63-a / W63-b / W63-f theme-wave)
**Scope:** Replace hardcoded dark-tier hex literals with theme-aware
CSS variables across the 12 ML / AI / Strategy panel components of the
Polymarket Pro trading workstation. The app switched to a
green-variant light theme as default (W63-a flipped `:root`; W63-b
flipped `defaultTheme`), so dark Bloomberg-terminal hex colors like
`#0e1015`, `#13161e`, `#1f2335`, `#dde1ed`, `#7e8aaa`, etc. must become
`var(--token)` references so they resolve to the new light palette via
the `.light` overrides in `globals.css`.

## Background

W63-a (worklog 43478+) flipped `:root` from a dark Bloomberg-terminal
palette to a light slate canvas with emerald-600 (`#059669`) accent.
W63-b (worklog 43285+) flipped `ThemeProvider.defaultTheme` to
`"light"` and `viewport.themeColor` to `#f8fafc`. W63-f (worklog
43549+) migrated ~1,502 hex literals across 25 System / Analytics /
Shared panels. W63-e extends the same migration to the remaining 12
ML / AI / Strategy panels listed below. Together these four waves
make every panel surface in the workstation resolve through the same
`--bg-*` / `--border*` / `--text-*` / `--accent` / `--accent-fg`
token set, so the ThemeToggle button flips the entire UI cleanly
between the dark Bloomberg-terminal palette and the new light-green
default.

## Files edited (12)

| # | File | Swaps |
|---|------|------:|
| 1 | `src/components/MLPanel.tsx` | 57 |
| 2 | `src/components/AIMLCommandCenter.tsx` | 85 |
| 3 | `src/components/MLValidationPanel.tsx` | 103 |
| 4 | `src/components/ShadowInferencePanel.tsx` | 169 |
| 5 | `src/components/AIPredictionExplainerPanel.tsx` | 119 |
| 6 | `src/components/DeepAnalysisView.tsx` | 78 |
| 7 | `src/components/AICopilotPanel.tsx` | 41 |
| 8 | `src/components/StrategyMatrix.tsx` | 43 |
| 9 | `src/components/ArbitrageMatrixView.tsx` | 49 |
| 10 | `src/components/StrategyPerformancePanel.tsx` | 96 |
| 11 | `src/components/StrategyConfigModal.tsx` | 22 |
| 12 | `src/components/BacktestLabView.tsx` | 73 |

**GRAND TOTAL: 935 hex → var() swaps across all 12 target files.**

## Replacement mapping applied

Per the W63-e task spec. Lowercase hex form throughout (verified
case-sensitively with `rg '#[0-9a-fA-F]{6}'`; the only uppercase-form
hits were semantic palette arrays like `'rgba(...)'`-style strings,
which are out of scope).

### Backgrounds
```
#0a0b0f  → var(--bg-base)
#080910  → var(--bg-base)
#0e1015  → var(--bg-base)
#0c0e14  → var(--bg-base)           ← close cousin of #0a0b0f; same tier
#13161e  → var(--bg-surface)
#14161c  → var(--bg-surface)
#141724  → var(--bg-surface)         ← close cousin of #14161c; same tier
#1a1d26  → var(--bg-elevated)
#1a1f2e  → var(--bg-elevated)
#1a1e2c  → var(--bg-elevated)        ← close cousin of #1a1f2e; same tier
```

### Borders
```
#1f2335  → var(--border)
#2a2e3a  → var(--border-strong)
#2a2f48  → var(--border-strong)
#2a2f45  → var(--border-strong)      ← close cousin of #2a2f48
#2a2f47  → var(--border-strong)      ← close cousin of #2a2f48
#2a3045  → var(--border-strong)      ← close cousin of #2a2f48
#2a3047  → var(--border-strong)      ← close cousin of #2a2f48
#2d3450  → var(--border-strong)
```

### Accent (now green via W63-a)
```
#3b82f6  → var(--accent)             ← emerald-600 in the new :root
#60a5fa  → var(--accent-fg)          ← emerald-700
```

### Text
```
#dde1ed  → var(--text-primary)
#e8eaed  → var(--text-primary)
#e8eaf0  → var(--text-primary)
#a1a8b5  → var(--text-secondary)
#7e8aaa  → var(--text-secondary)
#5a637a  → var(--text-secondary)
#6b7280  → var(--text-dim)
#4b5563  → var(--text-dim)
#3e4560  → var(--text-dim)
#3b4054  → var(--text-dim)           ← used in AIMLCommandCenter SVG axis lines
```

Each swap preserves the surrounding class structure:
- Tailwind arbitrary classes — `bg-[#1f2335]` → `bg-[var(--border)]`
- Inline-style color values — `color: '#3b82f6'` → `color: 'var(--accent)'`
- SVG attribute values — `stroke="#3b82f6"` → `stroke="var(--accent)"`
- Hex-with-opacity modifiers — `bg-[#0e1015]/60` → `bg-[var(--bg-base)]/60`
  (Tailwind 4 honours `var()` inside arbitrary-value brackets and
  applies the `/NN` opacity modifier via `color-mix` at build time.)

## Deliberately left untouched (per task constraints)

### Semantic chart colors (green/red/amber for financial data)
- `#22c55e` (green-500 — AIMLCommandCenter reliability-curve line stroke)
- `#fbbf24` (amber-400 — MLValidationPanel warning indicator)
- `#f87171` (red-400 — MLValidationPanel / StrategyPerformancePanel loss color)
- `#34d399` (emerald-400 — MLValidationPanel pass indicator)
- `#22d3ee` (cyan-400 — MLValidationPanel / BacktestLabView info color)
- `#ef4444` (red-500 — ShadowInferencePanel / BacktestLabView error color)
- `#f59e0b` (amber-500 — StrategyPerformancePanel / BacktestLabView warning)
- `#f97316` (orange-500 — StrategyPerformancePanel categorical)
- `#ec4899` (pink-500 — StrategyPerformancePanel categorical)
- `#a855f7` (purple-500 — StrategyPerformancePanel categorical)
- `#84cc16` (lime-500 — StrategyPerformancePanel categorical)
- `#10b981` (emerald-500 — StrategyPerformancePanel / BacktestLabView categorical)
- `#06b6d4` (cyan-500 — StrategyPerformancePanel categorical)

These carry domain semantics (long/short, profit/loss, training/error
states, strategy-line categorical hues) and must remain hue-stable
across themes per the task spec.

### Tailwind palette utilities
All `text-emerald-400`, `bg-amber-500/[0.06]`, `border-cyan-500/25`,
`hover:text-red-300`, `focus:ring-cyan-500/20`, etc. — already
theme-aware via Tailwind's own token system; no hex literals involved.

### `chartTheme.colors.*` references
- `StrategyPerformancePanel.tsx` imports `chartTheme` from
  `@/components/charts/theme` and uses `chartTheme.colors.muted` /
  `chartTheme.axis` in `<ReferenceLine>` and `<XAxis>` props — these
  are dot-notation object lookups, not hex literals, so they were
  naturally skipped by the hex-string matcher.

### White text on accent
- `#ffffff` (AIMLCommandCenter SVG scatter-point stroke) — intentional
  white outline on the now-green scatter dots; kept as-is because
  white on emerald-600 is a WCAG AA-compliant pairing and changing
  it would shift the chart's visual identity.

## Notable decisions

### `#3b82f6` in `STRATEGY_COLORS` palette (StrategyPerformancePanel.tsx:212)
The `STRATEGY_COLORS` array (used to give each strategy line in the
multi-line equity overlay a distinct color) includes:
```ts
'#10b981', // emerald
'#06b6d4', // cyan
'#f59e0b', // amber
'#a855f7', // purple
'#ec4899', // pink
'#84cc16', // lime
'#3b82f6', // blue (only used after the first 6 are taken)
'#f97316', // orange
```
The task spec explicitly lists `#3b82f6 → var(--accent)` as a "common
replacement (apply throughout)", and blue is NOT in the
DO-NOT-TOUCH-protected categories (green/red/amber only). So per the
strict reading of the spec, the palette entry was replaced with
`var(--accent)` (which resolves to `#059669` emerald-600 in the new
light theme). The chart now has two emerald-family hues
(`#10b981` emerald-500 and `var(--accent)` emerald-600) as the 1st and
7th categorical colors — visually distinct (500 vs 600 lightness
tier) and only collides when 7+ strategies share the chart (rare
edge case).

### `#3b4054` in AIMLCommandCenter.tsx SVG axis lines
Not in the task spec's literal hex list, but present in 3 SVG `<line>`
strokes used as calibration-chart axis lines (gray-blue UI color, not
financial semantic). Mapped to `var(--text-dim)` because it's the
closest semantic match (slate-400 in light mode = dim UI text/line
color). Same treatment applied to other "rare variant" hexes
(`#0c0e14`, `#141724`, `#1a1e2c`, `#2a2f45`, `#2a2f47`, `#2a3045`,
`#2a3047`) which were close cousins of spec hexes (same color tier,
slight shade variation) and clearly dark-tier UI tokens rather than
semantic data colors.

## Methodology

For each target file:
1. `rg -o '#[0-9a-fA-F]{6}' <file> | sort | uniq -c` to inventory the
   hex literals present (catches both Tailwind arbitrary classes and
   inline-style / SVG attribute values).
2. Build a per-file edit list containing only the hexes actually
   present (so MultiEdit's atomic contract doesn't abort on a
   no-match hex).
3. Apply all hex → var() swaps for that file via a single MultiEdit
   call with `replace_all: true` per edit.
4. After all 12 files are done, re-run `rg -o '#[0-9a-fA-F]{6}'` over
   each to confirm only out-of-scope semantic chart colors remain.

The MultiEdit tool's sequential-application semantics (when any
single edit in the batch fails to match, the tool stops applying
further edits in that batch — verified empirically when a first
attempt included `#13161e` for `StrategyConfigModal.tsx`, which
isn't present in that file) meant each per-file edit list had to
be precisely the set of hexes actually present. The verification
grep above provided that set.

## Constraint check

- ✅ **No existing class names renamed or deleted** — only the hex
  value inside `bg-[…]`, `text-[…]`, `border-[…]`, `hover:bg-[…]`,
  `focus:ring-[…]`, `placeholder-[…]`, `divide-[…]/NN`, `stroke="…"`,
  `fill="…"`, `color: '…'` patterns was swapped for the corresponding
  `var(--token)`.
- ✅ **No component logic changed** — purely cosmetic value swaps; no
  props, no JSX structure, no event handlers, no testIds touched.
- ✅ **No tests broken** — 1523 / 1523 tests pass across 93 test files
  (verified via `bun run test`; full run = 165.93 s wall-clock).
  Specifically:
  - `src/components/MLPanel.test.tsx` — passes.
  - `src/components/AIMLCommandCenter.test.tsx` — passes (including
    the calibration-point `data-testid="aiml-calibration-point"`
    contract — only the `fill` attribute swapped from `#3b82f6` to
    `var(--accent)`; the test asserts on the role, not the color).
  - `src/components/MLValidationPanel.test.tsx` — passes.
  - `src/components/ShadowInferencePanel.test.tsx` — passes.
  - `src/components/AIPredictionExplainerPanel.test.tsx` — passes.
  - `src/components/DeepAnalysisView.test.tsx` — passes.
  - `src/components/AICopilotPanel.test.tsx` — passes.
  - `src/components/StrategyMatrix.test.tsx` — passes.
  - `src/components/ArbitrageMatrixView.test.tsx` — passes.
  - `src/components/StrategyPerformancePanel.test.tsx` — passes.
  - `src/components/StrategyConfigModal.test.tsx` — passes.
  - `src/components/BacktestLabView.test.tsx` — passes.
- ✅ **`chartTheme.colors.*` references intact** — verified post-swap
  via `rg 'chartTheme' src/components/StrategyPerformancePanel.tsx`;
  the only chartTheme import + usage is untouched.
- ✅ **Semantic chart colors (green/red/amber) intact** — verified
  via `rg '#[0-9a-fA-F]{6}'` over all 12 files post-swap; the only
  remaining hex hits are out-of-scope semantic / palette tokens
  (full list in the "Deliberately left untouched" section above).
- ✅ **Existing class names preserved** — `bg-[var(--bg-surface)]`,
  `text-[var(--text-secondary)]`, `border-[var(--border)]` etc.
  all retain the `bg-[…]` / `text-[…]` / `border-[…]` brackets so
  Tailwind 4's arbitrary-value parser still generates the same
  utility class selectors.

## Verification

- **ESLint**: clean (exit 0). `bun run lint 2>&1 | tail -3` →
  `$ eslint .` (no warnings, no errors).
- **TypeScript**: 0 errors. `bunx tsc --noEmit --skipLibCheck 2>&1
  | tail -3` → empty output.
- **Targeted hex codes**: 0 remaining. `rg -o '#[0-9a-fA-F]{6}'`
  over all 12 target files post-swap → only out-of-scope semantic
  chart colors remain (verified in the per-file inventory above).
- **Tests**: 1523 / 1523 passed across 93 test files (full `bun run
  test` suite — 165.93 s wall-clock, zero regressions).
- **Dev server**: not re-checked post-edit (no logic changed, only
  literal value swaps; compile-time invariants unchanged).

## Net effect

The 12 ML / AI / Strategy panel components now render against the
W63-a green-variant light theme by default, with all dark-tier
surface, border, text, and accent hex literals routed through the
`--bg-*` / `--border*` / `--text-*` / `--accent` / `--accent-fg`
tokens defined in `src/app/globals.css`. Because the `.light`
overrides in globals.css already remap every Tailwind arbitrary
`bg-[var(--bg-base)]` / `text-[var(--text-primary)]` / etc. to the
light palette, the swap is purely cosmetic at the source level —
no test contracts, accessibility roles, or component APIs shifted.

Combined with the prior W63-f wave (System / Analytics / Shared —
1,502 swaps across 25 files) and the original W63-a CSS-`:root`
flip, the workstation's panel surface area is now ~95% routed
through theme-aware CSS variables. When the trader toggles back to
dark via ThemeToggle, the `.dark` block re-declares the same tokens
with the original Bloomberg-terminal values, so every panel flips
cleanly between themes with no code-path forks.
