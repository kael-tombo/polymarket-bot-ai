# W61-d — Dark/Light Theme Polish Agent

**Task ID**: W61-d
**Agent**: fullstack-developer (theme polish subagent)
**Scope**: Single-file polish of `/home/z/my-project/src/app/globals.css` —
complete the dual-theme system (dark default + `.light` override on `<html>`).

## Work summary

The file already had a near-complete light theme (`.light` block at lines
371–520 overriding every design token), but several layers of W50-2a premium
shadows, status-dot halos, and inset rim highlights were dark-mode-only and
silently broke on white backgrounds. This pass:

1. Added a `transition: background-color 200ms ease, color 200ms ease,
   border-color 200ms ease` on `body` (lines 620–624) for a smooth fade
   when the trader flips themes. Note: `next-themes`'s
   `disableTransitionOnChange` in `ThemeProvider.tsx` suppresses this
   during the actual toggle event (instant flip per Wave 13-4's design
   intent), but the rule still applies to subsequent style changes
   (background-image swap, programmatic color changes).

2. Bumped the `.light` shadow ladder (lines 457–462) for crisper depth
   on white: rgba alphas raised from 0.06–0.16 → 0.10–0.26, and the xl
   shadow extended from 20px → 24px blur for a softer falloff.

3. Bumped the W50-2a `.light` premium shadows (lines 2678–2694) similarly:
   `--shadow-ambient` 0.18→0.22, `--shadow-key` 0.10→0.14,
   `--shadow-contact` 0.06→0.08, modal-premium ambient 0.20→0.26.

4. Appended a new **W61-d** section (lines 3756–3902, ~147 lines) with
   8 additive rule groups:

   - **§1 Selection highlight** — `.light ::selection` uses
     `rgba(37, 99, 235, 0.22)` (blue-600) + slate-900 text for legibility
     on white; dark mode keeps the W49-1 default.
   - **§2 Glassmorphism** — `.light .surface-tier-overlay` brightened
     from 0.86→0.92 white tint, blur 12px→14px, saturate 140%→160%,
     visible slate-300 border so the overlay reads as a discrete layer
     on white instead of dissolving.
   - **§3 Inset rim highlights** — `.light .btn`, `.btn:hover`,
     `.btn:active`, `.btn-primary`, `.btn-primary:hover`,
     `.btn-primary:active`, `.card-hover:hover`,
     `.kpi-card.is-interactive:hover` all swap the dark-mode
     `rgba(255,255,255,…)` inset rim (invisible on white) for a
     slate-tinted `rgba(15, 23, 42, …)` rim. Primary buttons keep
     the white rim (their accent-blue background still benefits
     from a white highlight).
   - **§4 Status-dot halos** — `.light .status-dot.healthy`,
     `.connecting`, `.degraded`, `.unavailable` use the darker
     light-mode semantic hues (#16a34a green, #d97706 amber,
     #dc2626 red) with 0.22–0.24 alpha halos, and the healthy
     dot's `animation-name` swapped to a new
     `status-dot-live-light` keyframe (keyframes can't be scoped
     by `.light`, so the name swap is the cleanest override path).
   - **§5 Sidebar-status-dot** — `.light .sidebar-status-dot`
     + `.is-stale` get new `sidebar-status-pulse-light` and
     `sidebar-status-pulse-light-stale` keyframes using the darker
     light-mode hues with the same 2.2s / 1.4s cadence as dark mode.
   - **§6 Recharts tooltip** — `.light .recharts-tooltip-wrapper` +
     `.light .recharts-default-tooltip` forced to honor the
     `--chart-tooltip-*` tokens via `!important` so the tooltip
     border/bg/text flip cleanly with the theme (recharts' default
     styles would otherwise keep dark-mode colors).
   - **§7 Scrollbar thumb hover** — `.light .scrollbar-thin` thumb
     hover uses `rgba(37, 99, 235, 0.55)` (blue-600) instead of the
     dark-mode `rgba(59, 130, 246, 0.55)` (blue-500) for palette
     consistency.
   - **§8 Reduced-motion parity** — `.light` variants of the
     status-dot + sidebar-status-dot animations are explicitly
     disabled under `@media (prefers-reduced-motion: reduce)`.

## Files touched

- `src/app/globals.css` (theme polish pass, 2910 → 3902 lines,
  +992 net per `git diff --stat` — of which ~845 lines are uncommitted
  parallel work from W61-a / W61-b / W61-c agents; my own W61-d
  additions are ~150 lines + 6 in-place edits to existing rules).

## Verification

- **ESLint**: clean (exit 0, no output). `bun run lint 2>&1 | tail -3`
  returns just `$ eslint .` (the npm script banner).
- **TypeScript**: 0 errors. `bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3`
  returns empty output.
- **Tests**: 1523/1523 passed across 93 test files (no regressions,
  including the 5 ThemeToggle tests + 1 ThemeProvider test + the 38
  W58-f ai-explainability / small-component tests that exercise the
  `.light` toggle path).
- **CSS brace balance**: 758 open / 758 close (verified via node script).
- **Dev server**: `dev.log` shows clean compile, no CSS parse errors.

## Constraints honored

- ✅ Only edited `/home/z/my-project/src/app/globals.css` (no other files
  touched).
- ✅ No existing CSS classes renamed or deleted — all W61-d rules are
  additive (later cascade + `.light` prefix specificity).
- ✅ No tests broken (1523/1523 pass).
- ⚠️ File is 3902 lines, over the 3200-line soft cap. ~845 lines of
  that overage is uncommitted parallel work from W61-a / W61-b / W61-c
  agents; my own additions are ~150 lines. Did NOT touch their work
  (out of scope for this task ID).
