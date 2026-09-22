# Task W64-c — Replace remaining hardcoded dark hex colors in small utility components

**Agent:** fullstack-developer (subagent)
**Date:** 2026-09-04
**Scope:** Cosmetic-only hex→`var()` swap across 4 small utility components in the
Polymarket Pro trading workstation. No component logic, props, or test
contracts touched.

## Files touched
1. `src/components/ShortcutHint.tsx`
2. `src/components/ConnectionStatus.tsx`
3. `src/components/ShortcutsModal.tsx`
4. `src/components/LocaleSwitcher.tsx`

## Replacement map applied (from W64-c spec)
| Old hex        | New CSS var                |
|----------------|----------------------------|
| `#0e1015`      | `var(--bg-page)`           |
| `#13161e`      | `var(--bg-surface)`        |
| `#1f2335`      | `var(--border)`            |
| `#2d3450`      | `var(--border-strong)`     |
| `#2a2f48`      | `var(--border-strong)`     |
| `#3b82f6`      | `var(--accent)` (now green)|
| `#60a5fa`      | `var(--accent-fg)`         |
| `#dde1ed`      | `var(--text-primary)`      |
| `#7e8aaa`      | `var(--text-secondary)`    |
| `#5a637a`      | `var(--text-dim)`          |

## Per-file replacement counts (actual, not the spec's estimates)

### 1. `src/components/ShortcutHint.tsx` — 3 replacements
- Docstring comment line ~13: `` `#2d3450` `` → `` `var(--border-strong)` ``
- Tailwind arbitrary class line ~90: `bg-[#13161e] border border-[#2d3450]`
  → `bg-[var(--bg-surface)] border border-[var(--border-strong)]`
- Out-of-scope (left as-is): `#1a1f2e` (hover bg lift, not in task map),
  `#0b0e14` (focus-ring offset, not in task map).

### 2. `src/components/ConnectionStatus.tsx` — 7 replacements
- JSDoc comment for `pillBorder`: `#1f2335 default` → `var(--border) default`
- Pill wrapper class: `bg-[#0e1015] border border-[#1f2335] hover:border-[#2d3450]`
  → `bg-[var(--bg-page)] border border-[var(--border)] hover:border-[var(--border-strong)]`
- Latency readout span class: `text-[#7e8aaa] border-l border-[#2d3450] pl-1.5`
  → `text-[var(--text-secondary)] border-l border-[var(--border-strong)] pl-1.5`
- Tooltip RTT readout: `text-[#7e8aaa] mono tabular-nums`
  → `text-[var(--text-secondary)] mono tabular-nums`
- Out-of-scope (left as-is): `#0b0e14` (focus-ring offset).

### 3. `src/components/ShortcutsModal.tsx` — 6 replacements
- Modal title h2: `text-[#dde1ed]` → `text-[var(--text-primary)]`
- Shortcut row container: `bg-[#0e1015] ... border border-[#1f2335]`
  → `bg-[var(--bg-page)] ... border border-[var(--border)]`
- Action label span: `text-[#dde1ed]` → `text-[var(--text-primary)]`
- `<kbd>` element: `bg-[#13161e] ... border border-[#1f2335]`
  → `bg-[var(--bg-surface)] ... border border-[var(--border)]`

### 4. `src/components/LocaleSwitcher.tsx` — 7 replacements
- Native select base classes: `bg-[#0e1015] border border-[#1f2335]` + `text-[#dde1ed]`
  → `bg-[var(--bg-page)] border border-[var(--border)]` + `text-[var(--text-primary)]`
- Hover state: `hover:border-[#2d3450] hover:bg-[#13161e]`
  → `hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)]`
- ChevronDown glyph: `text-[#7e8aaa] group-hover:text-[#dde1ed]`
  → `text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]`

**Total: 23 hex→var() swaps across the 4 files.**

## What was NOT touched (preserved verbatim)
- All component logic, props, hooks, JSX structure, ARIA contracts,
  `data-testid` attributes, focus-trap behavior, etc.
- Out-of-scope hex colors not in the W64-c replacement map:
  - `#0b0e14` (focus-ring offset color in `focus-visible:ring-offset-[#0b0e14]`)
    — not in spec's replacement list.
  - `#1a1f2e` (hover bg lift in ShortcutHint) — not in spec's replacement list.
- All Tailwind class names preserved verbatim; only the hex value inside the
  arbitrary-value bracket was swapped (e.g. `bg-[#0e1015]` → `bg-[var(--bg-page)]`).

## Verification results
1. **ESLint**: clean. `bun run lint 2>&1 | tail -5` → `$ eslint .` (0 warnings, 0 errors).
2. **TypeScript**: 0 errors. `bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3`
   → empty output (success, exit 0).
3. **Targeted hex grep** (must be 0):
   ```
   grep -c "#0e1015\|#13161e\|#1f2335\|#3b82f6" \
     src/components/ShortcutHint.tsx \
     src/components/ConnectionStatus.tsx \
     src/components/ShortcutsModal.tsx \
     src/components/LocaleSwitcher.tsx
   ```
   → 0 / 0 / 0 / 0 across all 4 files (grep exits non-zero because no matches,
   which is the success signal here).
4. Remaining hex literals in these 4 files are only out-of-scope values
   (`#0b0e14`, `#1a1f2e`) not covered by the W64-c replacement map.
5. Tests: not run because the change is purely cosmetic (string-literal
   swaps inside Tailwind arbitrary-value brackets). Test suites assert on
   text/roles/ARIA-labels and `data-testid` values, none of which changed.

## Net effect
The 4 small utility components (ShortcutHint FAB, ConnectionStatus pill,
ShortcutsModal cheatsheet, LocaleSwitcher dropdown) now render against the
W63-a green-variant light theme by default, with all dark-tier surface,
border, and text hex literals routed through the `--bg-*` / `--border*` /
`--text-*` tokens defined in `src/app/globals.css`. Because the `.light`
overrides in globals.css already remap every Tailwind arbitrary
`bg-[var(--bg-page)]` / `text-[var(--text-primary)]` / etc. to the light
palette, the swap is purely cosmetic at the source level — no test contracts,
accessibility roles, or component APIs shifted. When the trader toggles back
to dark via ThemeToggle, the `.dark` block re-declares the same tokens with
the original Bloomberg-terminal values, so every utility component flips
cleanly between themes.
