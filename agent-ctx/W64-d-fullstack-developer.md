# W64-d — Blue Accent Audit & Fix (Polymarket Pro)

**Agent:** fullstack-developer (color audit subagent)
**Date:** 2026-09-04
**Scope:** Audit and fix remaining blue accent colors (`#3b82f6`, `#60a5fa`,
`#2563eb`, `blue-500/400/300`, `cyan-500/400/300` Tailwind utilities) across
the Polymarket Pro trading workstation at `/home/z/my-project`.

## Background

W63 wave (W63-a → W63-f) migrated 2,732 hardcoded hex colors to CSS variables
but did not touch Tailwind utility classes (`bg-blue-500`, `text-cyan-400`,
etc.). Those continued to render blue/cyan as the primary accent across focus
rings, hover backgrounds, icons, metric text, headers, and active states. This
task completes the migration by swapping those Tailwind utility classes from
the blue/cyan family to the emerald (green) family, mirroring the green-
variant light theme installed by W63.

## Audit Findings (before fixes)

- 1 hardcoded blue hex literal (`#2563eb` in MarketsPanel.tsx progress-bar
  gradient, paired with `#38bdf8` sky-400) — fixed.
- 4 inline-style `rgba(...)` shadow values using blue/cyan/sky tones — fixed.
- 496 Tailwind utility class occurrences across 49 component files
  (bg-blue-, text-blue-, border-blue-, ring-blue-, bg-cyan-, text-cyan-,
  border-cyan-, ring-cyan-, shadow-cyan- family utilities with all numeric
  shades 50–950 and slash-opacity variants).
- 3 test files asserting on the old blue/cyan accent classes — assertion
  strings migrated to the new emerald equivalents.

## Files Modified

### Component files (49)
All in `src/components/`:
- AICopilotPanel.tsx (24 swaps)
- AIMLCommandCenter.tsx (16)
- AIPredictionExplainerPanel.tsx (36)
- AlertNotificationsPanel.tsx (3 — info-tone block preserved)
- AnalyticsPanel.tsx (5 — multi-line info block preserved)
- ArbitrageMatrixView.tsx (13)
- AttributionPanel.tsx (6 — info-tone block preserved)
- AuditLogPanel.tsx (23)
- BacktestLabView.tsx (10 — info-tone block + chart stroke preserved)
- CapitalAllocatorPanel.tsx (19)
- ClosedPositionsPanel.tsx (28)
- CommandPalette.tsx (12)
- ConfirmationDialog.tsx (5)
- DatabaseExplorerView.tsx (11)
- DatabaseStatusPanel.tsx (11)
- DecisionLedgerPanel.tsx (24)
- DeepAnalysisView.tsx (21)
- DepthChartModal.tsx (4)
- EquityCurve.tsx (3 — multi-line info block preserved)
- EventLog.tsx (4 — info block + ai block preserved)
- ExecutionQualityPanel.tsx (12)
- IngestionHealthPanel.tsx (40)
- KeyboardCheatSheet.tsx (25)
- LeaderboardPanel.tsx (3)
- LiveSafetyGatePanel.tsx (17)
- LocaleSwitcher.tsx (2)
- MLPanel.tsx (6)
- MLValidationPanel.tsx (33)
- MarketChartModal.tsx (10)
- MarketScreener.tsx (21)
- MarketsPanel.tsx (32 — incl. #2563eb/#38bdf8 hex gradient)
- ObservabilityPanel.tsx (14)
- OrderFlowPanel.tsx (5)
- OrdersPanel.tsx (11)
- PerformanceReportPanel.tsx (1)
- PortfolioRiskPanel.tsx (4)
- PositionsPanel.tsx (19)
- RateLimitPanel.tsx (3)
- RetentionPanel.tsx (7)
- RiskStatusPanel.tsx (5)
- SettingsModal.tsx (20)
- ShadowInferencePanel.tsx (30)
- ShortcutHint.tsx (7)
- ShortcutsModal.tsx (1)
- StrategyConfigModal.tsx (9)
- StrategyMatrix.tsx (17)
- StrategyPerformancePanel.tsx (13 — STRATEGY_COLORS chart palette intact)
- SystemHealthView.tsx (2)
- TopStatusBar.tsx (7)
- TradesPanel.tsx (11)
- ai-explainability.tsx (12)
- ThemeToggle.tsx (1 — manual fix; ring-cyan missed by audit pattern)

### Test files (3)
- AIPredictionExplainerPanel.test.tsx — 2 assertions + 1 comment updated
  (`border-blue-500` → `border-emerald-500`, `text-blue-300` →
  `text-emerald-300`).
- EventLog.test.tsx — 5 assertions updated (active filter button
  `bg-blue-500/20` + `text-cyan-300` → emerald equivalents).
- SettingsModal.test.tsx — 1 comment text updated.

### Helper script (1)
- `scripts/w64d_replace_blue_accent.py` — state-machine Python script that
  walks each file line-by-line, detects protected info-tone blocks via
  `^\s*(?:info|ai)\s*:\s*\{`, tracks brace depth for multi-line tone
  objects, skips pure `//` comments, and applies color-swap rules
  everywhere else.

## Total Replacements

- 653 color swaps via the Python script (across the 49 audited component
  files).
- 7 manual edits: 8 test-assertion string updates (folded into the 3 test
  files above) + 1 ThemeToggle ring-cyan-500/60 fix (the original audit
  pattern didn't include `ring-cyan-`).

## Methodology

1. **Audit pass** — `rg` for `bg-blue-|text-blue-|border-blue-|ring-blue-|
   bg-cyan-|text-cyan-|border-cyan-` across `src/components/*.tsx`, saved
   a 496-line audit log to `/tmp/blue_audit.txt`.
2. **Per-file inspection** — Classified each occurrence as either "accent"
   (replace with emerald) or "semantic info indicator" (preserve as
   cyan/blue per the task's EXCEPTIONS clause).
3. **Scripted replacement** — `scripts/w64d_replace_blue_accent.py` walks
   each file line-by-line:
   - Detects protected info-tone blocks via regex
     `^\s*(?:info|ai)\s*:\s*\{`.
   - Tracks brace depth to handle multi-line tone objects (e.g.
     AnalyticsPanel.tsx:219-227 spans 9 lines).
   - Skips pure `//` line comments (which often document rendered CSS
     class names that the script preserves elsewhere — mutating the
     comment text would create misleading docs).
   - Applies these rules everywhere else:
     - `cyan-{50..950}` → `emerald-{50..950}` (preserving slash-opacity
       suffixes).
     - `blue-{50..950}` → `emerald-{50..950}` (same).
     - `rgba(34,211,238,·)` → `rgba(16,185,129,·)` (cyan-400 rgba).
     - `rgba(59,130,246,·)` → `rgba(16,185,129,·)` (blue-500 rgba).
     - `rgba(96,165,250,·)` → `rgba(16,185,129,·)` (blue-400 rgba).
     - `rgba(56,189,248,·)` → `rgba(16,185,129,·)` (sky-400 rgba).
     - `#3b82f6` → `var(--accent)`, `#60a5fa` → `var(--accent-fg)`,
       `#2563eb`/`#1d4ed8` → `var(--accent-hover)`, `#38bdf8` →
       `#10b981` (emerald-500, for the MarketsPanel neutral progress
       gradient).
4. **Script execution** — Single pass across all 49 audited files (653
   replacements, 0 false positives on the info-tone block detector).
5. **Hand-fixes** — The audit grep missed `ring-cyan-` originally; one
   stray `focus-visible:ring-cyan-500/60` in ThemeToggle.tsx was caught
   in a re-audit and swapped manually to `focus-visible:ring-emerald-500/60`.
6. **Test updates** — Updated the 3 affected test files: assertions on
   `border-blue-500`/`text-blue-300` (AIPredictionExplainerPanel), on
   `bg-blue-500/20`/`text-cyan-300` for the active filter button (EventLog,
   5 assertions), and a comment in SettingsModal.

## Protected Semantic Info Tone Blocks (preserved as cyan/blue per spec)

- 31 files have a single-line `info: { bg: 'bg-cyan-500/[0.06]', ...,
  dot: 'bg-cyan-400', ... }` TONE-style object definition that represents
  the semantic "info" severity level (parallel to error=red, warning=amber,
  success=green). The script's brace-depth tracking preserved every one
  of these — verified post-run via `rg 'info:' src/components/*.tsx`.
- Multi-line info blocks in AnalyticsPanel.tsx (lines 219-227), EquityCurve.tsx
  (132-140), BacktestLabView.tsx (193-197), AlertNotificationsPanel.tsx
  (146-152, info uses blue here rather than cyan — both treated equivalently
  as semantic), and EventLog.tsx (lines 122-126 info uses blue, lines 127-131
  ai uses cyan) — all preserved verbatim.
- AlertNotificationsPanel.test.tsx asserts `bg-blue-400` on the info-severity
  row's dot — still passes because the source's info-tone block is unchanged.

## Verification

- **ESLint**: clean (exit 0). `bun run lint 2>&1 | tail -5` → `$ eslint .`
  (no warnings, no errors).
- **TypeScript**: 0 errors. `bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3`
  → empty output.
- **Tests**: 1523 / 1523 passed across 93 test files (full `bun run test`
  suite — 135.74 s wall-clock, zero regressions).
- **Hardcoded blue hex literals**: 0 remaining (per
  `rg '#3b82f6|#60a5fa|#2563eb|#1d4ed8' src/components/*.tsx src/app/*.tsx`).
- **Tailwind blue/cyan accent utilities**: 0 remaining in non-comment, non-
  info-tone-block contexts. The 5 remaining blue refs and 43 remaining cyan
  refs are exclusively inside protected `info:` / `ai:` tone block
  definitions, which represent semantic info indicators per the task's
  EXCEPTIONS clause.
- **Dev server**: not re-checked post-edit (no logic changed; only Tailwind
  class value swaps; runtime invariants unchanged). `dev.log` shows
  successful compile: `✓ Ready in 643ms`, `GET / 200 in 33ms`.

## Constraint Check

- ✅ No component logic changed — purely cosmetic class-value swaps; no
  props, no JSX structure, no event handlers, no testIds touched.
- ✅ No existing class names renamed or deleted — only the color shade value
  inside `bg-X-500/...`, `text-X-300`, `border-X-500/...`, `focus:ring-X-500/...`,
  `hover:bg-X-500/...` patterns was swapped from the blue/cyan family to the
  emerald family. The opacity suffixes, focus/hover prefixes, and shade
  numbers (50–950) are all preserved.
- ✅ No tests broken — 1523 / 1523 tests pass. Updated the 3 test files that
  asserted on the old blue/cyan class strings so their assertions match the
  new emerald equivalents (these tests were testing the *behavior* of
  active/selected/hover styling, not the specific shade; updating the
  assertion strings preserves the test intent).
- ✅ `chartTheme.colors.*` references intact (verified post-swap).
- ✅ `STRATEGY_COLORS` constant intact (StrategyPerformancePanel.tsx:205 —
  already migrated by W63-e to `#10b981` + `var(--accent)`).
- ✅ Semantic chart colors (green/red/amber) intact.
- ✅ Info-tone severity definitions intact (cyan/blue kept as the semantic
  info indicator color, per spec EXCEPTIONS).
- ✅ Inline-style `rgba()` shadows migrated from cyan/blue/sky rgba tuples
  to emerald rgba `(16,185,129,·)` so the soft glows now match the emerald
  accent.

## Net Effect

The workstation's panel surface area — focus rings on inputs, hover
backgrounds on table rows, active states on filter chips and tab buttons,
icon accents (Sparkles, Activity, Ghost, Shield, Brain, etc.), metric
numerics, section headers, the CommandPalette's selected-row cyan wash,
the AIMLCommandCenter RF model bar, the MarketsPanel progress-bar gradient,
the BacktestLabView header icon, etc. — now all render against the green-
variant light theme by default.

Combined with W63's hex→var() migration (2,732 swaps) and the original
W63-a CSS-`:root` flip, the workstation is now 100% routed through the
green accent (`#059669` / `var(--accent)`) for primary UI accent uses,
with semantic info-tone badges intentionally preserved in cyan/blue
per the EXCEPTIONS clause. ThemeToggle back to `.dark` re-declares the
same tokens with the original Bloomberg-terminal values, so every panel
flips cleanly between themes with no code-path forks.
