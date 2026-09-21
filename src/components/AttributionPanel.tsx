// components/AttributionPanel.tsx — 7-Dimension P&L Performance Attribution
//
// Exposes the backend attribution engine (`GET /api/attribution`) which slices
// realised P&L across seven orthogonal dimensions: strategy, ML-confidence,
// predicted-edge, probability-band, liquidity-level, holding-period, and
// trade-direction. Each dimension is rendered as a horizontal contribution
// bar with expandable per-bucket breakdown, plus a waterfall view, a
// per-strategy table, summary KPIs (coverage %, residual), and a time-range
// selector with 30s auto-refresh (paused when document is hidden).
//
// ─── W55-c — Final UI polish pass (visual consistency with W50-54 design
//     system) ────────────────────────────────────────────────────────────
// This pass applies the W50-54 premium visual layer (Tone system, KpiTile
// pattern, shimmer skeleton, polished empty/error states, PulseDot,
// tabular-nums, row hover accent bar, section headers with icon +
// uppercase title, refined controls, tone-coloured P&L bars) to the
// attribution workstation. Mirrors the W53-c StrategyPerformancePanel +
// W54-a DeepAnalysisView + W54-e MLValidationPanel redesign family.
//
// Polish affordances (additive only — no functional behaviour change):
//   • Tone system — unified 5-tone vocabulary (good / warn / poor / info /
//     neutral) with self-contained class strings (bg / border / text / bar /
//     dot / label / halo) shared by KPI tiles + section header icons +
//     tone-coloured values. Static class strings keep Tailwind 4's JIT
//     scanner happy.
//   • KpiTile — refined KPI card (large value, tone-tinted bg, quality bar,
//     optional trend glyph). Drives the new 4-card attribution summary
//     strip (Total P&L / Best Contributor / Worst Contributor / Coverage).
//   • ShimmerSkeleton — structured shimmer placeholder mirroring the live
//     panel layout (header strip + KPI strip + dimensions list + tabs).
//     Uses .skeleton-line + .skeleton-line-sm + .skeleton-line-md +
//     .skeleton-card classes from globals.css.
//   • PolishedEmptyState — Lucide icon + title + helper copy for the
//     empty-attribution branch + the per-strategy table empty branch.
//     role=status.
//   • ErrorCard — polished error state with Lucide AlertTriangle + Retry
//     button. Preserves the "Attribution unavailable" title + error
//     string + "Retry" accessible name from the W38-8 test contract.
//   • SectionHeader — Lucide icon + uppercase tracking-wider title +
//     optional dim italic description + optional trailing node for each
//     tab content area (Dimensions / Waterfall / Strategies).
//   • PulseDot — animated status dot for the LIVE indicator in the
//     header. Mirrors W52-b / W53-c / W54-a PulseDot. aria-hidden.
//   • Tone-coloured P&L values — green for positive contributors, red
//     for negative, muted for breakeven. Applied to KPI tiles + table
//     cells + dimension bars + waterfall bars. Each value carries a
//     data-tone attribute for downstream CSS targeting.
//   • Tabular-nums on every numeric cell — Total P&L, Avg P&L, win-rate,
//     profit-factor, capital, holding-time, coverage %, residual, bar
//     widths, percentages — so the trader's eye scans aligned columns.
//   • Row hover accent bar — each strategies-table row carries
//     `hover:bg-cyan-500/5` layered with
//     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]` so hovering
//     a strategy shows a subtle cyan left accent bar (no layout shift).
//   • Refined controls — Time-range selector gets an explicit aria-label
//     + focus ring + Lucide Clock glyph trailing the selected value;
//     NEW Sort-by selector (Default / P&L ↓ / |P&L| ↓) re-orders the
//     7 dimensions without changing data. Refresh button keeps the
//     RefreshCw spin animation + freshness label.
//   • Refined attribution bar viz — each dimension's contribution bar
//     now uses the Tone system's bar colour (emerald / red / slate)
//     instead of the fixed pnlBg helper, with a tone-tinted halo ring
//     so positive vs negative bars read at a glance. Best/Worst
//     contributor rows in the expanded breakdown get a small leading
//     ▲/▼ glyph + tone-coloured label.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { fmtUsd, fmtPnl, fmtPct, fmtInt } from '@/lib/design-tokens'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Brain,
  Target,
  Percent,
  Waves,
  Clock,
  ArrowLeftRight,
  Layers,
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  ChevronRight,
  PieChart,
  BarChart3,
  Database,
  Inbox,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { PnLBarChart } from '@/components/charts'

// ── Types ────────────────────────────────────────────────────────────────
interface AttributionBucket {
  bucket: string
  count: number
  total_pnl: number
  avg_pnl: number
  win_rate: number
  wins: number
  losses: number
  avg_holding_seconds: number
  gross_profit: number
  gross_loss: number
  profit_factor: number | null
  capital_deployed: number
}

interface AttributionSummary {
  count?: number
  total_pnl?: number
  avg_pnl?: number
  median_pnl?: number
  win_rate?: number
  wins?: number
  losses?: number
  breakeven?: number
  avg_holding_seconds?: number
  gross_profit?: number
  gross_loss?: number
  profit_factor?: number | null
  best_trade?: number
  worst_trade?: number
  avg_entry_price?: number
  avg_exit_price?: number
  total_volume_shares?: number
  strategies_count?: number
}

interface AttributionResponse {
  summary: AttributionSummary
  by_strategy: AttributionBucket[]
  by_confidence_bucket: AttributionBucket[]
  by_edge_bucket: AttributionBucket[]
  by_probability_band: AttributionBucket[]
  by_liquidity_level: AttributionBucket[]
  by_holding_period: AttributionBucket[]
  by_trade_direction: AttributionBucket[]
  bucket_definitions: Record<string, string[]>
}

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all'

/** Sort order applied to the Dimensions list. Default preserves W38-8 order. */
type DimSortKey = 'default' | 'pnl-desc' | 'abs-pnl-desc'

type DimensionKey =
  | 'by_strategy'
  | 'by_confidence_bucket'
  | 'by_edge_bucket'
  | 'by_probability_band'
  | 'by_liquidity_level'
  | 'by_holding_period'
  | 'by_trade_direction'

interface DimensionMeta {
  key: DimensionKey
  label: string
  description: string
  icon: typeof Brain
  accent: 'blue' | 'purple' | 'cyan' | 'amber' | 'green'
}

const DIMENSIONS: DimensionMeta[] = [
  {
    key: 'by_strategy',
    label: 'Strategy',
    description: 'P&L source by trading strategy',
    icon: Layers,
    accent: 'blue',
  },
  {
    key: 'by_confidence_bucket',
    label: 'ML Confidence',
    description: 'Alpha from model confidence at entry',
    icon: Brain,
    accent: 'purple',
  },
  {
    key: 'by_edge_bucket',
    label: 'Predicted Edge',
    description: 'Edge (p_yes − market mid) at signal',
    icon: Target,
    accent: 'cyan',
  },
  {
    key: 'by_probability_band',
    label: 'Probability Band',
    description: 'Market selection by p_yes band',
    icon: Percent,
    accent: 'amber',
  },
  {
    key: 'by_liquidity_level',
    label: 'Liquidity Level',
    description: 'Execution slippage by market depth',
    icon: Waves,
    accent: 'green',
  },
  {
    key: 'by_holding_period',
    label: 'Holding Period',
    description: 'Entry/exit timing alpha',
    icon: Clock,
    accent: 'blue',
  },
  {
    key: 'by_trade_direction',
    label: 'Trade Direction',
    description: 'Long-YES vs short-NO asymmetry',
    icon: ArrowLeftRight,
    accent: 'cyan',
  },
]

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '1H' },
  { value: '24h', label: '24H' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'all', label: 'All-Time' },
]

const DIM_SORT_OPTIONS: { value: DimSortKey; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'pnl-desc', label: 'P&L ↓' },
  { value: 'abs-pnl-desc', label: '|P&L| ↓' },
]

const POLL_INTERVAL_MS = 30_000

// ────────────────────────────────────────────────────────────────────────────
// W55-c — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
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
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',   text: 'text-cyan-400',   bar: 'bg-cyan-500',   dot: 'bg-cyan-400',   label: 'text-cyan-400/80',   halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',     text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',      halo: '' },
}

// ── Tone helpers ──────────────────────────────────────────────────────────

function pnlTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v > 0) return 'good'
  if (v < 0) return 'poor'
  return 'neutral'
}

function coverageTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 95) return 'good'
  if (v >= 80) return 'warn'
  return 'poor'
}

function profitFactorTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 2) return 'good'
  if (v >= 1) return 'warn'
  return 'poor'
}

function winRateTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 0.55) return 'good'
  if (v >= 0.45) return 'warn'
  return 'poor'
}

// ── Helpers ────────────────────────────────────────────────────────────────

const accentBadge: Record<DimensionMeta['accent'], string> = {
  blue: 'badge badge-blue',
  purple: 'badge badge-purple',
  cyan: 'badge badge-cyan',
  amber: 'badge badge-amber',
  green: 'badge badge-green',
}

const accentText: Record<DimensionMeta['accent'], string> = {
  blue: 'text-[var(--accent-fg)]',
  purple: 'text-[#c084fc]',
  cyan: 'text-[#22d3ee]',
  amber: 'text-[#fbbf24]',
  green: 'text-[#4ade80]',
}

function pnlColor(v: number): string {
  if (v > 0) return 'text-[#4ade80]'
  if (v < 0) return 'text-[#f87171]'
  return 'text-[var(--text-secondary)]'
}

function humanizeBucket(label: string): string {
  if (!label) return '—'
  return label
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtHoldingSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s <= 0) return '—'
  if (s < 60) return `${Math.floor(s)}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${(s / 86400).toFixed(1)}d`
}

function sumDimensionPnl(buckets: AttributionBucket[]): number {
  return buckets.reduce((acc, b) => acc + (b.total_pnl || 0), 0)
}

function bestBucket(buckets: AttributionBucket[]): AttributionBucket | null {
  if (!buckets.length) return null
  return buckets.reduce((best, b) =>
    (b.total_pnl ?? -Infinity) > (best.total_pnl ?? -Infinity) ? b : best
  )
}

function worstBucket(buckets: AttributionBucket[]): AttributionBucket | null {
  if (!buckets.length) return null
  return buckets.reduce((worst, b) =>
    (b.total_pnl ?? Infinity) < (worst.total_pnl ?? Infinity) ? b : worst
  )
}

/** Best contributor across all 7 dimensions (highest total_pnl bucket). */
function bestContributor(
  data: AttributionResponse,
): { dim: DimensionMeta; bucket: AttributionBucket } | null {
  let best: { dim: DimensionMeta; bucket: AttributionBucket } | null = null
  for (const dim of DIMENSIONS) {
    const b = bestBucket(data[dim.key] ?? [])
    if (!b) continue
    if (!best || (b.total_pnl ?? -Infinity) > (best.bucket.total_pnl ?? -Infinity)) {
      best = { dim, bucket: b }
    }
  }
  return best
}

/** Worst contributor across all 7 dimensions (lowest total_pnl bucket). */
function worstContributor(
  data: AttributionResponse,
): { dim: DimensionMeta; bucket: AttributionBucket } | null {
  let worst: { dim: DimensionMeta; bucket: AttributionBucket } | null = null
  for (const dim of DIMENSIONS) {
    const b = worstBucket(data[dim.key] ?? [])
    if (!b) continue
    if (!worst || (b.total_pnl ?? Infinity) < (worst.bucket.total_pnl ?? Infinity)) {
      worst = { dim, bucket: b }
    }
  }
  return worst
}

// ────────────────────────────────────────────────────────────────────────────
// W55-c — Inline sub-components (kept private to the panel so test mocks
// and ts-isolation stay clean)
// ────────────────────────────────────────────────────────────────────────────

// PulseDot — small status dot with halo + ping animation. `animate-ping` is
// Tailwind's built-in pulse. Reduced-motion users see a static dot (the
// halo's ping is decorative; the dot's colour still conveys state).
function PulseDot({ tone = 'good' }: { tone?: Tone }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      <span className={`relative inline-flex w-2 h-2 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
  )
}

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. Mirrors the W53-c
// SectionHeader pattern. Title rendered in its own <span> so RTL's
// `getByText('Performance Attribution')` matches just the span.
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
    <div className="flex items-center justify-between gap-2 mb-2">
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
      {trailing && <span className="shrink-0 text-[10px] text-[var(--text-secondary)] mono">{trailing}</span>}
    </div>
  )
}

// KpiTile — refined KPI card (large value, tone-tinted bg, quality bar,
// optional trend glyph). Mirrors the W53-c KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  /** Quality bar fill [0..100]. 0 = no bar rendered. */
  quality?: number
  /** Optional trend glyph ('up' | 'down' | 'flat'). */
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative overflow-hidden border ${cfg.border} ${cfg.bg} transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId ?? 'attribution-kpi-tile'}
      data-tone={tone}
    >
      <div className={`kpi-label ${cfg.label}`}>
        {label}
      </div>
      <div
        className={`kpi-value mono tabular-nums ${cfg.text} flex items-baseline gap-1`}
        data-testid={testId ? `${testId}-value` : 'attribution-kpi-value'}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-3 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 inline-block" aria-hidden="true" />}
      </div>
      <div className="kpi-sub tabular-nums">{hint}</div>
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
// className prop. aria-hidden. Mirrors W54-e ShimmerBlock.
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-line-sm ${className}`}
      aria-hidden="true"
    />
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. Used by the
// empty-attribution branch + the per-strategy table empty branch.
interface PolishedEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  testId?: string
}

function PolishedEmptyState({ icon: Icon, title, description, className = '', testId }: PolishedEmptyStateProps) {
  return (
    <div className={`empty-state py-8 ${className}`} role="status" data-testid={testId ?? 'attribution-empty-state'}>
      <span className="empty-state-icon" aria-hidden="true">
        <Icon className="w-10 h-10 text-[var(--text-dim)]" strokeWidth={1.5} />
      </span>
      <span className="empty-state-title text-sm font-semibold">{title}</span>
      {description && (
        <span className="empty-state-desc text-xs max-w-sm text-center">{description}</span>
      )}
    </div>
  )
}

// ErrorCard — polished error state with Lucide AlertTriangle + the
// error string rendered as the card's subtitle (direct text node so the
// "Attribution unavailable" title is preserved) + Retry button (with
// RotateCcw glyph). role=alert. Mirrors the W54-a ErrorCard pattern.
function ErrorCard({
  title,
  error,
  onRetry,
}: {
  title: string
  error: string
  onRetry: () => void
}) {
  return (
    <div
      className="error-state py-8"
      role="alert"
      data-testid="attribution-error"
    >
      <AlertTriangle className="size-8 text-red-400/80" aria-hidden="true" />
      <span className="error-state-title">{title}</span>
      {/* The error string is rendered as the direct text node of this span so
          the W38-8 test contract resolves to a single leaf. */}
      <span className="error-state-desc" data-testid="attribution-error-msg">
        {error}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        data-testid="attribution-retry"
        aria-label="Retry attribution fetch"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  )
}

// AttributionSkeleton — structured shimmer placeholder mirroring the live
// panel layout (header strip + KPI strip + dimensions list + tab strip).
// Uses .skeleton / .skeleton-line / .skeleton-line-sm / .skeleton-line-md
// / .skeleton-card classes from globals.css so the existing test contract
// (loading state visibility) still resolves.
function AttributionSkeleton() {
  return (
    <div
      className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md"
      role="status"
      aria-live="polite"
      aria-label="Loading attribution analysis…"
      data-testid="attribution-loading-skeleton"
    >
      {/* Header skeleton */}
      <div className="card-header p-3 border-b border-[var(--border)] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <PieChart className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            Attribution Analysis
          </span>
        </div>
        <div className="skeleton h-6 w-32 rounded-md" />
      </div>

      <div className="p-3 space-y-3">
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card space-y-2">
              <ShimmerBlock className="w-2/5" />
              <div className="h-5 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-3/5" />
            </div>
          ))}
        </div>

        {/* Dimensions list skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton-card p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <ShimmerBlock className="w-40" />
                <ShimmerBlock className="w-16" />
              </div>
              <div className="h-2 w-full rounded-sm skeleton-line-md" />
            </div>
          ))}
        </div>

        {/* Tab strip skeleton */}
        <div className="skeleton h-7 w-full rounded-md" />
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export default function AttributionPanel() {
  const [data, setData] = useState<AttributionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [dimSort, setDimSort] = useState<DimSortKey>('default')
  const [expanded, setExpanded] = useState<Set<DimensionKey>>(new Set())
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAttribution = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const url = `/api/attribution?range=${timeRange}`
      const res = await apiFetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      const json = (await res.json()) as AttributionResponse
      setData(json)
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [timeRange])

  // Initial fetch + 30s polling, paused when document hidden
  useEffect(() => {
    fetchAttribution()
  }, [fetchAttribution])

  useEffect(() => {
    const start = () => {
      if (timerRef.current) return
      timerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return
        fetchAttribution()
      }, POLL_INTERVAL_MS)
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
        // On regain focus, immediately refresh + restart interval
        fetchAttribution()
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
  }, [fetchAttribution])

  const toggleExpand = (key: DimensionKey) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (loading && !data) {
    return <AttributionSkeleton />
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
        <div className="card-header p-3 border-b border-[var(--border)] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PieChart className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[var(--text-primary)]">
              Attribution Analysis
            </span>
          </div>
        </div>
        <ErrorCard
          title="Attribution unavailable"
          error={error}
          onRetry={() => fetchAttribution()}
        />
      </div>
    )
  }

  if (!data || !data.summary || Object.keys(data.summary).length === 0) {
    return (
      <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
        <div className="card-header p-3 border-b border-[var(--border)]">
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            Attribution Analysis
          </span>
        </div>
        <PolishedEmptyState
          icon={Inbox}
          title="No attribution data"
          description="Closed positions will appear here once strategies record exits."
          testId="attribution-empty-state"
        />
      </div>
    )
  }

  // ── Derived metrics ─────────────────────────────────────────────────────
  const totalPnl = data.summary?.total_pnl ?? 0
  const totalTrades = data.summary?.count ?? 0
  const winRate = data.summary?.win_rate ?? 0

  // Attribution coverage: each dimension covers ALL closed positions, so
  // every dimension's sum equals total P&L. Coverage is the share of total
  // P&L that flows through the (sum across 7 dimensions / 7) — i.e., always
  // 100% by construction. We compute residual as the difference between
  // total P&L and the average dimension sum (always 0 by design) so the
  // KPI surfaces the engine's design invariant: 100% attribution.
  const dimensionSums = DIMENSIONS.map((d) => sumDimensionPnl(data[d.key] ?? []))
  const attributedSum = dimensionSums.reduce((a, b) => a + Math.abs(b), 0) / 7
  const coverage = totalPnl !== 0
    ? Math.min(100, (Math.abs(attributedSum) / Math.abs(totalPnl)) * 100)
    : 0
  // Reconciliation residual — surfaces the engine's design invariant:
  // 100% attribution (residual should always be 0). Surfaced via the
  // Coverage KPI tile hint when the gap is non-trivial.
  const residual = totalPnl - attributedSum
  const reconciled = Math.abs(residual) < 0.01

  // Max abs P&L across all dimensions (for bar scaling)
  const maxAbsPnl = Math.max(
    1,
    ...dimensionSums.map((v) => Math.abs(v))
  )

  // Best + worst contributor across all dimensions (for KPI tiles)
  const best = bestContributor(data)
  const worst = worstContributor(data)

  // Sorted dimensions for the Dimensions tab (default preserves W38-8 order)
  const sortedDimensions: DimensionMeta[] = (() => {
    if (dimSort === 'default') return DIMENSIONS
    const withPnl = DIMENSIONS.map((d) => ({
      dim: d,
      pnl: sumDimensionPnl(data[d.key] ?? []),
    }))
    if (dimSort === 'pnl-desc') {
      withPnl.sort((a, b) => b.pnl - a.pnl)
    } else {
      // abs-pnl-desc
      withPnl.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    }
    return withPnl.map((x) => x.dim)
  })()

  const freshnessLabel = lastUpdated
    ? `${Math.floor((Date.now() - lastUpdated) / 1000)}s ago`
    : '—'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
      {/* Header */}
      <div className="card-header p-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PieChart className="w-3.5 h-3.5 text-[#22d3ee]" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            Performance Attribution
          </span>
          <span className="badge badge-cyan text-[9.5px]">7-DIMENSION</span>
          {/* LIVE indicator — mirrors W54-a / W53-c PulseDot pattern */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <PulseDot tone="good" />
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Time range selector (refined — explicit aria-label + focus ring) */}
          <Select
            value={timeRange}
            onValueChange={(v) => setTimeRange(v as TimeRange)}
          >
            <SelectTrigger
              className="h-7 w-[110px] text-[11px] bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              size="sm"
              aria-label="Attribution time range"
            >
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-surface)] border-[var(--border)]">
              {TIME_RANGES.map((r) => (
                <SelectItem
                  key={r.value}
                  value={r.value}
                  className="text-[var(--text-primary)] text-xs focus:bg-[var(--bg-elevated)]"
                >
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* NEW — Sort-by selector (Default / P&L ↓ / |P&L| ↓). Purely
              cosmetic — re-orders the 7 dimensions in the Dimensions tab
              without changing any data. Default preserves the W38-8 order
              so existing tests still pass. */}
          <Select
            value={dimSort}
            onValueChange={(v) => setDimSort(v as DimSortKey)}
          >
            <SelectTrigger
              className="h-7 w-[110px] text-[11px] bg-[var(--bg-page)] border-[var(--border)] text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-cyan-400/40"
              size="sm"
              aria-label="Attribution sort order"
            >
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-surface)] border-[var(--border)]">
              {DIM_SORT_OPTIONS.map((o) => (
                <SelectItem
                  key={o.value}
                  value={o.value}
                  className="text-[var(--text-primary)] text-xs focus:bg-[var(--bg-elevated)]"
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh + freshness */}
          <button
            type="button"
            onClick={() => fetchAttribution()}
            disabled={isRefreshing}
            className="btn btn-ghost btn-sm flex items-center gap-1 text-[10px] focus-visible:ring-1 focus-visible:ring-cyan-400/40"
            title={`Auto-refresh 30s • Last: ${freshnessLabel}`}
            aria-label="Refresh attribution"
          >
            <RefreshCw
              className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="text-[var(--text-secondary)] hidden sm:inline tabular-nums">{freshnessLabel}</span>
          </button>
        </div>
      </div>

      {/* Inline error banner (when we have stale data) */}
      {error && data && (
        <div className="banner-warning text-[10.5px] mx-3 mt-2 py-1.5 px-2.5" role="alert">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Refresh failed: {error}. Showing last cached data ({freshnessLabel}).
          </span>
        </div>
      )}

      {/* ── Summary KPI strip (KpiTile pattern) ──────────────────────────── */}
      <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <KpiTile
          label="Total P&L"
          value={fmtPnl(totalPnl)}
          hint={`${fmtInt(totalTrades)} closed trades`}
          tone={pnlTone(totalPnl)}
          quality={Math.min(100, Math.abs(totalPnl) * 10)}
          trend={totalPnl > 0 ? 'up' : totalPnl < 0 ? 'down' : 'flat'}
          testId="attribution-kpi-total"
        />

        <KpiTile
          label="Best Contributor"
          value={best ? fmtPnl(best.bucket.total_pnl) : '—'}
          hint={best ? `${best.dim.label} · ${humanizeBucket(best.bucket.bucket)}` : 'No buckets yet'}
          tone={best ? pnlTone(best.bucket.total_pnl) : 'neutral'}
          quality={best ? Math.min(100, Math.abs(best.bucket.total_pnl) * 20) : 0}
          trend="up"
          testId="attribution-kpi-best"
        />

        <KpiTile
          label="Worst Contributor"
          value={worst ? fmtPnl(worst.bucket.total_pnl) : '—'}
          hint={worst ? `${worst.dim.label} · ${humanizeBucket(worst.bucket.bucket)}` : 'No buckets yet'}
          tone={worst ? pnlTone(worst.bucket.total_pnl) : 'neutral'}
          quality={worst ? Math.min(100, Math.abs(worst.bucket.total_pnl) * 20) : 0}
          trend="down"
          testId="attribution-kpi-worst"
        />

        <KpiTile
          label="Coverage"
          value={`${coverage.toFixed(1)}%`}
          hint={reconciled
            ? `Fully reconciled · Win ${fmtPct(winRate)}`
            : `Gap ${fmtPnl(residual)} · Win ${fmtPct(winRate)}`}
          tone={coverageTone(coverage)}
          quality={coverage}
          testId="attribution-kpi-coverage"
        />
      </div>

      {/* Tabs: Dimensions / Waterfall / Strategies */}
      <div className="px-3 pb-3">
        <Tabs defaultValue="dimensions" className="w-full">
          <TabsList className="bg-[var(--bg-page)] border border-[var(--border)] h-8 w-full">
            <TabsTrigger
              value="dimensions"
              className="text-[11px] data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-[#22d3ee] flex items-center gap-1"
            >
              <BarChart3 className="w-3 h-3" aria-hidden="true" />
              Dimensions
            </TabsTrigger>
            <TabsTrigger
              value="waterfall"
              className="text-[11px] data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-[#22d3ee] flex items-center gap-1"
            >
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
              Waterfall
            </TabsTrigger>
            <TabsTrigger
              value="strategies"
              className="text-[11px] data-[state=active]:bg-[var(--bg-elevated)] data-[state=active]:text-[#22d3ee] flex items-center gap-1"
            >
              <Database className="w-3 h-3" aria-hidden="true" />
              Strategies
            </TabsTrigger>
          </TabsList>

          {/* ── Dimensions tab ────────────────────────────────────────────── */}
          <TabsContent value="dimensions" className="mt-3">
            <SectionHeader
              icon={Layers}
              title="Dimension Contribution"
              description="P&L sliced across 7 orthogonal factors"
              tone="info"
              trailing={`${DIMENSIONS.length} dimensions`}
            />
            <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
              {sortedDimensions.map((dim) => {
                const buckets = data[dim.key] ?? []
                const dimPnl = sumDimensionPnl(buckets)
                const dimPct = totalPnl !== 0 ? (dimPnl / Math.abs(totalPnl)) * 100 : 0
                const barWidthPct = (Math.abs(dimPnl) / maxAbsPnl) * 100
                const isExpanded = expanded.has(dim.key)
                const Icon = dim.icon
                const bestB = bestBucket(buckets)
                const worstB = worstBucket(buckets)
                const positiveCount = buckets.filter((b) => b.total_pnl > 0).length
                const dimTone = pnlTone(dimPnl)
                const dimCfg = TONE[dimTone]

                return (
                  <div
                    key={dim.key}
                    className="kpi-card !p-0 overflow-hidden transition-colors hover:border-[#2a3050]"
                    role="region"
                    aria-label={`${dim.label} attribution`}
                    data-tone={dimTone}
                  >
                    {/* Dimension header row (click to expand) */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(dim.key)}
                      className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-[var(--bg-elevated)]/40 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400/40"
                      aria-expanded={isExpanded}
                      aria-controls={`dim-${dim.key}`}
                    >
                      <ChevronRight
                        className={`w-3 h-3 text-[var(--text-secondary)] flex-shrink-0 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <div className="flex items-center gap-2 flex-shrink-0 min-w-[150px]">
                        <Icon
                          className={`w-3.5 h-3.5 ${accentText[dim.accent]}`}
                          aria-hidden="true"
                        />
                        <div className="flex flex-col">
                          <span className="text-[11.5px] font-semibold text-[var(--text-primary)] leading-tight">
                            {dim.label}
                          </span>
                          <span className="text-[9.5px] text-[var(--text-secondary)] leading-tight">
                            {dim.description}
                          </span>
                        </div>
                      </div>

                      {/* Bar — refined with Tone system colour (emerald / red / slate) */}
                      <div className="flex-1 flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 h-2 bg-[var(--bg-page)] rounded-sm overflow-hidden relative">
                          <div
                            className={`h-full rounded-sm transition-all duration-300 ${dimCfg.bar} shadow-[0_0_8px] ${dimCfg.halo}`}
                            style={{ width: `${barWidthPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Value + percentage */}
                      <div className="flex items-center gap-2 flex-shrink-0 text-right">
                        <span className={`mono text-[11.5px] font-bold tabular-nums ${dimCfg.text}`}>
                          {fmtPnl(dimPnl)}
                        </span>
                        <span className="mono text-[10px] text-[var(--text-secondary)] w-12 text-right tabular-nums">
                          {dimPct >= 0 ? '+' : ''}
                          {dimPct.toFixed(1)}%
                        </span>
                        <span className={`${accentBadge[dim.accent]} text-[9px]`}>
                          {buckets.length} buckets
                        </span>
                      </div>
                    </button>

                    {/* Expanded: per-bucket breakdown */}
                    {isExpanded && (
                      <div
                        id={`dim-${dim.key}`}
                        className="border-t border-[var(--border)] bg-[var(--bg-page)]/60 p-2 space-y-1"
                      >
                        {bestB && worstB && bestB.bucket !== worstB.bucket && (
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] mb-1.5 px-1">
                            <span className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                              <span className="uppercase tracking-wider text-[9px]">Best</span>
                              <span className="text-emerald-400 mono tabular-nums">{humanizeBucket(bestB.bucket)}</span>
                              <span className="text-emerald-400 mono tabular-nums">{fmtPnl(bestB.total_pnl)}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <TrendingDown className="w-3 h-3 text-red-400" aria-hidden="true" />
                              <span className="uppercase tracking-wider text-[9px]">Worst</span>
                              <span className="text-red-400 mono tabular-nums">{humanizeBucket(worstB.bucket)}</span>
                              <span className="text-red-400 mono tabular-nums">{fmtPnl(worstB.total_pnl)}</span>
                            </span>
                          </div>
                        )}
                        {buckets.map((b) => {
                          const bPct = dimPnl !== 0
                            ? (Math.abs(b.total_pnl) / Math.abs(dimPnl)) * 100
                            : 0
                          const bWidth = dimPnl !== 0
                            ? (Math.abs(b.total_pnl) / Math.abs(dimPnl)) * 100
                            : 0
                          const bTone = pnlTone(b.total_pnl)
                          const bCfg = TONE[bTone]
                          return (
                            <div
                              key={b.bucket}
                              className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-[var(--bg-elevated)]/40 transition-colors"
                            >
                              <div className="w-[90px] text-[10.5px] text-[#c8cfe0] font-medium truncate">
                                {humanizeBucket(b.bucket)}
                              </div>
                              <div className="flex-1 h-1.5 bg-[var(--bg-page)] rounded-sm overflow-hidden">
                                <div
                                  className={`h-full ${bCfg.bar} transition-all`}
                                  style={{ width: `${bWidth}%` }}
                                />
                              </div>
                              <div className={`mono text-[10.5px] font-semibold w-16 text-right tabular-nums ${bCfg.text}`} data-tone={bTone}>
                                {fmtPnl(b.total_pnl)}
                              </div>
                              <div className="mono text-[9.5px] text-[var(--text-secondary)] w-10 text-right tabular-nums">
                                {bPct.toFixed(0)}%
                              </div>
                              <div className="mono text-[9.5px] text-[var(--text-secondary)] w-10 text-right tabular-nums">
                                {b.count}t
                              </div>
                              <div className="mono text-[9.5px] text-[var(--text-secondary)] w-12 text-right tabular-nums">
                                {(b.win_rate * 100).toFixed(0)}% W
                              </div>
                            </div>
                          )
                        })}
                        {positiveCount > 0 && (
                          <div className="text-[9.5px] text-[var(--text-secondary)] pt-1 border-t border-[#181c28] mt-1 tabular-nums">
                            <Activity className="w-2.5 h-2.5 inline mr-1" aria-hidden="true" />
                            {positiveCount}/{buckets.length} buckets profitable
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </TabsContent>

          {/* ── Waterfall tab ─────────────────────────────────────────────── */}
          <TabsContent value="waterfall" className="mt-3">
            <div className="kpi-card p-3">
              <SectionHeader
                icon={TrendingUp}
                title="P&L Contribution Waterfall"
                description="Best bucket per dimension, cumulatively stacked"
                tone="info"
                trailing={
                  <span className="badge badge-dim text-[9px]">Best bucket per dimension</span>
                }
              />

              {/* W13-9 — Recharts bar chart summarising each dimension's total
                  P&L. Complements the cumulative waterfall track below with a
                  proper responsive chart (bars colored green/red by sign). */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                    Dimension P&amp;L — Recharts
                  </span>
                  <span className="text-[9px] text-[var(--text-secondary)] mono">
                    green=+ / red=−
                  </span>
                </div>
                <PnLBarChart
                  data={DIMENSIONS.map((dim) => ({
                    name: dim.label,
                    value: sumDimensionPnl(data[dim.key] ?? []),
                  }))}
                  height={180}
                  layout="horizontal"
                  formatValue={(v) =>
                    v >= 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`
                  }
                  formatTooltip={(d) => (
                    <div
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: '#e6edf3',
                        fontSize: '12px',
                        padding: '6px 10px',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
                      <div>{d.value >= 0 ? '+' : '−'}${Math.abs(d.value).toFixed(2)}</div>
                    </div>
                  )}
                />
              </div>

              {/* Cumulative waterfall track (existing CSS-based visualization,
                  kept as the chart's complement — shows bucket-level detail
                  stacked toward the running total). */}
              <div className="space-y-2">
                {(() => {
                  // Each dimension contributes its BEST bucket's P&L as the
                  // "alpha source" — cumulatively stacked toward total P&L.
                  const items = DIMENSIONS.map((dim) => {
                    const bestB = bestBucket(data[dim.key] ?? [])
                    return {
                      dim,
                      pnl: bestB?.total_pnl ?? 0,
                      bucketLabel: bestB?.bucket ?? '—',
                    }
                  })
                  // Cumulative running total starting from 0
                  let cumulative = 0
                  const maxCum = items.reduce(
                    (acc, it) => acc + Math.max(0, it.pnl),
                    0
                  )
                  const scaleMax = Math.max(
                    Math.abs(maxCum),
                    Math.abs(totalPnl),
                    1
                  )

                  return items.map((it) => {
                    const prev = cumulative
                    cumulative += it.pnl
                    const startPct = (Math.min(prev, cumulative) / scaleMax) * 100
                    const heightPct =
                      (Math.abs(it.pnl) / scaleMax) * 100
                    const Icon = it.dim.icon
                    const itTone = pnlTone(it.pnl)
                    const itCfg = TONE[itTone]
                    return (
                      <div
                        key={it.dim.key}
                        className="flex items-center gap-2"
                        title={`${it.dim.label} best bucket: ${humanizeBucket(
                          it.bucketLabel
                        )} (${fmtPnl(it.pnl)})`}
                        data-tone={itTone}
                      >
                        <div className="w-[110px] flex items-center gap-1.5 flex-shrink-0">
                          <Icon
                            className={`w-3 h-3 ${accentText[it.dim.accent]}`}
                            aria-hidden="true"
                          />
                          <span className="text-[10px] text-[#c8cfe0] truncate">
                            {it.dim.label}
                          </span>
                        </div>

                        {/* Stacked waterfall track — tone-coloured bar */}
                        <div className="flex-1 h-6 bg-[var(--bg-page)] rounded-sm relative overflow-hidden border border-[#181c28]">
                          {/* Baseline indicator */}
                          <div className="absolute left-0 top-0 bottom-0 w-px bg-[var(--border)]" />
                          {/* Bar segment */}
                          <div
                            className={`absolute top-0 bottom-0 ${itCfg.bar} transition-all duration-300 shadow-[0_0_8px] ${itCfg.halo}`}
                            style={{
                              left: `${startPct}%`,
                              width: `${Math.max(heightPct, it.pnl !== 0 ? 1.5 : 0)}%`,
                            }}
                          />
                          {/* Bucket label inside bar */}
                          <span className="absolute top-1/2 -translate-y-1/2 left-2 text-[9px] text-[var(--text-primary)] mono tabular-nums pointer-events-none">
                            {humanizeBucket(it.bucketLabel)}
                          </span>
                        </div>

                        {/* Cumulative + delta */}
                        <div className="w-[110px] flex flex-col items-end flex-shrink-0">
                          <span className={`mono text-[10px] font-bold tabular-nums ${itCfg.text}`}>
                            {fmtPnl(it.pnl)}
                          </span>
                          <span className="mono text-[9px] text-[var(--text-secondary)] tabular-nums">
                            cum {fmtPnl(cumulative)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>

              {/* Total marker */}
              <div className="mt-3 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Minus className="w-3 h-3 text-[var(--text-secondary)]" aria-hidden="true" />
                  <span className="text-[10.5px] text-[var(--text-secondary)] uppercase font-semibold tracking-wide">
                    Cumulative Total P&amp;L
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`mono text-[13px] font-bold tabular-nums ${pnlColor(totalPnl)}`}>
                    {fmtPnl(totalPnl)}
                  </span>
                  <span className="badge badge-blue text-[9px]">
                    {((totalPnl >= 0 ? totalPnl : -totalPnl) > 0 ? 'NET POSITIVE' : 'NET NEGATIVE')}
                  </span>
                </div>
              </div>

              <div className="mt-2 text-[9.5px] text-[var(--text-secondary)] leading-relaxed">
                Each bar represents the leading bucket&apos;s P&amp;L contribution within that
                dimension, stacked cumulatively. Bars grow right (green) for positive
                contributions and overlay left (red) for negative ones.
              </div>
            </div>
          </TabsContent>

          {/* ── Strategies tab ────────────────────────────────────────────── */}
          <TabsContent value="strategies" className="mt-3">
            <SectionHeader
              icon={Database}
              title="Per-Strategy Attribution"
              description="Closed positions grouped by trading strategy"
              tone="info"
              trailing={
                data.by_strategy.length > 0
                  ? `${data.by_strategy.length} strategies`
                  : 'No strategies'
              }
            />
            <div className="kpi-card !p-0 overflow-hidden">
              <div className="table-container max-h-[440px] scrollbar-thin">
                <table
                  className="data-table text-xs w-full"
                  role="table"
                  aria-label="Per-strategy attribution breakdown"
                >
                  <thead>
                    <tr>
                      <th scope="col" className="text-left uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Strategy</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Trades</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Win Rate</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Total P&amp;L</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Avg P&amp;L</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Profit Factor</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Capital</th>
                      <th scope="col" className="text-right uppercase tracking-wider text-[10px] text-[var(--text-secondary)] font-bold">Avg Hold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_strategy.length === 0 ? (
                      <tr>
                        <td colSpan={8}>
                          <PolishedEmptyState
                            icon={Database}
                            title="No strategy attribution yet"
                            description="Closed positions grouped by strategy will appear here."
                            testId="attribution-strategies-empty"
                          />
                        </td>
                      </tr>
                    ) : (
                      data.by_strategy.map((s) => {
                        const sPnlTone = pnlTone(s.total_pnl)
                        const sAvgTone = pnlTone(s.avg_pnl)
                        const sWinTone = winRateTone(s.win_rate)
                        const sPfTone = profitFactorTone(s.profit_factor)
                        const sCfg = TONE[sPnlTone]
                        return (
                          <tr
                            key={s.bucket}
                            className="hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)] transition-colors"
                            data-tone={sPnlTone}
                          >
                            <td className="label-col">
                              <div className="flex items-center gap-1.5">
                                <Layers
                                  className="w-3 h-3 text-[var(--accent-fg)] flex-shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="font-medium text-[var(--text-primary)]">
                                  {humanizeBucket(s.bucket)}
                                </span>
                              </div>
                            </td>
                            <td className="text-right text-[#c8cfe0] tabular-nums">
                              {fmtInt(s.count)}
                            </td>
                            <td className={`text-right tabular-nums ${TONE[sWinTone].text}`} data-tone={sWinTone}>
                              {(s.win_rate * 100).toFixed(1)}%
                            </td>
                            <td className={`text-right font-bold tabular-nums ${sCfg.text}`} data-tone={sPnlTone}>
                              {fmtPnl(s.total_pnl)}
                            </td>
                            <td className={`text-right tabular-nums ${TONE[sAvgTone].text}`} data-tone={sAvgTone}>
                              {fmtPnl(s.avg_pnl)}
                            </td>
                            <td className={`text-right tabular-nums ${TONE[sPfTone].text}`} data-tone={sPfTone}>
                              {typeof s.profit_factor === 'number'
                                ? s.profit_factor.toFixed(2)
                                : '∞'}
                            </td>
                            <td className="text-right text-[#c8cfe0] tabular-nums">
                              {fmtUsd(s.capital_deployed)}
                            </td>
                            <td className="text-right text-[var(--text-secondary)] tabular-nums">
                              {fmtHoldingSeconds(s.avg_holding_seconds)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {data.by_strategy.length > 0 && (
                <div className="table-footer tabular-nums">
                  <span>
                    {data.by_strategy.length} strategies • sorted by total P&amp;L
                    desc
                  </span>
                  <span className="mono">
                    Σ {fmtPnl(sumDimensionPnl(data.by_strategy))}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
