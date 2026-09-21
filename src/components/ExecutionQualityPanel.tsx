// components/ExecutionQualityPanel.tsx — Per-fill Execution Quality Telemetry
//   Exposes the backend execution_quality ledger (slippage / latency /
//   realized-edge) as an institutional-grade execution analytics panel.
//   Backed by GET /api/execution-quality (see core/execution_quality.py).
//
// W55-d polish goals (additive over W38-8):
//   1. KPI strip refactored into shared KpiTile sub-component — small
//      uppercase label, large tabular-nums value, tone-tinted bg, quality
//      bar showing the metric relative to its threshold, and an optional
//      trend glyph. Tone derived from each metric's own thresholds so the
//      trader reads good/warn/poor at a glance.
//   2. NEW shimmer-skeleton loading state — structured `ExecutionSkeleton`
//      that mirrors the loaded layout (header + KPI strip + charts row +
//      worst table + audit table) so the panel doesn't visually jump
//      when the first fetch resolves. `ShimmerBlock` + `skeleton-line-sm`
//      placeholders used throughout.
//   3. NEW polished empty state — friendly Lucide icon (Gauge) + title +
//      dim description, replacing the bare "No fills in window" text.
//   4. Refined metrics tables — uppercase headers, tabular-nums on every
//      numeric column, row-hover accent bar via inset shadow
//      (`hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`). Header
//      row picks up `hover:bg-transparent` so the accent doesn't fire on
//      the header.
//   5. Each section (Slippage Distribution, Latency Timeline, Worst
//      Executions, Per-Fill Quality Audit) now carries a `SectionHeader`
//      with a Lucide icon + uppercase tracking-wider title + optional dim
//      description + optional trailing node.
//   6. Tone-coloured metrics — green for good execution (low slippage,
//      positive edge, fast latency), amber for moderate, red for poor.
//      The `slippageTone` / `latencyTone` / `edgeTone` helpers map each
//      value onto a tone so the KpiTile, table cells, and timeline all
//      share the same colour vocabulary.
//   7. Refined execution timeline/visualization — the latency sparkline
//      now carries tone-aware stroke + a faint baseline gridline + a
//      tone-tinted area-fill. The slippage histogram bar widths animate
//      in with `transition-all duration-300`. Both visualizations expose
//      role="img" + descriptive aria-labels.
//   8. Polished error card with Retry — aligned with the W51-2d MLPanel
//      ErrorState styling (AlertTriangle icon + title direct text node +
//      dim detail + Retry button with RefreshCw glyph). The "Execution
//      Quality Ledger Unreachable" title text is preserved verbatim so
//      the test contract continues to match.
//   9. Refined controls — time-range select carries the same
//      `bg-[#0e1015]` dark styling + cyan focus tint. The manual
//      refresh button uses `btn-ghost btn-sm` with hover-tint. Both
//      controls preserve their existing `aria-label`s.
//
// Test contracts preserved (see ExecutionQualityPanel.test.tsx):
//   * "⚡ Execution Quality" header text remains a direct text node.
//   * "Per-Fill Audit" badge text remains present.
//   * Loading skeleton renders skeleton placeholders (no header text).
//   * "Execution Quality Ledger Unreachable" error title (direct text).
//   * Retry button accessible name matching /retry/i.
//   * Retry click triggers a re-fetch (uses the same `fetchData` callback).
//   * First API call URL contains `/api/execution-quality`.
//   * Empty state text: "No execution-quality records".
//   * All existing class names retained: `.card`, `.card-header`,
//     `.card-title`, `.badge` + `.badge-cyan` / `.badge-dim` /
//     `.badge-green` / `.badge-amber` / `.badge-red`, `.btn` + `.btn-primary`
//     / `.btn-ghost` / `.btn-sm`, `.mono`, `.scrollbar-thin`,
//     `.table-responsive`, `.table-container`, `.data-table`,
//     `.grid-kpi`, `.kpi-card` / `.kpi-label` / `.kpi-value` / `.kpi-sub`,
//     `.skeleton-line` / `.skeleton-line-lg` / `.skeleton-card`,
//     `.empty-state` (+ `-icon` / `-title` / `-desc`),
//     `.banner-warning`.
//   * All existing roles/labels preserved: role=alert on error,
//     aria-label="Time range filter" on the time-range select,
//     aria-label="Refresh execution quality data" on the manual refresh.
//   * The 'use client' directive at the top of the file.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Gauge,
  type LucideIcon,
  RefreshCw,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { fmtAge, fmtPnl, fmtPrice, fmtUsd } from '@/lib/design-tokens'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── Types ────────────────────────────────────────────────────────────────
/** One row of `execution_quality` table — mirrors the SQLite schema in
 * `core/execution_quality.py::register_routes` recent-fills slice. */
export interface ExecutionQualityFill {
  id: number
  timestamp: number // epoch seconds
  order_id: string
  decision_id: string | null
  token_id: string | null
  strategy: string | null
  side: string | null // 'BUY' | 'SELL' | ''
  signal_price: number
  decision_price: number
  submitted_price: number
  best_bid: number | null
  best_ask: number | null
  expected_fill: number
  actual_fill: number
  spread: number | null
  slippage: number // signed: positive = adverse
  slippage_bps: number // signed bps
  latency_ms: number
  realized_edge: number // signed $ per fill
  paper: number // 0/1
  data_json: string | null
}

/** Aggregate stats returned by `get_execution_stats()` under `stats`. */
export interface ExecutionQualityStats {
  count: number
  strategy: string | null
  time_window_seconds: number | null
  avg_slippage_bps: number
  median_slippage_bps: number
  p95_slippage_bps: number
  worst_slippage_bps: number
  avg_latency_ms: number
  avg_realized_edge: number
  total_realized_edge: number
  by_side: { BUY: number; SELL: number }
}

/** Full API response envelope. */
interface ExecutionQualityResponse {
  stats: ExecutionQualityStats
  recent_fills: ExecutionQualityFill[]
}

type TimeRange = '1h' | '24h' | '7d'

const TIME_RANGES: { value: TimeRange; label: string; seconds: number }[] = [
  { value: '1h', label: '1 Hour', seconds: 3600 },
  { value: '24h', label: '24 Hours', seconds: 86400 },
  { value: '7d', label: '7 Days', seconds: 604800 },
]

const POLL_INTERVAL_MS = 15_000
const MAX_FILLS = 200

// ── Tone system (W51-2d MLPanel redesign family) ─────────────────────────
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
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '' },
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtBps(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sign}${Math.abs(v).toFixed(digits)} bps`
}

function fmtMs(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)} ms`
}

/** Slippage tone: <5 bps good, 5–20 bps warn, >20 bps poor. */
function slippageTone(bps: number): Tone {
  const abs = Math.abs(bps)
  if (abs < 5) return 'good'
  if (abs < 20) return 'warn'
  return 'poor'
}

/** Slippage colour: <5 bps green, 5–20 bps amber, >20 bps red. */
function slippageColorClass(bps: number): string {
  return TONE[slippageTone(bps)].text
}

function slippageBadgeClass(bps: number): string {
  const abs = Math.abs(bps)
  if (abs < 5) return 'badge badge-green'
  if (abs < 20) return 'badge badge-amber'
  return 'badge badge-red'
}

/** Latency tone: <50ms good, 50–200ms warn, >200ms poor. */
function latencyTone(ms: number): Tone {
  if (ms < 50) return 'good'
  if (ms < 200) return 'warn'
  return 'poor'
}

/** Realized-edge tone: positive good, near-zero neutral, negative poor. */
function edgeTone(v: number): Tone {
  if (v > 0.001) return 'good'
  if (v < -0.001) return 'poor'
  return 'neutral'
}

function realizedEdgeClass(v: number): string {
  return TONE[edgeTone(v)].text
}

/** Fill-rate tone: ≥95% good, 80–95% warn, <80% poor. */
function fillRateTone(pct: number): Tone {
  if (pct >= 95) return 'good'
  if (pct >= 80) return 'warn'
  return 'poor'
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/** Quality-bar fill [0..100] for a slippage value relative to its
 * thresholds: 0 bps → 100% (perfect), 20 bps → 50%, 40+ bps → 0%. */
function slippageQuality(bps: number): number {
  const abs = Math.abs(bps)
  if (abs <= 0) return 100
  if (abs >= 40) return 0
  return Math.round(100 - (abs / 40) * 100)
}

/** Quality-bar fill [0..100] for a fill rate (0–100%). */
function fillRateQuality(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

/** Bucket slippage (absolute bps) into the 5-bucket histogram. */
interface SlippageBucket {
  label: string
  range: string
  count: number
  tone: Tone
  barClass: string
}

function computeHistogram(fills: ExecutionQualityFill[]): SlippageBucket[] {
  const buckets: SlippageBucket[] = [
    { label: '0–5',   range: 'Excellent',  count: 0, tone: 'good', barClass: 'bg-emerald-500/60' },
    { label: '5–10',  range: 'Good',       count: 0, tone: 'good', barClass: 'bg-emerald-500/40' },
    { label: '10–20', range: 'Acceptable', count: 0, tone: 'warn', barClass: 'bg-amber-500/60' },
    { label: '20–50', range: 'Poor',       count: 0, tone: 'poor', barClass: 'bg-red-500/60' },
    { label: '50+',   range: 'Severe',     count: 0, tone: 'poor', barClass: 'bg-red-500/80' },
  ]
  for (const f of fills) {
    const a = Math.abs(f.slippage_bps ?? 0)
    if (a < 5) buckets[0].count++
    else if (a < 10) buckets[1].count++
    else if (a < 20) buckets[2].count++
    else if (a < 50) buckets[3].count++
    else buckets[4].count++
  }
  return buckets
}

/** Build SVG sparkline path for latency over recent fills (oldest → newest). */
function sparklinePath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = (w - pad * 2) / (values.length - 1)
  return values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = pad + (1 - (v - min) / range) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// ── PulseDot — small status dot with halo + ping animation ──────────────────
function PulseDot({ tone, pulse = true }: { tone: Tone; pulse?: boolean }) {
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

// ── SectionHeader — icon + uppercase title + optional dim description ────────
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
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[10.5px] uppercase tracking-wider font-bold text-[#5a637a]">
        {title}
      </span>
      {description && (
        <span className="text-[9px] text-[#5a637a] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── KpiTile — refined KPI card (large value, tone-tinted bg, quality bar) ────
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  /** Quality bar fill [0..100]. 0 = no bar rendered. */
  quality?: number
  /** Optional trend glyph ('up' | 'down' | 'flat'). */
  trend?: 'up' | 'down' | 'flat'
  icon: LucideIcon
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, icon: Icon, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      title={`${label} — ${hint}`}
    >
      <span className={`kpi-label flex items-center gap-1 ${cfg.label}`}>
        <Icon className="size-2.5" aria-hidden="true" />
        {label}
      </span>
      <span
        className={`kpi-value mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
        data-testid={testId ?? 'execution-kpi-value'}
        data-tone={tone}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-2.5 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-2.5 inline-block" aria-hidden="true" />}
      </span>
      <span className="kpi-sub block text-[8px] text-[#5a637a] mt-0.5 italic truncate">{hint}</span>
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[#1f2335] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  )
}

// ── ShimmerBlock — shimmer skeleton placeholder for loading state ────────────
function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-line-sm ${className}`}
      aria-hidden="true"
    />
  )
}

// ── ExecutionSkeleton — structured loading placeholder mirroring the loaded layout
function ExecutionSkeleton() {
  return (
    <div
      className="card h-full flex flex-col p-3 bg-[#13161e] border border-[#1f2335] shadow-xl space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading execution quality ledger"
      data-testid="execution-skeleton"
    >
      <div className="flex items-center justify-between pb-2 border-b border-[#1f2335]">
        <div className="flex items-center gap-2">
          <Gauge className="size-3.5 text-cyan-400 animate-pulse" aria-hidden="true" />
          <ShimmerBlock className="!w-40 !h-3" />
          <ShimmerBlock className="!w-20 !h-4" />
        </div>
        <div className="flex items-center gap-2">
          <ShimmerBlock className="!w-12 !h-3" />
          <ShimmerBlock className="!w-16 !h-6" />
          <ShimmerBlock className="!w-20 !h-6" />
        </div>
      </div>
      {/* KPI strip */}
      <div className="grid-kpi">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="kpi-card skeleton-card p-2 space-y-1.5 border border-[#1f2335]"
          >
            <ShimmerBlock className="!w-3/4 !h-2" />
            <ShimmerBlock className="!w-full !h-4" />
            <ShimmerBlock className="!w-2/3 !h-2" />
          </div>
        ))}
      </div>
      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="skeleton-card p-3 space-y-2 border border-[#1f2335] rounded-md">
          <ShimmerBlock className="!w-1/2 !h-3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <ShimmerBlock key={i} className="!w-full !h-3" />
          ))}
        </div>
        <div className="skeleton-card p-3 space-y-2 border border-[#1f2335] rounded-md">
          <ShimmerBlock className="!w-1/2 !h-3" />
          <ShimmerBlock className="!w-full !h-20" />
        </div>
      </div>
      {/* Worst executions */}
      <div className="skeleton-card p-3 space-y-2 border border-red-500/15 rounded-md">
        <ShimmerBlock className="!w-1/3 !h-3" />
        {Array.from({ length: 3 }).map((_, i) => (
          <ShimmerBlock key={i} className="!w-full !h-3.5" />
        ))}
      </div>
      {/* Audit table */}
      <div className="skeleton-card p-3 flex-1 space-y-2 border border-[#1f2335] rounded-md">
        <ShimmerBlock className="!w-2/5 !h-3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerBlock key={i} className="!w-full !h-3.5" />
        ))}
      </div>
    </div>
  )
}

// ── PolishedErrorState ──────────────────────────────────────────────────────
function PolishedErrorState({
  detail,
  onRetry,
}: {
  detail?: string | null
  onRetry: () => void
}) {
  return (
    <div
      className="card h-full flex flex-col items-center justify-center p-6 bg-[#13161e] border border-red-500/30 shadow-xl space-y-3"
      role="alert"
      data-testid="execution-error"
    >
      <AlertTriangle className="size-8 text-red-400" aria-hidden="true" />
      <span className="text-sm font-bold text-red-400">Execution Quality Ledger Unreachable</span>
      <p className="text-xs text-[#7e8aaa] max-w-md text-center">
        Could not load per-fill execution quality metrics from{' '}
        <code className="text-[#c8cfe0]">/api/execution-quality</code>.
      </p>
      {detail && (
        <p className="text-[10px] text-[#5a637a] mono max-w-md text-center break-all">{detail}</p>
      )}
      <button
        onClick={onRetry}
        className="btn btn-primary btn-sm mt-2 flex items-center gap-1"
        data-testid="execution-error-retry"
      >
        <RefreshCw className="size-3" aria-hidden="true" /> Retry
      </button>
    </div>
  )
}

// ── PolishedEmptyState ─────────────────────────────────────────────────────
function PolishedEmptyState({
  icon: Icon,
  title,
  desc,
  tone = 'neutral',
}: {
  icon: LucideIcon
  title: string
  desc: string
  tone?: Tone
}) {
  const cfg = TONE[tone]
  return (
    <div
      className="empty-state py-8 flex flex-col items-center gap-2"
      role="status"
    >
      <Icon className={`size-7 ${cfg.text} opacity-60`} aria-hidden="true" />
      <span className="empty-state-title text-sm font-semibold text-[#dde1ed]">{title}</span>
      <span className="empty-state-desc text-xs text-center max-w-xs text-[#7e8aaa]">{desc}</span>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ExecutionQualityPanel() {
  const [data, setData] = useState<ExecutionQualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    const range = TIME_RANGES.find((r) => r.value === timeRange) ?? TIME_RANGES[1]
    const url = `${getApiUrl()}/api/execution-quality?time_window_seconds=${range.seconds}&limit=${MAX_FILLS}`
    try {
      setError(null)
      const res = await apiFetch(url)
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${txt ? ` — ${txt.slice(0, 200)}` : ''}`)
      }
      const json = (await res.json()) as ExecutionQualityResponse
      setData(json)
      setLastUpdated(Date.now())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [timeRange])

  // Initial + range-change fetch
  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  // Polling with document-hidden pause
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      setIsRefreshing(true)
      fetchData()
    }, POLL_INTERVAL_MS)
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        setIsRefreshing(true)
        fetchData()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchData])

  // ── Derived metrics ──────────────────────────────────────────────────────
  const fills = data?.recent_fills ?? []
  const stats = data?.stats

  const derived = useMemo(() => {
    const latencies = fills.map((f) => f.latency_ms ?? 0).filter((v) => Number.isFinite(v))
    const medianLat = median(latencies)
    const totalRealized = stats?.total_realized_edge ?? 0
    const totalFills = stats?.count ?? fills.length
    const buyCount = stats?.by_side?.BUY ?? 0
    const sellCount = stats?.by_side?.SELL ?? 0
    // Fill rate: rows with a valid BUY/SELL side and non-zero actual_fill price.
    const validFills = fills.filter(
      (f) => (f.side === 'BUY' || f.side === 'SELL') && f.actual_fill && f.actual_fill > 0,
    ).length
    const fillRate = fills.length > 0 ? (validFills / fills.length) * 100 : 0
    const histogram = computeHistogram(fills)
    // Worst executions: top 5 by adverse slippage (signed bps desc → most adverse first).
    const worst = [...fills].sort((a, b) => (b.slippage_bps ?? 0) - (a.slippage_bps ?? 0)).slice(0, 5)
    // Latency timeline: most recent 40 fills, oldest → newest for the sparkline.
    const latencyTimeline = [...fills]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-40)
      .map((f) => f.latency_ms ?? 0)
    return {
      medianLat,
      totalRealized,
      totalFills,
      buyCount,
      sellCount,
      fillRate,
      histogram,
      worst,
      latencyTimeline,
    }
  }, [fills, stats])

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading && !data) {
    return <ExecutionSkeleton />
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error && !data) {
    return <PolishedErrorState detail={error} onRetry={() => fetchData()} />
  }

  const avgSlippage = stats?.avg_slippage_bps ?? 0
  const avgSlippageTone = slippageTone(avgSlippage)
  const hasFills = fills.length > 0

  return (
    <div className="card h-full flex flex-col p-3 bg-[#13161e] border border-[#1f2335] shadow-xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="card-header pb-2 mb-3 border-b border-[#1f2335] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="size-3.5 text-cyan-400" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">
            ⚡ Execution Quality
          </span>
          <span className="badge badge-cyan text-[9.5px]">Per-Fill Audit</span>
          {stats?.count != null && (
            <span className="badge badge-dim text-[9.5px]">
              {derived.totalFills} fills · {derived.buyCount}B / {derived.sellCount}S
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-refresh indicator */}
          <span
            className={`flex items-center gap-1 text-[9.5px] mono ${
              isRefreshing ? 'text-cyan-400' : 'text-[#5a637a]'
            }`}
            title={`Auto-refresh every ${POLL_INTERVAL_MS / 1000}s${typeof document !== 'undefined' && document.hidden ? ' — paused (tab hidden)' : ''}`}
            aria-label="Auto-refresh status"
          >
            <PulseDot tone={isRefreshing ? 'info' : 'neutral'} pulse={isRefreshing} />
            {typeof document !== 'undefined' && document.hidden ? 'Paused' : lastUpdated ? fmtAge(lastUpdated / 1000) : '—'}
          </span>

          {/* Manual refresh */}
          <button
            onClick={() => {
              setIsRefreshing(true)
              fetchData()
            }}
            className="btn btn-ghost btn-sm text-[10px] px-2 py-0.5 border border-[#1f2335] text-[#7e8aaa] hover:text-white hover:border-cyan-500/30 hover:bg-cyan-500/[0.04] flex items-center gap-1 transition-colors"
            title="Refresh now"
            aria-label="Refresh execution quality data"
          >
            <RefreshCw className={`size-3 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Refresh
          </button>

          {/* Time-range select */}
          <Select
            value={timeRange}
            onValueChange={(v) => setTimeRange(v as TimeRange)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-[110px] text-[10.5px] bg-[#0e1015] border-[#1f2335] text-[#dde1ed] hover:border-cyan-500/30 focus:ring-cyan-500/20"
              aria-label="Time range filter"
            >
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent className="bg-[#0e1015] border-[#1f2335] text-[#dde1ed]">
              {TIME_RANGES.map((r) => (
                <SelectItem
                  key={r.value}
                  value={r.value}
                  className="text-[10.5px] focus:bg-cyan-500/[0.10] focus:text-cyan-300"
                >
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inline error banner (data present but refresh failed) */}
      {error && data && (
        <div className="banner-warning text-[10.5px] mb-2 py-1.5 px-2.5" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>Refresh failed: {error.slice(0, 160)} — showing last cached data.</span>
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid-kpi mb-3">
        <KpiTile
          icon={TrendingDown}
          label="Avg Slippage"
          value={fmtBps(avgSlippage)}
          hint={`med ${fmtBps(stats?.median_slippage_bps)} · p95 ${fmtBps(stats?.p95_slippage_bps)}`}
          tone={avgSlippageTone}
          quality={slippageQuality(avgSlippage)}
          trend={avgSlippage > 0 ? 'down' : 'up'}
          testId="execution-kpi-slippage"
        />
        <KpiTile
          icon={Clock}
          label="Median Latency"
          value={fmtMs(derived.medianLat)}
          hint={`avg ${fmtMs(stats?.avg_latency_ms)} · signal→fill`}
          tone={latencyTone(derived.medianLat)}
          quality={Math.max(0, Math.min(100, 100 - (derived.medianLat / 200) * 100))}
          testId="execution-kpi-latency"
        />
        <KpiTile
          icon={Target}
          label="Realized Edge"
          value={fmtPnl(derived.totalRealized, 4)}
          hint={`avg ${fmtUsd(stats?.avg_realized_edge, 4)} / fill`}
          tone={edgeTone(derived.totalRealized)}
          trend={derived.totalRealized > 0 ? 'up' : derived.totalRealized < 0 ? 'down' : 'flat'}
          testId="execution-kpi-edge"
        />
        <KpiTile
          icon={Activity}
          label="Fill Rate"
          value={`${derived.fillRate.toFixed(1)}%`}
          hint={`${fills.length} sampled fills`}
          tone={fillRateTone(derived.fillRate)}
          quality={fillRateQuality(derived.fillRate)}
          testId="execution-kpi-fillrate"
        />
        <KpiTile
          icon={Zap}
          label="Total Fills"
          value={derived.totalFills.toLocaleString('en-US')}
          hint={`worst ${fmtBps(stats?.worst_slippage_bps)}`}
          tone={derived.totalFills > 0 ? 'info' : 'neutral'}
          testId="execution-kpi-count"
        />
      </div>

      {/* ── Charts row: histogram + latency timeline ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* Slippage distribution histogram */}
        <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3">
          <SectionHeader
            icon={BarChart3}
            title="Slippage Distribution"
            description="|slippage| bps buckets"
            tone="info"
            trailing={
              <span className="text-[9px] text-[#5a637a] mono">{fills.length} fills</span>
            }
          />
          {hasFills ? (
            <div className="space-y-1.5" role="img" aria-label="Slippage distribution by bucket">
              {derived.histogram.map((b) => {
                const maxCount = Math.max(...derived.histogram.map((x) => x.count), 1)
                const pct = (b.count / maxCount) * 100
                const sharePct = fills.length > 0 ? (b.count / fills.length) * 100 : 0
                return (
                  <div key={b.label} className="flex items-center gap-2 text-[10.5px]">
                    <span className="mono w-12 text-[#7e8aaa] font-bold tabular-nums">{b.label}</span>
                    <div className="flex-1 h-4 bg-[#13161e] rounded-sm overflow-hidden border border-[#1f2335]/60">
                      <div
                        className={`h-full ${b.barClass} transition-all duration-300`}
                        style={{ width: `${Math.max(pct, b.count > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className={`mono w-10 text-right font-bold tabular-nums ${TONE[b.tone].text}`}>{b.count}</span>
                    <span className="mono w-12 text-right text-[9px] text-[#5a637a] tabular-nums">{sharePct.toFixed(0)}%</span>
                    <span className="hidden sm:inline text-[9px] text-[#5a637a] w-16">{b.range}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-6">
              <PolishedEmptyState
                icon={BarChart3}
                title="No fills in window"
                desc="Slippage distribution will populate as orders fill against the paper exchange within the selected time range."
                tone="neutral"
              />
            </div>
          )}
        </div>

        {/* Latency sparkline timeline */}
        <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3">
          <SectionHeader
            icon={Timer}
            title="Latency Timeline"
            description="signal → fill (ms)"
            tone={latencyTone(derived.latencyTimeline.length > 0 ? derived.latencyTimeline[derived.latencyTimeline.length - 1] : 0)}
            trailing={
              <span className="text-[9px] text-[#5a637a] mono">
                last {derived.latencyTimeline.length} fills
              </span>
            }
          />
          {derived.latencyTimeline.length >= 2 ? (
            <div className="relative">
              {(() => {
                const last = derived.latencyTimeline[derived.latencyTimeline.length - 1]
                const min = Math.min(...derived.latencyTimeline)
                const max = Math.max(...derived.latencyTimeline)
                const range = max - min || 1
                const path = sparklinePath(derived.latencyTimeline, 300, 70, 3)
                const lastY = 3 + (1 - (last - min) / range) * (70 - 6)
                const areaPath = `${path} L297,${(70 - 3).toFixed(1)} L3,${(70 - 3).toFixed(1)} Z`
                const liveTone = latencyTone(last)
                const strokeHex =
                  liveTone === 'good' ? '#34d399' : liveTone === 'warn' ? '#fbbf24' : '#f87171'
                const fillId = `latGrad-${liveTone}`
                const fillStop =
                  liveTone === 'good' ? '#34d399' : liveTone === 'warn' ? '#fbbf24' : '#f87171'
                return (
                  <>
                    <svg
                      viewBox="0 0 300 70"
                      className="w-full h-[70px]"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`Latency over the last ${derived.latencyTimeline.length} fills — current ${last.toFixed(0)} ms, range ${min.toFixed(0)}–${max.toFixed(0)} ms`}
                    >
                      <defs>
                        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={fillStop} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={fillStop} stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {/* Grid lines */}
                      {[14, 35, 56].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          y1={y}
                          x2="300"
                          y2={y}
                          stroke="#1f2335"
                          strokeWidth="0.5"
                          strokeDasharray="2 3"
                        />
                      ))}
                      <path d={areaPath} fill={`url(#${fillId})`} />
                      <path
                        d={path}
                        fill="none"
                        stroke={strokeHex}
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="297"
                        cy={lastY.toFixed(1)}
                        r="2.5"
                        fill={strokeHex}
                        stroke="#0e1015"
                        strokeWidth="1"
                      />
                    </svg>
                    <div className="flex items-center justify-between text-[9px] text-[#5a637a] mono mt-1">
                      <span className="tabular-nums">
                        min {min.toFixed(0)}ms
                      </span>
                      <span className={`tabular-nums ${TONE[liveTone].text}`}>
                        now {last.toFixed(0)}ms
                      </span>
                      <span className="tabular-nums">
                        max {max.toFixed(0)}ms
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="py-6">
              <PolishedEmptyState
                icon={Timer}
                title="Not enough fills for timeline"
                desc="At least 2 sampled fills are required to render the latency trend."
                tone="neutral"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Worst executions ────────────────────────────────────────────────── */}
      <div className="bg-[#0e1015] border border-red-500/25 rounded-md p-3 mb-3">
        <SectionHeader
          icon={AlertTriangle}
          title="Worst Executions"
          description="top 5 by adverse slippage"
          tone="poor"
          trailing={
            <span className="text-[9px] text-[#5a637a] mono">{derived.worst.length} of {fills.length}</span>
          }
        />
        {derived.worst.length > 0 ? (
          <div className="table-responsive scrollbar-thin">
            <table className="data-table text-xs w-full" role="table" aria-label="Top 5 worst slippage fills">
              <thead>
                <tr className="text-[#5a637a] text-[10px] uppercase tracking-wider font-bold hover:bg-transparent">
                  <th scope="col" className="text-left min-w-[140px] py-1">Token</th>
                  <th scope="col" className="text-center py-1">Side</th>
                  <th scope="col" className="text-right py-1">Intended</th>
                  <th scope="col" className="text-right py-1">Fill</th>
                  <th scope="col" className="text-right py-1">Slippage</th>
                  <th scope="col" className="text-right py-1">Latency</th>
                  <th scope="col" className="text-right py-1">Edge</th>
                  <th scope="col" className="text-right py-1">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2335]/40">
                {derived.worst.map((f) => (
                  <tr
                    key={`worst-${f.id}`}
                    className="bg-red-500/5 hover:bg-red-500/10 transition-colors hover:shadow-[inset_3px_0_0_0_rgba(239,68,68,0.45)]"
                    data-tone={slippageTone(f.slippage_bps ?? 0)}
                  >
                    <td className="py-1.5 max-w-[200px]">
                      <div className="flex flex-col">
                        <span className="text-[#c8cfe0] font-medium text-[10.5px] truncate" title={f.token_id ?? ''}>
                          {(f.token_id || '—').slice(0, 18)}…
                        </span>
                        <span className="text-[9px] text-[#5a637a] mono">
                          {f.strategy || 'manual'}
                        </span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          f.side === 'BUY'
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {f.side || '—'}
                      </span>
                    </td>
                    <td className="mono text-right text-[#7e8aaa] tabular-nums">{fmtPrice(f.expected_fill)}</td>
                    <td className="mono text-right text-[#c8cfe0] font-bold tabular-nums">{fmtPrice(f.actual_fill)}</td>
                    <td className={`mono text-right font-bold tabular-nums ${slippageColorClass(f.slippage_bps)}`}>
                      {fmtBps(f.slippage_bps)}
                    </td>
                    <td className={`mono text-right tabular-nums ${TONE[latencyTone(f.latency_ms ?? 0)].text}`}>{fmtMs(f.latency_ms)}</td>
                    <td className={`mono text-right font-bold tabular-nums ${realizedEdgeClass(f.realized_edge)}`}>
                      {fmtPnl(f.realized_edge, 4)}
                    </td>
                    <td className="mono text-right text-[#5a637a] text-[10px] tabular-nums">{fmtAge(f.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-4">
            <PolishedEmptyState
              icon={AlertTriangle}
              title="No fills recorded in this window"
              desc="Worst-execution outliers will surface here as adverse slippage events occur."
              tone="neutral"
            />
          </div>
        )}
      </div>

      {/* ── Full execution-quality table ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <SectionHeader
          icon={Gauge}
          title="Per-Fill Quality Audit"
          description="signed slippage · latency · realized edge"
          tone="info"
          trailing={
            <span className="text-[9px] text-[#5a637a] mono">
              {fills.length} of {derived.totalFills} fills shown
            </span>
          }
        />
        <div className="overflow-auto scrollbar-thin flex-1 table-container border border-[#1f2335] rounded-md">
          {hasFills ? (
            <table className="data-table text-xs" role="table" aria-label="Per-fill execution quality log">
              <thead>
                <tr className="text-[#5a637a] text-[10px] uppercase tracking-wider font-bold hover:bg-transparent sticky top-0 bg-[#0e1015] z-10">
                  <th scope="col" className="text-left min-w-[160px] py-1">Token / Strategy</th>
                  <th scope="col" className="text-center py-1">Side</th>
                  <th scope="col" className="text-right py-1">Intended</th>
                  <th scope="col" className="text-right py-1">Fill</th>
                  <th scope="col" className="text-right py-1">Slippage (bps)</th>
                  <th scope="col" className="text-right py-1">Latency (ms)</th>
                  <th scope="col" className="text-right py-1">Realized Edge</th>
                  <th scope="col" className="text-center py-1">Mode</th>
                  <th scope="col" className="text-right py-1">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2335]/40">
                {fills.map((f) => (
                  <tr
                    key={f.id}
                    className="hover:bg-cyan-500/[0.06] transition-colors hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]"
                    data-tone={slippageTone(f.slippage_bps ?? 0)}
                  >
                    <td className="py-1.5 max-w-[220px]">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[10px] text-cyan-400 font-bold truncate"
                          title={f.token_id ?? ''}
                        >
                          {(f.token_id || '—').slice(0, 22)}
                        </span>
                        <span className="text-[9px] text-[#5a637a] mono">
                          {f.strategy || 'manual'}
                        </span>
                      </div>
                    </td>
                    <td className="text-center">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          f.side === 'BUY'
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : f.side === 'SELL'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-[#1f2335] text-[#7e8aaa] border border-[#1f2335]'
                        }`}
                      >
                        {f.side || '—'}
                      </span>
                    </td>
                    <td className="mono text-right text-[#7e8aaa] tabular-nums">{fmtPrice(f.expected_fill)}</td>
                    <td className="mono text-right text-[#c8cfe0] font-bold tabular-nums">{fmtPrice(f.actual_fill)}</td>
                    <td className="text-right">
                      <span className={slippageBadgeClass(f.slippage_bps)}>
                        {fmtBps(f.slippage_bps)}
                      </span>
                    </td>
                    <td className={`mono text-right tabular-nums ${TONE[latencyTone(f.latency_ms ?? 0)].text}`}>{fmtMs(f.latency_ms)}</td>
                    <td
                      className={`mono text-right font-bold tabular-nums flex items-center justify-end gap-0.5 ${
                        realizedEdgeClass(f.realized_edge)
                      }`}
                    >
                      {f.realized_edge > 0 ? (
                        <TrendingUp className="size-2.5" aria-hidden="true" />
                      ) : f.realized_edge < 0 ? (
                        <TrendingDown className="size-2.5" aria-hidden="true" />
                      ) : null}
                      {fmtPnl(f.realized_edge, 4)}
                    </td>
                    <td className="text-center">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          f.paper
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                            : 'bg-red-500/10 text-red-400 border border-red-500/25'
                        }`}
                      >
                        {f.paper ? 'PAPER' : 'LIVE'}
                      </span>
                    </td>
                    <td className="mono text-right text-[#5a637a] text-[10px] tabular-nums">{fmtAge(f.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <PolishedEmptyState
              icon={Gauge}
              title="No execution-quality records"
              desc="Slippage, latency, and realized-edge metrics will appear here as orders fill against the paper exchange."
              tone="neutral"
            />
          )}
        </div>
      </div>
    </div>
  )
}
