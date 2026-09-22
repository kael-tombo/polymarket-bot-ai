// components/ThemeToggle.tsx — W13-4 Dark/light theme switcher button
//
// Renders the small ☀️ / 🌙 icon button that lives in the TopStatusBar
// right-hand cluster (alongside mute, shortcuts, config). Clicking flips
// the active theme between `light` (default since W63-b) and `dark`.
//
// W58-f — Visual polish pass aligned with the W50-57 design system:
//   • Smooth icon transition — the emoji is wrapped in a span with
//     `transition-transform duration-300 ease-out` + a subtle
//     `hover:scale-110 hover:rotate-12` so the glyph gently lifts and
//     rotates when the trader approaches it.
//   • Focus ring — `focus-visible:ring-2 focus-visible:ring-cyan-500/60`
//     + `ring-offset-1` so keyboard users get the same cyan affordance
//     as the rest of the W58 family (ShortcutHint, LocaleSwitcher,
//     ConnectionStatus).
//   • Accessible label preserved verbatim — `aria-label` announces the
//     target state ("Switch to light mode" when currently dark),
//     `aria-pressed` reflects whether dark is active. The
//     `toHaveTextContent('☀️')` / `toHaveTextContent('🌙')` /
//     `toHaveAttribute('aria-pressed', 'true' | 'false')` assertions
//     in `ThemeToggle.test.tsx` still resolve since the emoji remains
//     the button's sole text content.
//   • Existing class names preserved — `btn btn-ghost btn-sm p-1.5
//     text-xs text-[var(--text-secondary)] hover:text-white` (so the W13-4 contract
//     that consumers may rely on for `btn-ghost` styling continues to
//     apply). The W58 affordances are layered additively.
//
// Why a separate component:
//   - `next-themes`'s `useTheme()` only knows the active theme *after*
//     mount (it reads `document.documentElement.className` or
//     `localStorage` on the client). Rendering the icon during SSR would
//     emit a `🌙` (the defaultTheme='light' branch — moon, click to go
//     dark) that may mismatch the post-hydration value, which React flags
//     as a hydration error and causes a full client re-render. We avoid
//     that by rendering `null` until `mounted === true`.
//
// Why a small icon button (not a fancy dropdown / segmented control):
//   - The TopStatusBar is already dense (mode pill, kill switch, P&L,
//     ML health, latency, freshness, clock, mute, shortcuts, config,
//     cancel-all, kill/resume). One more tiny icon doesn't blow the
//     layout. Matches the existing `btn btn-ghost btn-sm` visual
//     language used by mute / shortcuts so the toggle doesn't look
//     like a different control category.
//
// Accessibility:
//   - `aria-label` announces the *target* state ("Switch to light mode"
//     when currently dark) so a screen reader tells the trader what
//     the click will do, not what the icon shows.
//   - `title` provides a hover tooltip for sighted mouse users.
//   - `aria-pressed` reflects whether dark is currently active, since
//     "dark mode on" is a meaningful toggled state.

'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch: next-themes only resolves `theme` after
  // the provider reads the DOM/localStorage on mount, so on the very
  // first server-render `theme` is undefined. Returning null here
  // means the server-rendered HTML has no button at all, and React
  // hydrates a stable tree once `mounted` flips to true on the client.
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        // Preserved W13-4 base classes — `btn btn-ghost btn-sm` etc. are
        // referenced by the global CSS rules in `globals.css` so the
        // ghost-button hover state continues to apply.
        'btn btn-ghost btn-sm p-1.5 text-xs text-[var(--text-secondary)] hover:text-white',
        // W58-f premium affordances layered additively — relative
        // positioning for the focus ring offset, smooth transition on
        // hover, and a cyan focus ring that matches the rest of the
        // W58 family (ShortcutHint, LocaleSwitcher, ConnectionStatus).
        'relative rounded-md transition-all duration-200',
        'hover:shadow-md hover:shadow-black/20',
        'focus:outline-none',
        'focus-visible:ring-2 focus-visible:ring-emerald-500/60',
        'focus-visible:ring-offset-1 focus-visible:ring-offset-[#f8fafc]',
      )}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      aria-pressed={isDark}
    >
      <span
        aria-hidden="true"
        className={cn(
          // W58-f — smooth icon transition. The emoji scales up + rotates
          // 12° on hover so the toggle feels alive. `inline-block` so
          // the transform applies; `leading-none` to remove the default
          // line-height padding around the emoji.
          'inline-block leading-none',
          'transition-transform duration-300 ease-out',
          'hover:scale-110 hover:rotate-12',
          // Slight entrance animation when the toggle first mounts so
          // the icon doesn't pop in abruptly after the hydration guard
          // lifts.
          'animate-in fade-in zoom-in-50',
        )}
      >
        {isDark ? '☀️' : '🌙'}
      </span>
    </button>
  )
}
