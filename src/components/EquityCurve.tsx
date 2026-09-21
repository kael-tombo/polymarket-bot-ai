// components/EquityCurve.tsx — Real-Time Equity Curve Chart
//
// W22-5 — Migrated from the self-managed 3-second REST polling loop (with
// W22-1's inline error banner) to the hybrid `useRealtimeData` hook. The
// panel now:
//   1. REST-prefetches /api/history/equity on mount.
//   2. Subscribes to the `metrics` WS channel for live push updates.
//      The `metrics` channel pushes the full BotSnapshot, whose shape
//      doesn't match the EquityResponse `{ points: EquityPoint[] }`
//      the panel renders. To avoid clobbering the typed state with
//      mismatched data, the hook is given a `validate` predicate that
//      drops any payload missing the `points` array. When the backend
//      eventually pushes equity-shaped objects over the metrics
//      channel, the validator will accept them.
//   3. Falls back to polling /api/history/equity every 5s when the WS
//      isn't connected.
//   4. Renders a "● Live" / "⟳ Polling" badge so the trader can tell at
//      a glance whether the equity timeline is real-time or lagged.
//
// W22-1 backwards-compat: the previous inline error banner (with HTTP
// status + Dismiss button) is preserved via a small inline state that
// mirrors the useRealtimeData `error` field. The banner surfaces the
// last fetch failure and can be dismissed; on a fresh error, the
// banner re-appears.
//
// W58-a — Premium visual polish pass aligned with the W51-2d MLPanel /
// W55-a LeaderboardPanel / W56-a SystemHealthView / W57-a RetentionPanel
// redesign family. The panel now:
//   1. Renders a shimmer skeleton loading state (EquitySkeleton) mirroring
//      the live panel layout (header + chart area + footer summary). The
//      "Loading equity timeline…" caption is preserved verbatim above
//      the shimmer rows so the W22-1 / W22-5 test contract
//      (`getByText(/Loading equity timeline/)`) still resolves.
//   2. Polished empty state with a Lucide TrendingUp icon + the
//      "Accumulating paper execution points…" title (preserved verbatim
//      so the W22-1 / W22-5 test contract still resolves) + dim
//      "Baseline: $X.XX · Operating Capital" description.
//   3. Section header with a Lucide Activity icon + uppercase
//      "Equity Curve" title + dim italic "paper execution timeline"
//      description + trailing "{points} pts" badge above the chart area.
//   4. Tone-colored curve frame — the chart already tone-colors the
//      area (green profit / red loss via chartTheme.colors.success /
//      .danger). The panel header's equity value + PnL badge + drawdown
//      badge now mirror that tone (good/poor/warn via the W58-a TONE
//      palette) + carry a `data-tone` hook for downstream CSS targeting.
//   5. Refined hover tooltip — a custom `formatTooltip` callback renders
//      a structured card with timestamp (HH:MM:SS UTC), equity value,
//      P&L delta (tone-coloured), and drawdown depth (red mono).
//   6. tabular-nums on every numeric value (header equity, PnL badge,
//      drawdown badge, footer Base / Min / Peak / lastUpdated) so the
//      columns don't shift alignment between renders.
//   7. Polished error card with a Lucide AlertTriangle icon + the wrapped
//      error string ("Failed to load equity timeline (HTTP 500)" —
//      preserved verbatim so the W22-1 test contract
//      `getByText(/Failed to load equity timeline \(HTTP 500\)/)`
//      resolves) + a Dismiss button (aria-label="Dismiss equity error" —
//      preserved verbatim) + role="alert" + data-testid="equity-error-card".
// All existing functionality, class names, API calls, polling, WS channel
// subscription, accessibility roles/labels, test-matched strings, and the
// 'use client' directive preserved.

'use client'

import { useState, useEffect, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { fmtUsd, fmtPnl, fmtPct, colors } from '@/lib/design-tokens'
import { EquityCurveChart, type EquityCurvePoint } from '@/components/charts'
import { Badge } from '@/components/ui/badge'

interface EquityPoint {
  timestamp: number
  equity: number
  pnl: number
}

interface EquityResponse {
  points?: EquityPoint[]
}

// ── W58-a Tone system (mirror of LeaderboardPanel / SystemHealthView) ───────
// 5-tone vocabulary with self-contained static class strings so Tailwind 4's
// JIT scanner picks them up. Maps onto the W50-57 premium-visual palette:
// good (emerald), warn (amber), poor (red), info (cyan), neutral (slate).

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  text: string
  bg: string
  border: string
  bar: string
  dot: string
  halo: string
  label: string
}

const TONE: Record<Tone, ToneConfig> = {
  good: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/[0.06]',
    border: 'border-emerald-500/25',
    bar: 'bg-emerald-400',
    dot: 'bg-emerald-400',
    halo: 'bg-emerald-400/40',
    label: 'EMERALD',
  },
  warn: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/[0.06]',
    border: 'border-amber-500/25',
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    halo: 'bg-amber-400/40',
    label: 'AMBER',
  },
  poor: {
    text: 'text-red-400',
    bg: 'bg-red-500/[0.06]',
    border: 'border-red-500/25',
    bar: 'bg-red-400',
    dot: 'bg-red-400',
    halo: 'bg-red-400/40',
    label: 'RED',
  },
  info: {
    text: 'text-cyan-300',
    bg: 'bg-cyan-500/[0.06]',
    border: 'border-cyan-500/25',
    bar: 'bg-cyan-400',
    dot: 'bg-cyan-400',
    halo: 'bg-cyan-400/40',
    label: 'CYAN',
  },
  neutral: {
    text: 'text-[#dde1ed]',
    bg: 'bg-[#1f2335]/40',
    border: 'border-[#1f2335]',
    bar: 'bg-[#5a637a]',
    dot: 'bg-[#5a637a]',
    halo: 'bg-[#5a637a]/40',
    label: 'NEUTRAL',
  },
}

// W22-5 — type guard for the metrics WS channel. The channel pushes
// the full BotSnapshot by default; only payloads that look like an
// EquityResponse (have the `points` array) are accepted. When the
// payload doesn't match, the data state is left untouched and the REST
// polling continues to drive the displayed equity timeline.
function isEquityPayload(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return Array.isArray(obj.points)
}

// ── W58-a ShimmerBlock — thin skeleton placeholder sized via className ────
function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
}

// ── W58-a SectionHeader — Lucide icon + uppercase title + dim description ─
function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  trailing,
}: {
  icon: LucideIcon
  title: string
  description?: string
  tone?: Tone
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── W58-a EquitySkeleton — shimmer placeholder mirroring the live panel ──
// Layout: header (rendered by the parent) + chart area (3 shimmer lines)
// + footer summary line (4 shimmer blocks). The "Loading equity
// timeline…" caption is preserved verbatim above the chart-area shimmer
// so the W22-1 / W22-5 test contract `getByText(/Loading equity timeline/)`
// resolves. role=status + aria-live=polite + data-testid="equity-loading-skeleton".
function EquitySkeleton() {
  return (
    <div
      className="p-3 space-y-2.5"
      role="status"
      aria-live="polite"
      aria-label="Loading equity timeline"
      data-testid="equity-loading-skeleton"
    >
      <div className="flex items-center gap-2 text-[10.5px] text-[#7e8aaa]">
        <span className="spinner" aria-hidden="true" />
        <span>Loading equity timeline…</span>
      </div>
      {/* Skeleton chart area — three shimmer lines mirroring the area chart */}
      <div
        className="h-[85px] rounded-md border border-[#1f2335] bg-[#0e1015] px-2 py-2.5 space-y-2"
        aria-hidden="true"
      >
        <ShimmerBlock className="w-1/3" />
        <ShimmerBlock className="w-2/3" />
        <ShimmerBlock className="w-1/2" />
      </div>
      {/* Skeleton footer summary line — Base / Min / Peak / lastUpdated */}
      <div
        className="flex justify-between items-center gap-2 pt-1 border-t border-[#1f2335]"
        aria-hidden="true"
      >
        <ShimmerBlock className="w-14" />
        <ShimmerBlock className="w-14" />
        <ShimmerBlock className="w-14" />
        <ShimmerBlock className="w-12" />
      </div>
    </div>
  )
}

// ── W58-a PolishedEmptyState — Lucide TrendingUp icon + dim description ──
// Renders the "Accumulating paper execution points…" title (preserved
// verbatim so the W22-1 / W22-5 test contract
// `getByText(/Accumulating paper execution points/)` resolves) + dim
// "Baseline: $X.XX · Operating Capital" description. role=status +
// data-testid="equity-empty-state".
function PolishedEmptyState({ currentEquity }: { currentEquity: number | null }) {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-3 text-center"
      role="status"
      data-testid="equity-empty-state"
    >
      <TrendingUp
        className="size-7 text-[#5a637a] mb-1.5"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="text-xs text-[#dde1ed] font-medium">
        Accumulating paper execution points…
      </div>
      <div className="text-[10px] text-[#4a5068] mt-1 tabular-nums">
        Baseline: {currentEquity !== null ? fmtUsd(currentEquity) : '$100.00'} · Operating Capital
      </div>
    </div>
  )
}

// ── W58-a PolishedErrorCard — AlertTriangle + wrapped error + Dismiss ────
// Renders a refined error card with a Lucide AlertTriangle icon + the
// wrapped error string ("Failed to load equity timeline (HTTP 500)" —
// preserved verbatim so the W22-1 test contract
// `getByText(/Failed to load equity timeline \(HTTP 500\)/)` resolves to a
// single leaf text node) + dim detail + a Dismiss button (aria-label=
// "Dismiss equity error" — preserved verbatim so the W22-1 test contract
// `getByRole('button', { name: /Dismiss equity error/i })` resolves) +
// role="alert" + data-testid="equity-error-card".
interface PolishedErrorCardProps {
  message: string
  onDismiss: () => void
}

function PolishedErrorCard({ message, onDismiss }: PolishedErrorCardProps) {
  return (
    <div
      className="mx-3 mt-2 mb-1 px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 flex items-start gap-2.5"
      role="alert"
      data-testid="equity-error-card"
    >
      <AlertTriangle
        className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <div className="text-red-200 font-semibold text-[11px] leading-snug break-words">
          {message}
        </div>
        <div className="text-red-300/60 text-[10px] mt-0.5 leading-snug">
          Equity fetch failed. Auto-retrying every 5 s — Dismiss to silence.
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:border-red-500/60 transition-colors shrink-0"
        aria-label="Dismiss equity error"
        data-testid="equity-error-dismiss"
      >
        <X className="w-3 h-3" aria-hidden="true" />
        Dismiss
      </button>
    </div>
  )
}

export default function EquityCurve() {
  // W22-5 — hybrid REST + WS subscription. Replaces the previous 3s
  // self-managed setInterval (the useRealtimeData hook handles polling,
  // visibility-aware pause, and WS fallback generically).
  const { data, isLoading, isRealtime, error } = useRealtimeData<EquityResponse>(
    '/api/history/equity',
    {
      wsChannel: 'metrics',
      pollInterval: 5000, // was 3s; relaxed to 5s with WS live updates
      validate: isEquityPayload,
    },
  )

  const points: EquityPoint[] = data?.points ?? []
  const lastUpdated = points.length > 0 ? points[points.length - 1].timestamp : null

  // W22-1 backwards-compat — surface fetch failures via a dismissable
  // error card so the trader knows the timeline is stale. useRealtimeData
  // exposes the latest error string (or null when the last fetch
  // succeeded); we mirror it into local state so we can track dismissal
  // independently. The card re-appears whenever a fresh error arrives.
  //
  // The error string is wrapped with the W22-1 "Failed to load equity
  // timeline" prefix so the W22-1 tests' assertion on
  // `/Failed to load equity timeline \(HTTP 500\)/` continues to match.
  const wrappedError = error ? `Failed to load equity timeline (${error})` : null
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  useEffect(() => {
    if (wrappedError && wrappedError !== dismissedError) {
      setDismissedError(null)
    }
  }, [wrappedError, dismissedError])
  const showError = wrappedError && wrappedError !== dismissedError
  const dismissError = () => setDismissedError(wrappedError)
  const errorCard = showError && (
    <PolishedErrorCard message={wrappedError as string} onDismiss={dismissError} />
  )

  const currentEquity = points.length > 0 ? points[points.length - 1].equity : null
  const currentPnl = points.length > 0 ? points[points.length - 1].pnl : 0.0

  // W58-a — Live / Polling badge (preserved from W22-5).
  const realtimeBadge = isRealtime ? (
    <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
  ) : (
    <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
  )

  // ── Loading state — shimmer skeleton mirroring the chart panel layout ────
  if (isLoading && points.length === 0) {
    return (
      <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md min-h-[160px]">
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">📈 Equity Curve</span>
            {realtimeBadge}
          </div>
          <span className="badge badge-dim text-[10px]">USDC · Paper</span>
        </div>
        {errorCard}
        <EquitySkeleton />
      </div>
    )
  }

  // ── Empty state — fewer than 2 points → polished TrendingUp icon ────────
  if (points.length < 2) {
    return (
      <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md min-h-[160px]">
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">📈 Equity Curve</span>
            {realtimeBadge}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="badge badge-amber text-[10px]">Paper</span>
            <span className="mono text-xs text-green-400 font-semibold tabular-nums">
              {currentEquity !== null ? fmtUsd(currentEquity) : '—'}
            </span>
          </div>
        </div>
        {errorCard}
        <PolishedEmptyState currentEquity={currentEquity} />
      </div>
    )
  }

  // ── Loaded state — refined chart frame with tone-colored values ────────
  // Calculate min/max for footer display (kept for the summary line below
  // the chart; the chart itself computes its own Y-domain via Recharts).
  const baseline = 100.0
  const allValues = [...points.map((p) => p.equity), baseline]
  const minEq = Math.min(...allValues)
  const maxEq = Math.max(...allValues)

  // W14 — drawdown from peak (running peak-to-trough excursion).
  const drawdowns: number[] = []
  let peak = -Infinity
  for (const p of points) {
    peak = Math.max(peak, p.equity)
    drawdowns.push(peak > 0 ? (p.equity - peak) / peak : 0)
  }
  const maxDrawdown = drawdowns.reduce((m, d) => Math.min(m, d), 0)
  const maxDrawdownPct = Math.abs(maxDrawdown) // 0..1 magnitude for display

  const isProfit = currentPnl >= 0
  const pnlTone: Tone = isProfit ? 'good' : 'poor'
  const ddTone: Tone =
    maxDrawdownPct > 0.05 ? 'poor' : maxDrawdownPct > 0 ? 'warn' : 'neutral'

  // Map to EquityCurveChart input shape — includes the precomputed drawdown
  // per timestamp so the chart's red overlay matches W14's contract.
  const chartData = points.map((p, i) => ({
    timestamp: p.timestamp,
    equity: p.equity,
    drawdown: drawdowns[i],
  }))

  // W58-a — Refined hover tooltip. The EquityCurveChart accepts a
  // `formatTooltip` callback that returns a ReactNode rendered inside
  // Recharts' <Tooltip>. We render a structured card with timestamp
  // (HH:MM:SS UTC), equity value, P&L delta (tone-coloured), and drawdown
  // depth (red mono) — tabular-nums on every numeric value so the
  // tooltip stays aligned across renders.
  const formatEquityTooltip = (point: EquityCurvePoint): ReactNode => {
    const pnl = point.equity - baseline
    const pnlPct = baseline > 0 ? (pnl / baseline) * 100 : 0
    const sign = pnl >= 0 ? '+' : '−'
    const pnlColorClass = pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
    const dd =
      point.drawdown != null ? Math.abs(point.drawdown * 100).toFixed(2) : '0.00'
    const tsLabel = new Date(point.timestamp).toISOString().slice(14, 19)
    return (
      <div className="rounded-md border border-[#1f2335] bg-[#13161e] shadow-[0_4px_12px_rgba(0,0,0,0.35)] px-2.5 py-1.5 text-[11px] min-w-[140px]">
        <div className="text-[9.5px] text-[#7e8aaa] mb-0.5 mono tabular-nums">
          {tsLabel} UTC
        </div>
        <div className="font-semibold text-[#dde1ed] mono tabular-nums">
          {fmtUsd(point.equity)}
        </div>
        <div className={`mt-0.5 mono tabular-nums ${pnlColorClass}`}>
          P&amp;L: {sign}
          {fmtUsd(Math.abs(pnl))} ({sign}
          {Math.abs(pnlPct).toFixed(2)}%)
        </div>
        <div className="text-red-400/90 mono tabular-nums mt-0.5">
          ↓ DD: {dd}%
        </div>
      </div>
    )
  }

  return (
    <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md min-h-[160px]">
      <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
        <div className="flex items-center gap-1.5">
          <Activity className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">📈 Portfolio Equity</span>
          <span className="badge badge-amber text-[9.5px]">Paper</span>
          {/* W22-5 — Live / Polling badge. */}
          {realtimeBadge}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`mono text-xs font-semibold tabular-nums ${TONE[pnlTone].text}`}
            data-tone={pnlTone}
          >
            {currentEquity !== null ? fmtUsd(currentEquity) : '—'}
          </span>
          <span
            className={`badge ${isProfit ? 'badge-green' : 'badge-red'} text-[10px] tabular-nums`}
            data-tone={pnlTone}
          >
            {fmtPnl(currentPnl)}
          </span>
          {/* W14 — Current max drawdown label (red tokens). */}
          <span
            className={`badge ${maxDrawdownPct > 0 ? 'badge-red' : 'badge-dim'} text-[10px] tabular-nums`}
            data-tone={ddTone}
            title={`Max drawdown from peak (running). Worst peak-to-trough excursion so far.`}
            style={maxDrawdownPct > 0 ? { color: colors.redFg } : undefined}
          >
            ↓DD {fmtPct(maxDrawdownPct)}
          </span>
        </div>
      </div>

      {errorCard}

      {/* W58-a — Section header above the chart area with Lucide icon +
          uppercase title + dim description + trailing "{points} pts" badge. */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1f2335]">
        <SectionHeader
          icon={TrendingUp}
          title="Equity Curve"
          description="paper execution timeline"
          tone={pnlTone}
          trailing={
            <span className="badge badge-dim text-[9px] tabular-nums">
              {points.length} pts
            </span>
          }
        />
      </div>

      {/* W13-9 — Recharts AreaChart via the shared EquityCurveChart.
          Replaces the hand-rolled SVG. Keeps the gradient fill, drawdown
          overlay band, baseline reference line, and hover tooltip.
          W58-a — wrapper carries `mono tabular-nums` so the Recharts SVG
          axis tick labels (`$X.XX` on Y, `HH:MM:SS` on X) inherit a
          monospace stack with tabular figure variants and stay column-
          aligned between renders (mirrors the footer summary line + the
          header PnL / drawdown badges). */}
      <div className="flex-1 flex items-center justify-center py-1 px-2 relative mono tabular-nums">
        <EquityCurveChart
          data={chartData}
          height={85}
          baseline={baseline}
          showDrawdown
          formatX={(ts) => new Date(ts).toISOString().slice(14, 19)}
          formatY={(eq) => `$${eq.toFixed(2)}`}
          formatTooltip={formatEquityTooltip}
        />
      </div>

      <div className="flex justify-between items-center text-[10px] text-[#7e8aaa] pt-1 px-3 pb-2 mono border-t border-[#1f2335] tabular-nums">
        <span>Base: $100.00</span>
        <span>Min: {fmtUsd(minEq)}</span>
        <span>Peak: {fmtUsd(maxEq)}</span>
        {lastUpdated && <span>{new Date(lastUpdated).toISOString().slice(14, 19)}</span>}
      </div>
    </div>
  )
}
