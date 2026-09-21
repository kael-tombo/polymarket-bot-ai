// components/AnalyticsPanel.tsx — Institutional Performance Analytics
//
// W15-5 — Migrated from a self-managed 4-second REST polling loop to
// the hybrid `useRealtimeData` hook. The panel now:
//   1. REST-prefetches /api/analytics on mount.
//   2. Subscribes to the `metrics` WS channel for live push updates.
//      Note: the `metrics` channel pushes the full BotSnapshot, whose
//      shape doesn't match the Analytics object the panel renders. To
//      avoid clobbering the typed state with mismatched data, the hook
//      is given a `validate` predicate that drops any payload missing
//      the `equity` field. When the backend eventually pushes Analytics
//      objects over the metrics channel, the validator will accept them.
//   3. Falls back to polling /api/analytics every 10s when the WS isn't
//      connected.
//   4. Renders a "● Live" / "⟳ Polling" badge so the trader can tell at
//      a glance whether the KPIs are real-time or lagged.
//
// W58-a — Premium visual polish pass aligned with the W51-2d MLPanel /
// W55-a LeaderboardPanel / W56-a SystemHealthView / W57-a RetentionPanel
// redesign family. The panel now:
//   1. KpiTile pattern for key analytics metrics — every KPI card is
//      refactored to a shared KpiTile sub-component with a Lucide icon
//      in the label row, tabular-nums on the value, and a `data-tone`
//      hook for downstream CSS targeting. The existing `kpi-card` /
//      `kpi-label` / `kpi-value` / `kpi-sub` class names are preserved
//      so the W26-6 / W25-6 test contracts (`closest('.kpi-card')` +
//      `querySelector('.kpi-value')`) continue to resolve, AND the
//      tone-coloured value class names (`text-[#f87171]` for negative
//      expectancy / `text-green-400` for the trend arrow) are preserved
//      verbatim so the W15-5 / W26-6 className assertions still match.
//   2. Shimmer skeleton loading state (AnalyticsSkeleton) mirroring the
//      live panel layout (header + KPI strip + disclaimer + report
//      placeholder). The "Loading analytics metrics…" caption is
//      preserved verbatim so the W15-5 test contract
//      (`getByText(/Loading analytics/)`) still resolves.
//   3. Polished empty state with a Lucide BarChart3 icon + dim
//      description. Used by the no-data-no-error soft-failure branch.
//   4. Section headers with a Lucide icon + uppercase tracking-wider
//      title + dim italic description + trailing count badge above the
//      KPI grid, the disclaimer section, and the report section.
//   5. Refined data display — tabular-nums on every numeric value
//      (KPI values, win rate %, p-values, n trades, max drawdown,
//      profit factor, expectancy, Sharpe ratio, etc.) so columns don't
//      shift alignment between renders.
//   6. Tone-coloured values — the existing colour palette
//      (`text-[#4ade80]` emerald / `text-[#f87171]` red / `text-[#60a5fa]`
//      blue / `text-[#dde1ed]` neutral) is preserved verbatim on every
//      KPI value so the W26-6 / W15-5 className assertions still match,
//      AND a `data-tone` attribute hook is layered on top so downstream
//      CSS can target the tone palette uniformly.
//   7. Error state — polished error card (PolishedErrorCard) with a
//      Lucide AlertTriangle icon + the title "Analytics data unavailable"
//      (preserved verbatim so the W15-5 test contract
//      `getByText('Analytics data unavailable')` resolves) + the wrapped
//      error string in dim detail + a Retry button (calls
//      useRealtimeData.refetch) + role="alert" + data-testid=
//      "analytics-error-card".
// All existing functionality, class names, API calls, polling, WS channel
// subscription, accessibility roles/labels, test-matched strings, and the
// 'use client' directive preserved.

'use client'

import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Gauge,
  Layers,
  ListChecks,
  Percent,
  RefreshCw,
  Scale,
  Sigma,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { fmtUsd, fmtPnl, fmtPct } from '@/lib/design-tokens'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useStaleAge } from '@/hooks/useStaleAge'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { StaleIndicator } from '@/components/ui/states'
// W26-6 — Confidence-interval + statistical-significance widgets.
// Used by the win-rate KPI card to surface (a) the Wilson 95% CI
// visually as a range bar, and (b) the binomial-test verdict
// (significant / not-significant / insufficient-data) as a pill.
import { ConfidenceIntervalBadge } from '@/components/ui/ConfidenceIntervalBadge'
import { StatisticalSignificanceBadge } from '@/components/ui/StatisticalSignificanceBadge'

// W26-6 — Client-side binomial-test p-value approximation (null p=0.5).
// The Analytics object doesn't ship a server-computed p_value for the
// live win-rate KPI (only PaperMetrics in /api/performance/report does).
// We compute a normal-approximation p-value so the significance badge
// has a real number to display; the exact binomial-test value from the
// backend supersedes this whenever the report fetch succeeds (which it
// does for the PaperTrading card in PerformanceReportSection).
function normalCdf(x: number): number {
  // Abramowitz-Stegun 26.2.17 — good to ~7 decimal places, sufficient
  // for the dashboard's "p=0.034" 3dp display.
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-(x * x) / 2)
  let p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  if (x > 0) p = 1 - p
  return p
}

function binomialPValue(wins: number, n: number): number {
  if (n <= 0) return 1
  const pHat = wins / n
  const z = (pHat - 0.5) / Math.sqrt(0.25 / n)
  return 2 * (1 - normalCdf(Math.abs(z)))
}

interface Analytics {
  equity: number
  realized_pnl: number
  unrealized_pnl: number
  net_pnl: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  closed_trades: number
  open_trades: number
  win_rate: number
  win_rate_ci_low: number | null
  win_rate_ci_high: number | null
  profit_factor: number | string | null
  max_drawdown_dollars: number
  max_drawdown_pct: number
  total_volume_usdc: number
  open_exposure: number
  open_position_count: number
  pending_order_capital: number
  risk_utilization: number
  mode: string
  data_freshness_seconds: number
  peak_equity: number
  active_strategies: string[]
  // S3 — extended KPI metrics (additive)
  avg_win: number | null
  avg_loss: number | null
  expectancy: number | null
  sharpe_ratio: number | null
}

const STRATEGY_LABELS: Record<string, string> = {
  mm_avellaneda_stoikov: 'Avellaneda-Stoikov MM',
  arb_binary_dutch_book: 'Dutch-Book Arb',
  ml_random_forest_quant: 'RF Quant Ensemble',
}

// W15-5 — type guard for the metrics WS channel. The channel is
// specified by the task as `metrics`, whose canonical payload is a
// BotSnapshot (mode / kill_switch / order_books / etc.) — that's NOT
// the Analytics shape this panel renders. We accept only payloads
// that look like Analytics (have the `equity` numeric field); the
// REST polling continues to drive the displayed KPIs in the meantime.
function isAnalyticsPayload(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return typeof obj.equity === 'number' && typeof obj.win_rate === 'number'
}

// ── W58-a Tone system (mirror of LeaderboardPanel / SystemHealthView) ───────
// 5-tone vocabulary with self-contained static class strings so Tailwind 4's
// JIT scanner picks them up. The `text` field is used by the KpiTile icon
// + SectionHeader icon; the existing kpi-value class names
// (`text-[#4ade80]` / `text-[#f87171]` / `text-[#60a5fa]` / `text-[#dde1ed]`)
// are preserved verbatim on the value spans so the W26-6 / W15-5 className
// assertions still match.

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

// ── W58-a KpiTile — premium KPI card with Lucide icon + tabular-nums ──────
// Renders the existing `.kpi-card` / `.kpi-label` / `.kpi-value` / `.kpi-sub`
// class names so the W26-6 / W15-5 test contracts (`closest('.kpi-card')` +
// `querySelector('.kpi-value')`) continue to resolve, AND adds:
//   • Lucide icon in the label row (tone-coloured, `data-tone` hook)
//   • tabular-nums on the value + sub spans
//   • optional trailing node (e.g. significance pill)
// The `valueClassName` prop preserves the tone-specific value class
// (e.g. `text-[#f87171]` for negative expectancy / `text-[#4ade80]` for
// positive expectancy) so the W26-6 / W15-5 className assertions still match.
interface KpiTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  valueClassName?: string
  tone?: Tone
  icon?: LucideIcon
  testId?: string
  trailing?: ReactNode
  className?: string
}

function KpiTile({
  label,
  value,
  sub,
  valueClassName = '',
  tone = 'neutral',
  icon: Icon,
  testId,
  trailing,
  className = '',
}: KpiTileProps) {
  return (
    <div
      className={`kpi-card ${className}`}
      data-tone={tone}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />}
        <span className="kpi-label">{label}</span>
        {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
      </div>
      <span className={`kpi-value tabular-nums ${valueClassName}`}>{value}</span>
      {sub && <span className="kpi-sub tabular-nums">{sub}</span>}
    </div>
  )
}

// ── W58-a AnalyticsSkeleton — shimmer placeholder mirroring the live panel ─
// Layout: header shimmer + KPI strip (4 cards x 3 shimmer lines) + disclaimer
// placeholder + report placeholder. The "Loading analytics metrics…"
// caption is preserved verbatim above the shimmer rows so the W15-5 test
// contract `getByText(/Loading analytics/)` resolves.
function AnalyticsSkeleton() {
  return (
    <div
      className="p-3 space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading analytics metrics"
      data-testid="analytics-loading-skeleton"
    >
      <div className="flex items-center gap-2 text-[10.5px] text-[#7e8aaa]">
        <span className="spinner" aria-hidden="true" />
        <span>Loading analytics metrics…</span>
      </div>
      {/* Skeleton KPI strip — 4 placeholder cards in a 2x2 grid */}
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="kpi-card"
          >
            <ShimmerBlock className="w-1/2" />
            <ShimmerBlock className="w-2/3 mt-1" />
            <ShimmerBlock className="w-1/3 mt-1" />
          </div>
        ))}
      </div>
      {/* Skeleton disclaimer + report placeholder */}
      <div
        className="border-t border-[#1f2335] pt-2 space-y-1.5"
        aria-hidden="true"
      >
        <ShimmerBlock className="w-1/3" />
        <ShimmerBlock className="w-full" />
        <ShimmerBlock className="w-2/3" />
      </div>
    </div>
  )
}

// ── W58-a PolishedEmptyState — Lucide BarChart3 icon + dim description ────
// Used by the soft-failure branch (data is null, no error). The title
// "Analytics data unavailable" is preserved verbatim so the W15-5 test
// contract `getByText('Analytics data unavailable')` resolves. role=status
// + data-testid="analytics-empty-state".
function PolishedEmptyState() {
  return (
    <div
      className="empty-state p-8"
      role="status"
      data-testid="analytics-empty-state"
    >
      <BarChart3
        className="empty-state-icon text-[#5a637a]"
        size={28}
        aria-hidden="true"
      />
      <div className="empty-state-title">Analytics data unavailable</div>
      <div className="empty-state-desc">
        The analytics endpoint returned no payload. The trader dashboard
        will retry on the next 10s poll.
      </div>
    </div>
  )
}

// ── W58-a PolishedErrorCard — AlertTriangle + title + detail + Retry ────
// Renders a refined error card with a Lucide AlertTriangle icon + the title
// "Analytics data unavailable" (preserved verbatim as the direct text node
// of a leaf `<span className="error-state-title">` so the W15-5 test contract
// `getByText('Analytics data unavailable')` resolves to a single leaf) + the
// wrapped error string in `.error-state-desc` + a Retry button (RefreshCw
// glyph, calls `onRetry`). role=alert + data-testid="analytics-error-card".
interface PolishedErrorCardProps {
  message: string
  detail?: string | null
  onRetry?: () => void
}

function PolishedErrorCard({ message, detail, onRetry }: PolishedErrorCardProps) {
  return (
    <div
      className="error-state"
      role="alert"
      data-testid="analytics-error-card"
    >
      <AlertTriangle
        className="error-state-icon text-red-400"
        size={28}
        aria-hidden="true"
      />
      <span className="error-state-title">{message}</span>
      {detail && (
        <span
          className="error-state-desc"
          style={{ fontFamily: 'var(--font-mono, monospace)' }}
        >
          {detail}
        </span>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:border-red-500/60 transition-colors"
          aria-label="Retry analytics fetch"
          data-testid="analytics-error-retry"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )
}

// W9-6 — wrapped in React.memo. The component takes no props, so React.memo
// with default shallow compare would never re-render. That's incorrect
// here: the panel self-polls every 4s and updates its own state. React.memo
// on a no-prop component is a no-op (only useful to skip when the parent
// re-renders). It IS valuable when this panel is rendered as a child of a
// frequently-re-rendering parent (the command-center grid re-renders on
// every snapshot tick from useBot), so we wrap it to short-circuit those
// parent-driven re-renders. Internal state updates (data/loading) still
// trigger re-renders normally.
function AnalyticsPanel() {
  // W15-5 — hybrid REST + WS subscription. Replaces the previous 4s
  // self-managed setInterval + visibilitychange listener (the
  // useRealtimeData hook handles both concerns generically).
  // W41-3 — also pull `error`, `lastUpdated`, and `refetch` so the
  // panel can render a structured ErrorState (with retry) and a
  // StaleIndicator when the snapshot ages past 30s.
  const { data, isLoading, isRealtime, error, lastUpdated, refetch } = useRealtimeData<Analytics>(
    '/api/analytics',
    {
      wsChannel: 'metrics',
      pollInterval: 10000, // was 4s; relaxed to 10s with WS live updates
      validate: isAnalyticsPayload,
    },
  )

  // W41-3 — Track the data's age. The backend exposes
  // `data_freshness_seconds` (the upstream's own report of how old the
  // snapshot is) but that's only populated once `data` exists. We use
  // the hook's `lastUpdated` to compute the local age so the indicator
  // also reflects the freshness of the local REST fetch + WS push.
  const age = useStaleAge(lastUpdated)

  // W41-2 — Memoize the inline significance computations. These were
  // previously recomputed on every render even though they only depend
  // on `data`. Wrapping them in useMemo skips the binomial-test + CI
  // arithmetic on parent-driven re-renders (e.g. when useBot snapshots
  // tick the page.tsx parent and AnalyticsPanel is re-rendered as a
  // child of the Command Center grid). Hoisted BEFORE the early returns
  // so the rules-of-hooks are satisfied (hooks must run in the same
  // order on every render). When `data` is null the memo returns a
  // null placeholder + zeroed stats; the early returns below render
  // loading / error states without touching the stats.
  const stats = useMemo(() => {
    if (!data) return null
    const n = data.closed_trades ?? (data.winning_trades + data.losing_trades)
    const isSmallSample = n < 30
    const winRatePct = (data.win_rate * 100).toFixed(1)

    const ciExcludes50 =
      data.win_rate_ci_low != null &&
      data.win_rate_ci_high != null &&
      ((data.win_rate_ci_low > 0.5 && data.win_rate_ci_high > 0.5) ||
        (data.win_rate_ci_low < 0.5 && data.win_rate_ci_high < 0.5))
    const winRatePValue = binomialPValue(data.winning_trades, n)
    const isWinRateSignificant = ciExcludes50 && winRatePValue < 0.05

    const ciMid =
      data.win_rate_ci_low != null && data.win_rate_ci_high != null
        ? (data.win_rate_ci_low + data.win_rate_ci_high) / 2
        : data.win_rate
    const trendArrow = ciMid > 0.505 ? '▲' : ciMid < 0.495 ? '▼' : '▶'
    const trendColor =
      ciMid > 0.505
        ? 'text-green-400'
        : ciMid < 0.495
        ? 'text-red-400'
        : 'text-[#7e8aaa]'

    return {
      n,
      isSmallSample,
      winRatePct,
      winRatePValue,
      isWinRateSignificant,
      trendArrow,
      trendColor,
    }
  }, [data])

  const activeStrats = useMemo(() => data?.active_strategies ?? [], [data?.active_strategies])

  // W58-a — Loading state uses the AnalyticsSkeleton (with the
  // "Loading analytics metrics…" caption preserved verbatim).
  if (isLoading && !data) {
    return (
      <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md">
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">📊 Performance Analytics</span>
            <span className="badge badge-amber text-[9.5px]">PAPER</span>
          </div>
          <span className="badge badge-dim text-[9.5px]">Loading…</span>
        </div>
        <AnalyticsSkeleton />
      </div>
    )
  }

  // W58-a — Error / empty branches. The "Analytics data unavailable" title
  // is preserved verbatim so the W15-5 test contract resolves. When the
  // hook exposes an error, the PolishedErrorCard surfaces it with a Retry
  // button (calls useRealtimeData.refetch). When there's no error but
  // `data` is null, the PolishedEmptyState surfaces the soft-failure case.
  if (!data || !stats) {
    if (error) {
      return (
        <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md">
          <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="card-title text-xs font-bold text-[#dde1ed]">📊 Performance Analytics</span>
              <span className="badge badge-amber text-[9.5px]">PAPER</span>
            </div>
            {isRealtime ? (
              <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
            ) : (
              <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
            )}
          </div>
          <div className="p-3">
            <PolishedErrorCard
              message="Analytics data unavailable"
              detail={error}
              onRetry={() => refetch()}
            />
          </div>
        </div>
      )
    }
    return (
      <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md">
        <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
            <span className="card-title text-xs font-bold text-[#dde1ed]">📊 Performance Analytics</span>
            <span className="badge badge-amber text-[9.5px]">PAPER</span>
          </div>
        </div>
        <div className="p-3">
          <PolishedEmptyState />
        </div>
      </div>
    )
  }

  const { n, isSmallSample, winRatePct, winRatePValue, isWinRateSignificant, trendArrow, trendColor } = stats

  return (
    <div className="card flex flex-col bg-[#13161e] border border-[#1f2335] shadow-md">
      <div className="card-header p-3 border-b border-[#1f2335] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <span className="card-title text-xs font-bold text-[#dde1ed]">📊 Performance Analytics</span>
          <span className="badge badge-amber text-[9.5px]">
            {data.mode?.toUpperCase() || 'PAPER'}
          </span>
          {/* W15-5 — Live / Polling badge. Reflects the underlying
              useRealtimeData transport state. */}
          {isRealtime ? (
            <Badge variant="success" className="text-[9.5px] py-0.5">● Live</Badge>
          ) : (
            <Badge variant="warning" className="text-[9.5px] py-0.5">⟳ Polling</Badge>
          )}
          {/* W41-3 — StaleIndicator: amber/red pill surfaces when the
              local snapshot is older than 30s. Complements the backend's
              own `data_freshness_seconds` (rendered further down) by
              reflecting the freshness of the local fetch + WS push
              chain, not just the upstream's report. */}
          {age !== null && <StaleIndicator age={age} />}
        </div>
        <div className="flex items-center gap-2">
          <span className={`mono text-xs font-bold tabular-nums ${trendColor}`}>
            {trendArrow}
          </span>
          <span className="mono text-xs text-green-400 font-bold tabular-nums">
            {winRatePct}% Win Rate
          </span>
        </div>
      </div>

      {/* Small sample warning — W26-6 raised threshold from 10 → 30
          to match StatisticalSignificanceBadge.MIN_SAMPLE_SIZE. The
          verdict text is intentionally a separate warning (the badge
          itself surfaces "Insufficient Data" inline next to the metric). */}
      {isSmallSample && (
        <div
          className="banner-warning text-[10.5px] mx-3 mt-2 py-1.5 px-2.5"
          role="alert"
          data-testid="small-sample-warning"
        >
          <span>⚠ Small sample size — results may not be reliable (n={n} &lt; 30)</span>
        </div>
      )}

      {/* W26-6 — Metrics sample-size note. Surfaced unconditionally
          (even when n is large) so the trader always knows the CI
          methodology + sample-size basis of the displayed metrics. */}
      <div
        className="text-[10px] text-[#7e8aaa] mx-3 mt-2 tabular-nums"
        data-testid="metrics-sample-note"
      >
        Metrics based on N={n} trades. 95% confidence intervals shown.
      </div>

      {/* Active Strategies Strip */}
      {activeStrats.length > 0 && (
        <div className="px-3 pt-2.5 flex flex-wrap gap-1.5">
          <span className="text-[10px] text-[#7e8aaa] uppercase font-semibold tracking-wider self-center">Active:</span>
          {activeStrats.map((s) => (
            <span key={s} className="badge badge-green text-[9px]">
              ● {STRATEGY_LABELS[s] ?? s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* W58-a — Section header above the KPI strip */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1f2335]">
        <SectionHeader
          icon={Gauge}
          title="Performance KPIs"
          description="real-time paper-trading metrics"
          tone="info"
          trailing={
            <span className="badge badge-dim text-[9px] tabular-nums">
              N={n}
            </span>
          }
        />
      </div>

      <div className="p-3 grid grid-cols-2 gap-2 text-[11px]">
        {/* Win Rate + Wilson CI — W26-6 rebuilt around the new
            ConfidenceIntervalBadge + StatisticalSignificanceBadge
            pair. The badge renders the point estimate (72.0%), the
            CI range "[55.0% – 84.0%]" below it, and a horizontal
            range bar visualising where the CI sits on [0, 1]. The
            significance badge sits to the right of the CI badge and
            encodes the binomial-test verdict as a colored pill. */}
        <div className="kpi-card col-span-2" data-testid="win-rate-kpi">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Percent className="size-3 text-cyan-300" aria-hidden="true" />
              <span className="kpi-label">Win Rate (95% CI)</span>
            </div>
            <StatisticalSignificanceBadge
              pValue={winRatePValue}
              n={n}
              isSignificant={isWinRateSignificant}
            />
          </div>
          <ConfidenceIntervalBadge
            value={data.win_rate}
            ciLower={data.win_rate_ci_low ?? 0}
            ciUpper={data.win_rate_ci_high ?? 1}
            format="percentage"
            significant={isWinRateSignificant}
            pValue={winRatePValue}
            n={n}
            className="w-full"
          />
        </div>

        {/* Profit Factor */}
        <KpiTile
          label="Profit Factor"
          icon={Scale}
          tone="info"
          testId="analytics-kpi-profit-factor"
          valueClassName="text-[#60a5fa]"
          value={
            typeof data.profit_factor === 'number'
              ? data.profit_factor.toFixed(2)
              : data.profit_factor === 'Infinity'
              ? '∞'
              : '—'
          }
          sub="Gross wins / Gross losses"
        />

        {/* Total Trades & Volume */}
        <KpiTile
          label="Trades / Volume"
          icon={Layers}
          tone="neutral"
          testId="analytics-kpi-trades-volume"
          valueClassName="text-[#dde1ed]"
          value={`${data.total_trades} trades`}
          sub={
            <span className="text-[#22d3ee]">{fmtUsd(data.total_volume_usdc)} vol</span>
          }
        />

        {/* Max Drawdown */}
        <KpiTile
          label="Max Drawdown"
          icon={TrendingDown}
          tone="poor"
          testId="analytics-kpi-max-drawdown"
          valueClassName="text-[#f87171]"
          value={`${fmtUsd(data.max_drawdown_dollars)} (${fmtPct(data.max_drawdown_pct)})`}
          sub={`Peak: ${fmtUsd(data.peak_equity)}`}
        />

        {/* Realized P&L */}
        <KpiTile
          label="Realized P&L"
          icon={TrendingUp}
          tone={data.realized_pnl >= 0 ? 'good' : 'poor'}
          testId="analytics-kpi-realized-pnl"
          valueClassName={data.realized_pnl >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}
          value={fmtPnl(data.realized_pnl)}
          sub="Closed positions today"
        />

        <KpiTile
          label="Unrealized P&L"
          icon={TrendingUp}
          tone={data.unrealized_pnl >= 0 ? 'good' : 'poor'}
          testId="analytics-kpi-unrealized-pnl"
          valueClassName={data.unrealized_pnl >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}
          value={fmtPnl(data.unrealized_pnl)}
          sub="Mark-to-mid open book"
        />

        {/* S3 — Expectancy / Trade */}
        <KpiTile
          label="Expectancy / Trade"
          icon={Target}
          tone={(data.expectancy ?? 0) >= 0 ? 'good' : 'poor'}
          testId="analytics-kpi-expectancy"
          valueClassName={
            (data.expectancy ?? 0) >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
          }
          value={data.expectancy != null ? fmtPnl(data.expectancy) : '—'}
          sub="Positive = profitable system"
        />

        {/* S3 — Avg Win / Avg Loss */}
        <div
          className="kpi-card"
          data-tone="neutral"
          data-testid="analytics-kpi-avg-win-loss"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Sigma className="size-3 text-[#dde1ed]" aria-hidden="true" />
            <span className="kpi-label">Avg Win / Avg Loss</span>
          </div>
          <span className="kpi-value flex items-baseline gap-1 tabular-nums">
            <span className="text-[#4ade80]">
              {data.avg_win != null ? fmtUsd(data.avg_win) : '—'}
            </span>
            <span className="text-[#7e8aaa] text-[10px]">/</span>
            <span className="text-[#f87171]">
              {data.avg_loss != null ? fmtUsd(data.avg_loss) : '—'}
            </span>
          </span>
          <span className="kpi-sub">Asymmetry check</span>
        </div>

        {/* S3 — Sharpe Ratio */}
        <KpiTile
          label="Sharpe Ratio"
          icon={Gauge}
          tone={
            data.sharpe_ratio == null
              ? 'neutral'
              : data.sharpe_ratio >= 1
              ? 'good'
              : data.sharpe_ratio >= 0
              ? 'info'
              : 'poor'
          }
          testId="analytics-kpi-sharpe"
          valueClassName={
            data.sharpe_ratio == null
              ? 'text-[#dde1ed]'
              : data.sharpe_ratio >= 1
              ? 'text-[#4ade80]'
              : data.sharpe_ratio >= 0
              ? 'text-[#60a5fa]'
              : 'text-[#f87171]'
          }
          value={data.sharpe_ratio != null ? data.sharpe_ratio.toFixed(2) : '—'}
          sub="Risk-adjusted return"
        />
      </div>

      {/* W26-6 — Standalone metrics disclaimer section. The
          PerformanceReportSection below ALSO renders a (shorter)
          disclaimer banner, but the task spec asks for this expanded
          5-bullet version as its own section so the trader can scan it
          without expanding the per-category report. */}
      <MetricsDisclaimerSection n={n} />

      {/* W25-6 — Honest Performance Report (per-category breakdown) +
          disclaimer banner. Fetches /api/performance/report (paper +
          walk-forward + live + disclaimer) and /api/performance/backtest
          (best experiment summary) on mount. The disclaimer banner is
          ALWAYS rendered (it's a static reminder); the per-category
          breakdown is conditionally rendered only when the report fetch
          succeeds AND the response shape matches the expected schema. */}
      <PerformanceReportSection />
    </div>
  )
}

// ── W26-6 — Metrics Disclaimer Section ───────────────────────────────────
// Five-bullet performance-metrics disclaimer. Rendered unconditionally
// (independent of the PerformanceReport fetch) so the trader is always
// warned about the backtest / paper / live distinction, the 95% CI
// convention, and the significance thresholds (α=0.05, n≥30).

function MetricsDisclaimerSection({ n }: { n: number }) {
  return (
    <div
      className="border-t border-[#1f2335] p-3 text-[10.5px] text-[#7e8aaa]"
      data-testid="metrics-disclaimer-section"
      aria-label="Performance Metrics Disclaimer"
    >
      {/* W58-a — Section header above the disclaimer bullets */}
      <div className="mb-1.5">
        <SectionHeader
          icon={AlertTriangle}
          title="Performance Metrics Disclaimer"
          description="α=0.05 · n≥30 · 95% CI"
          tone="warn"
          trailing={
            <span className="badge badge-dim text-[9px] tabular-nums">
              n={n}
            </span>
          }
        />
      </div>
      <ul className="space-y-0.5 list-disc pl-4">
        <li>
          Backtest results may be overfit — see walk-forward and paper
          metrics
        </li>
        <li>Only paper/live performance reflects actual system behavior</li>
        <li>Win rate target (95%) is aspirational, not guaranteed</li>
        <li>Metrics are reported with 95% confidence intervals</li>
        <li>Statistical significance requires p &lt; 0.05 and n ≥ 30</li>
      </ul>
    </div>
  )
}

// ── W25-6 — Performance Report Section ─────────────────────────────────────
// Honest per-category breakdown: paper / backtest / walk-forward / live,
// each reported SEPARATELY (never combined) with its own 95% confidence
// interval + binomial-test p-value vs the 50% coin-flip null. The
// disclaimer banner is rendered unconditionally — even when the backend is
// unreachable, the trader is still warned that backtest performance does
// NOT guarantee future results.

interface PaperMetrics {
  category: string
  win_rate: string
  win_rate_ci_95: string
  profit_factor: string
  expectancy: string
  max_drawdown: string
  sharpe_ratio: string
  sortino_ratio: string
  open_exposure: string
  capital_utilization: string
  avg_slippage_bps: string
  total_fees: string
  n_trades: number
  n_wins: number
  n_losses: number
  avg_win: string
  avg_loss: string
  avg_hold_time_hours: string
  p_value: string
  is_statistically_significant: boolean
  period_start: number
  period_end: number
}

interface PerformanceReport {
  paper_trading: PaperMetrics
  backtest: string
  walk_forward: string
  live: string
  disclaimer: string
}

interface BacktestSummary {
  category: 'backtest'
  n_experiments: number
  message?: string
  best_return?: number
  best_sharpe?: number
  best_strategy?: string
  disclaimer?: string
}

function isPerformanceReport(d: unknown): d is PerformanceReport {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return (
    typeof obj.disclaimer === 'string' &&
    typeof obj.backtest === 'string' &&
    typeof obj.walk_forward === 'string' &&
    typeof obj.live === 'string' &&
    typeof obj.paper_trading === 'object' &&
    obj.paper_trading !== null
  )
}

function isBacktestSummary(d: unknown): d is BacktestSummary {
  if (!d || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return obj.category === 'backtest' && typeof obj.n_experiments === 'number'
}

function PerformanceReportSection() {
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchAll = async () => {
      try {
        const [reportRes, backtestRes] = await Promise.all([
          apiFetch('/api/performance/report'),
          apiFetch('/api/performance/backtest'),
        ])
        if (cancelled) return
        if (reportRes.ok) {
          const json = await reportRes.json()
          if (isPerformanceReport(json)) setReport(json)
        }
        if (backtestRes.ok) {
          const json = await backtestRes.json()
          if (isBacktestSummary(json)) setBacktest(json)
        }
      } catch {
        // Silent failure — the disclaimer banner still renders so the
        // trader is always warned even when the backend is unreachable.
      }
    }
    fetchAll()
    return () => {
      cancelled = true
    }
  }, [])

  const paper = report?.paper_trading
  const backtestReady =
    backtest != null &&
    backtest.n_experiments > 0 &&
    backtest.best_return != null

  return (
    <div
      className="border-t border-[#1f2335] p-3 space-y-2 text-[11px]"
      data-testid="performance-report-section"
    >
      {/* W58-a — Section header above the report */}
      <div className="flex items-center justify-between">
        <SectionHeader
          icon={ListChecks}
          title="Honest Performance Report"
          description="paper · backtest · walk-forward · live"
          tone="info"
          trailing={
            <span className="badge badge-amber text-[9px]">Per-Category</span>
          }
        />
      </div>

      {/* Disclaimer banner — ALWAYS rendered (even when fetch failed) */}
      <div
        className="banner-warning py-1.5 px-2.5 text-[10.5px] space-y-0.5"
        data-testid="performance-disclaimer"
        aria-label="Performance Metrics Disclaimer"
      >
        <div className="font-semibold">
          ⚠ Performance Metrics Disclaimer
        </div>
        <div>
          Backtest results may be overfit and do not guarantee future performance.
        </div>
        <div>
          Only paper-trading and live metrics reflect actual system behavior.
        </div>
        <div>Win rate target (95%) is aspirational, not guaranteed.</div>
      </div>

      {/* Per-category breakdown — conditionally rendered when the
          report fetch succeeded AND the response shape validated. */}
      {report && paper && (
        <div className="grid grid-cols-2 gap-2">
          {/* Paper Trading metrics */}
          <div className="kpi-card col-span-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="kpi-label">Paper Trading</span>
              </div>
              <span className="text-[10px] text-[#4ade80]">
                Real-time · honest
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Win Rate (paper)
                </span>
                <div className="text-[#4ade80] font-semibold tabular-nums">
                  {paper.win_rate}
                </div>
                <div className="text-[9px] text-[#7e8aaa] tabular-nums">
                  95% CI: {paper.win_rate_ci_95}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Profit Factor (paper)
                </span>
                <div className="text-[#60a5fa] font-semibold tabular-nums">
                  {paper.profit_factor}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Expectancy (paper)
                </span>
                <div className="text-[#dde1ed] font-semibold tabular-nums">
                  {paper.expectancy}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Sharpe (paper)
                </span>
                <div className="text-[#dde1ed] font-semibold tabular-nums">
                  {paper.sharpe_ratio}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Max DD (paper)
                </span>
                <div className="text-[#f87171] font-semibold tabular-nums">
                  {paper.max_drawdown}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-[#7e8aaa] uppercase">
                  Trades (paper)
                </span>
                <div className="text-[#dde1ed] font-semibold tabular-nums">
                  {paper.n_trades}
                </div>
                <div className="text-[9px] text-[#7e8aaa] tabular-nums">
                  p={paper.p_value}
                </div>
              </div>
            </div>
          </div>

          {/* Backtest summary */}
          <div className="kpi-card">
            <div className="flex items-center justify-between mb-1">
              <span className="kpi-label">Backtest Summary</span>
              <span className="text-[10px] text-amber-400">⚠ Overfit risk</span>
            </div>
            {backtestReady && backtest ? (
              <div className="space-y-0.5 text-[10.5px] tabular-nums">
                <div>
                  Best Return:{' '}
                  <span className="text-[#4ade80] font-semibold">
                    {((backtest.best_return ?? 0) * 100).toFixed(2)}%
                  </span>
                </div>
                <div>
                  Best Sharpe:{' '}
                  <span className="text-[#60a5fa] font-semibold">
                    {(backtest.best_sharpe ?? 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  Strategy:{' '}
                  <span className="text-[#dde1ed]">
                    {backtest.best_strategy ?? 'unknown'}
                  </span>
                </div>
                <div>
                  Experiments:{' '}
                  <span className="text-[#dde1ed]">{backtest.n_experiments}</span>
                </div>
              </div>
            ) : (
              <div className="text-[10.5px] text-[#7e8aaa]">
                No backtest experiments yet — run a backtest to populate this
                section.
              </div>
            )}
          </div>

          {/* Walk-forward summary */}
          <div className="kpi-card">
            <div className="flex items-center justify-between mb-1">
              <span className="kpi-label">Walk-Forward</span>
              <span className="text-[10px] text-[#4ade80]">Out-of-sample</span>
            </div>
            <div className="text-[10.5px] text-[#7e8aaa] leading-tight">
              {report.walk_forward}
            </div>
          </div>

          {/* Live status */}
          <div className="kpi-card col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="kpi-label">Live Status</span>
              <span className="text-[10px] text-amber-400">Paper mode</span>
            </div>
            <div className="text-[10.5px] text-[#7e8aaa] leading-tight">
              {report.live}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// W9-6 — React.memo (no props, default shallow compare). Skips
// re-renders triggered purely by parent re-renders (e.g. useBot snapshot
// updates that don't affect this panel). Internal state updates
// (data/loading) still re-render normally because they originate inside
// the component.
export default memo(AnalyticsPanel)
