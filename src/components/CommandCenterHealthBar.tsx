// components/CommandCenterHealthBar.tsx — W38-3 / W39-3 / W49-3 Compact System
// Health Bar.
//
// Sits at the very top of the Command Center panel as the "system status
// bar" (Row 1 of the W49-3 redesign). It is a single-row compact summary
// of the six signals the trader scans before drilling into any individual
// metric:
//
//   ┌──────────┬───────────┬──────────┬──────────┬──────────┬────────┐
//   │ Backend  │ WebSocket │ Data Fr  │ Risk Lvl │ Kill Sw  │ Updated│
//   └──────────┴───────────┴──────────┴──────────┴──────────┴────────┘
//
// Each indicator is a self-contained pill:
//   * A colored dot (green = healthy, amber = warning, red = critical).
//   * A short label.
//   * A sub-value where helpful (latency, age, exposure %).
//
// Data sources:
//   * Backend       → `status` prop from useBot (REST /api/snapshot reachability).
//   * WebSocket     → `wsConnected` prop from useBot.
//   * Data Freshness → `snapshot.timestamp` age vs fresh/stale/dead thresholds.
//   * Risk Level    → derived from kill_switch / observation_only / daily_pnl /
//                     paper_balance drawdown vs configured limits.
//   * Kill Switch   → `snapshot.kill_switch` (off = green dot, on = red pulse).
//   * Last Update   → `snapshot.timestamp` formatted as HH:MM:SS UTC.
//
// W49-3 — Removed the AI Status indicator. The Row 1 spec calls for
// exactly six indicators; AI Status now lives in Row 5 (System Status)
// alongside Active Strategies, where it can carry richer context
// (brier score, drift PSI, model readiness) without crowding the bar.
//
// The bar is intentionally a single flex row so it survives at every
// responsive breakpoint (the existing top status bar already clusters
// mode + connection pills; this row re-surfaces them at the panel scope
// where the trader's attention is focused).
'use client'

import { useEffect, useState } from 'react'
import { BotSnapshot, ConnectionStatus } from '@/hooks/useBot'
import { fmtAge, fmtTime, freshnessClass } from '@/lib/design-tokens'

// Freshness thresholds (seconds). Mirrors the TopStatusBar's defaults so
// the dot color matches the age pill rendered in the top bar.
const FRESH_SEC = 15
const STALE_SEC = 60

export interface CommandCenterHealthBarProps {
  snapshot: BotSnapshot
  status: ConnectionStatus
  wsConnected: boolean
}

// ── Sub-component: single indicator pill ────────────────────────────────────
interface IndicatorProps {
  label: string
  value: string
  /** Color bucket for the dot — maps to the design system. */
  tone: 'healthy' | 'warning' | 'critical' | 'neutral'
  /** Optional sub-label rendered to the right of the dot. */
  sub?: string
  /** Pulse the dot when true (used for kill switch active state). */
  pulse?: boolean
  /** Tooltip text on hover. */
  title?: string
}

const TONE_CLASS: Record<IndicatorProps['tone'], string> = {
  healthy: 'bg-green-400 shadow-sm shadow-green-500/50',
  warning: 'bg-amber-400 shadow-sm shadow-amber-500/50',
  critical: 'bg-red-400 shadow-sm shadow-red-500/50',
  neutral: 'bg-[var(--text-dim)]',
}

function Indicator({ label, value, tone, sub, pulse, title }: IndicatorProps) {
  return (
    <div
      // W68-a — `shrink-0` so the indicator pills don't compress (which
      // would clip the value text) inside the horizontally-scrolling
      // mobile health bar. Reduced padding + gap on mobile via the
      // `px-2 py-1 sm:px-2.5 sm:py-1.5` responsive ladder.
      className="flex items-center gap-1.5 sm:gap-2 bg-[var(--bg-page)] border border-[var(--border)] rounded-md px-2 py-1 sm:px-2.5 sm:py-1.5 min-w-0 shrink-0"
      title={title}
      role="status"
      aria-label={`${label}: ${value}${sub ? ` (${sub})` : ''}`}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${TONE_CLASS[tone]} ${pulse ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      <div className="flex flex-col min-w-0">
        {/* W68-a — slightly smaller label + value on mobile (text-[8.5px] /
            text-[10.5px]) so more pills fit per visible scroll row.
            Restored to text-[9.5px] / text-[11.5px] on sm+ for desktop
            parity. */}
        <span className="text-[8.5px] sm:text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold leading-tight">
          {label}
        </span>
        <span className="text-[10.5px] sm:text-[11.5px] mono font-bold text-[var(--text-primary)] leading-tight truncate">
          {value}
          {sub && (
            <span className="ml-1 text-[8.5px] sm:text-[9.5px] font-normal text-[var(--text-secondary)]">
              {sub}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

// ── Derive the risk level from snapshot signals ─────────────────────────────
//
// Risk level buckets:
//   * critical — kill switch active OR observation-only mode engaged
//                (the bot is already in a defensive posture).
//   * warning  — daily PnL deeply negative (≤ -50% of the $2 daily stop)
//                OR data is dead (>60s stale) so the bot may be trading
//                on stale prices.
//   * healthy  — everything nominal.
function deriveRiskLevel(snapshot: BotSnapshot, dataAgeSec: number | null) {
  if (snapshot.kill_switch) {
    return {
      tone: 'critical' as const,
      label: 'Critical',
      sub: 'Kill switch active',
    }
  }
  if (snapshot.observation_only) {
    return {
      tone: 'warning' as const,
      label: 'Caution',
      sub: 'Observation only',
    }
  }
  // Daily-loss warning band: <= -$1.00 (50% of $2.00 stop) but not yet
  // breaching the kill threshold.
  if (snapshot.daily_pnl <= -1.0) {
    return {
      tone: 'warning' as const,
      label: 'Caution',
      sub: 'Daily loss approaching stop',
    }
  }
  // Stale data — the bot may be trading on outdated quotes.
  if (dataAgeSec != null && dataAgeSec > STALE_SEC) {
    return {
      tone: 'warning' as const,
      label: 'Caution',
      sub: 'Data stale',
    }
  }
  return {
    tone: 'healthy' as const,
    label: 'Normal',
    sub: undefined,
  }
}

// ── Main component ──────────────────────────────────────────────────────────
export default function CommandCenterHealthBar({
  snapshot,
  status,
  wsConnected,
}: CommandCenterHealthBarProps) {
  // Re-render every 5s so the freshness pill's "Xs ago" stays accurate
  // without coupling to the parent's polling cadence.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])

  // ── Backend (REST) status ──────────────────────────────────────────────
  // `status` from useBot: 'connecting' | 'connected' | 'disconnected' | 'error'.
  const backendTone: IndicatorProps['tone'] =
    status === 'connected'
      ? 'healthy'
      : status === 'connecting'
      ? 'warning'
      : 'critical'
  const backendValue =
    status === 'connected'
      ? 'Online'
      : status === 'connecting'
      ? 'Connecting'
      : 'Offline'

  // ── WebSocket status ───────────────────────────────────────────────────
  const wsTone: IndicatorProps['tone'] = wsConnected ? 'healthy' : 'critical'
  const wsValue = wsConnected ? 'Connected' : 'Disconnected'

  // ── Data freshness ─────────────────────────────────────────────────────
  const dataAgeSec =
    snapshot.timestamp > 0
      ? Math.max(0, Math.floor(Date.now() / 1000 - snapshot.timestamp))
      : null
  const freshClass = freshnessClass(snapshot.timestamp, FRESH_SEC, STALE_SEC)
  const freshTone: IndicatorProps['tone'] =
    freshClass === 'freshness-fresh' || freshClass === 'freshness-ok'
      ? 'healthy'
      : freshClass === 'freshness-stale'
      ? 'warning'
      : 'critical'
  const freshValue =
    snapshot.timestamp > 0 ? fmtAge(snapshot.timestamp) : 'No data'

  // ── Risk level (derived) ────────────────────────────────────────────────
  const risk = deriveRiskLevel(snapshot, dataAgeSec)

  // ── Kill switch ─────────────────────────────────────────────────────────
  const killTone: IndicatorProps['tone'] = snapshot.kill_switch
    ? 'critical'
    : 'healthy'
  const killValue = snapshot.kill_switch ? 'ON' : 'Off'

  // ── Last update timestamp (W39-3) ───────────────────────────────────────
  // Rendered at the right edge of the bar so the trader can see at a glance
  // when the bot last published a snapshot.
  const lastUpdateValue =
    snapshot.timestamp > 0 ? fmtTime(snapshot.timestamp) : '—'

  return (
    <div
      // W68-a — mobile: horizontal scroll for the 6 indicator pills
      // (flex-nowrap + overflow-x-auto) so they don't wrap to multiple
      // lines and push the dashboard hero KPIs below the fold. On sm+,
      // restore flex-wrap so the bar uses available width and wraps
      // gracefully on tablet / desktop. Added `command-center-health-bar`
      // class as a CSS hook for the globals.css mobile overrides.
      className="command-center-health-bar flex items-center gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-2 py-1.5 sm:px-2.5 sm:py-2 shadow-sm scrollbar-thin"
      role="region"
      aria-label="Command Center system health summary"
      data-testid="command-center-health-bar"
    >
      <div className="flex items-center gap-1.5 pr-2 border-r border-[var(--border)] mr-1 hidden md:flex shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
          System
        </span>
      </div>

      <Indicator
        label="Backend"
        value={backendValue}
        tone={backendTone}
        title={`Bot REST API connection state: ${backendValue}`}
      />

      <Indicator
        label="WebSocket"
        value={wsValue}
        tone={wsTone}
        title={
          wsConnected
            ? 'Real-time push channel live (WS)'
            : 'WS down — REST polling fallback active'
        }
      />

      <Indicator
        label="Data Fresh"
        value={freshValue}
        tone={freshTone}
        title={`Snapshot age: ${dataAgeSec != null ? `${dataAgeSec}s` : 'never'}`}
      />

      <Indicator
        label="Risk Level"
        value={risk.label}
        tone={risk.tone}
        sub={risk.sub}
        title="Composite risk posture derived from kill switch, observation mode, daily P&L and data freshness"
      />

      <Indicator
        label="Kill Switch"
        value={killValue}
        tone={killTone}
        pulse={snapshot.kill_switch}
        title={
          snapshot.kill_switch
            ? 'Kill switch active — all trading halted'
            : 'Kill switch inactive — trading enabled'
        }
      />

      <div
        // W68-a — `shrink-0` so the "Updated" segment doesn't compress
        // inside the horizontally-scrolling mobile health bar. Responsive
        // font sizes (8.5px / 10.5px on mobile, restored on sm+) match
        // the <Indicator> pill ladder above so the bar reads as a single
        // visual rhythm at every breakpoint.
        className="flex items-center gap-1.5 ml-auto pl-2 border-l border-[var(--border)] min-w-0 shrink-0"
        title={`Last snapshot received at ${lastUpdateValue}`}
      >
        <span className="text-[8.5px] sm:text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold leading-tight">
          Updated
        </span>
        <span className="text-[10.5px] sm:text-[11px] mono font-bold text-[var(--text-primary)] leading-tight truncate">
          {lastUpdateValue}
        </span>
      </div>
    </div>
  )
}
