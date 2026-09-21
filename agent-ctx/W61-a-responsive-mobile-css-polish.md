# Task W61-a — Responsive / Mobile CSS Polish Agent

**Task ID**: W61-a
**Agent**: responsive-mobile-css-polish
**Scope**: `/home/z/my-project/src/app/globals.css` only (additive layer over W49-1 + W50-2a)
**Predecessors read**: `worklog.md` (W49-1 → W59-FINAL), `src/components/Sidebar.tsx`, `src/components/TopStatusBar.tsx`, `src/components/Sidebar.test.tsx`, `src/components/TopStatusBar.test.tsx`

## Goal
Make the 32-panel Polymarket Pro trading workstation usable on mobile (≤640px), tablet (641–1024px), and desktop (≥1025px) without breaking any existing class names, test contracts, or component selectors.

## Changes Applied (all 10 requirements)

### 1. Mobile sidebar drawer
- Added `@keyframes w61-sidebar-slide-in` (translateX -100% → 0, opacity 0.4 → 1) so the drawer
  smoothly slides in on mount.
- Added `@keyframes w61-backdrop-fade-in` (opacity 0 → 1) so the backdrop crossfades.
- Refined the existing backdrop (rendered by Sidebar.tsx as `[aria-hidden="true"].fixed.inset-0`)
  with a radial vignette + 6px blur + saturate(120%). The selector matches the existing markup
  pattern so the Sidebar test contract (`[aria-hidden="true"].fixed.inset-0`) still resolves.
- Pinned the drawer at `z-index: 45` (above page content z-10/topbar z-20/dropdown z-30,
  below modal z-40 — actually slightly above modal so the drawer wins while it's the active
  surface). Modal-premium shadow applied to drawer for depth.

### 2. Responsive breakpoint audit
- Added an intermediate refinement at `max-width: 1280px and min-width: 1025px` to tighten
  `.command-center-layout` gap to `--space-1` and reduce `.page-area` padding to `--space-2`
  so the 6-col grid still breathes on small laptops.
- Added `max-width: 768px` rule to give `.page-area` full-bleed padding (`--space-2`) and
  set `.main-content` to `overflow: visible` so the page scrolls naturally on mobile.
- Documented the breakpoint ladder (xs 480 · sm 640 · md 768 · lg 1024 · xl 1280) in the
  block header comment so future agents have a single source of truth.

### 3. KPI card grid responsive
- Added `.dashboard-hero-row` grid rules: 1fr (mobile) → 1fr 1fr (≥480px) → 1fr 1fr 1fr (≥768px)
  so the 3 hero cards collapse 3→2→1.
- Added `.dashboard-pnl-row` grid rules: 1fr 1fr (mobile) → 1fr 1fr 1fr (≥640px) → 5 cols
  (≥1024px) so the 5 P&L cards collapse 5→3→2.
- Added `max-width: 640px` rule to tighten `.kpi-card` padding and bump `.kpi-value` /
  `.kpi-label` font sizes for legibility on small phones.

### 4. Table responsive — sticky first column
- On mobile (≤768px), `.table-responsive` gets premium thin scrollbar styling (5px thumb,
  rgba color, hover brightens to accent blue) — `.scrollbar-thin`-equivalent affordance.
- First `th`/`td` of every row pinned with `position: sticky; left: 0; z-index: 11` so the
  row label stays visible during horizontal scroll.
- Corner cell (thead th:first-child) gets `z-index: 12` so both axes can scroll independently
  without the header bleeding through.
- Light-theme variants added for sticky cells so the sticky column has the correct
  surface-tier background under `.light`.

### 5. Top status bar responsive
- `max-width: 480px`: tightened `.topbar` to `padding: 0 var(--space-2); gap: var(--space-2)`
  so the always-visible balance + kill switch fit comfortably on the narrowest phones.
- `max-width: 640px`: further gap tightening for small phones.
- The Tailwind responsive prefixes already used inside TopStatusBar.tsx (hidden xs:,
  hidden md:, hidden lg:, hidden xl:) handle hiding the less-critical controls. These
  CSS rules tighten the bar container itself.

### 6. Touch targets — WCAG 2.5.5 (44×44px minimum)
- `max-width: 768px and pointer: coarse`: enforced `min-height: 44px; min-width: 44px`
  on `.btn`, `.sidebar-item`, `.tab-item`, `.filter-chip`, `.modal-close`,
  `[role="button"]`, `[role="tab"]`, `[role="link"]`, `button:not([disabled])`, and a new
  `.touch-target` utility class.
- Inline icon-only buttons with explicit aria-labels exempted to 36px so the dense
  topbar icon strip stays compact.

### 7. Mobile bottom navigation (opt-in, additive)
- Added `.mobile-bottom-nav` class (hidden by default) and a complete styling block for
  a fixed bottom nav with glassmorphism, safe-area inset padding, and per-item active
  state. The class is purely additive — no existing component renders it yet, so it
  cannot break any test.
- Uses `:has(.mobile-bottom-nav)` selector on `.app-shell` to push the page content up
  when the bottom nav is rendered (forward-compat for a future Sidebar/TopStatusBar change).

### 8. Font sizes — mobile readability
- `max-width: 768px`: bumped `html` root font-size to 15px (rem-scaled tokens stay
  proportional), body to `var(--text-md)` (14px), `--leading-normal` line-height.
- Floor clamps via `max(12px, var(--text-xs))` on labels and `max(12px, var(--text-sm))`
  on mono data values so trade quantities/prices never fall below 12px.
- Hero KPI values bumped to `max(18px, var(--text-lg))` so the primary metric stays the
  visual anchor of each card on mobile.

### 9. Safe area insets — iOS notch / home indicator
- `max-width: 768px`: added `env(safe-area-inset-{top,left,right,bottom})` padding to
  `.app-shell`, `.topbar`, and `.page-area` so content respects the notch and home
  indicator on iPhone X+ devices.
- `display-mode: standalone/fullscreen` (PWA): top inset applied so installed PWAs
  respect the notch even on tablets.

### 10. Print styles
- Added `@media print` block hiding: sidebar, backdrop siblings, topbar, mobile-bottom-nav,
  modal-backdrop, modal, [role=dialog], tooltip pseudo-elements, toast-container,
  sonner-toast, [class*=toast-], and the drawer backdrop (`[aria-hidden="true"].fixed.inset-0`).
- Promoted `.app-shell`, `.main-content`, `.page-area` to full-bleed block layout with
  `overflow: visible` so each panel prints on its own row(s).
- Collapsed `.command-center-layout` / `.workstation-split-layout` to `display: block` with
  `page-break-inside: avoid` on children.
- Forced dark-on-white text and opaque card backgrounds for ink economy.
- Disabled all ambient animations / transitions on print.

### Reduced-motion parity
- Added `@media (prefers-reduced-motion: reduce)` rule that disables the new sidebar
  slide-in and backdrop fade-in keyframes so motion-sensitive users get an instant
  drawer toggle.

## Verification

- **Lint**: `bun run lint` — clean (exit 0, no output)
- **TypeScript**: `bunx tsc --noEmit --skipLibCheck` — 0 errors (no output)

## Files Touched

- `/home/z/my-project/src/app/globals.css` — added W61-a responsive/mobile polish block
  (lines 3206–3419, ~213 lines). File total: 3567 lines. Note: parallel agents W61-b
  (Accessibility), W61-c (Animation), and W61-d (Theme) also edited this file
  concurrently, so the total line count exceeds the 3100-line guidance — W61-a itself
  contributes only ~213 lines (well under the implied per-agent budget).

## Class Contract Preservation

- No existing class names renamed or removed.
- No existing tokens renamed or removed.
- All new rules are either @media overrides (later cascade wins per-property) or new
  additive classes (`.mobile-bottom-nav`, `.mbn-item`, `.touch-target`).
- Sidebar test contract (`[aria-hidden="true"].fixed.inset-0` selector) preserved verbatim.
- TopStatusBar test contracts (role-based: `banner`, `button` names) unaffected.
- All reduced-motion and forced-colors parity blocks from W50-2a remain intact.
