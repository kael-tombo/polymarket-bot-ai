// components/PerformanceReportPanel.tsx — Honest Performance Report
//
// W26-2 — Standalone panel that surfaces the bot's honest performance
// metrics SEPARATED BY CATEGORY (backtest / walk-forward / paper / live).
// This is distinct from `AnalyticsPanel`'s embedded `PerformanceReportSection`
// (which shows only the paper + best-backtest rows as a compact strip inside
// the command-center grid). This panel is the dedicated trader-facing view
// that lets the trader click through each category and audit every metric
// the system reports for that slice — with confidence intervals, p-values,
// slippage/fees, and an explicit disclaimer that backtest performance does
// NOT guarantee future results.
//
// Design contract:
//   * 4 category tabs — Backtest | Walk-Forward | Paper Trading | Live.
//     Switching tabs re-renders the metric-card grid + equity curve for
//     the selected category without re-fetching (the whole report is one
//     API response). When a category is "not available" (e.g. live when
//     the bot is still in paper mode), every metric card renders N/A and
//     a small inline pill explains why.
//   * 12 metric cards per category — Win Rate (with 95% Wilson CI +
//     significance p-value), Profit Factor, Expectancy ($/trade), Max
//     Drawdown (%), Sharpe, Sortino, Open Exposure ($), Capital
//     Utilization (%), Avg Slippage (bps), Total Fees ($), # Trades,
//     Statistical Significance. Green for positive, red for negative,
//     neutral grey when not applicable.
//   * Disclaimer banner — ALWAYS rendered (even when the fetch fails or
//     the response shape doesn't validate). The honest-disclosure text
//     is the panel's most important single artefact; the trader must see
//     it whenever the panel mounts.
//   * Equity curve — Recharts `EquityCurveChart` (the existing dark-themed
//     area chart already used by `EquityCurve` / `EquityCurveChart`).
//     Rendered only when the selected category supplies an `equity_curve`
//     array of length ≥ 2.
//   * Auto-refresh — `setInterval` every 30s while the document is visible.
//     Pauses on `visibilitychange` to hidden (matches the workstation's
//     existing polling panels: `useRealtimeData`, `useBot`, etc.).
//
// Backend contract (the panel tolerates a partial / missing response):
//   GET /api/performance/report?XTransformPort=8080
//   → 200 { backtest, walk_forward, paper_trading, live, disclaimer }
//   where each category is a `CategoryMetrics` object. If the backend
//   instead returns the legacy shape (paper_trading as object, others as
//   strings — see `AnalyticsPanel.PerformanceReportSection`), the panel
//   renders the paper_trading object (if present) and shows the string
//   fields under a "raw status" sub-card, with every metric card N/A.

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  Gauge,
  Clock,
  DollarSign,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { StatisticalSignificanceBadge } from '@/components/ui/StatisticalSignificanceBadge'
import {
  AIPredictionLabel,
  NotAGuaranteeInline,
} from '@/components/ai-explainability'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { EquityCurveChart } from '@/components/charts'

// ── Types ─────────────────────────────────────────────────────────────────

export type CategoryId = 'backtest' | 'walk_forward' | 'paper_trading' | 'live'

export interface CategoryMetrics {
  category: CategoryId
  /** Whether this category has data yet (e.g. live=false until enabled). */
  available: boolean
  /** Human-readable reason when `available=false` (e.g. "Live trading not enabled"). */
  unavailable_reason?: string
  win_rate: number | null // 0..1
  /** Wilson 95% CI bounds in 0..1. null when not computable (n<2). */
  win_rate_ci_low: number | null
  win_rate_ci_high: number | null
  profit_factor: number | null
  expectancy: number | null // $/trade
  max_drawdown_pct: number | null // 0..1
  sharpe_ratio: number | null
  sortino_ratio: number | null
  open_exposure: number | null // $ (USDC)
  capital_utilization: number | null // 0..1
  avg_slippage_bps: number | null
  total_fees: number | null // $
  n_trades: number
  /** Binomial-test p-value vs the 50% coin-flip null. null when not computable. */
  p_value: number | null
  is_statistically_significant: boolean
  /** Optional equity-curve series for the chart. */
  equity_curve?: Array<{ timestamp: number; equity: number }>
  /** Optional raw status string (used by the legacy backend shape). */
  raw?: string
}

export interface PerformanceReport {
  backtest: CategoryMetrics
  walk_forward: CategoryMetrics
  paper_trading: CategoryMetrics
  live: CategoryMetrics
  disclaimer: string
}

interface PerformanceReportPanelProps {
  /** Override the refresh interval (ms). Defaults to 30_000. Tests pass 100. */
  refreshIntervalMs?: number
}

// ── Validation ────────────────────────────────────────────────────────────

const CATEGORY_IDS: CategoryId[] = ['backtest', 'walk_forward', 'paper_trading', 'live']

function isCategoryMetrics(d: unknown): d is CategoryMetrics {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return (
    typeof obj.category === 'string' &&
    CATEGORY_IDS.includes(obj.category as CategoryId) &&
    typeof obj.available === 'boolean'
  )
}

function isPerformanceReport(d: unknown): d is PerformanceReport {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return (
    typeof obj.disclaimer === 'string' &&
    isCategoryMetrics(obj.backtest) &&
    isCategoryMetrics(obj.walk_forward) &&
    isCategoryMetrics(obj.paper_trading) &&
    isCategoryMetrics(obj.live)
  )
}

/** Coerce the legacy backend shape (paper_trading as object, others as
 *  strings) into the panel's full `PerformanceReport` contract so the
 *  panel renders something useful even before the backend is upgraded. */
function coerceLegacyShape(d: unknown): PerformanceReport | null {
  if (!d || typeof d !== 'object') return null
  const obj = d as Record<string, unknown>
  if (typeof obj.disclaimer !== 'string') return null
  const paperRaw = obj.paper_trading
  const paper = isCategoryMetrics(paperRaw)
    ? paperRaw
    : makeUnavailable('paper_trading', 'Paper-trading metrics unavailable')
  const stringToCat = (id: CategoryId, val: unknown): CategoryMetrics => {
    if (isCategoryMetrics(val)) return val
    if (typeof val === 'string') {
      return makeUnavailable(id, val)
    }
    return makeUnavailable(id, 'No data')
  }
  return {
    backtest: stringToCat('backtest', obj.backtest),
    walk_forward: stringToCat('walk_forward', obj.walk_forward),
    paper_trading: paper,
    live: stringToCat('live', obj.live),
    disclaimer: obj.disclaimer,
  }
}

function makeUnavailable(category: CategoryId, reason: string): CategoryMetrics {
  return {
    category,
    available: false,
    unavailable_reason: reason,
    win_rate: null,
    win_rate_ci_low: null,
    win_rate_ci_high: null,
    profit_factor: null,
    expectancy: null,
    max_drawdown_pct: null,
    sharpe_ratio: null,
    sortino_ratio: null,
    open_exposure: null,
    capital_utilization: null,
    avg_slippage_bps: null,
    total_fees: null,
    n_trades: 0,
    p_value: null,
    is_statistically_significant: false,
    raw: reason,
  }
}

const FALLBACK_DISCLAIMER =
  '⚠ Backtest performance does NOT guarantee future results. Only paper/live metrics reflect actual system behavior. Win rate target (95%) is aspirational.'

// ── Formatting helpers ────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  return `${(v * 100).toFixed(digits)}%`
}

function fmtUsd(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  const sign = v < 0 ? '−' : ''
  return `${sign}$${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function fmtPnl(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  const sign = v >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  return v.toFixed(digits)
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  return Math.round(v).toLocaleString('en-US')
}

function fmtPValue(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return 'N/A'
  if (p < 0.001) return 'p<0.001'
  return `p=${p.toFixed(3)}`
}

// ────────────────────────────────────────────────────────────────────────────
// W58-b — Premium polish layer (W51-2d / W53-c / W57-a redesign family)
// Self-contained Tone system + sub-components so the performance report
// panel reads as part of the same premium redesign family. All existing
// class names, test contracts (W26-2 — 19 tests), polling cadence (30s),
// API calls, aria-labels, data-testids, and the 'use client' directive
// are preserved verbatim.
// ────────────────────────────────────────────────────────────────────────────

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
  good:    { bg: 'bg-emerald-500/[0.06]',  border: 'border-emerald-500/25',  text: 'text-emerald-400',  bar: 'bg-emerald-500',  dot: 'bg-emerald-400',  label: 'text-emerald-400/80',  halo: 'shadow-emerald-500/10' },
  warn:    { bg: 'bg-amber-500/[0.06]',    border: 'border-amber-500/25',    text: 'text-amber-400',    bar: 'bg-amber-500',    dot: 'bg-amber-400',    label: 'text-amber-400/80',    halo: 'shadow-amber-500/10' },
  poor:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',      bar: 'bg-red-500',      dot: 'bg-red-400',      label: 'text-red-400/80',      halo: 'shadow-red-500/10' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-400',     bar: 'bg-cyan-500',     dot: 'bg-cyan-400',     label: 'text-cyan-400/80',     halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[var(--bg-page)]',          border: 'border-[var(--border)]',      text: 'text-[var(--text-primary)]',    bar: 'bg-[var(--text-secondary)]',    dot: 'bg-[var(--text-secondary)]',    label: 'text-[var(--text-secondary)]',       halo: '' },
}

/** Map the existing MetricCard tone API onto the W58-b Tone palette so the
 *  card border + value text read with the correct colour family:
 *  positive → good (emerald), negative → poor (red), info → info (cyan),
 *  neutral → neutral (slate). */
function metricTone(t: 'positive' | 'negative' | 'neutral' | 'info' | undefined): Tone {
  if (t === 'positive') return 'good'
  if (t === 'negative') return 'poor'
  if (t === 'info') return 'info'
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
// dim italic description + optional trailing node. Mirrors W53-c / W54-a /
// W55-c / W56-a SectionHeader.
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

// KpiTile — refined headline KPI card (tone-tinted bg, Lucide icon in
// label row, 16px tabular-nums value, optional sub hint + quality bar +
// trend glyph). Mirrors the W53-c / W56-a KpiTile pattern.
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

// PolishedEmptyState — Lucide icon + title + helper copy. role=status.
// Used by the unavailable-category card (preserves the
// `category-{X}-unavailable` testid + the unavailable reason text).
function PolishedEmptyState({
  icon: Icon,
  title,
  description,
  testId = 'performance-empty-state',
}: {
  icon: LucideIcon
  title: string
  description?: string
  testId?: string
}) {
  return (
    <div className="empty-state py-8" role="status" data-testid={testId}>
      <Icon className="empty-state-icon text-[var(--text-dim)]" size={32} strokeWidth={1.5} aria-hidden="true" />
      <span className="empty-state-title text-sm font-semibold">{title}</span>
      {description && (
        <span className="empty-state-desc text-xs max-w-sm text-center">{description}</span>
      )}
    </div>
  )
}

// PolishedErrorCard — red-tinted error card with Lucide AlertTriangle +
// the title "Performance report unavailable" + the wrapped error string +
// a Retry button (RefreshCw glyph, calls `onRetry`). role=alert. Rendered
// alongside the existing `report-error` badge so the W26-2 test contract
// (`getByTestId('report-error')` + text content match) continues to
// resolve. Mirrors W54-a / W55-c / W56-a / W57-a ErrorCard.
function PolishedErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="error-state p-6 border border-red-500/30 bg-red-500/[0.06] rounded-md"
      role="alert"
      data-testid="performance-error-card"
    >
      <AlertTriangle className="error-state-icon text-[#f87171]" size={28} aria-hidden="true" />
      <span className="error-state-title text-sm font-semibold">Performance report unavailable</span>
      <span className="error-state-desc text-xs max-w-md break-words mono" data-testid="performance-error-msg">
        {message}
      </span>
      <button
        onClick={onRetry}
        className="mt-2 h-7 text-[10px] gap-1 px-3 py-1 border border-red-500/30 bg-red-500/[0.06] text-red-200 hover:bg-red-500/15 hover:border-red-500/50 hover:text-red-100 rounded transition-colors inline-flex items-center"
        aria-label="Retry performance-report fetch"
        data-testid="performance-error-retry"
      >
        <RefreshCw size={11} className="mr-1.5" />
        Retry
      </button>
    </div>
  )
}

// PerformanceReportSkeleton — structured shimmer placeholder mirroring the
// 12-card metric grid layout. Rendered in place of the metric grid while
// the initial fetch is in-flight (loading=true && report=null). Preserves
// the always-rendered header + disclaimer + tabs so the W26-2 loading-state
// test contracts (`getByText('📈 Honest Performance Report')` +
// `getByTestId('performance-disclaimer')` + the 4 tab testids) still
// resolve. role=status + aria-live=polite.
function PerformanceReportSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
      data-testid="performance-loading-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading performance report…"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="kpi-card space-y-2 border border-[var(--border)] bg-[var(--bg-page)]" aria-hidden="true">
          <div className="flex items-center justify-between">
            <ShimmerBlock className="w-2/5" />
            <ShimmerBlock className="w-4 !h-4 !rounded-full" />
          </div>
          <div className="h-5 rounded-sm skeleton-line-md" />
          <ShimmerBlock className="w-3/5" />
          <div className="h-1 rounded-full skeleton-line-sm" />
        </div>
      ))}
    </div>
  )
}

// ── Confidence interval range bar ─────────────────────────────────────────
// A tiny horizontal bar showing the 95% CI relative to the full [0,1]
// range. Used as a visual companion to the textual CI display so the
// trader can glance at how tight / loose the interval is.

function CIRangeBar({
  low,
  high,
  point,
}: {
  low: number | null
  high: number | null
  point: number | null
}) {
  // Cannot render a meaningful bar without both bounds.
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) {
    return null
  }
  const lo = Math.max(0, Math.min(1, low))
  const hi = Math.max(0, Math.min(1, high))
  const leftPct = lo * 100
  const widthPct = Math.max(2, (hi - lo) * 100) // min 2% so it's visible
  const pt = point != null && Number.isFinite(point)
    ? Math.max(0, Math.min(1, point)) * 100
    : null
  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-[var(--border)] mt-1"
      role="img"
      aria-label={`95% confidence interval from ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}%`}
      data-testid="ci-range-bar"
    >
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: 'linear-gradient(90deg, rgba(74,222,128,0.6), rgba(74,222,128,0.85))',
        }}
      />
      {pt != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 rounded-full bg-[var(--text-primary)]"
          style={{ left: `${pt}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  /** 'positive' | 'negative' | 'neutral' — controls the value colour. */
  tone?: 'positive' | 'negative' | 'neutral' | 'info'
  /** Optional CI range bar (win-rate card only). */
  ciBar?: React.ReactNode
  /** Optional badge (e.g. "Significant" / "Not significant"). */
  badge?: React.ReactNode
  testId?: string
}

function MetricCard({
  label,
  value,
  sub,
  tone = 'neutral',
  ciBar,
  badge,
  testId,
}: MetricCardProps) {
  // W58-b — map the existing tone API onto the W58-b Tone palette so the
  // card border + value text + label read with the correct colour family.
  const t = metricTone(tone)
  const cfg = TONE[t]
  return (
    <Card
      className={`bg-[var(--bg-surface)] border ${cfg.border} ${cfg.bg} shadow-sm p-3 gap-2 rounded-md transition-colors hover:shadow-md`}
      data-testid={testId ?? 'metric-card'}
      data-card-type="metric"
      data-tone={t}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.label}`}>
          {label}
        </span>
        {badge}
      </div>
      <div className={`mono text-base font-bold tabular-nums ${cfg.text}`} data-testid="metric-value">
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--text-secondary)] leading-tight tabular-nums">{sub}</div>}
      {ciBar}
    </Card>
  )
}

// ── Category metrics grid ─────────────────────────────────────────────────

function CategoryMetricsGrid({
  metrics,
  testIdPrefix,
  loading = false,
}: {
  metrics: CategoryMetrics
  testIdPrefix: string
  loading?: boolean
}) {
  // W58-b — When the initial fetch is in-flight (loading=true && no report
  // yet), render the structured shimmer skeleton in place of the metric
  // grid. The activeMetrics is `makeUnavailable(...)` during loading, but
  // we don't want to flash the "unavailable" empty state before the first
  // fetch resolves. The skeleton mirrors the 12-card grid layout so the
  // panel doesn't visually jump when the data lands.
  if (loading) {
    return <PerformanceReportSkeleton />
  }

  // When the category is unavailable, render a polished empty-state card
  // (Lucide Clock icon + the unavailable reason as the title) instead of
  // the 12-metric grid. The disclaimer banner above still reminds the
  // trader that paper/live are the only categories that reflect actual
  // system behavior. Preserves the `category-{X}-unavailable` testid +
  // the unavailable-reason text so the W26-2 test contract resolves.
  if (!metrics.available) {
    return (
      <PolishedEmptyState
        icon={Clock}
        title={metrics.unavailable_reason ?? 'No data available for this category yet.'}
        description="Switch to a category with available data, or wait for the bot to publish metrics for this slice."
        testId={`${testIdPrefix}-unavailable`}
      />
    )
  }

  const winRate = metrics.win_rate
  const ciLow = metrics.win_rate_ci_low
  const ciHigh = metrics.win_rate_ci_high
  const winRateDisplay =
    winRate != null
      ? `${fmtPct(winRate)} [${fmtPct(ciLow, 1)}, ${fmtPct(ciHigh, 1)}]`
      : 'N/A'
  const isSignificant = metrics.is_statistically_significant
  const pValueStr = fmtPValue(metrics.p_value)

  // Colour-code expectancy / profit factor / sharpe by sign.
  const expectancyTone =
    metrics.expectancy == null
      ? 'neutral'
      : metrics.expectancy >= 0
        ? 'positive'
        : 'negative'
  const profitFactorTone =
    metrics.profit_factor == null
      ? 'neutral'
      : metrics.profit_factor >= 1
        ? 'positive'
        : 'negative'
  const sharpeTone =
    metrics.sharpe_ratio == null
      ? 'neutral'
      : metrics.sharpe_ratio >= 1
        ? 'positive'
        : metrics.sharpe_ratio >= 0
          ? 'info'
          : 'negative'
  const sortinoTone =
    metrics.sortino_ratio == null
      ? 'neutral'
      : metrics.sortino_ratio >= 1
        ? 'positive'
        : metrics.sortino_ratio >= 0
          ? 'info'
          : 'negative'

  // W58-b — Headline KPI strip tones (mapped onto the W58-b Tone palette).
  const totalReturn = metrics.expectancy != null
    ? metrics.expectancy * metrics.n_trades
    : null
  const totalReturnTone: Tone =
    totalReturn == null ? 'neutral' : totalReturn >= 0 ? 'good' : 'poor'
  const headlineSharpeTone: Tone =
    metrics.sharpe_ratio == null
      ? 'neutral'
      : metrics.sharpe_ratio >= 1
        ? 'good'
        : metrics.sharpe_ratio >= 0
          ? 'info'
          : 'poor'
  const headlineWinRateTone: Tone =
    metrics.win_rate == null
      ? 'neutral'
      : metrics.win_rate >= 0.5
        ? 'good'
        : 'warn'
  const headlineExpectancyTone: Tone =
    metrics.expectancy == null
      ? 'neutral'
      : metrics.expectancy >= 0
        ? 'good'
        : 'poor'

  return (
    <>
      {/* W58-b — SectionHeader above the metric grid (icon + uppercase
          title + trailing n-trades count). */}
      <SectionHeader
        icon={BarChart3}
        title="Performance Metrics"
        tone="info"
        description="12 metrics · 95% CI · p-value"
        trailing={`${metrics.n_trades} trades`}
      />

      {/* W58-b — Headline KPI strip: 4 KpiTile cards (Total Return,
          Sharpe, Win Rate, Expectancy). Tone-tinted bg + Lucide icon +
          tabular-nums value + optional quality bar. These are ADDITIVE
          to the 12-card metric grid below — they do NOT carry
          `data-card-type="metric"` so the W26-2 test contract
          (`cards.length === 12`) continues to resolve. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2 mb-1">
        <KpiTile
          label="Total Return"
          value={fmtPnl(totalReturn)}
          hint={`${metrics.n_trades} trades`}
          tone={totalReturnTone}
          icon={DollarSign}
          trend={totalReturn != null && totalReturn >= 0 ? 'up' : 'down'}
          testId={`${testIdPrefix}-headline-return`}
        />
        <KpiTile
          label="Sharpe"
          value={fmtNum(metrics.sharpe_ratio)}
          hint="Risk-adjusted"
          tone={headlineSharpeTone}
          icon={Gauge}
          testId={`${testIdPrefix}-headline-sharpe`}
        />
        <KpiTile
          label="Win Rate"
          value={fmtPct(metrics.win_rate)}
          hint={`${metrics.n_trades} trades`}
          tone={headlineWinRateTone}
          icon={Target}
          quality={metrics.win_rate != null ? metrics.win_rate * 100 : 0}
          testId={`${testIdPrefix}-headline-winrate`}
        />
        <KpiTile
          label="Expectancy"
          value={fmtPnl(metrics.expectancy)}
          hint="Per trade"
          tone={headlineExpectancyTone}
          icon={Activity}
          trend={metrics.expectancy != null && metrics.expectancy >= 0 ? 'up' : 'down'}
          testId={`${testIdPrefix}-headline-expectancy`}
        />
      </div>

      {/* 12-metric grid (preserves `data-testid={testIdPrefix + '-grid'}` +
          `data-card-type="metric"` on each card so the W26-2 test contract
          `cards.length === 12` resolves). */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        data-testid={`${testIdPrefix}-grid`}
      >
      <MetricCard
        label="Win Rate (95% CI)"
        value={winRateDisplay}
        sub={`n=${metrics.n_trades} · ${pValueStr}`}
        tone={winRate != null && winRate >= 0.5 ? 'positive' : 'negative'}
        ciBar={<CIRangeBar low={ciLow} high={ciHigh} point={winRate} />}
        testId={`${testIdPrefix}-winrate`}
      />
      <MetricCard
        label="Profit Factor"
        value={fmtNum(metrics.profit_factor)}
        sub="Gross wins / Gross losses"
        tone={profitFactorTone}
        testId={`${testIdPrefix}-profit-factor`}
      />
      <MetricCard
        label="Expectancy"
        value={fmtPnl(metrics.expectancy)}
        sub="Per-trade expectancy"
        tone={expectancyTone}
        testId={`${testIdPrefix}-expectancy`}
      />
      <MetricCard
        label="Max Drawdown"
        value={fmtPct(metrics.max_drawdown_pct)}
        sub="Peak-to-trough excursion"
        tone="negative"
        testId={`${testIdPrefix}-max-dd`}
      />
      <MetricCard
        label="Sharpe Ratio"
        value={fmtNum(metrics.sharpe_ratio)}
        sub="Risk-adjusted return"
        tone={sharpeTone}
        testId={`${testIdPrefix}-sharpe`}
      />
      <MetricCard
        label="Sortino Ratio"
        value={fmtNum(metrics.sortino_ratio)}
        sub="Downside-adjusted return"
        tone={sortinoTone}
        testId={`${testIdPrefix}-sortino`}
      />
      <MetricCard
        label="Open Exposure"
        value={fmtUsd(metrics.open_exposure)}
        sub="Capital in open positions"
        tone="info"
        testId={`${testIdPrefix}-exposure`}
      />
      <MetricCard
        label="Capital Utilization"
        value={fmtPct(metrics.capital_utilization)}
        sub="Risk budget consumed"
        tone={
          metrics.capital_utilization == null
            ? 'neutral'
            : metrics.capital_utilization > 0.9
              ? 'negative'
              : 'info'
        }
        testId={`${testIdPrefix}-cap-util`}
      />
      <MetricCard
        label="Avg Slippage"
        value={metrics.avg_slippage_bps == null ? 'N/A' : `${metrics.avg_slippage_bps.toFixed(1)} bps`}
        sub="Realized vs quoted mid"
        tone={
          metrics.avg_slippage_bps == null
            ? 'neutral'
            : metrics.avg_slippage_bps > 5
              ? 'negative'
              : 'info'
        }
        testId={`${testIdPrefix}-slippage`}
      />
      <MetricCard
        label="Total Fees"
        value={fmtUsd(metrics.total_fees)}
        sub="Cumulative paid"
        tone="neutral"
        testId={`${testIdPrefix}-fees`}
      />
      <MetricCard
        label="Number of Trades"
        value={fmtInt(metrics.n_trades)}
        sub="Closed positions counted"
        tone="neutral"
        testId={`${testIdPrefix}-n-trades`}
      />
      <MetricCard
        label="Statistical Significance"
        value={isSignificant ? 'Significant' : 'Not significant'}
        sub={pValueStr}
        tone={isSignificant ? 'positive' : 'negative'}
        badge={
          <Badge
            variant={isSignificant ? 'success' : 'warning'}
            className="text-[9px] py-0.5"
            data-testid={`${testIdPrefix}-significance-badge`}
          >
            {isSignificant ? '✓ sig' : '✗ ns'}
          </Badge>
        }
        testId={`${testIdPrefix}-significance`}
      />
    </div>
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────

export function PerformanceReportPanel({
  refreshIntervalMs = 30_000,
}: PerformanceReportPanelProps) {
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<CategoryId>('paper_trading')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const fetchReport = useCallback(async () => {
    try {
      const res = await apiFetch('/api/performance/report')
      if (!res.ok) {
        setError(`HTTP ${res.status}`)
        setLoading(false)
        return
      }
      const json: unknown = await res.json()
      // Accept either the new typed shape or the legacy shape (paper object +
      // others as strings). `coerceLegacyShape` returns null only when the
      // response doesn't even have a `disclaimer` string — in which case we
      // fall back to a fully-unavailable report so the panel still renders
      // the metric grid skeleton with N/A values + the always-on disclaimer.
      let next: PerformanceReport | null = null
      if (isPerformanceReport(json)) {
        next = json
      } else {
        next = coerceLegacyShape(json)
      }
      if (!next) {
        next = {
          backtest: makeUnavailable('backtest', 'Backtest experiments not yet run'),
          walk_forward: makeUnavailable('walk_forward', 'Walk-forward analysis pending'),
          paper_trading: makeUnavailable('paper_trading', 'Paper-trading metrics unavailable'),
          live: makeUnavailable('live', 'Live trading not enabled'),
          disclaimer: FALLBACK_DISCLAIMER,
        }
      }
      setReport(next)
      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch.
  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Auto-refresh every `refreshIntervalMs` ms while the document is visible.
  // Pauses when the tab is hidden (matches `useRealtimeData` / `useBot`
  // visibility-aware polling conventions).
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (id != null) return
      id = setInterval(fetchReport, refreshIntervalMs)
    }
    const stop = () => {
      if (id != null) {
        clearInterval(id)
        id = null
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    if (typeof document !== 'undefined' && !document.hidden) start()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [fetchReport, refreshIntervalMs])

  const disclaimer = report?.disclaimer ?? FALLBACK_DISCLAIMER
  const activeMetrics =
    report?.[activeCategory] ?? makeUnavailable(activeCategory, 'No data')

  // Equity curve data — adapt to the EquityCurveChart input shape.
  const equityCurve = activeMetrics.equity_curve ?? []
  const hasEquity = equityCurve.length >= 2

  return (
    <div
      className="flex flex-col gap-3 h-full"
      data-testid="performance-report-panel"
    >
      {/* Header (W58-b — PulseDot + Activity icon added before the title;
          the `📈 Honest Performance Report` text + `Per-Category` badge +
          `AIPredictionLabel` are preserved verbatim so the W26-2 test
          contract `getByText('📈 Honest Performance Report')` resolves). */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PulseDot tone="info" />
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="text-sm font-bold text-[var(--text-primary)]">
            📈 Honest Performance Report
          </span>
          <Badge variant="secondary" className="text-[10px] py-0.5">
            Per-Category
          </Badge>
          {/* W39-6 — AI label so the trader remembers the panel surfaces
              AI-derived performance metrics (Sharpe / Sortino are
              model-attributed). */}
          <AIPredictionLabel label="AI Metrics:" hint="model-attributed" size="sm" className="text-[8.5px]" />
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--text-secondary)]">
          {loading && (
            <span className="flex items-center gap-1" data-testid="report-loading">
              <span className="spinner" aria-hidden="true" /> Loading…
            </span>
          )}
          {error && (
            <Badge variant="warning" className="text-[9.5px] py-0.5" data-testid="report-error">
              ⚠ {error}
            </Badge>
          )}
          {!loading && !error && lastUpdated && (
            <span data-testid="report-last-updated" className="tabular-nums">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <Badge variant="success" className="text-[9.5px] py-0.5" data-testid="auto-refresh-badge">
            ⟳ 30s
          </Badge>
        </div>
      </div>

      {/* W39-6 + W58-b — Disclaimer banner. Made MORE prominent: bigger
          font, amber-300 body on amber-50 background, larger icon,
          full-width bordered card, refined border-2 + shadow. Always
          rendered (even when fetch fails) — the honest-disclosure text
          is the panel's most important single artefact. Preserves the
          `performance-disclaimer` testid + the disclaimer text content
          so the W26-2 test contracts resolve. */}
      <div
        className="banner-warning p-4 text-[12px] rounded-md border-2 border-amber-500/50 bg-amber-500/[0.12] flex items-start gap-3 shadow-md shadow-amber-500/10"
        role="alert"
        aria-label="Performance Metrics Disclaimer"
        data-testid="performance-disclaimer"
      >
        <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-bold text-amber-300 mb-1 text-[13px] uppercase tracking-wider">
            ⚠ Performance Metrics Disclaimer
          </div>
          <div className="text-amber-100/90 leading-relaxed">{disclaimer}</div>
        </div>
      </div>

      {/* W58-b — Polished error card with Retry (rendered alongside the
          inline `report-error` badge so the W26-2 test contract
          `getByTestId('report-error')` continues to resolve). Shown only
          when the fetch failed AND no report has loaded yet. */}
      {error && !report && (
        <PolishedErrorCard message={error} onRetry={() => { void fetchReport() }} />
      )}

      {/* Category tabs */}
      <Tabs
        value={activeCategory}
        onValueChange={(v) => setActiveCategory(v as CategoryId)}
        className="w-full"
        data-testid="performance-report-tabs"
      >
        <TabsList className="bg-[var(--bg-page)] border border-[var(--border)]">
          <TabsTrigger value="backtest" data-testid="tab-backtest">
            Backtest
          </TabsTrigger>
          <TabsTrigger value="walk_forward" data-testid="tab-walk-forward">
            Walk-Forward
          </TabsTrigger>
          <TabsTrigger value="paper_trading" data-testid="tab-paper">
            Paper Trading
          </TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">
            Live
          </TabsTrigger>
        </TabsList>

        {/* Render content for each category so the trader can switch
            without the layout flashing — the active one is shown, the
            others are radix-hidden but kept mounted (NOT a real
            performance concern; the data is already in memory). */}
        <TabsContent value={activeCategory} forceMount>
          <div className="mt-3 flex flex-col gap-3">
            {/* W39-6 — Per-category source disclaimer: makes the
                separation between backtest, walk-forward, paper, and
                live data crystal clear. Backtest results are simulated
                on historical data; paper and live reflect actual system
                behavior. Rendered ABOVE the metric grid so the trader
                sees the source before scanning the numbers. */}
            <div
              className="text-[10.5px] rounded-md border px-2.5 py-1.5 flex items-center gap-2"
              data-testid={`category-${activeCategory}-source-banner`}
            >
              <span className="text-[var(--text-secondary)] uppercase tracking-wider font-bold text-[9px]">
                Source:
              </span>
              <span className="mono text-[var(--text-primary)]">
                {activeCategory === 'backtest' && '🔬 Backtest (historical simulation — does NOT reflect live execution)'}
                {activeCategory === 'walk_forward' && '🔁 Walk-Forward (rolling out-of-sample retraining)'}
                {activeCategory === 'paper_trading' && '📝 Paper Trading (simulated execution against live market data)'}
                {activeCategory === 'live' && '🔴 Live Trading (real capital at risk)'}
              </span>
              <span className="ml-auto">
                {/* W39-6 — visible statistical significance verdict. */}
                {activeMetrics.available && (
                  <StatisticalSignificanceBadge
                    pValue={activeMetrics.p_value ?? undefined}
                    n={activeMetrics.n_trades}
                    isSignificant={activeMetrics.is_statistically_significant}
                  />
                )}
              </span>
            </div>

            <CategoryMetricsGrid
              metrics={activeMetrics}
              testIdPrefix={`category-${activeCategory}`}
              loading={loading && !report}
            />

            {/* W39-6 — Permanent NOT A GUARANTEE reminder below the
                metric grid for extra emphasis. Mirrors the disclaimer
                at the top of the panel. */}
            <NotAGuaranteeInline compact />

            {/* Equity curve — only when the category supplies one. */}
            {hasEquity && (
              <Card
                className="bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-3 rounded-md"
                data-testid={`category-${activeCategory}-equity`}
              >
                {/* W58-b — SectionHeader above the equity curve. */}
                <SectionHeader
                  icon={BarChart3}
                  title={`Equity Curve — ${activeCategory.replace('_', ' ')}`}
                  tone="info"
                  description="cumulative equity"
                  trailing={`${activeMetrics.n_trades} trades`}
                />
                <EquityCurveChart
                  data={equityCurve}
                  height={240}
                  baseline={equityCurve[0]?.equity ?? 100}
                />
              </Card>
            )}

            {/* Raw status string fallback (legacy backend shape). */}
            {activeMetrics.raw && !activeMetrics.available && (
              <Card
                className="bg-[var(--bg-surface)] border border-[var(--border)] p-3 rounded-md text-[11px] text-[var(--text-secondary)] leading-relaxed"
                data-testid={`category-${activeCategory}-raw`}
              >
                {activeMetrics.raw}
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default PerformanceReportPanel
