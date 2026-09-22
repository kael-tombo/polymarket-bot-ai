// components/ConnectionStatus.tsx — Compact WebSocket / polling health pill.
//
// W15-5 — Real-time panels (PositionsPanel / OrdersPanel / AnalyticsPanel)
// were migrated to `useRealtimeData`, which transparently falls back to
// REST polling when the WebSocket is down. This component surfaces the
// underlying transport state in the TopStatusBar so the trader can see at
// a glance whether live pushes are flowing (green dot) or whether the UI
// is relying on the polling fallback (amber dot).
//
// W58-f — Visual polish pass aligned with the W50-57 design system
// (PulseDot halo + tone-tinted pill background + tabular-nums on the
// optional latency readout). The dot retains its `w-2 h-2 rounded-full
// bg-{green|amber|red}-400` class contract so the W15-5 ConnectionStatus
// tests' `container.querySelector('.w-2.h-2.rounded-full')` selector +
// `toContain('bg-amber-400')` / `toContain('bg-green-400')` assertions
// continue to resolve against the same element. The "Polling" / "WS Live"
// / "WS Error" label strings, the `Connection status: ${label}`
// aria-label, and the `'use client'` directive are all preserved verbatim.
//
// Design contract:
//   - Green dot + "WS Live" label when the WebSocket is open.
//   - Amber dot + "Polling" label when the WS is not connected (still
//     handshaking, mid-reconnect, or permanently failed).
//   - Red dot + "Error" label when the WS reported an `onerror` event.
//     We don't tear down the socket on `onerror` — the browser fires
//     `onclose` shortly after, which useWebSocket already routes into
//     the amber polling state via its reconnect logic. The red state
//     therefore surfaces only briefly before reconnect kicks in.
//
// The dot is wrapped in a Radix Tooltip so a hover/focus reveals the
// full state detail without consuming header real estate.
'use client'

import { useState, useCallback } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useWebSocket } from '@/hooks/useWebSocket'
import { cn } from '@/lib/utils'

export type TransportState = 'live' | 'polling' | 'error'

export interface ConnectionStatusProps {
  /** Optional className override for the pill wrapper. */
  className?: string
  /** Optional compact mode — hides the label, shows only the dot. */
  compact?: boolean
  /** Optional latency in milliseconds. When provided, the pill renders
   *  a small `·{n}ms` suffix in tabular-nums so the digits don't shift
   *  as latency fluctuates. The ms readout is omitted entirely when
   *  `latencyMs == null` (preserving the W15-5 visual contract that
   *  pre-W58-f callers expect). */
  latencyMs?: number | null
}

// W58-f — Per-state visual config. `dotBg` carries the canonical Tailwind
// bg-class asserted by the W15-5 tests (`bg-green-400` / `bg-amber-400`
// / `bg-red-400`). The other fields layer the W58 premium affordances
// (pulse halo, pill background tint, label color, ring color) on top.
interface StateConfig {
  /** Tailwind background class applied to the solid dot — preserved
   *  verbatim from the W15-5 contract so existing tests resolve. */
  dotBg: string
  /** Tailwind background class for the optional pulse halo (sibling of
   *  the solid dot). Uses the matching `-400` hue so the halo reads as
   *  the same color family. */
  haloBg: string
  /** Pulse animation flag — the live + polling states gently ping to
   *  draw the eye; the error state stays solid so the trader can tell
   *  the difference at a glance. */
  pulse: boolean
  /** Pill background tint — subtle 5%-opacity wash in the matching hue. */
  pillBg: string
  /** Pill border color — brightens from `var(--border)` default to the
   *  matching hue at 35% opacity. */
  pillBorder: string
  /** Pill hover border color — brighter on hover. */
  pillHoverBorder: string
  /** Label color — matches the dot hue so the label and the dot read
   *  as a single colored chip. */
  labelText: string
  /** Tooltip ring color (focus-visible ring). */
  ring: string
  /** Halo shadow color (used for the soft glow under the dot). */
  halo: string
}

const STATE_CFG: Record<TransportState, StateConfig> = {
  live: {
    dotBg: 'bg-green-400',
    haloBg: 'bg-green-400',
    pulse: true,
    pillBg: 'bg-green-500/[0.06]',
    pillBorder: 'border-green-500/25',
    pillHoverBorder: 'hover:border-green-500/50',
    labelText: 'text-green-400',
    ring: 'focus-visible:ring-green-500/60',
    halo: 'shadow-green-500/50',
  },
  error: {
    dotBg: 'bg-red-400',
    haloBg: 'bg-red-400',
    pulse: false,
    pillBg: 'bg-red-500/[0.06]',
    pillBorder: 'border-red-500/30',
    pillHoverBorder: 'hover:border-red-500/55',
    labelText: 'text-red-400',
    ring: 'focus-visible:ring-red-500/60',
    halo: 'shadow-red-500/50',
  },
  polling: {
    dotBg: 'bg-amber-400',
    haloBg: 'bg-amber-400',
    pulse: true,
    pillBg: 'bg-amber-500/[0.06]',
    pillBorder: 'border-amber-500/25',
    pillHoverBorder: 'hover:border-amber-500/50',
    labelText: 'text-amber-300',
    ring: 'focus-visible:ring-amber-500/60',
    halo: 'shadow-amber-500/50',
  },
}

export function ConnectionStatus({
  className,
  compact = false,
  latencyMs = null,
}: ConnectionStatusProps) {
  // `hasErrored` flips true when `onerror` fires. It's reset back to false
  // on the next `onConnect` (the WS successfully re-established). We use a
  // local state instead of deriving from `isConnected` because the
  // browser's WS lifecycle emits `onerror` → `onclose` → (reconnect) →
  // `onopen`, and we want to surface the error mid-cycle rather than mask
  // it as "polling".
  const [hasErrored, setHasErrored] = useState(false)

  const { isConnected } = useWebSocket({
    onConnect: useCallback(() => setHasErrored(false), []),
    onError: useCallback(() => setHasErrored(true), []),
  })

  const state: TransportState = hasErrored ? 'error' : isConnected ? 'live' : 'polling'
  const cfg = STATE_CFG[state]

  const label = state === 'live' ? 'WS Live' : state === 'error' ? 'WS Error' : 'Polling'
  const tip =
    state === 'live'
      ? 'WebSocket connected — real-time pushes are active.'
      : state === 'error'
      ? 'WebSocket reported an error. Falling back to REST polling; reconnect in progress.'
      : 'WebSocket not connected. Live data is being refreshed via REST polling.'

  const latencyStr =
    latencyMs != null && Number.isFinite(latencyMs)
      ? `${Math.round(latencyMs)}ms`
      : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Connection status: ${label}`}
          className={cn(
            // W58-f premium pill — tone-tinted background + matching border.
            'flex items-center gap-1.5 rounded-md px-2 py-1',
            'text-[11px] whitespace-nowrap transition-colors',
            'bg-[var(--bg-page)] border border-[var(--border)] hover:border-[var(--border-strong)]',
            // Layered tone classes (additive — preserved over the W15-5 base).
            cfg.pillBg,
            cfg.pillBorder,
            cfg.pillHoverBorder,
            // Focus ring (W58 accessibility pass).
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-[#f8fafc]',
            cfg.ring,
            className,
          )}
        >
          {/* PulseDot — solid dot retains the W15-5 contract classes
              (`w-2 h-2 rounded-full bg-{green|amber|red}-400`) so the
              existing test selector `container.querySelector('.w-2.h-2.rounded-full')`
              keeps resolving. The ping halo is layered as a sibling with
              `inset-0` (no `w-2`/`h-2` classes) so it never matches that
              selector and the `not.toContain('bg-amber-400')` assertion
              in the live state still holds. */}
          <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
            {cfg.pulse && (
              <span
                className={cn(
                  'absolute inset-0 rounded-full opacity-60 animate-ping',
                  cfg.haloBg,
                )}
              />
            )}
            <span
              className={cn(
                'relative inline-flex w-2 h-2 rounded-full shadow-sm',
                cfg.dotBg,
                cfg.halo,
              )}
            />
          </span>
          {!compact && (
            <span
              className={cn(
                'mono font-semibold uppercase tracking-wider tabular-nums',
                cfg.labelText,
              )}
            >
              {label}
            </span>
          )}
          {latencyStr && (
            <span
              className={cn(
                'mono tabular-nums text-[10px] font-medium',
                'text-[var(--text-secondary)] border-l border-[var(--border-strong)] pl-1.5',
                // Hide the ms readout in compact mode so the pill stays
                // dot-only (matches the W15-5 compact contract).
                compact && 'sr-only',
              )}
              aria-hidden={compact ? 'true' : undefined}
            >
              {latencyStr}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="text-xs leading-relaxed">{tip}</p>
        {latencyStr && (
          <p className="text-[10px] mt-1 text-[var(--text-secondary)] mono tabular-nums">
            RTT: {latencyStr}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export default ConnectionStatus
