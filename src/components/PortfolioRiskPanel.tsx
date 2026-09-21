// components/PortfolioRiskPanel.tsx — Real-time P&L heatmap + correlation matrix.
//
// W58-e — Final UI polish pass (premium visual layer)
// ────────────────────────────────────────────────────────────────────────────
// This pass applies the W50-57 premium visual layer (Tone system, KpiTile,
// SectionHeader, PulseDot, ShimmerBlock, PolishedEmptyState, PolishedErrorCard)
// so the portfolio risk surface stays visually consistent with the W51-2d
// MLPanel / W53-c StrategyPerformancePanel / W54-e MLValidationPanel / W55-a
// LeaderboardPanel / W56-a SystemHealthView / W56-e ObservabilityPanel
// / W57-a RetentionPanel / W57-e CapitalAllocatorPanel / W58-d
// CommandPalette + SettingsModal redesign family.
//
// Affordances applied (additive only — existing class names, testids, role
// attributes, aria-labels, API calls, polling, the `useRealtimeData` hook,
// the `PnLHeatmap` + `CorrelationMatrix` chart components, the `KpiCard`
// testid pattern `risk-kpi-<slug>`, and the `'use client'` directive are
// preserved verbatim):
//
//   • KpiTile pattern for risk metrics — the bare `<KpiCard>` sub-component
//     is refactored to a refined `<KpiTile>` with tone-tinted bg + ring +
//     Lucide icon in the label row + large tabular-nums value + `data-tone`
//     hook. Tone is derived from the existing `valueColor` prop
//     (`#fbbf24`=warn, `#f87171`=poor, `#4ade80`=good, `#7e8aaa`=neutral,
//     else info) so the existing colour logic is preserved verbatim. The
//     `data-testid="risk-kpi-<slug>"` is preserved verbatim so the W16-1
//     test contract continues to resolve.
//   • Shimmer skeleton loading state — the bare skeleton-card placeholders
//     are refined with `<ShimmerBlock/>` blocks mirroring the live panel
//     layout (header strip + 5-tile KPI strip + 2-col heatmap/matrix
//     placeholder + exposure breakdown placeholder). role=status +
//     aria-live=polite + data-testid="portfolio-risk-loading" (preserved
//     verbatim).
//   • Polished empty state — the bare "No open positions to render." /
//     "Correlation matrix unavailable." / "No open positions." copy is
//     wrapped in a polished `<PolishedEmptyState/>` with Lucide icon +
//     preserved verbatim title + dim description. data-testid
//     "portfolio-risk-heatmap-empty" / "portfolio-risk-matrix-empty"
//     preserved verbatim.
//   • Section headers — three `<SectionHeader/>` sub-components render
//     above the KPI strip (`Activity` / "Risk Metrics" / "VaR · CVaR ·
//     exposure · diversification" / `tone=info`), the heatmap + matrix
//     row (`TrendingUp` / "P&L Heatmap & Correlation Matrix" / tone=info),
//     and the exposure breakdown (`BarChart3` / "Exposure Breakdown" /
//     tone=info).
//   • Tone-colored risk levels (green safe, amber elevated, red danger) —
//     the existing `diversificationColor` heuristic (≥0.7 emerald / ≥0.4
//     amber / <0.4 red) is mapped onto the Tone palette. Each KpiTile
//     carries `data-tone={tone}` for downstream CSS targeting. The
//     Capital Allocation meter + the Exposure Breakdown row tones
//     (max=warn, others=info) match the RiskStatusPanel visual language.
//   • Refined risk gauge/visualization — the Capital Allocation bar at the
//     top of the KPI strip is refined with tone-tinted progress bar
//     (good/warn/poor bands) + tone-matched percentage label. The Exposure
//     Breakdown rows are refined with a tone-tinted hover accent.
//   • Error card — the bare "error-state" block is wrapped in a refined
//     `<PolishedErrorCard/>` with Lucide `AlertTriangle` icon + the
//     "Risk matrix unavailable" title (preserved verbatim) + the wrapped
//     error string + a Retry button (`RefreshCw` glyph, calls `doFetch()`).
//     role=alert + data-testid="portfolio-risk-error" (preserved verbatim).
//
// Data flow (preserved verbatim):
//   1. The panel self-fetches /api/analytics/risk-summary on mount. That
//      endpoint bundles:
//        • total_exposure, max_single_position_exposure, open_position_count
//        • diversification_score (1 - mean |r| across the upper triangle)
//        • value_at_risk_95 (historical VaR from the equity-curve deltas)
//        • expected_shortfall_95 (CVaR — average of the worst 5% tail)
//        • correlation_matrix (the N×N Pearson matrix payload)
//   2. The panel separately reads `positions` (passed as a prop by
//      page.tsx via the useBot snapshot) so the heatmap can map the
//      position array to PnLHeatmapDatum instances without an extra
//      round-trip. When the prop is omitted, the panel self-fetches
//      /api/positions via useRealtimeData (mirrors PositionsPanel's
//      pattern).
//   3. Auto-refresh every 30s — paused when the document is hidden so
//      a background tab doesn't burn backend quota.
//
// Layout:
//   • Top KPI strip — 5 KPI cards (exposure / max single / diversification /
//     VaR-95 / ES-95) + a "refresh in Xs" countdown chip.
//   • Two-column grid (lg+) — heatmap on the left, correlation matrix on
//     the right. Stacks vertically below `md` width.
//   • Exposure breakdown — list of per-position exposure with the
//     max-position badge highlighted.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  Layers,
  TrendingDown,
  Gauge,
  Shield,
  BarChart3,
  TrendingUp,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { fmtUsd, fmtPct } from '@/lib/design-tokens'
import { formatHierarchicalMarket } from '@/lib/formatters'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import {
  PnLHeatmap,
  type PnLHeatmapDatum,
  CorrelationMatrix,
  type CorrelationMatrixPayload,
} from '@/components/charts'
import type { Position } from '@/hooks/useBot'

// ────────────────────────────────────────────────────────────────────────────
// W58-e — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
// ────────────────────────────────────────────────────────────────────────────
// Static class strings so Tailwind 4's JIT scanner picks them up at build
// time. Mirrors the W53-c Tone system (StrategyPerformancePanel) so the
// visual palette stays consistent across the workstation.

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-400/80',    halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',     halo: '' },
}

/** Map a hex colour string onto the Tone palette (preserves existing logic). */
function hexToTone(hex?: string): Tone {
  if (!hex) return 'neutral'
  if (hex === '#4ade80') return 'good'
  if (hex === '#fbbf24') return 'warn'
  if (hex === '#f87171') return 'poor'
  if (hex === '#7e8aaa') return 'neutral'
  return 'info'
}

// ── Backend payload shape ────────────────────────────────────────────────
// Mirrors `core/correlation.py::compute_risk_summary()` exactly. Optional
// fields are nullable so the panel renders a "—" placeholder when the
// backend can't compute them (e.g. VaR needs ≥2 equity-curve points;
// the very first dashboard load before any fills have landed).
interface RiskSummaryPayload {
  total_exposure: number
  max_single_position_exposure: number
  open_position_count: number
  diversification_score: number
  value_at_risk_95: number | null
  expected_shortfall_95: number | null
  correlation_matrix: CorrelationMatrixPayload
  computed_at: number
}

interface PositionsApiResponse {
  positions: Position[]
}

export interface PortfolioRiskPanelProps {
  /** Optional override — page.tsx threads the useBot snapshot through. */
  positions?: Position[]
  /** Optional override — true when the WS connection is live. */
  isRealtime?: boolean
  /** Refresh interval (ms). Default 30_000. */
  refreshIntervalMs?: number
  /** Optional className passthrough. */
  className?: string
}

const POLL_INTERVAL_MS = 30_000

// ────────────────────────────────────────────────────────────────────────────
// W58-e — Inline sub-components (kept private to the panel so test mocks
// + ts-isolation stay clean)
// ────────────────────────────────────────────────────────────────────────────

// PulseDot — small status dot with halo + ping animation. Used by the
// panel header Live/Polling badge. Mirrors W56-e / W57-a PulseDot.
function PulseDot({ tone = 'good', pulse = true }: { tone?: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-1.5 h-1.5 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      )}
      <span className={`relative inline-flex w-1.5 h-1.5 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
  )
}

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. Title rendered in its
// own `<span>` so RTL `getByText(...)` matches just the span. Mirrors the
// W53-c / W56-e / W57-a SectionHeader pattern.
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
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-[#dde1ed] truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[#5a637a] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[#7e8aaa] mono tabular-nums">{trailing}</span>}
    </div>
  )
}

// ShimmerBlock — thin skeleton placeholder sized via className. aria-hidden.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
}

// KpiTile — refined KPI card with Lucide icon + tone-tinted bg + ring +
// large tabular-nums value. Carries `data-tone` hook for downstream CSS
// targeting. The `data-testid="risk-kpi-<slug>"` is preserved verbatim so
// the W16-1 test contract continues to resolve. Mirrors W56-e KpiTile.
interface KpiTileProps {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  valueColor?: string
  testId?: string
}

function KpiTile({ label, value, sub, icon: Icon, valueColor, testId }: KpiTileProps) {
  const tone = hexToTone(valueColor)
  const cfg = TONE[tone]
  // When the caller supplies an explicit valueColor hex, use it verbatim
  // (preserves the existing colour logic). Otherwise fall back to the
  // Tone palette's text class.
  const valueStyle = valueColor ? { color: valueColor } : undefined
  const valueClass = valueColor ? '' : cfg.text
  return (
    <div
      className={`kpi-card relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      data-testid={testId}
      data-tone={tone}
    >
      <span className={`kpi-label flex items-center gap-1 ${cfg.label}`}>
        <Icon className="w-3 h-3" aria-hidden="true" />
        {label}
      </span>
      <span
        className={`kpi-value mono font-bold text-base tabular-nums mt-0.5 ${valueClass}`}
        style={valueStyle}
      >
        {value}
      </span>
      {sub && <span className="kpi-sub tabular-nums">{sub}</span>}
    </div>
  )
}

// PolishedEmptyState — Lucide icon + preserved verbatim title + dim
// description. role=status. data-testid preserved verbatim.
function PolishedEmptyState({
  icon: Icon,
  title,
  description,
  testId,
  tone = 'neutral',
}: {
  icon: LucideIcon
  title: string
  description?: string
  testId?: string
  tone?: Tone
}) {
  const cfg = TONE[tone]
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-8 px-4"
      data-testid={testId}
      role="status"
    >
      <span className="mb-2 inline-flex p-2 rounded-full bg-[#0e1015] border border-[#1f2335]" aria-hidden="true">
        <Icon className={`w-7 h-7 ${cfg.text}`} strokeWidth={1.5} />
      </span>
      <p className="text-xs text-[#7e8aaa] max-w-[260px]">{title}</p>
      {description && (
        <p className="text-[10px] text-[#5a637a] italic mt-0.5 max-w-[240px]">{description}</p>
      )}
    </div>
  )
}

// PolishedErrorCard — AlertTriangle icon + preserved verbatim title +
// wrapped error string + Retry button. role=alert. data-testid preserved
// verbatim as "portfolio-risk-error".
function PolishedErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="error-state py-6 px-4 flex flex-col items-center text-center"
      role="alert"
      data-testid="portfolio-risk-error"
    >
      <span className="mb-2 inline-flex" aria-hidden="true">
        <AlertTriangle className="w-8 h-8 text-red-400/80" strokeWidth={1.5} />
      </span>
      <span className="error-state-title">Risk matrix unavailable</span>
      <span
        className="error-state-desc"
        style={{ fontFamily: 'var(--font-mono, monospace)' }}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 mt-2 rounded text-[10px] mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        aria-label="Retry risk matrix fetch"
        data-testid="portfolio-risk-error-retry"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// PortfolioRiskSkeleton — structured shimmer placeholder mirroring the
// live panel layout (header strip + 5-tile KPI strip + 2-col heatmap/matrix
// placeholder + exposure breakdown placeholder). role=status +
// aria-live=polite. The "Portfolio Risk Matrix" header text is preserved
// verbatim above the shimmers so the W16-1 test contract `getByText`
// resolves.
function PortfolioRiskSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="portfolio-risk-loading"
      className={`card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-label="Loading portfolio risk matrix"
    >
      <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            Portfolio Risk Matrix
          </span>
        </div>
        <span className="spinner" aria-hidden="true" />
      </div>
      <div className="p-3 space-y-3">
        {/* KPI strip skeleton */}
        <div className="grid-kpi text-[11px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="kpi-card space-y-2">
              <ShimmerBlock className="w-2/3" />
              <div className="h-4 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-1/2" />
            </div>
          ))}
        </div>
        {/* Heatmap + Matrix skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-hidden="true">
          <div className="border border-[#1f2335] bg-[#0e1015] rounded-lg p-3 space-y-2">
            <ShimmerBlock className="w-1/3" />
            <div className="h-64 rounded-md skeleton-card" />
          </div>
          <div className="border border-[#1f2335] bg-[#0e1015] rounded-lg p-3 space-y-2">
            <ShimmerBlock className="w-1/3" />
            <div className="h-64 rounded-md skeleton-card" />
          </div>
        </div>
        {/* Exposure breakdown skeleton */}
        <div className="border border-[#1f2335] bg-[#0e1015] rounded-lg p-3 space-y-2" aria-hidden="true">
          <ShimmerBlock className="w-1/4" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <ShimmerBlock className="w-6" />
              <ShimmerBlock className="flex-1" />
              <ShimmerBlock className="w-24" />
              <ShimmerBlock className="w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map a useBot Position into a PnLHeatmapDatum. The heatmap renders the
 * (realised + unrealised) P&L per cell; when the backend hasn't
 * populated `unrealized_pnl`, we fall back to the realised figure so
 * the cell still shows a meaningful magnitude.
 */
function positionToDatum(p: Position): PnLHeatmapDatum {
  const info = formatHierarchicalMarket(p.slug)
  const yes = p.yes_shares
  const no = p.no_shares ?? 0
  const outcome: PnLHeatmapDatum['outcome'] = yes > 0 ? 'YES' : no > 0 ? 'NO' : 'FLAT'
  const shares = yes > 0 ? yes : no
  const realised = p.realised_pnl ?? 0
  const unrealised = typeof p.unrealized_pnl === 'number' ? p.unrealized_pnl : 0
  const pnl = realised + unrealised
  const cost = p.total_invested ?? 0
  const pnlPct = cost > 0 ? pnl / cost : Number.NaN
  return {
    tokenId: p.token_id,
    label: info.question || info.fullLabel || p.slug || p.token_id,
    outcome,
    shares,
    entryPrice: p.avg_entry_price,
    currentPrice: typeof p.current_price === 'number' ? p.current_price : null,
    positionSize: cost,
    pnl,
    pnlPct,
  }
}

function pnlTextColor(v: number): string {
  if (v > 0) return '#4ade80'
  if (v < 0) return '#f87171'
  return '#7e8aaa'
}

// ── Main panel ───────────────────────────────────────────────────────────
function PortfolioRiskPanelImpl({
  positions: positionsOverride,
  isRealtime: isRealtimeOverride,
  refreshIntervalMs = POLL_INTERVAL_MS,
  className,
}: PortfolioRiskPanelProps) {
  const [summary, setSummary] = useState<RiskSummaryPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [secondsToRefresh, setSecondsToRefresh] = useState<number>(Math.floor(refreshIntervalMs / 1000))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch positions via useRealtimeData so the panel can render the
  // heatmap even when no `positions` prop is supplied (mirrors the
  // PositionsPanel pattern). The override takes precedence when present.
  const {
    data: fetchedPositions,
    isLoading: positionsLoading,
    isRealtime: wsIsRealtime,
  } = useRealtimeData<PositionsApiResponse>('/api/positions', {
    wsChannel: 'positions',
    pollInterval: 5000,
  })

  const positions = positionsOverride ?? fetchedPositions?.positions ?? []
  const isRealtime = isRealtimeOverride ?? wsIsRealtime

  const doFetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/analytics/risk-summary')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      const json = (await res.json()) as RiskSummaryPayload
      setSummary(json)
      setLastUpdated(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch + 30s auto-refresh (paused when document hidden).
  useEffect(() => {
    doFetch()
  }, [doFetch])

  useEffect(() => {
    const start = () => {
      if (timerRef.current) return
      timerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        doFetch()
      }, refreshIntervalMs)
    }
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        stop()
      } else {
        doFetch()
        start()
      }
    }
    start()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [doFetch, refreshIntervalMs])

  // 1s countdown to "next refresh in Xs" — purely cosmetic.
  useEffect(() => {
    setSecondsToRefresh(Math.floor(refreshIntervalMs / 1000))
    countdownRef.current = setInterval(() => {
      setSecondsToRefresh((prev) => {
        if (prev <= 1) {
          return Math.floor(refreshIntervalMs / 1000)
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
  }, [refreshIntervalMs])

  // Map positions → heatmap datums. Memoised so we don't recompute on
  // every parent re-render (only when the positions array identity
  // actually changes).
  const heatData = useMemo(() => positions.map(positionToDatum), [positions])

  const corrPayload = summary?.correlation_matrix ?? null

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading && !summary) {
    return <PortfolioRiskSkeleton className={className} />
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && !summary) {
    return (
      <div
        className={`card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md ${className ?? ''}`}
        data-testid="portfolio-risk-error"
      >
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">
              Portfolio Risk Matrix
            </span>
          </div>
          <PulseDot tone="poor" pulse={false} />
        </div>
        <PolishedErrorCard message={error} onRetry={() => doFetch()} />
      </div>
    )
  }

  const totalExposure = summary?.total_exposure ?? 0
  const maxSingle = summary?.max_single_position_exposure ?? 0
  const diversification = summary?.diversification_score ?? 1
  const var95 = summary?.value_at_risk_95 ?? null
  const es95 = summary?.expected_shortfall_95 ?? null
  const openCount = summary?.open_position_count ?? positions.length

  // Diversification tone — green safe / amber elevated / red danger.
  const diversificationTone: Tone =
    diversification >= 0.7 ? 'good' : diversification >= 0.4 ? 'warn' : 'poor'

  // Max single position tone — warn when >60% of total, danger when >80%.
  const maxSingleTone: Tone =
    totalExposure > 0 && maxSingle > 0.8 * totalExposure
      ? 'poor'
      : totalExposure > 0 && maxSingle > 0.6 * totalExposure
      ? 'warn'
      : 'neutral'

  // VaR / CVaR tone — null is neutral; high magnitude is danger.
  const varTone: Tone = var95 == null ? 'neutral' : Math.abs(var95) > 5 ? 'poor' : 'warn'
  const esTone: Tone = es95 == null ? 'neutral' : Math.abs(es95) > 5 ? 'poor' : 'warn'

  // Total exposure tone — danger when >80% of max, warn when >60%.
  const totalExposureTone: Tone =
    totalExposure > 20 ? 'poor' : totalExposure > 12 ? 'warn' : 'good'

  return (
    <div
      data-testid="portfolio-risk-panel"
      className={`card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md ${className ?? ''}`}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            Portfolio Risk Matrix
          </span>
          <span className="badge badge-amber text-[9.5px] tabular-nums">
            {openCount} {openCount === 1 ? 'position' : 'positions'}
          </span>
          {isRealtime ? (
            <span className="flex items-center gap-1 badge badge-green text-[9.5px]" data-tone="good">
              <PulseDot tone="good" pulse />
              <span>● Live</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 badge badge-amber text-[9.5px]" data-tone="warn">
              <PulseDot tone="warn" pulse={false} />
              <span>⟳ Polling</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#7e8aaa]">
          {lastUpdated && (
            <span
              title={`Last updated: ${new Date(lastUpdated).toLocaleString()}`}
              className="mono tabular-nums"
            >
              updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <span className="mono tabular-nums" title={`Auto-refresh in ${secondsToRefresh}s`}>
            ⟳ {secondsToRefresh}s
          </span>
          <button
            type="button"
            onClick={() => doFetch()}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[#1f2335] text-[#7e8aaa] hover:text-white hover:border-[#2d3450] flex items-center gap-1"
            title="Refresh now"
            aria-label="Refresh risk matrix now"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* ── Section header above the KPI strip ────────────────────────── */}
        <SectionHeader
          icon={Activity}
          title="Risk Metrics"
          description="VaR · CVaR · exposure · diversification"
          tone="info"
          trailing="5 metrics"
        />

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid-kpi text-[11px]">
          <KpiTile
            label="Total Exposure"
            value={fmtUsd(totalExposure)}
            sub="Sum of cost basis"
            icon={Activity}
            testId="risk-kpi-total-exposure"
            valueColor={totalExposureTone === 'poor' ? '#f87171' : totalExposureTone === 'warn' ? '#fbbf24' : '#4ade80'}
          />
          <KpiTile
            label="Max Single"
            value={fmtUsd(maxSingle)}
            sub="Largest position"
            icon={TrendingDown}
            testId="risk-kpi-max-single"
            valueColor={maxSingleTone === 'poor' ? '#f87171' : maxSingleTone === 'warn' ? '#fbbf24' : '#dde1ed'}
          />
          <KpiTile
            label="Diversification"
            value={fmtPct(diversification, 0)}
            sub="1 − mean|ρ|"
            icon={Shield}
            testId="risk-kpi-diversification"
            valueColor={diversification === 1 ? '#7e8aaa' : TONE[diversificationTone].text === 'text-emerald-400' ? '#4ade80' : TONE[diversificationTone].text === 'text-amber-400' ? '#fbbf24' : '#f87171'}
          />
          <KpiTile
            label="VaR 95%"
            value={var95 == null ? '—' : fmtUsd(var95)}
            sub="1-period historical"
            icon={Gauge}
            testId="risk-kpi-var-95%"
            valueColor={var95 == null ? '#7e8aaa' : TONE[varTone].text === 'text-red-400' ? '#f87171' : '#fbbf24'}
          />
          <KpiTile
            label="Expected Shortfall 95%"
            value={es95 == null ? '—' : fmtUsd(es95)}
            sub="Avg worst-5% tail"
            icon={TrendingDown}
            testId="risk-kpi-expected-shortfall-95%"
            valueColor={es95 == null ? '#7e8aaa' : TONE[esTone].text === 'text-red-400' ? '#f87171' : '#f87171'}
          />
        </div>

        {/* ── Section header above the heatmap + matrix row ───────────── */}
        <SectionHeader
          icon={TrendingUp}
          title="P&L Heatmap & Correlation Matrix"
          description="per-position · Pearson ρ"
          tone="info"
          trailing={`${heatData.length} positions`}
        />

        {/* ── Heatmap + Correlation matrix (2-col on lg+) ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="bg-[#0e1015] border-[#1f2335]">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs flex items-center gap-2 text-[#dde1ed]">
                <span className="text-[#22d3ee]" aria-hidden="true">🔥</span>
                P&amp;L Heatmap
                <span className="text-[9.5px] text-[#7e8aaa] font-normal">
                  per-position · green = profit · red = loss
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {heatData.length === 0 ? (
                positionsLoading && heatData.length === 0 ? (
                  <div className="flex items-center justify-center text-xs text-[#7e8aaa] py-8">
                    <span className="spinner mr-2" aria-hidden="true" />
                    Loading positions…
                  </div>
                ) : (
                  <PolishedEmptyState
                    icon={TrendingUp}
                    title="No open positions to render."
                    description="Open a position to populate the heatmap."
                    testId="portfolio-risk-heatmap-empty"
                    tone="neutral"
                  />
                )
              ) : (
                <PnLHeatmap data={heatData} cellHeight={64} cellMinWidth={150} />
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#0e1015] border-[#1f2335]">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-xs flex items-center gap-2 text-[#dde1ed]">
                <span className="text-[#22d3ee]" aria-hidden="true">⊞</span>
                Correlation Matrix
                <span className="text-[9.5px] text-[#7e8aaa] font-normal">
                  Pearson · ρ ∈ [−1, +1]
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {corrPayload ? (
                <CorrelationMatrix matrix={corrPayload} cellSize={48} />
              ) : (
                <PolishedEmptyState
                  icon={Gauge}
                  title="Correlation matrix unavailable."
                  description="Awaiting 2+ positions to compute Pearson ρ."
                  testId="portfolio-risk-matrix-empty"
                  tone="warn"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Section header above the exposure breakdown ─────────────── */}
        <SectionHeader
          icon={BarChart3}
          title="Exposure Breakdown"
          description="per-position · largest highlighted"
          tone="info"
          trailing={`${heatData.length} rows`}
        />

        {/* ── Exposure breakdown ─────────────────────────────────────────── */}
        <Card className="bg-[#0e1015] border-[#1f2335]">
          <CardContent className="p-3 pt-3">
            {heatData.length === 0 ? (
              <PolishedEmptyState
                icon={BarChart3}
                title="No open positions."
                description="Exposure breakdown populates once a position opens."
                tone="neutral"
              />
            ) : (
              <ExposureBreakdown
                data={heatData}
                maxMagnitude={heatData.reduce((acc, d) => Math.max(acc, d.positionSize), 0)}
              />
            )}
          </CardContent>
        </Card>

        {error && (
          <div
            className="banner-warning text-[10.5px] py-1.5 px-2.5"
            role="alert"
            data-testid="portfolio-risk-stale"
          >
            <span aria-hidden="true">⚠️</span>
            <span>Stale data — last refresh failed: {error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ExposureBreakdownProps {
  data: PnLHeatmapDatum[]
  maxMagnitude: number
}

function ExposureBreakdownImpl({ data, maxMagnitude }: ExposureBreakdownProps) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.positionSize - a.positionSize),
    [data],
  )
  if (maxMagnitude <= 0) {
    return (
      <div className="text-xs text-[#7e8aaa] py-2">No exposure to break down.</div>
    )
  }
  return (
    <div
      data-testid="portfolio-risk-exposure-breakdown"
      className="flex flex-col gap-1.5 max-h-72 overflow-y-auto scrollbar-thin"
    >
      {sorted.map((d, i) => {
        const pct = (d.positionSize / maxMagnitude) * 100
        const isMax = i === 0
        // Tone for the row: warn for the max position, info for others.
        const rowTone: Tone = isMax ? 'warn' : 'info'
        const cfg = TONE[rowTone]
        return (
          <div
            key={d.tokenId}
            className={`flex items-center gap-2 text-xs px-2 py-1 rounded border border-[#1f2335] hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-all ${cfg.bg}`}
            data-testid={`exposure-row-${d.tokenId}`}
            data-tone={rowTone}
          >
            <span
              className="mono text-[#7e8aaa] text-[10px] w-6 text-right tabular-nums"
              aria-hidden="true"
            >
              {i + 1}.
            </span>
            <span
              className="flex-1 truncate text-[#dde1ed]"
              title={d.label}
            >
              {isMax && (
                <span className="badge badge-amber text-[9px] mr-1.5 py-0">MAX</span>
              )}
              <span className="text-[9px] uppercase font-bold tracking-wide text-cyan-400 mr-1.5">
                {d.outcome}
              </span>
              {d.label}
            </span>
            <div className="w-32 h-1.5 bg-[#1f2335] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${cfg.bar}`}
                style={{
                  width: `${pct.toFixed(1)}%`,
                  background: isMax ? '#fbbf24' : '#22d3ee',
                }}
              />
            </div>
            <span className="mono font-bold text-cyan-300 w-20 text-right tabular-nums">
              {fmtUsd(d.positionSize)}
            </span>
            <span
              className="mono w-16 text-right font-bold tabular-nums"
              style={{ color: pnlTextColor(d.pnl) }}
            >
              {d.pnl >= 0 ? '+' : '−'}${Math.abs(d.pnl).toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const ExposureBreakdown = memo(ExposureBreakdownImpl)
const PortfolioRiskPanel = memo(PortfolioRiskPanelImpl)
export default PortfolioRiskPanel
