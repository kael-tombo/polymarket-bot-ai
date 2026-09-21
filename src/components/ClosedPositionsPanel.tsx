// components/ClosedPositionsPanel.tsx — Closed Positions Ledger (W8-4)
// Journal of every closed position with realized P&L, hold time, and exit
// reason. Mirrors the PositionsPanel.tsx visual language (dark card, KPI
// strip, filter row, sortable data-table) while adding a summary KPI grid,
// exit-reason donut breakdown, cumulative P&L timeline, and row expansion.
'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Timer,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  RefreshCw,
  Download,
  Archive,
  Calendar,
  Filter,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { formatHierarchicalMarket } from '@/lib/formatters'
import { fmtUsd, fmtPnl, fmtPct, fmtTime } from '@/lib/design-tokens'

// ───────────────────────────────────────────────────────────────────────────
// Types — mirror the schema exposed by core/closed_positions.py register_routes
// ───────────────────────────────────────────────────────────────────────────

export interface ClosedPosition {
  id: number
  timestamp: number                       // close epoch seconds
  position_id: string
  token_id: string
  strategy: string | null
  entry_price: number | null
  exit_price: number | null
  shares: number | null
  pnl: number
  holding_seconds: number
  model_version: string | null
  decision_id: string | null
  direction: string | null               // BUY / SELL of opening trade
  confidence: number | null
  predicted_edge: number | null
  p_yes: number | null
  market_mid: number | null
  liquidity: number | null
  data: Record<string, any> | null       // decoded metadata_json
}

export interface ClosedPositionsResponse {
  count: number
  positions: ClosedPosition[]
}

export interface ClosedPositionsStats {
  count: number
  total_pnl: number
  avg_pnl: number
  median_pnl: number
  win_rate: number
  wins: number
  losses: number
  breakeven: number
  avg_holding_seconds: number
  gross_profit: number
  gross_loss: number
  profit_factor: number | null
  best_trade: number
  worst_trade: number
  avg_entry_price: number
  avg_exit_price: number
  total_volume_shares: number
  strategies_count: number
}

type ExitReason = 'SL' | 'TP' | 'MANUAL' | 'SETTLEMENT' | 'UNKNOWN'
type SideFilter = 'ALL' | 'LONG' | 'SHORT'
type ReasonFilter = 'ALL' | ExitReason
type WinLossFilter = 'ALL' | 'WIN' | 'LOSS' | 'BREAKEVEN'
type SortKey = 'date' | 'pnl' | 'hold' | 'size'

// ───────────────────────────────────────────────────────────────────────────
// Inference helpers
// ───────────────────────────────────────────────────────────────────────────

function inferExitReason(p: ClosedPosition): ExitReason {
  const d = p.data ?? {}
  const raw = (d.exit_reason ?? d.reason ?? d.close_reason ?? '') as string
  const r = String(raw).trim().toUpperCase()
  if (r === 'SL' || r.includes('STOP_LOSS') || r === 'STOP-LOSS') return 'SL'
  if (r === 'TP' || r.includes('TAKE_PROFIT') || r === 'TAKE-PROFIT') return 'TP'
  if (r === 'SETTLEMENT' || r.includes('SETTLE')) return 'SETTLEMENT'
  if (r === 'MANUAL') return 'MANUAL'
  // Strategy-name fallback
  const strat = (p.strategy || '').toLowerCase()
  if (strat.includes('_sl_') || strat.endsWith('-sl') || strat.includes('stoploss')) return 'SL'
  if (strat.includes('_tp_') || strat.endsWith('-tp') || strat.includes('takeprofit')) return 'TP'
  if (strat.includes('settle')) return 'SETTLEMENT'
  if (r && r !== 'UNKNOWN') return 'MANUAL'
  return 'UNKNOWN'
}

function inferSide(p: ClosedPosition): 'LONG' | 'SHORT' | 'UNKNOWN' {
  const d = p.data ?? {}
  const sideRaw = (d.side ?? '') as string
  if (sideRaw) {
    const s = String(sideRaw).toUpperCase()
    if (s === 'YES' || s === 'LONG' || s === 'BUY') return 'LONG'
    if (s === 'NO' || s === 'SHORT' || s === 'SELL') return 'SHORT'
  }
  if (p.direction) {
    const d0 = String(p.direction).toUpperCase()
    if (d0 === 'BUY') return 'LONG'
    if (d0 === 'SELL') return 'SHORT'
  }
  return 'UNKNOWN'
}

function pnlPct(p: ClosedPosition): number | null {
  const cost = (p.entry_price ?? 0) * (p.shares ?? 0)
  if (!cost || cost <= 0) return null
  return (p.pnl / cost) * 100
}

function fmtHoldTime(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return '—'
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) {
    const m = Math.floor(s / 60)
    const sec = Math.round(s % 60)
    return sec === 0 ? `${m}m` : `${m}m ${sec}s`
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  const days = Math.floor(s / 86400)
  const h = Math.round((s % 86400) / 3600)
  return h === 0 ? `${days}d` : `${days}d ${h}h`
}

const REASON_META: Record<ExitReason, { label: string; cls: string; dot: string; color: string }> = {
  SL:         { label: 'Stop Loss',  cls: 'bg-red-500/15 text-red-400 border border-red-500/30',   dot: '#f87171', color: '#ef4444' },
  TP:         { label: 'Take Profit', cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', dot: '#4ade80', color: '#22c55e' },
  MANUAL:     { label: 'Manual',      cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',   dot: '#fbbf24', color: '#f59e0b' },
  SETTLEMENT: { label: 'Settlement',  cls: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',       dot: 'var(--accent-fg)', color: 'var(--accent)' },
  UNKNOWN:    { label: 'Unknown',    cls: 'bg-slate-500/15 text-slate-400 border border-slate-500/30',   dot: 'var(--text-secondary)', color: 'var(--text-dim)' },
}

// ───────────────────────────────────────────────────────────────────────────
// W58-b — Premium polish layer (W51-2d / W53-c / W57-a redesign family)
// Self-contained Tone system + sub-components so the closed-positions panel
// reads as part of the same premium redesign family. All existing class
// names, test contracts (W38-8 — 8 tests), polling cadence (30s),
// API calls, aria-labels, data-testids, and the 'use client' directive
// are preserved verbatim.
// ───────────────────────────────────────────────────────────────────────────

type Tone = 'good' | 'warn' | 'poor' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
  /** Row-hover left-edge accent bar (inset shadow). */
  rowHover: string
}

const TONE: Record<Tone, ToneConfig> = {
  good:    { bg: 'bg-emerald-500/[0.06]',  border: 'border-emerald-500/25',  text: 'text-emerald-400',  bar: 'bg-emerald-500',  dot: 'bg-emerald-400',  label: 'text-emerald-400/80',  halo: 'shadow-emerald-500/10',  rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(52,211,153,0.55)]' },
  warn:    { bg: 'bg-amber-500/[0.06]',    border: 'border-amber-500/25',    text: 'text-amber-400',    bar: 'bg-amber-500',    dot: 'bg-amber-400',    label: 'text-amber-400/80',    halo: 'shadow-amber-500/10',    rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',      bar: 'bg-red-500',      dot: 'bg-red-400',      label: 'text-red-400/80',      halo: 'shadow-red-500/10',      rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.55)]' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',     bar: 'bg-cyan-500',     dot: 'bg-cyan-400',     label: 'text-cyan-400/80',     halo: 'shadow-cyan-500/10',     rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',    bar: 'bg-[var(--text-secondary)]',    dot: 'bg-[var(--text-secondary)]',    label: 'text-[var(--text-secondary)]',       halo: '',                        rowHover: 'hover:shadow-[inset_3px_0_0_0_rgba(125,138,170,0.35)]' },
}

/** Map a P&L amount to a Tone: positive → good (emerald), negative →
 *  poor (red), zero → neutral. Used by the row-hover accent bar so the
 *  hover affordance is tone-aware (green for winning rows, red for
 *  losing rows). */
function pnlTone(pnl: number): Tone {
  if (pnl > 0) return 'good'
  if (pnl < 0) return 'poor'
  return 'neutral'
}

// PulseDot — small status dot with halo + ping animation. Mirrors the
// W54-a / W55-c / W56-e PulseDot pattern.
function PulseDot({ tone = 'good', pulse = true }: { tone?: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      )}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
  )
}

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. Title rendered in its
// own <span> so RTL's `getByText(...)` matches just the span (preserves
// the W38-8 test contract `/CLOSED POSITIONS LEDGER/`). Mirrors W53-c /
// W54-a / W55-c / W56-a SectionHeader.
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
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-primary)] truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[var(--text-secondary)] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[var(--text-secondary)] mono tabular-nums">{trailing}</span>}
    </div>
  )
}

// KpiTile — refined KPI card (tone-tinted bg, Lucide icon in label row,
// 16px tabular-nums value, optional sub hint + quality bar + trend glyph).
// Mirrors the W53-c / W56-a KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint?: string
  tone: Tone
  icon: LucideIcon
  quality?: number
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, icon: Icon, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative overflow-hidden border ${cfg.border} ${cfg.bg} transition-colors`}
      title={`${label}${hint ? ' — ' + hint : ''}`}
      data-testid={testId}
      data-tone={tone}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className={`kpi-label flex items-center gap-1 ${cfg.label}`}>
          <Icon className="size-3 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </div>
        {trend === 'up' && <TrendingUp className="size-3 text-emerald-400 shrink-0" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 text-red-400 shrink-0" aria-hidden="true" />}
      </div>
      <div className={`kpi-value mono tabular-nums ${cfg.text}`}>
        {value}
      </div>
      {hint && <div className="kpi-sub tabular-nums">{hint}</div>}
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ShimmerBlock — thin skeleton placeholder that can be sized via the
// className prop. aria-hidden. Mirrors W54-e / W56-a ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`skeleton-line-sm ${className}`} aria-hidden="true" />
  )
}

// SortIndicator — chevron showing the current sort column + direction.
// Mirrors the W51-2b PositionsPanel SortIndicator.
function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <span className="inline-flex flex-col ml-1 opacity-30" aria-hidden="true">
        <ChevronUp className="size-2.5 -mb-1" />
        <ChevronDown className="size-2.5" />
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col ml-1" aria-hidden="true">
      <ChevronUp className={`size-2.5 -mb-1 ${direction === 'asc' ? 'text-cyan-400' : 'text-[var(--text-dim)]'}`} />
      <ChevronDown className={`size-2.5 ${direction === 'desc' ? 'text-cyan-400' : 'text-[var(--text-dim)]'}`} />
    </span>
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. role=status.
// Mirrors W56-a / W56-e / W57-a PolishedEmptyState.
function PolishedEmptyState({
  icon: Icon,
  title,
  description,
  testId = 'closed-positions-empty-state',
}: {
  icon: LucideIcon
  title: string
  description: string
  testId?: string
}) {
  return (
    <div className="empty-state py-10" role="status" data-testid={testId}>
      <Icon className="empty-state-icon text-[var(--text-dim)]" size={32} strokeWidth={1.5} aria-hidden="true" />
      <span className="empty-state-title text-sm font-semibold">{title}</span>
      <span className="empty-state-desc text-xs max-w-sm text-center">{description}</span>
    </div>
  )
}

// PolishedErrorCard — red-tinted error card with Lucide AlertTriangle +
// the title "Failed to load closed positions" (preserved verbatim as the
// direct text node of a leaf <span> so the W38-8 test contract
// `getByText('Failed to load closed positions')` resolves) + the wrapped
// error string + a Retry button (RefreshCw glyph, calls `onRetry`).
// role=alert. Mirrors W54-a / W55-c / W56-a / W57-a ErrorCard.
function PolishedErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl"
      data-testid="closed-positions-error-card"
    >
      <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="poor" pulse={false} />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">📕 Closed Positions Ledger</span>
          <span className="badge badge-red text-[9.5px]">Offline</span>
        </div>
      </div>
      <div
        className="error-state flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center"
        role="alert"
        data-testid="closed-positions-error-state"
      >
        <AlertTriangle className="error-state-icon text-[#f87171]" size={28} aria-hidden="true" />
        <span className="error-state-title text-sm font-semibold">Failed to load closed positions</span>
        <span className="error-state-desc text-xs max-w-md break-words mono">{message}</span>
        <button
          onClick={onRetry}
          className="mt-2 h-7 text-[10px] gap-1 px-3 py-1 border border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100 rounded transition-colors inline-flex items-center"
          aria-label="Retry closed-positions fetch"
          data-testid="closed-positions-error-retry"
        >
          <RefreshCw size={11} className="mr-1.5" />
          Retry
        </button>
      </div>
    </div>
  )
}

// ClosedPositionsSkeleton — structured shimmer placeholder mirroring the
// live panel layout (header + KPI strip + donut/timeline row + filter row
// + table rows). Preserves the "📕 Closed Positions Ledger" header text
// (test contract `getByText('📕 Closed Positions Ledger')`) so the W38-8
// loading-state test resolves. role=status + aria-live=polite.
function ClosedPositionsSkeleton() {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl"
      data-testid="closed-positions-panel"
      role="status"
      aria-live="polite"
      aria-label="Loading closed positions ledger…"
    >
      <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PulseDot tone="info" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">📕 Closed Positions Ledger</span>
          <span className="badge badge-cyan text-[9.5px] animate-pulse">Loading…</span>
        </div>
        <span className="spinner inline-block w-3 h-3 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />
      </div>
      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="kpi-card space-y-2">
            <ShimmerBlock className="w-2/5" />
            <div className="h-4 rounded-sm skeleton-line-md" />
            <ShimmerBlock className="w-3/5" />
          </div>
        ))}
      </div>
      {/* Donut + timeline skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-3" aria-hidden="true">
        <div className="skeleton-card p-3 space-y-2">
          <ShimmerBlock className="w-32" />
          <div className="h-20 rounded-md skeleton-line-lg" />
        </div>
        <div className="skeleton-card p-3 space-y-2 lg:col-span-2">
          <ShimmerBlock className="w-40" />
          <div className="h-20 rounded-md skeleton-line-lg" />
        </div>
      </div>
      {/* Filter row skeleton */}
      <div className="flex items-center gap-2 mb-2" aria-hidden="true">
        <ShimmerBlock className="flex-1 min-w-[200px] max-w-xs !h-7 !rounded-md" />
        <ShimmerBlock className="w-24 !h-7 !rounded-md" />
        <ShimmerBlock className="w-24 !h-7 !rounded-md" />
        <ShimmerBlock className="w-32 !h-7 !rounded-md" />
      </div>
      {/* Table rows skeleton */}
      <div className="flex-1 space-y-1.5" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-[var(--border)]"
          >
            <ShimmerBlock className="w-4" />
            <ShimmerBlock className="flex-1" />
            <ShimmerBlock className="w-12" />
            <ShimmerBlock className="w-14" />
            <ShimmerBlock className="w-14" />
            <ShimmerBlock className="w-12" />
            <ShimmerBlock className="w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────

export default function ClosedPositionsPanel() {
  const [positions, setPositions] = useState<ClosedPosition[]>([])
  const [stats, setStats] = useState<ClosedPositionsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [filterQuery, setFilterQuery] = useState('')
  const [sideFilter, setSideFilter] = useState<SideFilter>('ALL')
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('ALL')
  const [winLossFilter, setWinLossFilter] = useState<WinLossFilter>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    setError(null)
    try {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const [posRes, statsRes] = await Promise.allSettled([
        apiFetch('/api/positions/closed?limit=500', { signal: ctrl.signal }),
        apiFetch('/api/positions/closed/stats', { signal: ctrl.signal }),
      ])

      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const body: ClosedPositionsResponse = await posRes.value.json()
        setPositions(Array.isArray(body.positions) ? body.positions : [])
      } else if (posRes.status === 'fulfilled') {
        setError(`positions: HTTP ${posRes.value.status}`)
      } else if (posRes.reason?.name !== 'AbortError') {
        setError(`positions fetch failed`)
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        setStats(await statsRes.value.json())
      } else if (statsRes.status === 'fulfilled') {
        setError((p) => (p ? `${p} · stats: HTTP ${statsRes.value.status}` : `stats: HTTP ${statsRes.value.status}`))
      }
      setLastUpdated(Date.now())
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? 'fetch failed')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial fetch + 30s polling, paused when document hidden
  useEffect(() => {
    fetchData()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (!timer) timer = setInterval(() => fetchData(true), 30_000)
    }
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null }
    }
    const onVis = () => {
      if (document.hidden) stop()
      else { fetchData(true); start() }
    }
    document.addEventListener('visibilitychange', onVis)
    if (!document.hidden) start()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
      abortRef.current?.abort()
    }
  }, [fetchData])

  // Derived: enriched positions (with side + reason + pnl%)
  const enriched = useMemo(() => {
    return positions.map((p) => ({
      ...p,
      _side: inferSide(p),
      _reason: inferExitReason(p),
      _pnlPct: pnlPct(p),
    }))
  }, [positions])

  // Derived: filter + sort
  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    // Pre-compute epoch bounds for the date-range filter so we don't
    // re-parse on every row iteration. Empty string → unbounded.
    const fromTs = dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000) : null
    const toTs = dateTo ? Math.floor(new Date(dateTo).getTime() / 1000) + 86400 : null
    const out = enriched.filter((p) => {
      if (q) {
        const slug = String(p.data?.slug ?? '').toLowerCase()
        const tid = String(p.token_id || '').toLowerCase()
        const strat = String(p.strategy || '').toLowerCase()
        const pid = String(p.position_id || '').toLowerCase()
        if (!slug.includes(q) && !tid.includes(q) && !strat.includes(q) && !pid.includes(q)) return false
      }
      if (sideFilter !== 'ALL') {
        if (p._side === 'UNKNOWN') return false
        if (sideFilter === 'LONG' && p._side !== 'LONG') return false
        if (sideFilter === 'SHORT' && p._side !== 'SHORT') return false
      }
      if (reasonFilter !== 'ALL' && p._reason !== reasonFilter) return false
      if (winLossFilter === 'WIN' && !(p.pnl > 0)) return false
      if (winLossFilter === 'LOSS' && !(p.pnl < 0)) return false
      if (winLossFilter === 'BREAKEVEN' && p.pnl !== 0) return false
      if (strategyFilter !== 'ALL' && (p.strategy ?? '') !== strategyFilter) return false
      if (fromTs != null && (p.timestamp ?? 0) < fromTs) return false
      if (toTs != null && (p.timestamp ?? 0) > toTs) return false
      return true
    })

    out.sort((a, b) => {
      switch (sortBy) {
        case 'pnl':  return b.pnl - a.pnl
        case 'hold': return (b.holding_seconds ?? 0) - (a.holding_seconds ?? 0)
        case 'size': return (b.shares ?? 0) - (a.shares ?? 0)
        case 'date':
        default:     return (b.timestamp ?? 0) - (a.timestamp ?? 0)
      }
    })
    return out
  }, [enriched, filterQuery, sideFilter, reasonFilter, winLossFilter, strategyFilter, dateFrom, dateTo, sortBy])

  // Derived: distinct strategy list for the strategy filter dropdown.
  const strategyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of enriched) {
      if (p.strategy) set.add(p.strategy)
    }
    return Array.from(set).sort()
  }, [enriched])

  // Derived: exit-reason breakdown
  const reasonBreakdown = useMemo(() => {
    const m: Record<ExitReason, { count: number; pnl: number }> = {
      SL: { count: 0, pnl: 0 },
      TP: { count: 0, pnl: 0 },
      MANUAL: { count: 0, pnl: 0 },
      SETTLEMENT: { count: 0, pnl: 0 },
      UNKNOWN: { count: 0, pnl: 0 },
    }
    for (const p of enriched) {
      m[p._reason].count++
      m[p._reason].pnl += p.pnl
    }
    return m
  }, [enriched])

  // Derived: cumulative P&L timeline (oldest → newest)
  const timeline = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    let cum = 0
    return sorted.map((p) => {
      cum += p.pnl
      return { t: p.timestamp, cum, pnl: p.pnl }
    })
  }, [enriched])

  const totalClosed = stats?.count ?? enriched.length
  const totalPnl = stats?.total_pnl ?? enriched.reduce((a, p) => a + (p.pnl || 0), 0)
  const winRate = stats?.win_rate ?? (totalClosed ? (stats?.wins ?? enriched.filter(p => p.pnl > 0).length) / totalClosed : 0)
  const wins = stats?.wins ?? enriched.filter(p => p.pnl > 0).length
  const losses = stats?.losses ?? enriched.filter(p => p.pnl < 0).length
  const grossProfit = stats?.gross_profit ?? enriched.filter(p => p.pnl > 0).reduce((a, p) => a + p.pnl, 0)
  const grossLoss = stats?.gross_loss ?? Math.abs(enriched.filter(p => p.pnl < 0).reduce((a, p) => a + p.pnl, 0))
  const profitFactor = stats?.profit_factor ?? (grossLoss > 0 ? grossProfit / grossLoss : null)
  const avgWin = wins > 0 ? grossProfit / wins : 0
  const avgLoss = losses > 0 ? grossLoss / losses : 0
  const avgHold = stats?.avg_holding_seconds ?? (enriched.length ? enriched.reduce((a, p) => a + (p.holding_seconds || 0), 0) / enriched.length : 0)

  const handleExportCsv = () => {
    if (filtered.length === 0) return
    const headers = [
      'Position ID', 'Closed At (ISO)', 'Token ID', 'Slug', 'Strategy',
      'Side', 'Direction', 'Entry Price', 'Exit Price', 'Shares',
      'P&L USD', 'P&L %', 'Hold Seconds', 'Exit Reason',
      'Confidence', 'Predicted Edge', 'P(Yes)', 'Market Mid',
      'Liquidity', 'Model Version', 'Decision ID',
    ]
    const rows = filtered.map((p) => [
      p.position_id,
      new Date((p.timestamp ?? 0) * 1000).toISOString(),
      p.token_id,
      `"${String(p.data?.slug ?? '').replace(/"/g, '""')}"`,
      p.strategy ?? '',
      p._side,
      p.direction ?? '',
      p.entry_price ?? '',
      p.exit_price ?? '',
      p.shares ?? '',
      (p.pnl ?? 0).toFixed(4),
      p._pnlPct != null ? p._pnlPct.toFixed(2) : '',
      p.holding_seconds ?? '',
      p._reason,
      p.confidence ?? '',
      p.predicted_edge ?? '',
      p.p_yes ?? '',
      p.market_mid ?? '',
      p.liquidity ?? '',
      p.model_version ?? '',
      p.decision_id ?? '',
    ])
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const link = document.createElement('a')
    link.href = encodeURI(csv)
    link.download = `polymarket_closed_positions_${Date.now()}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Render: loading skeleton (W58-b — shimmer placeholder mirroring the
  // live layout; preserves the "📕 Closed Positions Ledger" header text
  // so the W38-8 loading-state test contract resolves). ──────────────
  if (loading && positions.length === 0) {
    return <ClosedPositionsSkeleton />
  }

  // ── Render: error state (W58-b — polished red-tinted card with retry). ─
  if (error && positions.length === 0) {
    return <PolishedErrorCard message={error} onRetry={() => fetchData()} />
  }

  // ── Render: main ──────────────────────────────────────────────────────────
  return (
    <div className="card h-full flex flex-col p-3 bg-[var(--bg-surface)] border border-[var(--border)] shadow-xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PulseDot tone="info" />
          <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)] tracking-wide">
            📕 CLOSED POSITIONS LEDGER ({totalClosed})
          </span>
          <span className="badge badge-green text-[9.5px]">Realized P&amp;L Journal</span>
          {lastUpdated && (
            <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
              · {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="bg-[var(--bg-page)] border border-[var(--border)] px-2.5 py-1 rounded-md flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Realized:</span>
            <span className={`mono font-bold text-xs tabular-nums ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPnl(totalPnl)}
            </span>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-strong)] flex items-center gap-1 disabled:opacity-50"
            title="Refresh now"
            aria-label="Refresh closed positions"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-strong)] flex items-center gap-1 disabled:opacity-40"
            title="Export CSV"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
        </div>
      </div>

      {/* ── KPI summary strip (W58-b — KpiTile pattern: tone-tinted bg +
          Lucide icon in label + tabular-nums value + optional quality
          bar + trend glyph). Labels + values + hints preserved verbatim. ─ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        <KpiTile
          label="Total Realized"
          value={fmtPnl(totalPnl)}
          tone={totalPnl >= 0 ? 'good' : 'poor'}
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          trend={totalPnl >= 0 ? 'up' : 'down'}
          testId="closed-kpi-total-realized"
        />
        <KpiTile
          label="Win Rate"
          value={`${(winRate * 100).toFixed(1)}%`}
          hint={`${wins}W / ${losses}L`}
          tone={winRate >= 0.5 ? 'good' : 'warn'}
          icon={Target}
          quality={winRate * 100}
          testId="closed-kpi-win-rate"
        />
        <KpiTile
          label="Avg Win"
          value={fmtUsd(avgWin)}
          tone="good"
          icon={TrendingUp}
          testId="closed-kpi-avg-win"
        />
        <KpiTile
          label="Avg Loss"
          value={fmtUsd(-avgLoss)}
          tone="poor"
          icon={TrendingDown}
          testId="closed-kpi-avg-loss"
        />
        <KpiTile
          label="Profit Factor"
          value={profitFactor == null ? '∞' : profitFactor.toFixed(2)}
          tone={profitFactor == null || profitFactor >= 1 ? 'good' : 'poor'}
          icon={Activity}
          testId="closed-kpi-profit-factor"
        />
        <KpiTile
          label="Avg Hold"
          value={fmtHoldTime(avgHold)}
          hint={`${totalClosed} closed`}
          tone="info"
          icon={Timer}
          testId="closed-kpi-avg-hold"
        />
      </div>

      {/* ── Donut + Timeline row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-3">
        <ExitReasonDonut breakdown={reasonBreakdown} />
        <CumulativePnLChart timeline={timeline} />
      </div>

      {/* ── Filter row (W58-b — SectionHeader + refined search input +
          date-range + strategy + side + outcome + reason + sort). ──────── */}
      <div className="mb-2">
        <SectionHeader
          icon={Filter}
          title="Filters"
          tone="info"
          description="date · strategy · side · outcome · reason"
          trailing={`${filtered.length} / ${enriched.length} shown`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <input
              type="text"
              placeholder="Search by market, strategy, token id…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-[var(--bg-page)] border border-[var(--border)] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40 rounded text-xs px-2.5 py-1.5 text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all"
              aria-label="Search closed positions"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)] hover:text-white"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Date range (W58-b refinement) */}
            <div className="flex items-center gap-1" aria-label="Filter by close date">
              <Calendar className="w-3 h-3 text-[var(--text-secondary)]" aria-hidden="true" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 tabular-nums focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40"
                aria-label="Filter from date"
              />
              <span className="text-[10px] text-[var(--text-secondary)]">→</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] px-2 py-1 outline-none cursor-pointer hover:border-[var(--border-strong)] h-7 tabular-nums focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40"
                aria-label="Filter to date"
              />
            </div>
            {/* Strategy filter (W58-b refinement) */}
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value)}
              className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:text-[var(--text-primary)] h-7 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40"
              aria-label="Filter by strategy"
            >
              <option value="ALL">All Strategies</option>
              {strategyOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {/* Side filter */}
            <FilterPill
              options={['ALL', 'LONG', 'SHORT'] as const}
              value={sideFilter}
              onChange={(v) => setSideFilter(v as SideFilter)}
              label="Side"
            />
            {/* Win/Loss filter */}
            <FilterPill
              options={['ALL', 'WIN', 'LOSS', 'BREAKEVEN'] as const}
              value={winLossFilter}
              onChange={(v) => setWinLossFilter(v as WinLossFilter)}
              label="Outcome"
            />
            {/* Reason filter */}
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as ReasonFilter)}
              className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:text-[var(--text-primary)] h-7 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40"
              aria-label="Filter by exit reason"
            >
              <option value="ALL">All Reasons</option>
              <option value="SL">Stop Loss</option>
              <option value="TP">Take Profit</option>
              <option value="MANUAL">Manual</option>
              <option value="SETTLEMENT">Settlement</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-[var(--bg-page)] border border-[var(--border)] text-[var(--text-secondary)] rounded text-[10px] font-semibold px-2 py-1 outline-none cursor-pointer hover:text-[var(--text-primary)] h-7 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-400/40"
              aria-label="Sort closed positions"
            >
              <option value="date">Sort: Date</option>
              <option value="pnl">Sort: P&amp;L</option>
              <option value="hold">Sort: Hold Time</option>
              <option value="size">Sort: Size</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-auto scrollbar-thin flex-1 table-container">
        {filtered.length === 0 ? (
          <PolishedEmptyState
            icon={Archive}
            title="No closed positions"
            description={
              filterQuery || sideFilter !== 'ALL' || reasonFilter !== 'ALL' || winLossFilter !== 'ALL' || strategyFilter !== 'ALL' || dateFrom || dateTo
                ? 'No closed positions match your active filters.'
                : 'Closed positions will appear here once trades round-trip and realize P&L.'
            }
          />
        ) : (
          <table className="data-table text-xs w-full" role="table" aria-label="Closed positions ledger">
            <thead className="sticky top-0 bg-[var(--bg-surface)] z-10">
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-[10.5px]">
                <th scope="col" className="w-6 py-1.5 text-left uppercase tracking-wider" />
                <th scope="col" className="min-w-[190px] py-1.5 text-left uppercase tracking-wider">Market</th>
                <th scope="col" className="text-center uppercase tracking-wider px-2">Side</th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">Entry</th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">Exit</th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">
                  <button
                    type="button"
                    onClick={() => setSortBy('size')}
                    className="inline-flex items-center hover:text-cyan-300 transition-colors"
                    aria-label="Sort by size"
                  >
                    Size
                    <SortIndicator active={sortBy === 'size'} direction="desc" />
                  </button>
                </th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">
                  <button
                    type="button"
                    onClick={() => setSortBy('pnl')}
                    className="inline-flex items-center hover:text-cyan-300 transition-colors"
                    aria-label="Sort by P&L"
                  >
                    P&amp;L
                    <SortIndicator active={sortBy === 'pnl'} direction="desc" />
                  </button>
                </th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">P&amp;L %</th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">
                  <button
                    type="button"
                    onClick={() => setSortBy('hold')}
                    className="inline-flex items-center hover:text-cyan-300 transition-colors"
                    aria-label="Sort by hold time"
                  >
                    Hold
                    <SortIndicator active={sortBy === 'hold'} direction="desc" />
                  </button>
                </th>
                <th scope="col" className="text-center uppercase tracking-wider px-2">Reason</th>
                <th scope="col" className="text-right uppercase tracking-wider px-2">
                  <button
                    type="button"
                    onClick={() => setSortBy('date')}
                    className="inline-flex items-center hover:text-cyan-300 transition-colors"
                    aria-label="Sort by close date"
                  >
                    Closed At
                    <SortIndicator active={sortBy === 'date'} direction="desc" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/50">
              {filtered.map((p) => {
                const info = formatHierarchicalMarket(String(p.data?.slug ?? ''))
                const isExpanded = expandedId === p.position_id
                const reasonM = REASON_META[p._reason]
                const isWin = p.pnl > 0
                const isLoss = p.pnl < 0
                return (
                  <Fragment key={p.position_id}>
                    <tr
                      className={`hover:bg-cyan-500/[0.04] transition-colors group cursor-pointer ${TONE[pnlTone(p.pnl)].rowHover}`}
                      onClick={() => setExpandedId(isExpanded ? null : p.position_id)}
                    >
                      <td className="text-center text-[var(--text-secondary)]">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 mx-auto" /> : <ChevronRight className="w-3.5 h-3.5 mx-auto" />}
                      </td>
                      <td className="py-2 max-w-[240px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider truncate">
                            {info.category.icon} {info.eventTitle}
                          </span>
                          <span
                            className="text-[var(--text-primary)] group-hover:text-cyan-300 font-medium leading-snug text-xs block whitespace-normal transition-colors"
                            title={info.fullLabel}
                          >
                            {info.question}
                          </span>
                          <span className="text-[9px] text-[var(--text-secondary)] mono tabular-nums truncate" title={p.position_id}>
                            {p.position_id.slice(0, 18)}…
                          </span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wide ${
                            p._side === 'LONG'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : p._side === 'SHORT'
                              ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                          }`}
                        >
                          {p._side === 'LONG' ? 'LONG YES' : p._side === 'SHORT' ? 'SHORT NO' : '—'}
                        </span>
                      </td>
                      <td className="mono tabular-nums text-right text-[var(--text-secondary)]">
                        {p.entry_price != null ? `$${p.entry_price.toFixed(3)}` : '—'}
                      </td>
                      <td className="mono tabular-nums text-right text-[var(--text-primary)]">
                        {p.exit_price != null ? `$${p.exit_price.toFixed(3)}` : '—'}
                      </td>
                      <td className="mono tabular-nums text-right font-semibold text-[var(--text-primary)]">
                        {p.shares != null ? p.shares.toFixed(1) : '—'}
                      </td>
                      <td
                        className={`mono tabular-nums text-right font-bold ${
                          isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {fmtPnl(p.pnl)}
                      </td>
                      <td
                        className={`mono tabular-nums text-right font-semibold ${
                          p._pnlPct == null
                            ? 'text-[var(--text-dim)]'
                            : p._pnlPct > 0
                            ? 'text-emerald-400'
                            : p._pnlPct < 0
                            ? 'text-red-400'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {p._pnlPct == null ? '—' : `${p._pnlPct > 0 ? '+' : ''}${p._pnlPct.toFixed(1)}%`}
                      </td>
                      <td className="mono tabular-nums text-right text-[var(--text-secondary)] text-[10.5px]">
                        {fmtHoldTime(p.holding_seconds)}
                      </td>
                      <td className="text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${reasonM.cls}`}>
                          {p._reason}
                        </span>
                      </td>
                      <td className="mono tabular-nums text-right text-[var(--text-secondary)] text-[10.5px]" title={p.timestamp ? new Date(p.timestamp * 1000).toISOString() : ''}>
                        {fmtTime(p.timestamp)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${p.position_id}-detail`} className="bg-[var(--bg-page)]/60">
                        <td colSpan={11} className="px-4 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2 text-[11px]">
                            <DetailRow label="Position ID" value={<span className="mono text-[var(--text-primary)] break-all">{p.position_id}</span>} />
                            <DetailRow label="Token ID" value={<span className="mono text-[var(--text-primary)] break-all">{p.token_id}</span>} />
                            <DetailRow label="Strategy" value={<span className="text-[var(--text-primary)]">{p.strategy ?? '—'}</span>} />
                            <DetailRow label="Model Version" value={<span className="mono text-cyan-300">{p.model_version || '—'}</span>} />
                            <DetailRow label="Decision ID" value={
                              <span className="mono text-cyan-300 break-all">
                                {p.decision_id || '—'}
                              </span>
                            } />
                            <DetailRow label="Direction" value={<span className="text-[var(--text-primary)]">{p.direction ?? '—'}</span>} />
                            <DetailRow label="Confidence" value={
                              <span className="mono text-[var(--text-primary)]">
                                {p.confidence != null ? fmtPct(p.confidence, 1) : '—'}
                              </span>
                            } />
                            <DetailRow label="Predicted Edge" value={
                              <span className={`mono ${p.predicted_edge == null ? 'text-[var(--text-dim)]' : p.predicted_edge >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {p.predicted_edge != null ? `${p.predicted_edge >= 0 ? '+' : ''}${(p.predicted_edge * 100).toFixed(2)}pp` : '—'}
                              </span>
                            } />
                            <DetailRow label="P(Yes)" value={
                              <span className="mono text-[var(--text-primary)]">{p.p_yes != null ? fmtPct(p.p_yes, 1) : '—'}</span>
                            } />
                            <DetailRow label="Market Mid" value={
                              <span className="mono text-[var(--text-primary)]">{p.market_mid != null ? `$${p.market_mid.toFixed(4)}` : '—'}</span>
                            } />
                            <DetailRow label="Liquidity" value={
                              <span className="mono text-[var(--text-primary)]">{p.liquidity != null ? fmtUsd(p.liquidity) : '—'}</span>
                            } />
                            <DetailRow label="Closed At (ISO)" value={
                              <span className="mono text-[var(--text-secondary)]">
                                {p.timestamp ? new Date(p.timestamp * 1000).toISOString() : '—'}
                              </span>
                            } />
                            <DetailRow label="Hold Time (s)" value={
                              <span className="mono text-[var(--text-primary)]">{p.holding_seconds?.toFixed(0) ?? '—'}</span>
                            } />
                            <DetailRow label="Slippage" value={
                              <span className="mono text-amber-400">
                                {p.entry_price != null && p.exit_price != null && p.shares
                                  ? `${Math.abs(p.exit_price - p.entry_price).toFixed(4)} (${p._side === 'LONG'
                                      ? p.exit_price >= p.entry_price ? 'adverse' : 'favourable'
                                      : p.exit_price <= p.entry_price ? 'adverse' : 'favourable'})`
                                  : '—'}
                              </span>
                            } />
                            <DetailRow label="Exit Reason" value={
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase ${reasonM.cls}`}>
                                {reasonM.label}
                              </span>
                            } />
                          </div>
                          {p.data && Object.keys(p.data).length > 0 && (
                            <details className="mt-3">
                              <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] select-none">
                                Raw metadata ({Object.keys(p.data).length} keys)
                              </summary>
                              <pre className="mt-1 p-2 bg-[var(--bg-base)] border border-[var(--border)] rounded text-[10px] mono text-[var(--text-secondary)] overflow-x-auto max-h-40 scrollbar-thin">
                                {JSON.stringify(p.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer status (W58-b — tabular-nums) ────────────────────── */}
      <div className="pt-2 mt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
        <span>
          Showing <span className="mono tabular-nums text-[var(--text-secondary)]">{filtered.length}</span> of{' '}
          <span className="mono tabular-nums text-[var(--text-secondary)]">{enriched.length}</span> closed positions
          {error && <span className="text-amber-400 ml-2">· {error}</span>}
        </span>
        <span className="mono tabular-nums">Auto-refresh: 30s {typeof document !== 'undefined' && document.hidden ? '(paused)' : ''}</span>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────
// (W58-b — the legacy `KpiCard` sub-component was removed since the live
// KPI strip now uses the W58-b `KpiTile` pattern above; FilterPill,
// DetailRow, ExitReasonDonut, and CumulativePnLChart below are still used.)

function FilterPill<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      className="inline-flex bg-[var(--bg-page)] border border-[var(--border)] rounded p-0.5 text-[10px]"
      role="group"
      aria-label={`Filter by ${label}`}
    >
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 rounded font-bold transition-all ${
            value === opt
              ? 'bg-blue-500/20 text-cyan-300 shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          aria-pressed={value === opt}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-[var(--text-secondary)] uppercase font-semibold tracking-wide">{label}</span>
      <span className="text-[11px]">{value}</span>
    </div>
  )
}

function ExitReasonDonut({
  breakdown,
}: {
  breakdown: Record<ExitReason, { count: number; pnl: number }>
}) {
  const entries = (Object.entries(breakdown) as [ExitReason, { count: number; pnl: number }][])
    .filter(([r]) => r !== 'UNKNOWN')
  const total = entries.reduce((a, [, v]) => a + v.count, 0)

  // SVG donut math
  const R = 38
  const r = 24
  const C = 2 * Math.PI * R
  let offset = 0
  const segments = entries
    .filter(([, v]) => v.count > 0)
    .map(([reason, v]) => {
      const frac = total > 0 ? v.count / total : 0
      const len = frac * C
      const seg = {
        reason,
        count: v.count,
        pnl: v.pnl,
        dasharray: `${len} ${C - len}`,
        dashoffset: -offset,
        color: REASON_META[reason].dot,
      }
      offset += len
      return seg
    })

  return (
    <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold tracking-wide">
          Exit Reason Breakdown
        </span>
        <span className="text-[9px] text-[var(--text-secondary)] mono">{total} total</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-[100px] h-[100px] flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" strokeWidth={R - r} />
            {segments.length === 0 && total === 0 && (
              <circle cx="50" cy="50" r={R} fill="none" stroke="#181c28" strokeWidth={R - r} />
            )}
            {segments.map((s) => (
              <circle
                key={s.reason}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={R - r}
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
                strokeLinecap="butt"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="mono text-base font-bold text-[var(--text-primary)]">{total}</span>
            <span className="text-[8.5px] text-[var(--text-secondary)] uppercase tracking-wide">closed</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          {entries.map(([reason, v]) => {
            const meta = REASON_META[reason]
            const pct = total > 0 ? (v.count / total) * 100 : 0
            return (
              <div key={reason} className="flex items-center justify-between gap-2 text-[10.5px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }} />
                  <span className="text-[var(--text-primary)] font-semibold truncate">{meta.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="mono text-[var(--text-secondary)]">{v.count}</span>
                  <span className="mono text-[var(--text-secondary)] text-[9px]">({pct.toFixed(0)}%)</span>
                  <span className={`mono font-semibold ${v.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPnl(v.pnl)}
                  </span>
                </div>
              </div>
            )
          })}
          {total === 0 && (
            <div className="text-[10px] text-[var(--text-dim)] text-center py-2">No closed positions yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

function CumulativePnLChart({ timeline }: { timeline: { t: number; cum: number; pnl: number }[] }) {
  const w = 100
  const h = 40
  const data = timeline.length > 0 ? timeline : [{ t: 0, cum: 0, pnl: 0 }]

  const minCum = Math.min(0, ...data.map((d) => d.cum))
  const maxCum = Math.max(0, ...data.map((d) => d.cum))
  const range = maxCum - minCum || 1

  const points = data.map((d, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w
    const y = h - ((d.cum - minCum) / range) * h
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${h} L ${points[0].x.toFixed(2)} ${h} Z`
  const zeroY = h - ((0 - minCum) / range) * h
  const isPositive = (data[data.length - 1]?.cum ?? 0) >= 0
  const stroke = isPositive ? '#4ade80' : '#f87171'
  const fill = isPositive ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)'

  const finalCum = data[data.length - 1]?.cum ?? 0

  return (
    <div className="bg-[var(--bg-page)] border border-[var(--border)] rounded-md p-3 flex flex-col lg:col-span-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold tracking-wide">
          Cumulative Realized P&amp;L
        </span>
        <span className={`mono text-xs font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPnl(finalCum)}
        </span>
      </div>
      <div className="relative w-full" style={{ aspectRatio: '3 / 1' }}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
          {/* Zero line */}
          <line
            x1="0" y1={zeroY} x2={w} y2={zeroY}
            stroke="var(--border)" strokeWidth="0.4" strokeDasharray="1 1"
          />
          {/* Area */}
          <path d={areaPath} fill={fill} />
          {/* Line */}
          <path d={linePath} fill="none" stroke={stroke} strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="flex items-center justify-between mt-1 text-[9px] text-[var(--text-secondary)] mono">
        <span>
          {data.length > 1
            ? new Date(data[0].t * 1000).toLocaleDateString()
            : '—'}
        </span>
        <span>
          {data.length > 1
            ? new Date(data[data.length - 1].t * 1000).toLocaleDateString()
            : '—'}
        </span>
      </div>
    </div>
  )
}
