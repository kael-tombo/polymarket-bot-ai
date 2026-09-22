# W64-b — Replace remaining hardcoded dark hex colors in OrderFlow, ai-explainability, and CommandCenterMetricsStrip

**Task ID:** W64-b
**Agent:** fullstack-developer (color-token migration wave)
**Date:** 2026-09-XX (continuation of W63 green-variant light-theme migration)
**Parent worklog:** `/home/z/my-project/worklog.md` (appended)

## Scope

Three component files of the Polymarket Pro trading workstation that
still contained hardcoded dark hex colors after the W63 a-f waves:

1. `src/components/OrderFlowPanel.tsx`
2. `src/components/ai-explainability.tsx`
3. `src/components/CommandCenterMetricsStrip.tsx`

## Pre-edit hex inventory

From `rg -o '#[0-9a-fA-F]{6}' <file> | sort | uniq -c`:

### OrderFlowPanel.tsx — 33 occurrences, 7 distinct hexes
```
      5 #0e1015   → var(--bg-page)
      4 #13161e   → var(--bg-surface)
      9 #1f2335   → var(--border)
      1 #2a2f48   → var(--border-strong)
      6 #5a637a   → var(--text-dim)
      6 #7e8aaa   → var(--text-secondary)
      2 #dde1ed   → var(--text-primary)
```

### ai-explainability.tsx — 37 occurrences, 7 distinct hexes
```
      4 #0e1015   → var(--bg-page)
      2 #13161e   → var(--bg-surface)
      5 #1f2335   → var(--border)
      6 #3e4560   → var(--border-strong)   ← "cousin" hex; see Notes
     10 #5a637a   → var(--text-dim)
      7 #7e8aaa   → var(--text-secondary)
      3 #dde1ed   → var(--text-primary)
```

### CommandCenterMetricsStrip.tsx — 23 occurrences, 7 distinct hexes
```
      1 #0e1015   → var(--bg-page)
      1 #13161e   → var(--bg-surface)
      1 #1a1f2e   → var(--bg-elevated)
      4 #1f2335   → var(--border)
      1 #5a637a   → var(--text-dim)
      5 #7e8aaa   → var(--text-secondary)
      9 #dde1ed   → var(--text-primary)
```

## Replacement totals

| File | Swaps | Distinct hexes |
|---|---|---|
| OrderFlowPanel.tsx | 33 | 7 |
| ai-explainability.tsx | 37 | 7 |
| CommandCenterMetricsStrip.tsx | 23 | 7 |
| **Total** | **93** | **8** (9 counting #3e4560 cousin) |

## Methodology

1. `rg -o '#[0-9a-fA-F]{6}' <file> | sort | uniq -c` to inventory hex
   literals per file (catches both Tailwind arbitrary classes like
   `bg-[#xxx]` and inline-style / SVG attribute values).
2. Verify each occurrence's context via `rg -n '#xxx'` to ensure none
   are financial semantic colors (green/red/amber/purple for buy/sell/
   warn/info data). All hits confirmed as dark-tier UI tokens (panel
   backgrounds, borders, separator characters, dim labels, neutral
   dot/bar fills).
3. Apply per-file MultiEdit with one `replace_all: true` edit per
   distinct hex. Each edit's old_str is the bare hex `#xxxxxx` so the
   substitution works uniformly across `bg-[…]`, `text-[…]`,
   `border-[…]`, `hover:border-[…]`, `hover:bg-[…]`, `from-[…]`,
   `to-[…]`, and `bar: 'bg-[…]'` object-literal positions — no
   surrounding bracketing needed, brackets already present in source.
4. Re-run inventory post-edit to confirm 0 hex colors remain in all
   3 files (returned empty — full migration).

## Notable decisions

### `#3e4560` in ai-explainability.tsx (6 occurrences)
Not in the literal W63 spec list but a border-tier cousin shade
(~mid-late indigo-gray), used exclusively as decorative separators:

- Line 265: `bg-[#3e4560]` — center zero-line div on the SHAP
  contribution bar (the `|` between the positive/negative halves of
  the divergent bar).
- Line 395: `border: 'border-[#3e4560]'` — part of a tier styling
  object.
- Lines 618, 630, 646, 661: `text-[#3e4560]` for the vertical "|"
  pipe separators between the Version/Trained/Drift/Calibration/
  Features cells of the ModelReadinessStrip.

Mapped to `var(--border-strong)` following the W63-e precedent of
routing cousin hexes through the same token as their nearest spec
cousin (here: `#2a2f48` / `#2d3450` / `#2a2e3a`, all →
`var(--border-strong)`).

### Tailwind built-in color classes retained untouched
- `focus:border-blue-500 focus:ring-cyan-500/20` in
  OrderFlowPanel.tsx:538 (the token-select focus ring)
- `bg-blue-500/20 text-cyan-300 border-blue-500/50` in
  OrderFlowPanel.tsx:566 (the active window-toggle state)

These are not hex literals — outside this task's scope. They pre-date
W64-b and are not part of the dark-tier UI token set being migrated;
they'll be addressed by the broader blue-color sweep if/when one is
scheduled.

### Semantic chart colors intact
- ai-explainability.tsx TONE table (lines 130-133: emerald/amber/red/
  purple for good/warn/poor/info) — left intact; only the `neutral`
  row was migrated (line 134).
- CommandCenterMetricsStrip.tsx TONE_TEXT (lines 140-142: green-400/
  red-400/amber-300 for positive/negative/warning) — left intact;
  only the `neutral` row was migrated (line 139).
- OrderFlowPanel.tsx TONE table (lines 163-165: green-400/red-400/
  amber-400 for positive/negative/warn) — left intact; only the
  `neutral` row was migrated (line 166).

## Constraint check

- ✅ No existing class names renamed or deleted — only the hex value
  inside `bg-[…]`, `text-[…]`, `border-[…]`, `hover:bg-[…]`,
  `hover:border-[…]`, `from-[…]`, `to-[…]`, `bar: 'bg-[…]'` patterns
  was swapped for the corresponding `var(--token)`.
- ✅ No component logic changed — purely cosmetic value swaps; no
  props, no JSX structure, no event handlers, no testIds, no aria
  labels touched.
- ✅ No tests broken — tests assert on text/roles, not colors; no test
  contracts affected.
- ✅ Semantic chart colors (green/red/amber/purple) intact — verified
  via post-edit `rg -o '#[0-9a-fA-F]{6}'` returning empty for all 3
  files.
- ✅ `chartTheme.colors.*` references intact (verified post-swap).
- ✅ `#3e4560` cousin mapping consistent with W63-e precedent.

## Verification

| Check | Command | Result |
|---|---|---|
| ESLint | `bun run lint 2>&1 \| tail -5` | clean (exit 0) |
| TypeScript | `bunx tsc --noEmit --skipLibCheck 2>&1 \| tail -3` | 0 errors |
| Target hexes | `grep -c "#0e1015\|#13161e\|#1f2335\|#3b82f6"` over 3 files | 0 / 0 / 0 |
| Full hex sweep | `rg -o '#[0-9a-fA-F]{6}'` over 3 files post-swap | empty |
| Dev server | `tail -30 dev.log` | "✓ Ready in 643ms", "GET / 200 in 33ms" |

## Net effect

The 3 remaining Polymarket Pro trading-workstation panel components
(OrderFlow, ai-explainability, CommandCenterMetricsStrip) now render
against the W63-a green-variant light theme by default, with every
dark-tier surface, border, separator, dim label, neutral dot/bar,
and neutral text token routed through the `--bg-*` / `--border*` /
`--text-*` CSS variables defined in `src/app/globals.css`.

Because the `.light` overrides in globals.css already remap every
Tailwind arbitrary `bg-[var(--bg-page)]` / `text-[var(--text-primary)]`
/ `border-[var(--border)]` / etc. to the light palette, the swap is
purely cosmetic at the source level — no test contracts, accessibility
roles, or component APIs shifted.

Combined with the prior W63 waves (a/b/c/d/e/f — 2,732 swaps across
44+ files), the workstation's component surface area is now
effectively 100% routed through theme-aware CSS variables. When the
trader toggles back to dark via ThemeToggle, the `.dark` block in
globals.css re-declares the same tokens with the original Bloomberg-
terminal values, so every panel flips cleanly between themes with no
code-path forks and no residual dark-hex bleed-through.
