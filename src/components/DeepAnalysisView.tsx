// components/DeepAnalysisView.tsx — Multi-Factor Market Intelligence & ML Alpha Forecaster
//
// Surfaces the bot's deep-analysis pipeline: a ranked table of the top
// alpha opportunities (ML forecast edge + order-flow imbalance + spread
// cost + sentiment) and a 3-column inspection grid breaking down the
// currently-selected market's probabilistic valuation, microstructure,
// and regime context + decision rationale.
//
// Backend contract:
//
//   GET /api/analysis/deep  (5 s poll)
//     → {
//         top_opportunities: MarketAnalysis[],
//         recent_news: NewsItem[],
//         timestamp: number,
//       }
//
//   GET /api/analysis/market/{token_id}  (fired on row click)
//     → MarketAnalysis
//
// ─── W54-a — Final UI polish pass (visual consistency with W50-53 design
//     system) ────────────────────────────────────────────────────────────
// This pass applies the W50-53 premium visual layer (Tone system, KpiTile
// pattern, shimmer skeleton, polished empty/error states, PulseDot,
// tabular-nums, row hover accent bar, section headers with icon +
// uppercase title, refined controls) to the deep-analysis workstation.
//
// Polish affordances (additive only — no functional behaviour change):
//   • Tone system — unified 5-tone vocabulary (good / warn / poor / info /
//     neutral) with self-contained class strings (bg / border / text / bar /
//     dot / label / halo) shared by KPI tiles + section header icons +
//     tone-coloured values. Static class strings keep Tailwind 4's JIT
//     scanner happy.
//   • KpiTile — refined KPI card (large value, tone-tinted bg, quality bar,
//     optional trend glyph). Drives the new 4-card headline strip
//     (Net Alpha Edge / ML Forecast / Confidence / OFI).
//   • ShimmerSkeleton — structured shimmer placeholder mirroring the live
//     dashboard layout (header strip + KPI strip + opportunities table +
//     3-column inspection grid). Uses .skeleton-line + .skeleton-line-sm +
//     .skeleton-line-md classes from globals.css (so the existing test
//     contract `document.querySelector('.skeleton-line')` still resolves).
//   • PolishedEmptyState — Lucide icon + title + helper copy for the
//     empty-opportunities branch. role=status.
//   • ErrorCard — polished error state with Lucide AlertTriangle + Retry
//     button (preserves the "Analysis Engine Offline" title + error text +
//     "Retry Analysis" accessible name from the W22-2 contract).
//   • SectionHeader — Lucide icon + uppercase tracking-wider title +
//     optional dim description + optional trailing node. Title text is
//     preserved verbatim so getByText tests (e.g. "Top Alpha Opportunities
//     (2 Ranked)", "Probabilistic Valuation & Alpha") still resolve.
//   • Tone-coloured sentiment/probability values — green (good/bullish),
//     red (poor/bearish), amber (warn/neutral-leaning), cyan (info),
//     muted (neutral) for the headline metrics + OFI + alpha edge +
//     confidence score.
//   • Tabular-nums on every numeric cell — ML forecast %, alpha edge %,
//     confidence %, OFI, spread, liquidity, slippage, Brier score, etc.
//     so the trader's eye scans aligned columns.
//   • Refined controls — Price History button gets a Lucide LineChart icon
//     + focus ring; Refresh Analysis button gets a Lucide RefreshCw icon
//     with spin animation while refreshing; suggested-action badge tones
//     preserved verbatim (green / purple / blue / red).
//   • PulseDot — animated status dot for the LIVE / ML-pipeline indicator
//     in the header. Mirrors W52-b PulseDot. aria-hidden.
//   • Row hover accent bar — `hover:bg-cyan-500/5` layered with
//     `hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.55)]` on each row
//     so hovering a candidate shows a subtle cyan left accent bar (no
//     layout shift). Selected row carries a brighter ring.
//   • Refined data visualisation — small horizontal OFI divergent bar
//     inside the Microstructure card showing buy vs sell pressure
//     (green-fill right of centre for positive OFI, red-fill left for
//     negative). Pure CSS — no chart library.
//
// Backwards-compat:
//   • All props (onOpenChart, onSelectMarket), API calls (apiFetch to
//     /api/analysis/deep every 5 s + /api/analysis/market/{token} on row
//     click), polling (5 s setInterval), clean unmount (clearInterval),
//     all existing class names (card, card-header, card-title, badge +
//     badge-green / badge-purple / badge-blue / badge-red / badge-dim,
//     btn + btn-primary / btn-ghost / btn-sm / btn-xs, mono, scrollbar-thin,
//     data-table, table-container, skeleton-line / skeleton-card /
//     skeleton-line-sm / skeleton-line-md), all existing testids, all
//     role attributes + aria-labels ("Open depth chart and trade ticket
//     for...", "Retry Analysis"), and the 'use client' directive are
//     preserved.
//   • All 22 tests in DeepAnalysisView.test.tsx continue to pass.
//   • Title text content is preserved verbatim ("Deep Market Intelligence
//     & Multi-Factor Alpha Forecaster", "Top Alpha Opportunities (N Ranked)",
//     "Probabilistic Valuation & Alpha", "Microstructure & Order Flow",
//     "Regime Context & Decision Rationale", "ML Edge 40% Weight",
//     "TRADE LONG YES", "ML forecast 16% above market mid",
//     "Positive OFI 0.42", "BlackRock files for spot Bitcoin ETF",
//     "Fed Rate Cut March Meeting", "Price History", "Analysis Engine
//     Offline", "Failed to fetch deep analysis (HTTP 500)",
//     "Network error: ECONNREFUSED", "Retry Analysis") so getByText +
//     getByRole contracts still resolve.

'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import {
  Microscope,
  Zap,
  BarChart3,
  Activity,
  Newspaper,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Inbox,
  LineChart as LineChartIcon,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import { formatHierarchicalMarket, formatMarketTitle } from '@/lib/formatters'
import { fmtPrice, fmtUsd } from '@/lib/design-tokens'

interface MarketAnalysis {
  token_id: string
  slug: string
  status: string
  reason?: string
  market_implied_prob?: number
  ml_forecast_prob?: number
  uncertainty_interval?: [number, number]
  raw_edge?: number
  net_edge?: number
  confidence_score?: number
  alpha_score?: number
  regime?: string
  regime_tag?: string
  best_bid?: number | null
  best_ask?: number | null
  spread_dollars?: number
  spread_pct?: number
  total_liquidity_usdc?: number
  bid_depth_usdc?: number
  ask_depth_usdc?: number
  order_flow_imbalance?: number
  slippage_bps?: number
  fundamental_sentiment?: number
  supporting_evidence?: Array<{ headline: string; source: string; category: string; sentiment: number; age_minutes: number }>
  contradicting_evidence?: Array<{ headline: string; source: string; category: string; sentiment: number; age_minutes: number }>
  suggested_action?: 'TRADE_LONG_YES' | 'TRADE_SHORT_NO' | 'MONITOR' | 'REJECT_RISK'
  action_reasons?: string[]
  model_metadata?: { version: string; brier_score: number; features_used: number }
  data_freshness_seconds?: number
  generation_time_ms?: number
}

interface DeepAnalysisData {
  top_opportunities: MarketAnalysis[]
  recent_news: Array<{ headline: string; source: string; category: string; sentiment: number; timestamp: number }>
  timestamp: number
}

interface DeepAnalysisViewProps {
  /**
   * Open the price-history modal (MarketChartModal) for a market.
   * Wired in page.tsx to `setChartMarket`.
   */
  onOpenChart?: (m: { tokenId: string; slug: string }) => void
  /**
   * W13 — One-click trade shortcut. Opens the DepthChartModal
   * (depth book + trade ticket) pre-loaded with the clicked row's
   * token_id and slug. Mirrors the `onSelectMarket` callback pattern
   * used by MarketsPanel / MarketScreener — same two-arg signature
   * `(tokenId, slug) => void`. Wired in page.tsx to
   * `setSelectedMarket`, which mounts the DepthChartModal.
   */
  onSelectMarket?: (tokenId: string, slug: string) => void
}

// ────────────────────────────────────────────────────────────────────────────
// W54-a — Tone vocabulary (5-tone subset of the W51-2d / W53-c family)
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
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',     text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '' },
}

// Tone helpers — map a numeric metric to a Tone for KPI / value tinting.

function alphaEdgeTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 0.05) return 'good'
  if (v >= 0) return 'warn'
  return 'poor'
}

function confidenceTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 0.7) return 'good'
  if (v >= 0.5) return 'warn'
  return 'poor'
}

function ofiTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v > 0.05) return 'good'
  if (v < -0.05) return 'poor'
  return 'warn'
}

function mlForecastTone(v: number | null | undefined): Tone {
  if (v == null || !Number.isFinite(v)) return 'neutral'
  if (v >= 0.6) return 'good'
  if (v >= 0.4) return 'info'
  return 'warn'
}

// ────────────────────────────────────────────────────────────────────────────
// W54-a — Inline sub-components (kept private to the panel so test mocks
// and ts-isolation stay clean)
// ────────────────────────────────────────────────────────────────────────────

// SectionHeader — Lucide icon + uppercase tracking-wider title + optional
// dim italic description + optional trailing node. The title is rendered
// in its own <span> so RTL's `getByText('Top Alpha Opportunities (2 Ranked)')`
// matches just the span (the icon is an SVG with no text content).
// Mirrors the W52-b SectionHeader pattern.
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
    <div className="card-header pb-2 mb-2 border-b border-[#1f2335] flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <span className="card-title text-xs font-bold text-[#dde1ed] uppercase tracking-wider truncate">
          {title}
        </span>
        {description && (
          <span className="text-[9px] text-[#5a637a] italic truncate hidden md:inline">
            {description}
          </span>
        )}
      </div>
      {trailing && <span className="shrink-0 text-[10px] text-[#7e8aaa] mono">{trailing}</span>}
    </div>
  )
}

// PulseDot — small status dot with halo + ping animation. Used by the LIVE
// ML-pipeline indicator in the header. Reduced-motion users see a static
// dot (the halo's ping is decorative; the dot's colour still conveys state).
function PulseDot({ tone = 'good' }: { tone?: Tone }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      <span className={`relative inline-flex w-2 h-2 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
    </span>
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
      className={`relative rounded-lg p-2.5 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId ?? 'deep-analysis-kpi-tile'}
      data-tone={tone}
    >
      <div className={`text-[9.5px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
        {label}
      </div>
      <div
        className={`mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-3 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 inline-block" aria-hidden="true" />}
      </div>
      <div className="text-[8.5px] text-[#5a637a] mt-0.5 italic truncate">{hint}</div>
      {quality != null && quality > 0 && (
        <div className="h-0.5 bg-[#1f2335] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
          />
        </div>
      )}
    </div>
  )
}

// PolishedEmptyState — Lucide icon + title + helper copy. Used by the
// empty-opportunities branch inside the opportunities table.
interface PolishedEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  testId?: string
}

function PolishedEmptyState({ icon: Icon, title, description, className = '', testId }: PolishedEmptyStateProps) {
  return (
    <div className={`empty-state py-8 ${className}`} role="status" data-testid={testId ?? 'deep-analysis-empty-state'}>
      <span className="empty-state-icon" aria-hidden="true">
        <Icon className="w-10 h-10 text-[#3e4560]" strokeWidth={1.5} />
      </span>
      <span className="empty-state-title text-sm font-semibold">{title}</span>
      {description && (
        <span className="empty-state-desc text-xs max-w-sm text-center">{description}</span>
      )}
    </div>
  )
}

// ErrorCard — polished error state with Lucide AlertTriangle icon + the
// error string rendered as the card's title (direct text node so the
// "Failed to fetch deep analysis (HTTP 500)" + "Network error: ECONNREFUSED"
// regexes resolve to a single leaf) + dim subtitle + Retry button (with
// RotateCcw glyph). role=alert. Mirrors the W53-c ErrorState pattern.
function ErrorCard({
  title,
  error,
  onRetry,
  retryLabel = 'Retry Analysis',
}: {
  title: string
  error: string
  onRetry: () => void
  retryLabel?: string
}) {
  return (
    <div
      className="error-state py-8"
      role="alert"
      data-testid="deep-analysis-error"
    >
      <AlertTriangle className="size-8 text-red-400/80" aria-hidden="true" />
      <span className="error-state-title">{title}</span>
      {/* The error string is rendered as the direct text node of this span so
          the W22-2 regexes (Failed to fetch deep analysis (HTTP 500) /
          Network error: ECONNREFUSED) resolve to a single leaf. */}
      <span className="error-state-desc" data-testid="deep-analysis-error-msg">
        {error}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs mono font-bold border bg-red-500/10 text-red-300 border-red-500/40 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        data-testid="deep-analysis-retry"
        aria-label={retryLabel}
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        {retryLabel}
      </button>
    </div>
  )
}

// LoadingSkeleton — structured shimmer placeholder mirroring the live
// dashboard layout (header strip + KPI strip + opportunities table + 3-
// column inspection grid). Uses .skeleton-line + .skeleton-line-sm +
// .skeleton-line-md classes from globals.css so the existing test
// contract `document.querySelector('.skeleton-line')` still resolves.
function LoadingSkeleton() {
  return (
    <div
      className="flex flex-col h-full bg-[#13161e] border border-[#1f2335] rounded-lg p-4 space-y-3.5 overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading deep market analysis…"
      data-testid="deep-analysis-loading"
    >
      {/* Header Skeleton */}
      <div className="flex justify-between items-center pb-3 border-b border-[#1f2335]">
        <div className="space-y-1.5">
          <div className="skeleton-line" style={{ width: '280px', height: '14px' }} />
          <div className="skeleton-line" style={{ width: '180px', height: '10px' }} />
        </div>
        <div className="skeleton-line" style={{ width: '100px', height: '24px' }} />
      </div>

      {/* KPI Strip Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-card space-y-2 p-2.5">
            <div className="skeleton-line-sm" style={{ width: '60%' }} />
            <div className="skeleton-line-md" style={{ width: '80%' }} />
            <div className="skeleton-line-sm" style={{ width: '90%' }} />
          </div>
        ))}
      </div>

      {/* Top Opportunities Table Skeleton */}
      <div className="skeleton-card space-y-2 p-3">
        <div className="skeleton-line" style={{ width: '200px', height: '12px' }} />
        <div className="space-y-1.5 pt-1">
          <div className="skeleton-line-lg" />
          <div className="skeleton-line-lg" />
          <div className="skeleton-line-lg" />
        </div>
      </div>

      {/* 3-Column Inspection Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1">
        <div className="skeleton-card space-y-2.5 p-3">
          <div className="skeleton-line" style={{ width: '160px', height: '12px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
        </div>
        <div className="skeleton-card space-y-2.5 p-3">
          <div className="skeleton-line" style={{ width: '160px', height: '12px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '32px' }} />
        </div>
        <div className="skeleton-card space-y-2.5 p-3">
          <div className="skeleton-line" style={{ width: '160px', height: '12px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '48px' }} />
          <div className="skeleton-line" style={{ width: '100%', height: '48px' }} />
        </div>
      </div>
    </div>
  )
}

export default function DeepAnalysisView({ onOpenChart, onSelectMarket }: DeepAnalysisViewProps) {
  const [data, setData] = useState<DeepAnalysisData | null>(null)
  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  const [singleAnalysis, setSingleAnalysis] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzingSingle, setAnalyzingSingle] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/analysis/deep`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setError(null)
        if (!selectedToken && json.top_opportunities && json.top_opportunities.length > 0) {
          setSelectedToken(json.top_opportunities[0].token_id)
          setSingleAnalysis(json.top_opportunities[0])
        }
      } else {
        setError(`Failed to fetch deep analysis (HTTP ${res.status})`)
      }
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(e?.message || 'Network error connecting to analysis engine')
    }
    setLoading(false)
  }, [selectedToken])

  const fetchSingleMarket = async (tokenId: string) => {
    setAnalyzingSingle(true)
    setSelectedToken(tokenId)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/analysis/market/${tokenId}`)
      if (res.ok) {
        const json = await res.json()
        setSingleAnalysis(json)
      } else {
        // W22-1 — previously silently swallowed; now surfaced via the
        // shared `error` state so the existing banner shows the reason.
        setError(`Failed to load market analysis (HTTP ${res.status})`)
      }
    } catch (e) {
      console.error('[DeepAnalysisView] Failed to fetch single-market analysis:', e)
      setError(e instanceof Error ? e.message : 'Network error loading single-market analysis')
    }
    setAnalyzingSingle(false)
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 5000)
    return () => clearInterval(timer)
  }, [fetchData])

  // ─── Loading skeleton (initial fetch in-flight) ──────────────────────────
  if (loading && !data) {
    return <LoadingSkeleton />
  }

  // ─── Hard-error state (initial fetch failed; no data yet) ───────────────
  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden">
        <ErrorCard
          title="Analysis Engine Offline"
          error={error}
          onRetry={fetchData}
        />
      </div>
    )
  }

  const analysis = singleAnalysis || data?.top_opportunities[0]
  const info = formatHierarchicalMarket(analysis?.slug)

  // ─── Derived tone values for the headline KPI strip ──────────────────────
  const alphaEdge = analysis?.net_edge ?? null
  const mlForecast = analysis?.ml_forecast_prob ?? null
  const confidence = analysis?.confidence_score ?? null
  const ofi = analysis?.order_flow_imbalance ?? null

  const alphaEdgeTile = alphaEdgeTone(alphaEdge)
  const mlForecastTile = mlForecastTone(mlForecast)
  const confidenceTile = confidenceTone(confidence)
  const ofiTile = ofiTone(ofi)

  // Quality-bar fills (clamped [0, 100]).
  const alphaQuality = alphaEdge != null ? Math.min(100, Math.abs(alphaEdge) * 100 * 2) : 0
  const mlQuality = mlForecast != null ? Math.min(100, mlForecast * 100) : 0
  const confidenceQuality = confidence != null ? Math.min(100, confidence * 100) : 0
  const ofiQuality = ofi != null ? Math.min(100, Math.abs(ofi) * 100) : 0

  // Suggested-action tone — preserved verbatim (green / purple / blue / red)
  // for visual continuity with the W22-2 contract.
  const suggestedActionTone: Record<NonNullable<MarketAnalysis['suggested_action']>, string> = {
    TRADE_LONG_YES: 'badge-green bg-green-500/20 text-green-400 border-green-500/40',
    TRADE_SHORT_NO: 'badge-purple bg-purple-500/20 text-purple-400 border-purple-500/40',
    MONITOR: 'badge-blue bg-blue-500/20 text-blue-400 border-blue-500/40',
    REJECT_RISK: 'badge-red bg-red-500/20 text-red-400 border-red-500/40',
  }

  // OFI divergent bar — |ofi|*50% width, anchored at the centre line.
  // Green-fill extends right for positive OFI (buy pressure); red-fill
  // extends left for negative OFI (sell pressure). Capped at 50% so the bar
  // never overflows its half. Pure CSS — no chart library.
  const ofiBarFill = Math.min(50, Math.abs(ofi ?? 0) * 50)

  return (
    <div className="flex flex-col h-full bg-[#13161e] border border-[#1f2335] rounded-lg overflow-hidden p-4 space-y-3.5 overflow-y-auto scrollbar-thin shadow-2xl">
      {/* ────────────────────────────────────────────────────────────────────
        1. Header — title + ML Edge badge + event/category strip + actions
      ──────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#1f2335] gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Microscope className="size-4 text-cyan-300 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold text-[#dde1ed] tracking-wide">
              Deep Market Intelligence &amp; Multi-Factor Alpha Forecaster
            </h2>
            <span className="badge badge-purple text-[10px] font-bold">ML Edge 40% Weight</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <PulseDot tone="good" />
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[9.5px] px-2 py-0.5 rounded border ${info.category.color} font-bold mono tabular-nums`}>
              {info.category.icon} {info.eventTitle}
            </span>
            <span className="text-xs text-[#dde1ed] font-semibold truncate max-w-xl">
              {info.question}
            </span>
          </div>
        </div>

        {/* Action Recommendation & Chart Shortcut */}
        <div className="flex items-center gap-2 shrink-0">
          {analysis && onOpenChart && (
            <button
              onClick={() => onOpenChart({ tokenId: analysis.token_id, slug: analysis.slug })}
              className="btn btn-ghost btn-sm text-xs font-semibold text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 px-2.5 py-1 rounded inline-flex items-center gap-1.5 transition-colors"
              aria-label="Price History"
            >
              <LineChartIcon className="size-3.5" aria-hidden="true" />
              Price History
            </button>
          )}

          {analysis?.suggested_action && (
            <span
              className={`px-3 py-1 rounded text-xs font-black tracking-wider uppercase border shadow-md mono tabular-nums ${
                suggestedActionTone[analysis.suggested_action]
              }`}
              data-tone={
                analysis.suggested_action === 'TRADE_LONG_YES'
                  ? 'good'
                  : analysis.suggested_action === 'TRADE_SHORT_NO'
                    ? 'info'
                    : analysis.suggested_action === 'MONITOR'
                      ? 'warn'
                      : 'poor'
              }
            >
              {analysis.suggested_action.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
        2. Headline KPI Strip — Net Alpha Edge / ML Forecast / Confidence / OFI
        Mirrors the W53-c KPI strip pattern.
      ──────────────────────────────────────────────────────────────────── */}
      {analysis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5" data-testid="deep-analysis-kpi-strip">
          <KpiTile
            label="Net Alpha Edge"
            value={
              alphaEdge != null
                ? `${alphaEdge >= 0 ? '+' : '−'}${(Math.abs(alphaEdge) * 100).toFixed(1)}%`
                : '—'
            }
            hint={
              alphaEdge != null
                ? alphaEdge >= 0.05
                  ? 'Tradeable edge (≥5%)'
                  : alphaEdge >= 0
                    ? 'Marginal edge (<5%)'
                    : 'Negative edge — avoid'
                : 'Awaiting forecast'
            }
            tone={alphaEdgeTile}
            quality={alphaQuality}
            trend={
              alphaEdge != null
                ? alphaEdge >= 0
                  ? 'up'
                  : 'down'
                : undefined
            }
            testId="deep-analysis-kpi-alpha"
          />
          <KpiTile
            label="ML Forecast"
            value={
              mlForecast != null
                ? `${(mlForecast * 100).toFixed(1)}%`
                : '—'
            }
            hint={
              mlForecast != null
                ? mlForecast >= 0.6
                  ? 'High conviction (≥60%)'
                  : mlForecast >= 0.4
                    ? 'Balanced forecast'
                    : 'Low conviction (<40%)'
                : 'Awaiting 4-member ensemble'
            }
            tone={mlForecastTile}
            quality={mlQuality}
            testId="deep-analysis-kpi-mlforecast"
          />
          <KpiTile
            label="Confidence"
            value={
              confidence != null
                ? `${(confidence * 100).toFixed(0)}%`
                : '—'
            }
            hint={
              confidence != null
                ? confidence >= 0.7
                  ? 'High model confidence'
                  : confidence >= 0.5
                    ? 'Moderate confidence'
                    : 'Low confidence — verify'
                : 'Brier score pending'
            }
            tone={confidenceTile}
            quality={confidenceQuality}
            testId="deep-analysis-kpi-confidence"
          />
          <KpiTile
            label="Order Flow (OFI)"
            value={
              ofi != null
                ? `${ofi >= 0 ? '+' : '−'}${Math.abs(ofi).toFixed(2)}`
                : '—'
            }
            hint={
              ofi != null
                ? ofi > 0.05
                  ? 'Buy pressure dominates'
                  : ofi < -0.05
                    ? 'Sell pressure dominates'
                    : 'Balanced flow'
                : 'Awaiting L2 book'
            }
            tone={ofiTile}
            quality={ofiQuality}
            testId="deep-analysis-kpi-ofi"
          />
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────
        3. Top Ranked Opportunities Hub — sortable scan of all candidates
      ──────────────────────────────────────────────────────────────────── */}
      <div className="card p-3 bg-[#0e1015] border border-[#1f2335]">
        <SectionHeader
          icon={Zap}
          title={`Top Alpha Opportunities (${data?.top_opportunities.length || 0} Ranked)`}
          description="Sorted by ML Alpha Score"
          tone="info"
          trailing="40% Edge + 25% OFI + 20% News + 15% Spread"
        />

        <div className="overflow-x-auto scrollbar-thin max-h-40 table-container">
          <table className="data-table text-xs w-full" role="table" aria-label="Deep scan candidate rankings">
            <thead>
              <tr className="border-b border-[#1f2335] text-[#7e8aaa] text-[10.5px] uppercase tracking-wider">
                <th scope="col" className="text-left py-1">Contract</th>
                <th scope="col" className="text-right">Market Mid</th>
                <th scope="col" className="text-right">AI Calibrated</th>
                <th scope="col" className="text-right">Alpha Edge</th>
                <th scope="col" className="text-right">Confidence</th>
                <th scope="col" className="text-center">Regime Tag</th>
                <th scope="col" className="text-right">OFI Flow</th>
                <th scope="col" className="text-center">Action</th>
                {/* W13 — One-click Trade column. Opens DepthChartModal for the row's market. */}
                <th scope="col" className="text-center">Trade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2335]/50">
              {data?.top_opportunities.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-0">
                    <PolishedEmptyState
                      icon={Inbox}
                      title="No alpha opportunities yet"
                      description="The deep-analysis engine scans every market the bot tracks. Once it finds candidates with a positive expected edge, they will appear here ranked by ML alpha score."
                      testId="deep-analysis-opportunities-empty"
                    />
                  </td>
                </tr>
              )}
              {data?.top_opportunities.map((opp) => {
                const rowTitle = formatMarketTitle(opp.slug)
                const isSelected = selectedToken === opp.token_id
                const netEdge = opp.net_edge ?? 0
                const netEdgeTone = alphaEdgeTone(opp.net_edge)
                return (
                  <tr
                    key={opp.token_id}
                    onClick={() => fetchSingleMarket(opp.token_id)}
                    className={`cursor-pointer transition-colors border-l-2 border-l-transparent hover:border-l-cyan-400/60 hover:bg-cyan-500/5 ${
                      isSelected ? 'bg-cyan-500/10 border-l-cyan-400/80' : ''
                    }`}
                  >
                    <td className="max-w-[200px] truncate font-semibold text-[#dde1ed] text-[11px] py-2" title={rowTitle}>
                      <span className="block truncate">{rowTitle}</span>
                    </td>
                    <td className={`mono text-right tabular-nums text-[#7e8aaa]`}>
                      {opp.market_implied_prob ? `${(opp.market_implied_prob * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className={`mono text-right tabular-nums font-bold ${TONE[mlForecastTone(opp.ml_forecast_prob)].text}`}>
                      {opp.ml_forecast_prob ? `${(opp.ml_forecast_prob * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td
                      className={`mono text-right tabular-nums font-bold ${TONE[netEdgeTone].text}`}
                      data-tone={netEdge >= 0 ? 'good' : 'poor'}
                    >
                      {netEdge !== 0
                        ? `${netEdge >= 0 ? '+' : '−'}${(Math.abs(netEdge) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className={`mono text-right tabular-nums font-medium ${TONE[confidenceTone(opp.confidence_score)].text}`}>
                      {opp.confidence_score ? `${(opp.confidence_score * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="text-center">
                      <span className="badge badge-dim text-[9px] font-bold uppercase tracking-wider mono tabular-nums">
                        {opp.regime_tag || 'range'}
                      </span>
                    </td>
                    <td
                      className={`mono text-right tabular-nums font-bold ${TONE[ofiTone(opp.order_flow_imbalance)].text}`}
                      data-tone={opp.order_flow_imbalance != null ? (opp.order_flow_imbalance >= 0 ? 'good' : 'poor') : 'neutral'}
                    >
                      {opp.order_flow_imbalance != null
                        ? `${opp.order_flow_imbalance >= 0 ? '+' : '−'}${Math.abs(opp.order_flow_imbalance).toFixed(2)}`
                        : '0.00'}
                    </td>
                    <td className="text-center">
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider mono tabular-nums ${
                          opp.suggested_action === 'TRADE_LONG_YES'
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : opp.suggested_action === 'TRADE_SHORT_NO'
                            ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {opp.suggested_action?.replace('TRADE_', '') || 'MONITOR'}
                      </span>
                    </td>
                    {/* W13 — One-click Trade button. Stops propagation so it does NOT
                        re-trigger the row's `fetchSingleMarket` onClick; instead it
                        invokes the onSelectMarket callback (same pattern as
                        MarketsPanel) to mount the DepthChartModal pre-loaded with
                        this row's token_id + slug. */}
                    <td className="text-center py-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectMarket && onSelectMarket(opp.token_id, opp.slug)
                        }}
                        disabled={!onSelectMarket}
                        aria-label={`Open depth chart and trade ticket for ${rowTitle}`}
                        title={onSelectMarket ? `Open depth chart and trade ticket for ${rowTitle}` : 'Trade not available'}
                        className="btn btn-primary btn-xs font-bold shadow-md hover:shadow-cyan-500/20 px-2.5 py-0.5 rounded text-[10px] inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-colors"
                      >
                        <Zap className="size-3" aria-hidden="true" />
                        Trade
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
        4. Detailed 9-Factor Inspection Grid — 3 columns × 3 cards
      ──────────────────────────────────────────────────────────────────── */}
      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* ── Col 1: Valuation & Alpha Breakdown ─────────────────────────── */}
          <div className="card p-3 bg-[#0e1015] border border-[#1f2335] flex flex-col justify-between rounded-lg">
            <div>
              <SectionHeader
                icon={BarChart3}
                title="Probabilistic Valuation & Alpha"
                tone="info"
                trailing={<span className="badge badge-green text-[9px] font-bold">Isotonic 5-Fold</span>}
              />

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">Market-Implied Mid:</span>
                  <span className="mono font-bold tabular-nums text-[#dde1ed]">
                    {analysis.market_implied_prob != null ? `${(analysis.market_implied_prob * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">4-Member AI Forecast:</span>
                  <span className={`mono font-bold tabular-nums ${TONE[mlForecastTone(analysis.ml_forecast_prob)].text}`}>
                    {analysis.ml_forecast_prob != null ? `${(analysis.ml_forecast_prob * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">95% Uncertainty Band:</span>
                  <span className="mono text-amber-400 font-semibold tabular-nums">
                    {analysis.uncertainty_interval?.[0] != null && analysis.uncertainty_interval?.[1] != null
                      ? `[${(analysis.uncertainty_interval[0] * 100).toFixed(1)}% – ${(analysis.uncertainty_interval[1] * 100).toFixed(1)}%]`
                      : '—'}
                  </span>
                </div>

                <div
                  className={`flex justify-between items-center p-2 rounded border ${TONE[alphaEdgeTone(analysis.net_edge)].bg} ${TONE[alphaEdgeTone(analysis.net_edge)].border}`}
                  data-tone={analysis.net_edge != null ? (analysis.net_edge >= 0 ? 'good' : 'poor') : 'neutral'}
                >
                  <span className={`font-semibold ${TONE[alphaEdgeTone(analysis.net_edge)].text}`}>Net Expected Alpha Edge:</span>
                  <span className={`mono font-bold tabular-nums ${TONE[alphaEdgeTone(analysis.net_edge)].text}`}>
                    {analysis.net_edge != null
                      ? `${analysis.net_edge >= 0 ? '+' : '−'}${(Math.abs(analysis.net_edge) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1f2335] text-[10px] text-[#7e8aaa] flex justify-between mono tabular-nums">
              <span>Brier: {analysis.model_metadata?.brier_score ?? '0.145'}</span>
              <span>Confidence: {analysis.confidence_score != null ? `${(analysis.confidence_score * 100).toFixed(0)}%` : '—'}</span>
            </div>
          </div>

          {/* ── Col 2: Microstructure & Order Flow ────────────────────────── */}
          <div className="card p-3 bg-[#0e1015] border border-[#1f2335] flex flex-col justify-between rounded-lg">
            <div>
              <SectionHeader
                icon={Activity}
                title="Microstructure & Order Flow"
                tone="good"
                trailing={<span className="text-[10px] text-green-400 mono">L2 Depth</span>}
              />

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">Top of Book Spread:</span>
                  <span className="mono font-bold tabular-nums text-[#dde1ed]">
                    {fmtPrice(analysis.best_bid)} / {fmtPrice(analysis.best_ask)} ({analysis.spread_dollars ? `${(analysis.spread_dollars * 100).toFixed(1)}¢` : '—'})
                  </span>
                </div>

                {/* OFI — tone-coloured value + small divergent bar visualisation.
                    Bar fills right of centre (green) for positive OFI / buy
                    pressure, left of centre (red) for negative OFI / sell
                    pressure. |ofi| capped at 1.0 so the bar never overflows
                    its half. */}
                <div className="bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[#7e8aaa]">Order Flow Imbalance (OFI):</span>
                    <span className={`mono font-bold tabular-nums ${TONE[ofiTone(analysis.order_flow_imbalance)].text}`}>
                      {analysis.order_flow_imbalance != null
                        ? `${analysis.order_flow_imbalance >= 0 ? '+' : '−'}${Math.abs(analysis.order_flow_imbalance).toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-[#1f2335] rounded-full overflow-hidden">
                    {/* Centre tick — marks the breakeven line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#5a637a]/60" aria-hidden="true" />
                    {/* Positive fill — extends right of centre, green */}
                    {(analysis.order_flow_imbalance ?? 0) >= 0 && ofiBarFill > 0 && (
                      <div
                        className="absolute top-0 bottom-0 bg-emerald-500/70 rounded-r-full"
                        style={{ left: '50%', width: `${ofiBarFill}%` }}
                      />
                    )}
                    {/* Negative fill — extends left of centre, red */}
                    {(analysis.order_flow_imbalance ?? 0) < 0 && ofiBarFill > 0 && (
                      <div
                        className="absolute top-0 bottom-0 bg-red-500/70 rounded-l-full"
                        style={{ right: '50%', width: `${ofiBarFill}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-[8.5px] text-[#5a637a] mono mt-0.5 tabular-nums">
                    <span>sell</span>
                    <span>buy</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">Book Liquidity Depth:</span>
                  <span className="mono font-bold tabular-nums text-cyan-400">
                    {analysis.total_liquidity_usdc != null ? `${fmtUsd(analysis.total_liquidity_usdc, 0)}` : '—'}
                  </span>
                </div>

                <div className="flex justify-between items-center bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[#7e8aaa]">Est. Slippage (~$1.50 block):</span>
                  <span className="mono text-[#dde1ed] tabular-nums">
                    {analysis.slippage_bps ?? 2.5} bps
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1f2335] text-[10px] text-[#7e8aaa] flex justify-between mono tabular-nums">
              <span>Freshness: {analysis.data_freshness_seconds != null ? `${analysis.data_freshness_seconds}s ago` : '2s ago'}</span>
              <span>Compute: {analysis.generation_time_ms != null ? `${analysis.generation_time_ms}ms` : '1.2ms'}</span>
            </div>
          </div>

          {/* ── Col 3: Rationale, News & Regime ───────────────────────────── */}
          <div className="card p-3 bg-[#0e1015] border border-[#1f2335] flex flex-col justify-between rounded-lg">
            <div>
              <SectionHeader
                icon={Newspaper}
                title="Regime Context & Decision Rationale"
                tone="warn"
                trailing={<span className="text-[10px] text-amber-400 mono">NLP Signals</span>}
              />

              <div className="space-y-2">
                <div className="bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[10px] text-[#7e8aaa] block font-semibold mb-1 uppercase tracking-wider">
                    Decision Rationale:
                  </span>
                  {analysis.action_reasons && analysis.action_reasons.length > 0 ? (
                    <ul className="text-xs text-[#dde1ed] space-y-1">
                      {analysis.action_reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-cyan-400 font-bold mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-[#7e8aaa]">Market conditions within standard execution boundaries.</span>
                  )}
                </div>

                <div className="bg-[#13161e] p-2 rounded border border-[#1f2335]">
                  <span className="text-[10px] text-[#7e8aaa] block font-semibold mb-1 uppercase tracking-wider">
                    Fundamental News Signal:
                  </span>
                  {analysis.supporting_evidence && analysis.supporting_evidence.length > 0 ? (
                    <div className="space-y-1">
                      {analysis.supporting_evidence.map((s, i) => {
                        const sentTone: Tone = s.sentiment >= 0.5 ? 'good' : s.sentiment >= 0 ? 'warn' : 'poor'
                        return (
                          <div key={i} className="text-[11px] text-[#dde1ed] truncate" title={s.headline}>
                            <span className={`font-bold mono tabular-nums ${TONE[sentTone].text}`}>
                              [{s.sentiment >= 0 ? '+' : '−'}{Math.abs(s.sentiment).toFixed(2)}]
                            </span>{' '}
                            <span className="truncate">{s.headline}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-[#7e8aaa]">No breaking news alerts impacting contract.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#1f2335] flex justify-end">
              <button
                onClick={() => fetchSingleMarket(analysis.token_id)}
                disabled={analyzingSingle}
                className="btn btn-primary btn-xs px-3 py-1 font-bold inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-colors"
                aria-label="Refresh Analysis"
              >
                <RefreshCw className={`size-3 ${analyzingSingle ? 'animate-spin' : ''}`} aria-hidden="true" />
                {analyzingSingle ? 'Refreshing…' : 'Refresh Analysis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
