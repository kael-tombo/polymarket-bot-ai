# W63-b — Switch default theme from dark → light (green variant)

**Agent:** fullstack-developer
**Task ID:** W63-b
**Date:** 2026-09-04 (continuation of W60-62 final polish wave)
**Scope:** Default-theme flip only — additive behaviour change, no contract
renames, no new components. Theme toggle remains fully functional; users
can still switch to dark.

## Background

The workstation was originally dark-first (`ThemeProvider.defaultTheme =
"dark"`, `viewport.themeColor = "#0b0e14"`, `DEFAULTS.theme = "dark"`).
Waves 49 / 50-2a / 61-d brought the `.light` CSS override layer to
production parity with the dark Bloomberg-terminal palette (semantic
colors, shadows, glassmorphism, status dots, scrollbars, chart tooltips,
inset rim highlights). W63-b is the follow-through: flip the *default*
so a fresh install / first-run boots into the light theme, and the
browser chrome (Android address bar, iOS Safari status bar) tints to
match.

## Files touched

1. `src/components/ThemeProvider.tsx`
   - `defaultTheme="dark"` → `defaultTheme="light"`.
   - Updated the docstring above the JSX (the `defaultTheme="light"` bullet)
     to explain the W63-b rationale: light overrides reached parity with
     the dark palette, so light is now the safer first-run canvas.
   - Updated the `enableSystem={false}` bullet's parenthetical example
     ("light always — even in a dim trading room") to stay consistent.

2. `src/app/layout.tsx`
   - `viewport.themeColor: '#0b0e14'` → `'#f8fafc'` (slate-50, matches
     the `.light` `--bg` token) so the Android address bar / iOS Safari
     chrome blends with the light shell on first paint.
   - `<meta name="theme-color" content="#0b0e14" />` → `content="#f8fafc"`
     (same rationale; the explicit `<meta>` is duplicated for crawlers
     / browsers that only read `<link>` + `<meta>` tags).
   - Updated both comments to flag the W63-b default flip.

3. `src/components/ThemeToggle.tsx`
   - No behavioural change — `useTheme()` from `next-themes` resolves
     `theme === 'light'` on first mount now, so the toggle correctly
     renders the 🌙 moon icon with `aria-label="Switch to dark mode"`
     and `aria-pressed={false}` (since dark is the "on" toggle state
     and it's currently off). Clicking flips to dark, as before.
   - Updated two docstring comments:
     - The header line ("`light` (default since W63-b) and `dark`").
     - The "Why a separate component" block: previously said SSR would
       emit a `🌙` because `defaultTheme='dark'`; now SSR emits the
       light-branch icon (which is still `🌙` — moon means click to go
       dark — but the rationale text now correctly attributes it to
       `defaultTheme='light'`).

4. `src/lib/preferences.ts`
   - `DEFAULTS.theme: 'dark'` → `'light'`, with an inline comment
     pointing to the W63-b rationale and noting that the trader can
     still flip back to dark via the ThemeToggle / SettingsModal.
   - Updated the module-level "Default values" docstring: removed the
     "dark-first design system" justification (no longer accurate) and
     replaced it with the W63-b rationale (light overrides reached
     parity, so light is now the first-run canvas).

5. `src/lib/preferences.test.ts`
   - `EXPECTED_DEFAULTS.theme: 'dark'` → `'light'`. This local mirror
     is kept in lock-step with the canonical `DEFAULTS` so the
     `getDefaults` / `loadPreferences` / `resetPreferences` round-trip
     assertions still reflect the first-run state.
   - Added an inline comment explaining the W63-b flip so a future
     reader doesn't think the test was always asserting `'light'`.
   - The other theme assertions in this file (`theme: 'light'` in
     partial-merge tests, `theme: 'dark'` in the overwrite-saves test)
     are explicit overrides, so they remain valid.

6. `src/hooks/usePreferences.test.ts`
   - Two assertions in the `reset() restores DEFAULTS` test expected
     `theme: 'dark'` after a reset (i.e. they were pinning the
     canonical DEFAULTS). Flipped both to `'light'` with an inline
     W63-b comment.
   - All other theme assertions in this file are explicit overrides
     (seeding `theme: 'light'` then expecting it back), so they
     remain valid.

## What I explicitly did NOT change

- `<html className="dark">` in `layout.tsx` — there is no SSR `className`
  on the `<html>` element (only `lang="en" suppressHydrationWarning`).
  `next-themes` injects the `light` / `dark` class via an inline script
  on mount, so no manual SSR class was needed. The `:root` CSS variables
  in `globals.css` default to the dark values, but `next-themes` adds
  the `.light` class before first paint (its inline script runs
  synchronously in `<head>`), so the light palette wins on the very
  first paint. No change needed here.

- `ThemeToggle.tsx` aria-label logic — verified correct:
  `isDark ? 'Switch to light mode' : 'Switch to dark mode'`.
  With the new light default, the toggle initially shows
  `aria-label="Switch to dark mode"` + 🌙 + `aria-pressed=false`,
  which is exactly the right affordance.

- `ThemeToggle.tsx` focus-ring offset color (`ring-offset-[#0b0e14]`)
  — the W58-f polish pass hardcoded a dark slate-950 ring offset. With
  light mode as default, this ring offset (the gap between the button
  and the focus ring) would ideally be slate-50 to blend with the
  light bg. This is a W58-family visual polish concern, not a theme
  default concern — out of scope for W63-b (which is a one-line default
  flip, not a visual polish pass). Flagged here for a future polish
  wave if the dark ring offset becomes visually jarring on light bg.

- The `ThemeProvider.test.tsx` smoke test — it only asserts "renders
  children", no theme-specific behaviour, so it was unaffected.

- The `ThemeToggle.test.tsx` test suite — every test passes an explicit
  `defaultTheme` prop to the test-only `NextThemesProvider` wrapper, so
  the assertions are isolated from the production `ThemeProvider.tsx`
  default. No edits needed.

## Verification

- **ESLint**: clean (exit 0). `bun run lint 2>&1 | tail -3` → `$ eslint .`
- **TypeScript**: 0 errors. `bunx tsc --noEmit --skipLibCheck 2>&1 | tail -3` → empty.
- **Tests**: 1523 / 1523 passed across 93 test files (no regressions).
  Specifically:
  - `src/components/ThemeProvider.test.tsx` — 1/1 passed.
  - `src/components/ThemeToggle.test.tsx` — 5/5 passed.
  - `src/lib/preferences.test.ts` — all assertions passed (including the
    updated `EXPECTED_DEFAULTS` mirror).
  - `src/hooks/usePreferences.test.ts` — all assertions passed (including
    the two updated post-reset `theme: 'light'` assertions).
- **Dev server**: clean compile, no parse errors in `dev.log`.

## Constraints check

- ✅ Don't break any existing tests — 1523/1523 pass.
- ✅ Keep the theme toggle working — ThemeToggle.tsx is unchanged in
  behaviour; only its docstring comments were updated.
- ✅ Default theme is now `light` (green variant — the `.light` CSS
  override layer at `globals.css` lines 437+ is the production-ready
  light palette from W49-1 / W50-2a / W61-d).

## Net effect

A fresh install / first-run (no `localStorage` entry under
`polymarket_preferences` and no `theme` cookie from `next-themes`)
now boots the workstation into the light theme. The browser chrome
(Android address bar, iOS Safari status bar) tints to slate-50
(`#f8fafc`) to match. The trader can still flip to dark via the
ThemeToggle button in TopStatusBar or the Theme selector in the
SettingsModal — and that choice persists across reloads via
`next-themes`'s `localStorage` write.
