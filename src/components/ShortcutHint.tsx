// components/ShortcutHint.tsx — W17-6 Floating "?" hint button.
//
// Renders a small circular button pinned to the bottom-right corner
// of the viewport that opens the KeyboardCheatSheet. A tooltip on
// hover announces "Press ? for keyboard shortcuts" so the trader
// learns the `?` shortcut by interacting with the affordance.
//
// W58-f — Visual polish pass aligned with the W50-57 design system:
//   • Subtle pulse halo (an `animate-ping` ring layered behind the
//     button) so the FAB gently breathes to draw the trader's eye to
//     the help affordance without being distracting.
//   • Refined hover state — border brightens from `#2d3450` to cyan
//     60% opacity, background lifts to `#1a1f2e`, the glyph warms to
//     `text-cyan-300`, and a soft cyan glow (`shadow-cyan-500/20`)
//     blooms under the button on hover.
//   • Smooth icon transition (`transition-all duration-200`) so the
//     hover state morphs rather than snapping.
//   • Focus ring is preserved verbatim from W17-6
//     (`focus-visible:ring-2 focus-visible:ring-cyan-500
//     focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e14]`).
//   • Accessible label preserved verbatim (`aria-label="Open keyboard
//     cheat sheet"`, `title="Press ? for keyboard shortcuts"`,
//     `data-testid="shortcut-hint-button"`) so the W40-2 tests still
//     resolve.
//
// Why a separate component (and not just a button in TopStatusBar):
//   * The TopStatusBar is already dense (mode pill, kill switch,
//     latency, freshness, ML, balance, P&L, theme, locale, mute,
//     shortcuts, config, cancel-all, kill/resume). Adding one more
//     icon dilutes the action cluster.
//   * The bottom-right corner is the universal "help / FAB" slot —
//     the trader's eye lands there when they're looking for help
//     the same way they look for the kill switch in the top-right
//     corner.
//   * Floating the button over the panel area means it stays visible
//     regardless of which nav section is active (the TopStatusBar is
//     sticky but the page-area scrolls under it).
//
// Accessibility:
//   * `aria-label="Open keyboard cheat sheet"` so screen-reader
//     users hear the action's purpose, not just "question mark".
//   * `title` provides a hover tooltip for sighted mouse users.
//   * The Radix `Tooltip` adds a richer hint on hover (also announced
//     to screen readers via aria-describedby).
//   * 44×44 px touch target (per WCAG 2.5.5) — the visual 32×32
//     circle is wrapped in a 44×44 hit area.
//
// Hydration: rendered `null` until `mounted === true` so the SSR
// payload doesn't include a `fixed`-positioned button that might
// overlap with the loading-state splash. Mirrors the ThemeToggle
// pattern.

'use client'

import { useEffect, useState } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ShortcutHintProps {
  /** Invoked when the button is clicked. The parent opens the
   *  KeyboardCheatSheet via this callback. */
  onOpen: () => void
  /** Optional className override — used by tests to assert the
   *  button's visibility / position without relying on the default
   *  Tailwind classes. */
  className?: string
}

export default function ShortcutHint({ onOpen, className }: ShortcutHintProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-live="polite"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onOpen}
            // 44x44 hit area per WCAG 2.5.5 — the visual 32x32 circle
            // is centered within the larger touch target.
            className={cn(
              'group relative w-11 h-11 rounded-full',
              'flex items-center justify-center',
              'bg-[#13161e] border border-[#2d3450]',
              'text-cyan-400',
              'shadow-lg shadow-black/40',
              'transition-all duration-200',
              // Refined hover state (W58-f) — border warms to cyan,
              // background lifts, glyph brightens, cyan glow blooms.
              'hover:border-cyan-500/60 hover:bg-[#1a1f2e] hover:text-cyan-300',
              'hover:shadow-cyan-500/20 hover:shadow-lg',
              // Focus ring (W58-f accessibility pass — preserved verbatim
              // from W17-6 so keyboard users get the same cyan ring).
              'focus:outline-none',
              'focus-visible:ring-2 focus-visible:ring-cyan-500',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e14]',
              className,
            )}
            aria-label="Open keyboard cheat sheet"
            title="Press ? for keyboard shortcuts"
            data-testid="shortcut-hint-button"
          >
            {/* W58-f — Subtle ping halo. Layered BEHIND the button
                (z-[-1] + absolute inset-0 + rounded-full) so the
                solid button face stays the primary target. The halo
                is `aria-hidden` so screen readers skip it; it's purely
                decorative. The `opacity-40` baseline lifts to
                `opacity-70` on hover so the FAB subtly intensifies
                when the trader approaches it. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 rounded-full border border-cyan-500/40',
                'animate-ping opacity-40 transition-opacity duration-300',
                'group-hover:opacity-70',
              )}
            />
            {/* W58-f — Soft glow underlay. A blurred cyan wash that
                blooms under the button on hover (opacity 0 → 100%).
                Gives the FAB a "lit-from-within" feel on hover without
                consuming extra layout space. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 rounded-full bg-cyan-500/10 blur-md',
                'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                'relative text-lg font-bold leading-none tabular-nums',
                'transition-transform duration-200 group-hover:scale-110',
              )}
              style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
            >
              ?
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={6}>
          <span>
            Press <kbd className="mono font-bold">?</kbd> for keyboard shortcuts
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
