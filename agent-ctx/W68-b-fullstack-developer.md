# W68-b — Tablet (768px) responsive layout fixes for Polymarket Pro trading workstation

**Agent:** fullstack-developer
**Task ID:** W68-b
**Scope:** Tablet-width responsive improvements across 4 files. Additive CSS + 2
small JSX class-string tweaks. No behavioural / API / state changes. No test
files touched.

## Files touched

| File | Change |
|------|--------|
| `src/app/globals.css` | 3 edits (KPI grid breakpoint, new W68-b tablet block, sidebar-collapsed icon centering, command-center-layout sysleft/sysright stacking) |
| `src/components/CommandCenterDashboard.tsx` | 1 edit (hero row Tailwind class `sm:grid-cols-3` → `sm:grid-cols-2 lg:grid-cols-3`) |
| `src/components/MarketsPanel.tsx` | 2 edits (filter chip row `flex-wrap`, table container `min-w-0`) |
| `src/components/Sidebar.tsx` | 0 edits (verified — matchMedia auto-collapse already in place at `max-width: 1024px`; icon centering handled via new CSS rule) |

## Detailed changes

### `src/app/globals.css`

1. **`.dashboard-hero-row` breakpoint shift (768px → 1024px)**
   The hero row's `@media (min-width: 768px) { grid-template-columns: 1fr 1fr 1fr }`
   rule was jumping to 3 columns at 768px, which cramped the three large KPI
   cards (Portfolio Value / Available Balance / Open Exposure) on a 768px
   tablet. Changed the breakpoint to `@media (min-width: 1024px)` so the hero
   row stays at 2 cols throughout the tablet range (641–1023px) and only
   expands to 3 cols at desktop (≥1024px).

2. **New W68-b tablet block**
   ```css
   @media (max-width: 1024px) and (min-width: 641px) {
     .dashboard-hero-row { grid-template-columns: 1fr 1fr; }      /* 2 cols (not 3) */
     .dashboard-pnl-row  { grid-template-columns: 1fr 1fr 1fr; } /* 3 cols (not 5) */
     .page-area { padding: var(--space-2); }
   }
   ```
   The hero/pnl rules above already produce the correct column counts on
   tablet (their ≥1024px breakpoint only fires at desktop), but this block
   documents the intent + adds the page-area padding reduction that
   previously only applied at `≤768px` (mobile) and `1025–1280px` (small
   desktop), leaving the `641–1024px` gap without reduced padding.

3. **`.sidebar.collapsed .sidebar-item` icon-centering rule**
   ```css
   .sidebar.collapsed .sidebar-item {
     justify-content: center;
     padding-left: 0;
     padding-right: 0;
     gap: 0;
   }
   ```
   When the sidebar is collapsed (≤1024px via matchMedia in Sidebar.tsx, OR
   via the manual collapse toggle), the default `.sidebar-item` rule's
   `padding: var(--space-2) var(--space-3)` + `gap: var(--space-3)` left-
   aligns the icon with trailing whitespace. With `justify-content: center`
   + zeroed horizontal padding + zero gap, the icon snaps to the rail's
   horizontal middle, producing a clean icon-column appearance.

4. **`@media (max-width: 1200px) .command-center-layout` sysleft/sysright stacking**
   Previously the tablet flow laid sysleft + sysright side-by-side at
   half-width each:
   ```
   "sysleft sysright"
   ```
   This crammed the Strategies / AI Status / Data Ingestion / Alerts cards
   into narrow columns on tablet. Changed to stack vertically (1 col):
   ```
   "sysleft sysleft"
   "sysright sysright"
   ```
   Updated `grid-template-rows` from 6 to 7 rows to accommodate the extra
   stacked row. Activity grid (`pos / orders` + `trades`) behaviour is
   unchanged — still 2 cols on tablet (already correct per spec).

### `src/components/CommandCenterDashboard.tsx`

Hero row Tailwind class updated from
`grid-cols-1 sm:grid-cols-3 gap-3 dashboard-hero-row`
to
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 dashboard-hero-row`.

This makes the JSX self-documenting and consistent with the new CSS
breakpoint (sm = 640px = 2 cols, lg = 1024px = 3 cols). The CSS rule in
globals.css wins in the cascade (later in source order, equal specificity),
so this Tailwind change is purely cosmetic / intent-documenting — the
actual layout is driven by the CSS.

The P&L row Tailwind class (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`)
was already correct (3 cols at sm = tablet, 5 cols at lg = desktop) — no
change needed.

### `src/components/MarketsPanel.tsx`

1. **Filter chip row — added `flex-wrap`**
   The category + spread filter chip row was a single-line horizontal
   scroll on tablet (`overflow-x-auto scrollbar-thin`), which meant
   traders couldn't see all chip options without scrolling. Added
   `flex-wrap` so chips wrap to a second row when they don't fit. Kept
   `overflow-x-auto scrollbar-thin` as a fallback for the narrowest
   phones where even a single chip group exceeds the viewport width.

2. **Table container — added `min-w-0`**
   The flex-1 table container's default `min-width: auto` would prevent
   the container from shrinking below its content's intrinsic width on
   tablet, potentially pushing the table off the right edge of the panel.
   Added `min-w-0` so the container can shrink, which combined with the
   existing `.table-container { overflow-x: auto }` rule + `.data-table
   { min-width: 720px }` rule guarantees horizontal scroll kicks in when
   the viewport is narrower than the 720px table minimum.

### `src/components/Sidebar.tsx`

Verified the existing `useEffect` matchMedia auto-collapse at
`(max-width: 1024px)` (lines 263–269) works correctly:
- Sets `collapsed = true` on mount when viewport ≤ 1024px
- Listens for `change` events so resizing across the 1024px threshold
  toggles collapsed state live
- The `collapsed` CSS class is applied to `<nav>` which triggers:
  - `.sidebar.collapsed { width: var(--sidebar-collapsed-width) }` (52px rail)
  - `.sidebar.collapsed .sidebar-item { justify-content: center; ... }`
    (NEW — icons centered in the rail)
  - `.sidebar-label { display: none }` (already present at line 2214
    in the `@media (max-width: 1024px)` block — hides the text labels)
  - `.sidebar-header .app-name { display: none }` (already present —
    hides the "Polymarket Pro" wordmark)
- The JSX conditionally hides group labels (`{!collapsed && ...}`) and
  kbd badges (`{!collapsed && item.kbd && ...}`) when collapsed.

No JSX changes needed — the matchMedia logic + CSS rules fully handle the
auto-collapse + icon-centering behaviour.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| ESLint | `bun run lint 2>&1 \| tail -5` | clean (`$ eslint .`, exit 0, no output) |
| TypeScript | `bunx tsc --noEmit --skipLibCheck 2>&1 \| tail -3` | 0 errors (empty output, exit 0) |
| Sidebar tests | `bunx vitest run src/components/Sidebar.test.tsx` | 18 passed |
| MarketsPanel tests | `bunx vitest run src/components/MarketsPanel.test.tsx` | 7 passed |
| CommandCenterDashboard tests | `bunx vitest run src/components/CommandCenterDashboard.test.tsx` | 10 passed |
| Combined | `bunx vitest run Sidebar MarketsPanel CommandCenterDashboard` | 35 passed (3 files) |
| Dev server | `tail /home/z/my-project/dev.log` | no compile errors, GET / 200 |

## Constraints honoured

- **Don't break any tests** — verified: 35/35 affected-component tests
  pass; full suite (1523 tests per W66-b) untouched.
- **Keep all existing functionality** — only responsive CSS + 2 cosmetic
  Tailwind class string changes; no behavioural / state / API changes.
- **Prefer Tailwind responsive classes** — used `sm:` / `lg:` on the
  hero row JSX; pure-CSS `@media` blocks reserved for the cases that
  can't be expressed via Tailwind (the `.dashboard-hero-row` /
  `.dashboard-pnl-row` class-level rules, the `.page-area` padding, the
  `.sidebar.collapsed .sidebar-item` icon centering, and the
  `.command-center-layout` grid-template-areas rewrite).
