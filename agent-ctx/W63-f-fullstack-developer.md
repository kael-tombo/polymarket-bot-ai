# W63-f — CSS variable migration: System/Analytics/Shared panel components

**Task ID:** W63-f
**Agent:** W63-f (fullstack-developer)
**Date:** 2026-09-21
**Scope:** Replace hardcoded dark hex colors with CSS variables across the
25 System / Analytics / Shared panel components of the Polymarket Pro
trading workstation, in support of the W63-a green-variant light theme
default.

## Context

The workstation switched its default theme to a green-variant light
palette (W63-a flipped `:root` to emerald-600 accent + slate-50 bg;
W63-b flipped `ThemeProvider.defaultTheme` to `"light"` and the
`layout.tsx` `themeColor` to `#f8fafc`). The W63-c subagent migrated
the 6 core-layout components (TopStatusBar, Sidebar,
CommandCenterDashboard, CommandCenterHealthBar, KpiCard, page.tsx). My
scope is the next wave — 25 System / Analytics / Shared panel
components.

## Files edited (25)

| # | File | Swaps |
|---|------|------:|
| 1 | `src/components/SystemHealthView.tsx` | 35 |
| 2 | `src/components/DatabaseExplorerView.tsx` | 25 |
| 3 | `src/components/DatabaseStatusPanel.tsx` | 89 |
| 4 | `src/components/IngestionHealthPanel.tsx` | 126 |
| 5 | `src/components/ObservabilityPanel.tsx` | 77 |
| 6 | `src/components/RetentionPanel.tsx` | 77 |
| 7 | `src/components/DecisionLedgerPanel.tsx` | 87 |
| 8 | `src/components/LiveSafetyGatePanel.tsx` | 85 |
| 9 | `src/components/AuditLogPanel.tsx` | 88 |
| 10 | `src/components/RateLimitPanel.tsx` | 90 |
| 11 | `src/components/CapitalAllocatorPanel.tsx` | 104 |
| 12 | `src/components/LeaderboardPanel.tsx` | 31 |
| 13 | `src/components/AttributionPanel.tsx` | 87 |
| 14 | `src/components/ExecutionQualityPanel.tsx` | 68 |
| 15 | `src/components/ClosedPositionsPanel.tsx` | 124 |
| 16 | `src/components/PerformanceReportPanel.tsx` | 28 |
| 17 | `src/components/EquityCurve.tsx` | 33 |
| 18 | `src/components/AnalyticsPanel.tsx` | 62 |
| 19 | `src/components/AlertNotificationsPanel.tsx` | 32 |
| 20 | `src/components/PortfolioRiskPanel.tsx` | 58 |
| 21 | `src/components/RiskStatusPanel.tsx` | 47 |
| 22 | `src/components/CommandPalette.tsx` | 12 |
| 23 | `src/components/SettingsModal.tsx` | 14 |
| 24 | `src/components/ConfirmationDialog.tsx` | 0 |
| 25 | `src/components/KeyboardCheatSheet.tsx` | 23 |
| | **GRAND TOTAL** | **1,502** |

`ConfirmationDialog.tsx` was already 100% Tailwind-palette +
pre-existing var()-driven; no targeted hex literals present.

## Replacement mapping (22 hex codes → CSS vars)

The lowercase hex form was verified as the sole casing in the
codebase (case-sensitive `rg '#[0-9A-F]{6}'` matched only all-digit
hex codes like `#080910`, never letter-bearing ones like `#1F2335`),
so a single-pass lowercase `str.replace` is provably complete.

### Backgrounds
| Hex | CSS var |
|-----|---------|
| `#0a0b0f` | `var(--bg-base)` |
| `#080910` | `var(--bg-base)` |
| `#0e1015` | `var(--bg-page)` |
| `#13161e` | `var(--bg-surface)` |
| `#14161c` | `var(--bg-surface)` |
| `#1a1d26` | `var(--bg-elevated)` |
| `#1a1f2e` | `var(--bg-elevated)` |

### Borders
| Hex | CSS var |
|-----|---------|
| `#1f2335` | `var(--border)` |
| `#2a2e3a` | `var(--border-strong)` |
| `#2a2f48` | `var(--border-strong)` |
| `#2d3450` | `var(--border-strong)` |

### Accent (now green via W63-a)
| Hex | CSS var |
|-----|---------|
| `#3b82f6` | `var(--accent)` |
| `#60a5fa` | `var(--accent-fg)` |

### Text
| Hex | CSS var |
|-----|---------|
| `#dde1ed` | `var(--text-primary)` |
| `#e8eaed` | `var(--text-primary)` |
| `#e8eaf0` | `var(--text-primary)` |
| `#a1a8b5` | `var(--text-secondary)` |
| `#7e8aaa` | `var(--text-secondary)` |
| `#5a637a` | `var(--text-secondary)` |
| `#6b7280` | `var(--text-dim)` |
| `#4b5563` | `var(--text-muted)` |
| `#3e4560` | `var(--text-dim)` |

The `#6b7280` / `#4b5563` split (dim vs muted) follows the dark-mode
`:root` definitions in `src/app/globals.css` exactly, so the
theme-toggle round-trip stays isometric.

## Patterns preserved by the swap

Each swap preserves the surrounding class structure — only the hex
value inside the wrapper was replaced:

- **Tailwind arbitrary classes** — `bg-[#0e1015]` →
  `bg-[var(--bg-page)]`. Tailwind 4 honours `var()` inside
  arbitrary-value brackets and applies `/NN` opacity modifiers via
  `color-mix()` at build time, so e.g. `divide-[#1f2335]/60` →
  `divide-[var(--border)]/60` retains its 60% opacity.
- **Inline-style color values** — `color: '#3b82f6'` →
  `color: 'var(--accent)'`. Same for `backgroundColor`, `borderColor`,
  `fill`, `stroke` object keys.
- **SVG attribute values** — `stroke="#3b82f6"` →
  `stroke="var(--accent)"`. Same for `fill=`, `stopColor=`.
- **Modifier-prefixed classes** — `hover:bg-[#13161e]` →
  `hover:bg-[var(--bg-surface)]`; `focus-visible:ring-[#3b82f6]/40` →
  `focus-visible:ring-[var(--accent)]/40`.

## Deliberately left untouched (per task constraints)

### Semantic chart colors (green/red/amber for financial data)
- `#4ade80` (emerald-400 — positive P&L)
- `#f87171` (red-400 — negative P&L)
- `#22d3ee` (cyan-400 — info / volume)
- `#fbbf24` (amber-400 — manual exit)
- `#f59e0b` (amber-500 — manual exit dot)
- `#ef4444` (red-500 — stop-loss dot)
- `#22c55e` (green-500 — take-profit dot)
- `#c084fc` (purple-400 — attribution dimension accent)

These carry domain semantics (long/short, profit/loss,
SL/TP/MANUAL/SETTLEMENT exit reasons) and must remain hue-stable
across themes.

### Tailwind palette utilities
`text-green-400`, `bg-amber-500/15`, `border-sky-500/30`,
`bg-red-500/10`, etc. — already theme-aware via Tailwind's own token
system; no hex literals involved.

### `chartTheme.colors.*` references
4 dot-notation object lookups (1 in `EquityCurve.tsx`, 3 in
`RateLimitPanel.tsx`) — never at risk from a `str.replace` over hex
strings. Verified intact post-swap.

### Other dark-mode tokens NOT in the task's "common replacements" list
- `#08090f` (close cousin of `#080910`, but a distinct shade — left
  alone)
- `#181c28` (dark-mode `--border-dim`)
- `#c8cfe0` (dark-mode `--text-mono`)
- `#9aa3bc` (slate-400-alt text shade)

The task author was explicit about which hex codes to migrate;
expanding scope beyond that list would risk drift from the W63-a /
W63-b palette decisions.

### `var(--token, #fallback)`-style hex fallbacks
Where present (none in these 25 files), these are no-CSS safety nets
on already var()-driven properties; the literal is a fallback that
never renders when `globals.css` loads. My script's
`text.count('#0a0b0f')`-style matching naturally skips these since
the fallback hex isn't in the list.

## Methodology

A one-shot Python script (`w63f_swap.py`, since removed) iterated the
22 hex-literal → var() mappings above and applied them in-place via
`str.replace` to each of the 25 target files. Per-file swap counts
were captured by `text.count(old)` before each replace, so the
reported totals are exact (not estimated).

A pre-flight `rg` survey confirmed the 1,502 swaps were distributed
sensibly across the 25 files (heaviest in the panels with the most
inline status badges / KPI tiles — IngestionHealthPanel 126,
ClosedPositionsPanel 124, CapitalAllocatorPanel 104; lightest in the
small modal / palette components — CommandPalette 12, SettingsModal
14, ConfirmationDialog 0).

## Verification

### ESLint: clean (exit 0)
```
$ bun run lint 2>&1 | tail -5
$ eslint .
```
No warnings, no errors.

### TypeScript: 0 errors
```
$ bunx tsc --noEmit --skipLibCheck 2>&1 | tail -5
(empty output)
```

### Targeted hex codes: 0 remaining
```
$ rg -i '#0a0b0f|#0e1015|#080910|#13161e|#14161c|#1a1d26|#1a1f2e|
         #1f2335|#2a2e3a|#2a2f48|#2d3450|#3b82f6|#60a5fa|#dde1ed|
         #e8eaed|#e8eaf0|#a1a8b5|#7e8aaa|#5a637a|#6b7280|#4b5563|
         #3e4560' <25 files>
(empty)
```

### Tests: 324 / 324 passed across 21 test files
```
$ bunx vitest run <21 touched-files' test files>
Test Files  21 passed (21)
     Tests  324 passed (324)
  Duration  68.76s
```

Touched-file test contracts verified:
- `SystemHealthView.test.tsx` — 11/11 passed.
- `DatabaseExplorerView.test.tsx` — 18/18 passed.
- `DatabaseStatusPanel.test.tsx` — passed.
- `IngestionHealthPanel.test.tsx` — passed.
- `RetentionPanel.test.tsx` — 10/10 passed.
- `DecisionLedgerPanel.test.tsx` — 8/8 passed.
- `AuditLogPanel.test.tsx` — passed.
- `RateLimitPanel.test.tsx` — 18/18 passed.
- `CapitalAllocatorPanel.test.tsx` — 10/10 passed.
- `LeaderboardPanel.test.tsx` — 21/21 passed.
- `AttributionPanel.test.tsx` — 9/9 passed.
- `ExecutionQualityPanel.test.tsx` — 9/9 passed.
- `ClosedPositionsPanel.test.tsx` — 8/8 passed.
- `EquityCurve.test.tsx` — 18/18 passed.
- `AnalyticsPanel.test.tsx` — passed.
- `AlertNotificationsPanel.test.tsx` — 20/20 passed.
- `RiskStatusPanel.test.tsx` — 8/8 passed.
- `CommandPalette.test.tsx` — passed.
- `SettingsModal.test.tsx` — passed.
- `ConfirmationDialog.test.tsx` — 15/15 passed.
- `KeyboardCheatSheet.test.tsx` — 4/4 passed.

### Dev server (`dev.log` tail)
No compile errors after edits; `GET /` returns 200 in 26 ms (cached
compile, 4 ms transform). The earlier `EADDRINUSE` warning at the top
of the log was a stale-instance hiccup that auto-recovered before the
next successful compile.

## Constraint check

- ✅ **Don't break any tests** — 324/324 pass.
- ✅ **Keep all existing class names** — only hex values inside
  arbitrary-value brackets / inline styles / SVG attributes were
  swapped. Verified by sample diff of `SystemHealthView.tsx`:
  class structure, modifier prefixes, and bracket contents all
  preserved; only the hex literal became `var(--token)`.
- ✅ **Don't change component logic** — purely cosmetic value swaps;
  no props, no JSX structure, no event handlers, no testIds touched.
- ✅ **Semantic chart colors intact** — verified via
  `rg '#[0-9a-f]{3,6}'` over all 25 files post-swap; remaining hits
  are exclusively out-of-scope semantic / palette / fallback tokens.
- ✅ **Tailwind palette utilities intact** — never at risk; they
  contain no hex literals.
- ✅ **`chartTheme.colors.*` references intact** — 4 dot-notation
  lookups verified present and unchanged post-swap.

## Net effect

The 25 System / Analytics / Shared panel components now render against
the W63-a green-variant light theme by default, with all dark-tier
surface, border, text, and accent hex literals routed through the
`--bg-*` / `--border*` / `--text-*` / `--accent` / `--accent-fg`
tokens defined in `src/app/globals.css`. Because the `.light`
overrides in `globals.css` (lines 541+) already remap every Tailwind
arbitrary `bg-[var(--bg-page)]` / `text-[var(--text-primary)]` / etc.
to the light palette, the swap is purely cosmetic at the source
level — no test contracts, accessibility roles, or component APIs
shifted. When the trader toggles back to dark via ThemeToggle, the
`.dark` block re-declares the same tokens with the original
Bloomberg-terminal values, so the panels flip cleanly between themes
with no code-path forks.

Combined with the W63-c wave (6 core-layout components, 109 swaps),
the W63-f wave (25 panel components, 1,502 swaps) brings the
workstation to **1,611 total hex → var() migrations** across 31 of
the workstation's most-trafficked components — leaving only the
long-tail modal / view components (BacktestLabView, DepthChartModal,
StrategyConfigModal, AIMLCommandCenter, AIPredictionExplainerPanel,
ShadowInferencePanel, DeepAnalysisView, ArbitrageMatrixView,
AICopilotPanel) still on hardcoded dark hex, which can be migrated
in a future W63 wave.
