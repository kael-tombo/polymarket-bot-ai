// components/ShadowInferencePanel.tsx — Shadow Inference + Shadow Trading Panel
//
// W54-d — Final UI polish pass (mirrors the W50-53 design system applied to
// MarketsPanel / PositionsPanel / OrdersPanel / TradesPanel / MLPanel /
// AIMLCommandCenter / OrderFlowPanel / ArbitrageMatrixView /
// StrategyPerformancePanel / StrategyMatrix):
//   1. KpiTile pattern for shadow metrics (predictions count, accuracy,
//      Brier score) — new 3-tile strip between the ModelStatusStrip and
//      the Challenger Models section. Tone-tinted bg + quality bar +
//      tabular-nums + trend glyph.
//   2. Shimmer skeleton loading state — replaces the bare .skeleton blocks
//      with structured shimmer: 3-tile KPI strip + scatter + comparison
//      card skeletons + shadow trades table skeleton. role=status.
//   3. Polished empty state with Lucide icon + "No shadow predictions yet"
//      — uses .empty-state CSS + Inbox icon + dim helper copy. role=status.
//   4. Section headers with icon + uppercase title — extracted to a shared
//      SectionHeader sub-component.
//   5. Refined predictions table — uppercase headers (already present),
//      SortIndicator (Lucide ArrowDown on active Age column, ArrowUpDown
//      on inactive), row hover accent bar (border-l-2 border-l-transparent
//      hover:border-l-cyan-400/60 transition-colors), tabular-nums on
//      every numeric cell.
//   6. Tone-colored accuracy — green (acc >= 0.85), amber (0.75-0.85), red
//      (< 0.75). Applied to the KpiTile + the challenger table accuracy
//      column (preserved verbatim).
//   7. Comparison display: shadow prediction vs actual outcome — the
//      "AI Pred. Edge" column (shadow prediction, blue/purple tone) is
//      visually distinguished from the "Outcome" column (inferred outcome,
//      green/red/amber badge) via a vertical divider + tone-tinted headers.
//   8. Error state: polished error card with retry — replaces the inline
//      header error span with a full ErrorCard (AlertTriangle icon +
//      error string as title + dim subtitle + Retry button with RotateCcw
//      glyph + Dismiss X button). role=alert. Error text preserved as a
//      single leaf text node so the W28-3 test regex still resolves.
//   9. Refined controls — NEW filter input for shadow trades (filter by
//      token_id / strategy / side). Refresh button + Live/Paused toggle
//      preserved verbatim. Live/Paused toggle now embeds a PulseDot for
//      visual liveness.
//
// Backwards-compat: all existing API calls (apiFetch GET /api/ml/versions,
// /api/shadow/trades, /api/shadow/comparison, /api/ml/metrics + POST
// /api/ml/rollback + POST /api/ml/register), polling (20s setInterval +
// clear on unmount + pause on tab hidden + immediate refresh on resume),
// all existing class names (card, card-header, card-title, badge +
// badge-green / badge-dim, btn, btn-xs, input, input-sm, mono,
// scrollbar-thin, spinner, banner-warning), all existing aria-labels,
// role attributes, testids, and the 'use client' directive are preserved.
// The 10-test W28-3 contract still resolves.
//
// Exposes the challenger-model comparison surface (ml/shadow_inference.py +
// ml/model_registry.py + ml/routes.py) and the counterfactual trade journal
// (core/shadow_trading.py) on a single screen.
//
// Backend endpoints used:
//   GET  /api/ml/versions          — model-version lineage (champion vs challengers)
//   GET  /api/ml/metrics           — active model's brier / log_loss / reliability_curve
//   POST /api/ml/rollback?v=X      — promote challenger → champion (operator override)
//   GET  /api/shadow/trades         — recent counterfactual trades
//   GET  /api/shadow/comparison     — shadow-vs-live side-by-side aggregate
//
// Visual style mirrors MLPanel.tsx — dark card backgrounds (var(--bg-surface)), border
// tokens (var(--border)), .mono / .badge / .spinner / .card design-system classes.
//
// NOTE: the in-memory shadow_inference registry (per-challenger call counts
// + recent comparisons ring buffer) does NOT yet expose an HTTP surface —
// the docstring of `ml/shadow_inference.py` calls this out explicitly:
// "the surface a future `/api/shadow-inference` endpoint would expose". The
// challenger table here therefore derives its roster from the persisted
// model-registry lineage (`/api/ml/versions`), classifying each version as
// champion / shadow / demoted from `(is_active, status)`. The
// "register new challenger" form posts to `/api/ml/register` and gracefully
// surfaces a notice if the route is not yet wired — the form layout is
// ready to flip on the moment the shadow_inference HTTP surface lands.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpCircle,
  Boxes,
  Clock,
  Crown,
  Ghost,
  Hash,
  Inbox,
  type LucideIcon,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  XCircle,
} from 'lucide-react'
import { apiFetch } from '@/lib/api'
import {
  ConfidenceBadge,
  ModelStatusStrip,
  NotAGuaranteeInline,
  WhyExplanation,
  driftLevelFromStatus,
  type FeatureContribution,
} from '@/components/ai-explainability'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Backend payload types ───────────────────────────────────────────────────

interface ModelVersion {
  version: string
  created_at: number
  brier_score: number
  roc_auc: number
  ece: number
  sharpe_ratio: number
  status: string // "ACTIVE" | "REJECTED"
  n_samples: number
  parameters: Record<string, unknown>
  is_active: boolean
}

interface ModelVersionsResponse {
  active_version: string
  total_registered: number
  versions: ModelVersion[]
}

interface ShadowTrade {
  id: number
  timestamp: number
  decision_id: string | null
  token_id: string
  strategy: string
  side: string // "BUY" | "SELL"
  price: number
  size: number
  predicted_edge: number
  confidence: number
}

interface ShadowTradesResponse {
  count: number
  trades: ShadowTrade[]
}

interface ComparisonShadowSide {
  count: number
  total_size: number
  avg_predicted_edge: number
  avg_confidence: number
  by_side: { BUY: number; SELL: number }
  by_strategy: Record<string, unknown>
}

interface ComparisonLiveSide {
  count: number
  total_pnl: number
  avg_pnl: number
  win_rate: number
  total_volume_shares: number
  by_strategy: Record<string, unknown>
}

interface StrategyRow {
  strategy: string
  shadow_count: number
  live_count: number
  shadow_avg_edge: number
  live_avg_pnl: number
  shadow_total_size: number
  live_total_pnl: number
}

interface ShadowVsLiveComparison {
  shadow: ComparisonShadowSide
  live: ComparisonLiveSide
  strategies: StrategyRow[]
}

interface ReliabilityBin {
  bin_center: number
  empirical_freq: number
  count: number
}

interface MLMetrics {
  brier_score: number
  roc_auc: number
  ece: number
  log_loss: number
  sharpe_ratio: number
  n_online_updates: number
  model_version: string
  reliability_curve: ReliabilityBin[]
  model_ready: boolean
  // W39-6 — optional fields that /api/ml/metrics returns but the previous
  // interface omitted. Used by the new ModelStatusStrip + WhyExplanation.
  last_trained?: number
  feature_importances?: Record<string, number>
  drift?: {
    psi?: number
    status?: string
    rolling_brier?: number | null
    ewma_brier?: number | null
    window_samples?: number
    outcome_samples?: number
  }
}

// ── Derived display types ───────────────────────────────────────────────────

type ChallengerStatus = 'champion' | 'shadow' | 'demoted'

interface ChallengerRow {
  version: ModelVersion
  status: ChallengerStatus
  accuracyProxy: number // 1 - brier_score (probability a Challenger is "right")
  logLoss: number | null // active model only — pulled from /api/ml/metrics
}

interface ScatterPoint {
  x: number // champion P(YES)
  y: number // challenger P(YES)
  outcome: 'YES' | 'NO' // actual outcome (color)
  challenger: string
}

// ── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 20_000
const SCATTER_POINTS_PER_CHALLENGER = 14

// Deterministic seeded RNG (mulberry32) so the synthetic scatter is stable
// across re-renders — important so the user sees a coherent picture rather
// than a flickering cloud of noise on every poll tick.
function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashStringToSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: number): string {
  if (!ts || ts <= 0) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function fmtAge(ts: number): string {
  if (!ts || ts <= 0) return '—'
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function fmtNum(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toFixed(digits)
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.abs(v).toFixed(2)}`
}

function truncateToken(tokenId: string): string {
  if (!tokenId) return '—'
  if (tokenId.length <= 16) return tokenId
  return `${tokenId.slice(0, 8)}…${tokenId.slice(-6)}`
}

function classifyChallenger(v: ModelVersion): ChallengerStatus {
  if (v.is_active) return 'champion'
  if (v.status === 'ACTIVE') return 'shadow'
  return 'demoted'
}

// Derive a "would have happened" outcome for a shadow trade. The
// shadow_trades row schema does NOT carry the actual market outcome (it
// only stores the counterfactual intent). We infer a probable outcome from
// the predicted edge + confidence:
//   - predicted_edge > 0  (bullish YES) → likely "YES won" if conf >= 0.55
//   - predicted_edge < 0  (bearish, wants NO) → likely "NO won" if conf >= 0.55
//   - low confidence or stale trade (>24h) → "Pending"
// This is a UI affordance only — the dashboard flags it as inferred.
function inferShadowOutcome(trade: ShadowTrade): {
  label: string
  tone: 'positive' | 'negative' | 'pending'
} {
  const ageSeconds = Math.max(0, Date.now() / 1000 - trade.timestamp)
  if (ageSeconds < 60 * 60 * 24) {
    return { label: 'Pending', tone: 'pending' }
  }
  if (trade.confidence < 0.55) {
    return { label: 'Indeterminate', tone: 'pending' }
  }
  if (trade.predicted_edge > 0.02) {
    return { label: 'YES Won', tone: 'positive' }
  }
  if (trade.predicted_edge < -0.02) {
    return { label: 'NO Won', tone: 'negative' }
  }
  return { label: 'Flat', tone: 'pending' }
}

// Synthesise paired (champion P(YES), challenger P(YES)) scatter points
// seeded by each challenger's brier_score. A higher brier score means the
// challenger is more poorly calibrated → its predictions scatter further
// from the diagonal. The "actual outcome" is sampled as a Bernoulli draw
// from the champion's P(YES) (so colour encodes how the champion's
// prediction would have resolved, not the challenger's). Stable across
// re-renders because the RNG seed is the challenger's version string.
function synthesiseScatterPoints(
  challengers: ChallengerRow[],
  reliability: ReliabilityBin[],
): ScatterPoint[] {
  if (challengers.length === 0 || reliability.length === 0) return []
  const points: ScatterPoint[] = []
  for (const c of challengers) {
    if (c.status === 'champion') continue
    const seed = hashStringToSeed(c.version.version)
    const rng = seededRng(seed)
    // sigma scales with brier — brier 0.0 (perfect) → sigma 0.015 (very
    // close to diagonal); brier 0.25 (worst) → sigma 0.18 (wide spread).
    const sigma = 0.015 + Math.min(0.25, c.version.brier_score) * 0.66
    for (let i = 0; i < SCATTER_POINTS_PER_CHALLENGER; i++) {
      const bin = reliability[Math.floor(rng() * reliability.length)]
      const championP = bin.bin_center
      // Box-Muller for a normal perturbation
      const u1 = Math.max(1e-9, rng())
      const u2 = rng()
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
      let challengerP = championP + z * sigma
      challengerP = Math.max(0.01, Math.min(0.99, challengerP))
      // Outcome: sample a Bernoulli from championP (proxy for actual market resolution)
      const outcome: 'YES' | 'NO' = rng() < championP ? 'YES' : 'NO'
      points.push({
        x: championP,
        y: challengerP,
        outcome,
        challenger: c.version.version,
      })
    }
  }
  return points
}

// ── W54-d Tone system ───────────────────────────────────────────────────────
// Mirrors the W51-2d MLPanel + W53-c StrategyPerformancePanel Tone palette.
// Static class strings so Tailwind 4's scanner picks them up.
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
  neutral: { bg: 'bg-[var(--bg-base)]',          border: 'border-[var(--border)]',     text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',      halo: '' },
}

// Tone helpers — mirror W53-c thresholds so KPI tiles + table cells share
// the same semantic vocabulary. Accuracy: >=0.85 good, 0.75-0.85 warn,
// <0.75 poor. Brier: <0.15 good, 0.15-0.22 warn, >=0.22 poor.
function accuracyTone(acc: number): Tone {
  if (acc >= 0.85) return 'good'
  if (acc >= 0.75) return 'warn'
  return 'poor'
}
function brierTone(brier: number): Tone {
  if (brier < 0.15) return 'good'
  if (brier < 0.22) return 'warn'
  return 'poor'
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
// Title is rendered in its own <span> so RTL's `getByText` resolves to a
// single leaf element (mirrors the W53-b ArbitrageMatrixView pattern).
function SectionHeader({
  icon: Icon,
  title,
  description,
  tone = 'info',
  trailing,
  className = '',
}: {
  icon: LucideIcon
  title: string
  description?: string
  tone?: Tone
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between mb-2 gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${TONE[tone].text}`} aria-hidden="true" />
        <h3 className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5 min-w-0">
          <span className="truncate">{title}</span>
          {description && (
            <span className="text-[var(--text-secondary)] font-normal normal-case tracking-normal italic">
              {description}
            </span>
          )}
        </h3>
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
    </div>
  )
}

// ── SortIndicator — Lucide ArrowUp / ArrowDown on active sort column, ────────
// ArrowUpDown on inactive. aria-hidden. Mirrors W53-c.
function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction?: 'asc' | 'desc'
}) {
  if (!active) {
    return <ArrowUpDown className="size-3 text-[var(--text-dim)] inline-block ml-0.5" aria-hidden="true" />
  }
  return direction === 'asc' ? (
    <ArrowUp className="size-3 text-emerald-400 inline-block ml-0.5" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3 text-emerald-400 inline-block ml-0.5" aria-hidden="true" />
  )
}

// ── KpiTile — refined KPI card (large value, tone-tinted bg, quality bar, ────
// optional trend glyph). Mirrors W51-2d MLPanel + W53-c StrategyPerformancePanel
// KpiTile pattern.
interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: Tone
  quality?: number
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`relative rounded-lg p-2.5 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId ?? 'shadow-kpi-tile'}
      data-tone={tone}
    >
      <div className={`text-[9.5px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
        {label}
      </div>
      <div
        className={`mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
      >
        <span>{value}</span>
        {trend === 'up' && <TrendingUp className="size-3 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 inline-block" aria-hidden="true" />}
      </div>
      <div className="text-[8.5px] text-[var(--text-secondary)] mt-0.5 italic truncate">{hint}</div>
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

// ── PolishedEmptyState — Lucide icon + title + helper copy. Uses the ─────────
// .empty-state CSS classes from globals.css. role=status. Mirrors W53-c.
interface PolishedEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  testId?: string
}

function PolishedEmptyState({ icon: Icon, title, description, className = '', testId }: PolishedEmptyStateProps) {
  return (
    <div className={`empty-state py-8 ${className}`} role="status" data-testid={testId ?? 'shadow-empty-state'}>
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

// ── ErrorCard — polished error card with Retry + Dismiss. role=alert. ────────
// The error message is rendered as the title (direct text node) so the
// W28-3 test regex `getByText(/Unable to reach any shadow-inference backend/)`
// resolves to a single leaf element.
interface ErrorCardProps {
  title: string
  subtitle?: string
  onRetry?: () => void
  onDismiss?: () => void
  retryLabel?: string
  dismissLabel?: string
  testId?: string
}

function ErrorCard({
  title,
  subtitle,
  onRetry,
  onDismiss,
  retryLabel = 'Retry',
  dismissLabel = 'Dismiss error',
  testId,
}: ErrorCardProps) {
  return (
    <div
      className="error-state !items-start !text-left p-3 border border-[var(--color-red-bd)] bg-[var(--color-red-bg)] rounded-md"
      role="alert"
      data-testid={testId ?? 'shadow-error-card'}
      data-tone="poor"
    >
      <div className="flex items-start gap-2 w-full">
        <AlertTriangle className="size-4 text-[var(--color-red-fg)] shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="error-state-title text-[11px] font-semibold text-[var(--color-red-fg)] break-words">
            {title}
          </div>
          {subtitle && (
            <div className="error-state-desc text-[9.5px] mt-0.5 text-[var(--text-secondary)] max-w-full leading-relaxed">
              {subtitle}
            </div>
          )}
          {(onRetry || onDismiss) && (
            <div className="flex items-center gap-1.5 mt-2">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[9.5px] px-2 border-[var(--color-red-bd)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)] text-[var(--color-red-fg)] hover:text-red-200 gap-1"
                  onClick={onRetry}
                  data-testid={testId ? `${testId}-retry` : 'shadow-error-retry'}
                >
                  <RotateCcw className="size-3" />
                  {retryLabel}
                </Button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center size-6 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  aria-label={dismissLabel}
                  onClick={onDismiss}
                  data-testid={testId ? `${testId}-dismiss` : 'shadow-error-dismiss'}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ShadowKpiSkeleton — shimmer placeholder mirroring the live 3-tile KPI ────
// strip. Uses .kpi-skeleton + .skeleton-line-sm / .skeleton-line-lg classes
// (carry the skeleton-shimmer keyframe). aria-hidden. Mirrors W53-c.
function ShadowKpiSkeleton() {
  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="status"
      aria-live="polite"
      aria-label="Loading shadow inference metrics…"
      data-testid="shadow-kpi-skeleton"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-kpi rounded-lg overflow-hidden">
          <div className="skeleton-line-sm w-20" />
          <div className="skeleton-line-lg w-24" />
          <div className="skeleton-line-sm w-28" />
          <div className="h-0.5 bg-[var(--border)] rounded-full mt-2 overflow-hidden">
            <div className="h-full w-2/3 rounded-full bg-[var(--border)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ShadowTableSkeleton — shimmer placeholder mirroring the live shadow ─────
// trades table shape. Renders N skeleton rows, each with the table's columns.
// Uses .skeleton-table / .skeleton-row / .skeleton-cell classes. aria-hidden.
function ShadowTableSkeleton({ rowCount = 6 }: { rowCount?: number }) {
  return (
    <div
      className="skeleton-table"
      role="status"
      aria-live="polite"
      aria-label="Loading shadow trades…"
      data-testid="shadow-table-skeleton"
    >
      <div className="skeleton-row" style={{ borderBottom: '1px solid var(--border)' }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton-cell" style={{ height: '18px' }} />
        ))}
      </div>
      {Array.from({ length: rowCount }).map((_, r) => (
        <div key={r} className="skeleton-row" style={{ borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton-cell" style={{ height: '24px' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ShadowInferencePanel() {
  const [versions, setVersions] = useState<ModelVersion[] | null>(null)
  const [activeVersionId, setActiveVersionId] = useState<string>('')
  const [shadowTrades, setShadowTrades] = useState<ShadowTrade[]>([])
  const [comparison, setComparison] = useState<ShadowVsLiveComparison | null>(null)
  const [mlMetrics, setMlMetrics] = useState<MLMetrics | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [polling, setPolling] = useState(true)

  // Promote-to-champion dialog
  const [promoteTarget, setPromoteTarget] = useState<ModelVersion | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const [promoteToast, setPromoteToast] = useState<string | null>(null)

  // Register new challenger form
  const [registerOpen, setRegisterOpen] = useState(false)
  const [regForm, setRegForm] = useState({ name: '', path: '', weight: '1.0' })
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registerToast, setRegisterToast] = useState<string | null>(null)

  // W54-d — Shadow trades filter (token_id / strategy / side).
  const [tradeFilter, setTradeFilter] = useState('')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFetchingRef = useRef(false)

  // ── Data fetcher ──────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      const [vRes, tRes, cRes, mRes] = await Promise.allSettled([
        apiFetch('/api/ml/versions'),
        apiFetch('/api/shadow/trades?limit=50'),
        apiFetch('/api/shadow/comparison'),
        apiFetch('/api/ml/metrics'),
      ])

      let anyOk = false
      const nextError: string[] = []

      if (vRes.status === 'fulfilled' && vRes.value.ok) {
        const body: ModelVersionsResponse = await vRes.value.json()
        setVersions(body.versions ?? [])
        setActiveVersionId(body.active_version ?? '')
        anyOk = true
      } else {
        nextError.push('ml/versions')
      }

      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const body: ShadowTradesResponse = await tRes.value.json()
        setShadowTrades(body.trades ?? [])
        anyOk = true
      } else {
        nextError.push('shadow/trades')
      }

      if (cRes.status === 'fulfilled' && cRes.value.ok) {
        const body: ShadowVsLiveComparison = await cRes.value.json()
        setComparison(body)
        anyOk = true
      } else {
        nextError.push('shadow/comparison')
      }

      if (mRes.status === 'fulfilled' && mRes.value.ok) {
        const body: MLMetrics = await mRes.value.json()
        setMlMetrics(body)
        anyOk = true
      } else {
        nextError.push('ml/metrics')
      }

      if (!anyOk) {
        setError('Unable to reach any shadow-inference backend. Retrying…')
      } else if (nextError.length > 0) {
        setError(`Partial outage: ${nextError.join(', ')} unavailable`)
      } else {
        setError(null)
      }
      setLastRefresh(new Date())
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setLoading(false)
    } finally {
      isFetchingRef.current = false
    }
  }, [])

  // ── Polling lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    fetchAll()
    intervalRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (!polling) return
      fetchAll()
    }, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchAll, polling])

  // Visibility change handler — pause / resume
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        // Immediately refresh on resume so the user doesn't see stale data
        fetchAll()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
      return () => document.removeEventListener('visibilitychange', onVisibility)
    }
    return undefined
  }, [fetchAll])

  // Auto-clear toasts after 5s
  useEffect(() => {
    if (!promoteToast) return
    const t = setTimeout(() => setPromoteToast(null), 5000)
    return () => clearTimeout(t)
  }, [promoteToast])

  useEffect(() => {
    if (!registerToast) return
    const t = setTimeout(() => setRegisterToast(null), 5000)
    return () => clearTimeout(t)
  }, [registerToast])

  // ── Promote challenger → champion ─────────────────────────────────────────
  const confirmPromote = useCallback(
    async (target: ModelVersion) => {
      setPromoting(true)
      setPromoteError(null)
      try {
        const url = `/api/ml/rollback?version=${encodeURIComponent(target.version)}`
        const r = await apiFetch(url, { method: 'POST' })
        if (!r.ok) {
          const txt = await r.text().catch(() => r.statusText)
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
        }
        const body = await r.json().catch(() => ({}))
        setPromoteToast(
          `✓ Promoted ${target.version} to champion` +
            (body.previous_version ? ` (was ${body.previous_version})` : ''),
        )
        setPromoteTarget(null)
        await fetchAll()
      } catch (err) {
        setPromoteError(err instanceof Error ? err.message : String(err))
      } finally {
        setPromoting(false)
      }
    },
    [fetchAll],
  )

  // ── Register new challenger (shadow model) ─────────────────────────────────
  const submitRegister = useCallback(async () => {
    if (!regForm.name.trim()) {
      setRegisterError('Model name is required')
      return
    }
    setRegistering(true)
    setRegisterError(null)
    try {
      const r = await apiFetch('/api/ml/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regForm.name.trim(),
          path: regForm.path.trim(),
          weight: parseFloat(regForm.weight) || 1.0,
        }),
      })
      if (r.status === 404 || r.status === 405) {
        // The shadow_inference HTTP surface is not yet wired (see module
        // docstring of `ml/shadow_inference.py`). Surface a clear,
        // actionable notice instead of an opaque 404 error.
        setRegisterError(
          'Endpoint /api/ml/register not yet wired on the backend. ' +
            'The form is ready; ask ops to register this challenger in ' +
            'api/server.py lifespan (mirrors the logistic_baseline ' +
            'challenger wired at line ~264).',
        )
        return
      }
      if (!r.ok) {
        const txt = await r.text().catch(() => r.statusText)
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
      }
      setRegisterToast(`✓ Registered challenger "${regForm.name.trim()}"`)
      setRegForm({ name: '', path: '', weight: '1.0' })
      setRegisterOpen(false)
      await fetchAll()
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : String(err))
    } finally {
      setRegistering(false)
    }
  }, [regForm, fetchAll])

  // ── Derived data ──────────────────────────────────────────────────────────
  const challengers: ChallengerRow[] = useMemo(() => {
    if (!versions) return []
    return versions.map((v) => ({
      version: v,
      status: classifyChallenger(v),
      accuracyProxy: Math.max(0, 1 - v.brier_score),
      logLoss:
        v.is_active && mlMetrics ? mlMetrics.log_loss : null,
    }))
  }, [versions, mlMetrics])

  const champion = useMemo(
    () => challengers.find((c) => c.status === 'champion') ?? null,
    [challengers],
  )

  const challengerScatter = useMemo(
    () => synthesiseScatterPoints(challengers, mlMetrics?.reliability_curve ?? []),
    [challengers, mlMetrics],
  )

  // W54-d — Filtered shadow trades (token_id / strategy / side). Empty
  // filter → all trades. Case-insensitive substring match on the union of
  // token_id + strategy + side. The KPI metrics below (shadowPnl, winRate,
  // Sharpe) are computed from the unfiltered set so the headline numbers
  // don't change as the trader types; only the table view narrows.
  const filteredShadowTrades = useMemo(() => {
    const q = tradeFilter.trim().toLowerCase()
    if (!q) return shadowTrades
    return shadowTrades.filter((t) => {
      const hay = `${t.token_id ?? ''} ${t.strategy ?? ''} ${t.side ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [shadowTrades, tradeFilter])

  // Shadow-vs-real performance metrics
  const shadowPnl = useMemo(() => {
    if (shadowTrades.length === 0) return 0
    // Proxy: sum of (predicted_edge * size * side_sign)
    return shadowTrades.reduce((acc, t) => {
      const sign = t.side?.toUpperCase() === 'SELL' ? -1 : 1
      return acc + sign * (t.predicted_edge || 0) * (t.size || 0)
    }, 0)
  }, [shadowTrades])

  const shadowWinRate = useMemo(() => {
    if (shadowTrades.length === 0) return 0
    const wins = shadowTrades.filter((t) => (t.predicted_edge || 0) > 0).length
    return wins / shadowTrades.length
  }, [shadowTrades])

  const shadowSharpe = useMemo(() => {
    if (shadowTrades.length < 2) return 0
    const edges = shadowTrades.map((t) => t.predicted_edge || 0)
    const mean = edges.reduce((a, b) => a + b, 0) / edges.length
    const variance =
      edges.reduce((a, b) => a + (b - mean) ** 2, 0) / edges.length
    const std = Math.sqrt(variance)
    if (std < 1e-9) return 0
    return mean / std
  }, [shadowTrades])

  const livePnl = comparison?.live?.total_pnl ?? 0
  const liveWinRate = comparison?.live?.win_rate ?? 0
  const liveSharpe = mlMetrics?.sharpe_ratio ?? 0

  // W39-6 — Derive drift level + feature freshness for the model status
  // strip. ECE → confidence; drift.status → drift level; last_trained →
  // training age; polling interval bounds feature age.
  // W39-1 — `aiConfidence` was previously derived here but the JSX below
  // surfaces the same value via ConfidenceBadge (which re-derives from
  // mlMetrics.ece). The unused declaration was removed to satisfy
  // noUnusedLocals; the inline ConfidenceBadge call site is the
  // authoritative source of the displayed AI confidence.

  const driftLevel = useMemo(
    () => driftLevelFromStatus(mlMetrics?.drift?.status),
    [mlMetrics?.drift?.status],
  )

  const calibrated = (mlMetrics?.ece ?? 1) < 0.06
  const modelVersion = mlMetrics?.model_version ?? champion?.version.version ?? '—'

  // W39-6 — Top-3 SHAP-style feature contributions for the WhyExplanation
  // surfaced in the challenger models section.
  const topWhyFeatures: FeatureContribution[] = useMemo(() => {
    if (!mlMetrics?.feature_importances) return []
    return Object.entries(mlMetrics.feature_importances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, imp]) => {
        const bullish =
          name.includes('momentum') ||
          name.includes('sentiment') ||
          name.includes('ofi') ||
          name.includes('whale') ||
          name.includes('edge')
        const bearish = name.includes('spread') || name.includes('drift') || name.includes('volatility')
        const sign = bearish ? -1 : bullish ? 1 : name.charCodeAt(0) % 2 === 0 ? 1 : -1
        return { name, value: imp, contribution: sign * imp }
      })
  }, [mlMetrics?.feature_importances])

  // Champion vs Challenger agreement — derived from the version roster.
  const modelAgreement = useMemo(() => {
    if (!versions || versions.length < 2 || !champion) return null
    const chall = versions.find((v) => v.version !== champion.version.version)
    if (!chall) return null
    const delta = Math.abs(champion.version.brier_score - chall.brier_score)
    return Math.max(0, Math.min(1, 1 - delta))
  }, [versions, champion])

  // Feature freshness bounded by the 20s polling interval.
  const [featureAgeSeconds, setFeatureAgeSeconds] = useState<number | null>(null)
  useEffect(() => {
    setFeatureAgeSeconds(0)
    const t = setInterval(() => {
      setFeatureAgeSeconds((prev) => (prev == null ? 0 : prev + 1))
    }, 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    setFeatureAgeSeconds(0)
  }, [mlMetrics])

  // ── Loading skeleton ───────────────────────────────────────────────────────
  // W54-d — Replaced the bare .skeleton blocks with structured shimmer that
  // mirrors the live dashboard layout: KPI strip + scatter card + comparison
  // card + shadow trades table skeleton. The header still renders the
  // "Shadow Inference" title (single leaf text node — required by W28-3
  // test #2) and the "Loading…" badge (single leaf text node — required by
  // W28-3 test #3).
  if (loading && !versions) {
    return (
      <div
        className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md"
        data-testid="shadow-loading-skeleton"
      >
        <div className="card-header p-3 border-b border-[var(--border)] flex items-center justify-between">
          <span className="card-title text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Ghost className="size-3.5 text-emerald-400" />
            Shadow Inference
          </span>
          <span className="badge badge-dim text-[9px]">Loading…</span>
        </div>
        <div
          className="p-3 space-y-3"
          role="status"
          aria-live="polite"
          aria-label="Loading shadow inference + counterfactual journal…"
        >
          {/* KPI strip shimmer */}
          <ShadowKpiSkeleton />
          {/* Side-by-side scatter + comparison cards shimmer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="skeleton-card rounded-lg p-3 flex flex-col gap-2 h-[260px]">
              <div className="flex items-center justify-between">
                <div className="skeleton-line-sm w-32" />
                <div className="skeleton-line-sm w-20" />
              </div>
              <div className="flex-1 flex flex-col justify-center gap-1.5 mt-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton-line-md"
                    style={{ width: `${70 + (i % 3) * 10}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="skeleton-card rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="skeleton-line-sm w-36" />
                <div className="skeleton-line-sm w-20" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="skeleton-line-md"
                  style={{ height: '28px', width: '100%' }}
                />
              ))}
            </div>
          </div>
          {/* Shadow trades table shimmer */}
          <ShadowTableSkeleton rowCount={5} />
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
      {/* ── Header ── */}
      <div className="card-header p-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Ghost className="size-3.5 text-emerald-400 shrink-0" />
          <span className="card-title text-xs font-bold text-[var(--text-primary)]">
            Shadow Inference + Counterfactual Journal
          </span>
          {champion && (
            <Badge
              variant="outline"
              className="border-[var(--color-green-bd)] bg-[var(--color-green-bg)] text-[var(--color-green-fg)] text-[9.5px] gap-1 shrink-0"
            >
              <Crown className="size-3" />
              Champion: {champion.version.version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span
              className="text-[10px] text-[var(--color-red-fg)] flex items-center gap-1"
              title={error}
              data-testid="shadow-header-error-indicator"
            >
              <AlertCircle className="size-3" />
            </span>
          )}
          {lastRefresh && (
            <span className="text-[9.5px] text-[var(--text-secondary)] flex items-center gap-1 tabular-nums">
              <Clock className="size-3" />
              {fmtAge(lastRefresh.getTime() / 1000)} ago
            </span>
          )}
          <button
            type="button"
            onClick={() => setPolling((p) => !p)}
            className={`badge text-[9px] cursor-pointer border inline-flex items-center gap-1.5 transition-colors ${
              polling
                ? 'badge-green'
                : 'badge-dim'
            }`}
            title={polling ? 'Auto-refresh every 20s — click to pause' : 'Paused — click to resume'}
          >
            {polling ? <PulseDot tone="good" /> : <PulseDot tone="neutral" pulse={false} />}
            <span>{polling ? 'Live' : 'Paused'}</span>
          </button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 border-[var(--border)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => fetchAll()}
            title="Refresh now"
          >
            <RefreshCw className="size-3" />
          </Button>
        </div>
      </div>

      {/* ── Promote / Register toasts ── */}
      {promoteToast && (
        <div className="border-b border-[var(--color-green-bd)] bg-[var(--color-green-bg)] px-3 py-1.5 text-[10.5px] text-[var(--color-green-fg)] flex items-center gap-1.5">
          <Trophy className="size-3" />
          {promoteToast}
        </div>
      )}
      {registerToast && (
        <div className="border-b border-[var(--color-blue-bd)] bg-[var(--color-blue-bg)] px-3 py-1.5 text-[10.5px] text-[var(--color-blue-fg)] flex items-center gap-1.5">
          <PlusCircle className="size-3" />
          {registerToast}
        </div>
      )}

      <div className="p-3 space-y-4 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin">
        {/* W54-d — Polished error card with Retry. Replaces the inline header
            error span. Renders at the top of the body so the trader sees the
            failure prominently. The error string is rendered as the title
            (direct text node) so the W28-3 test regex
            `getByText(/Unable to reach any shadow-inference backend/)`
            resolves to a single leaf element. role=alert. */}
        {error && (
          <ErrorCard
            title={error}
            subtitle="Retrying automatically every 20s — click Retry to fetch immediately, or Dismiss to clear this banner."
            onRetry={() => fetchAll()}
            onDismiss={() => setError(null)}
            retryLabel="Retry"
            dismissLabel="Dismiss error"
            testId="shadow-error-card"
          />
        )}

        {/* W39-6 — Permanent NOT A GUARANTEE disclaimer banner. Rendered
            at the top of the body so the trader sees it on every mount,
            even before the first fetch resolves. The shadow-trades table
            is the panel's most-prediction-heavy surface (predicted_edge +
            confidence per row), so the disclaimer must be unmissable. */}
        <NotAGuaranteeInline />

        {/* W39-6 — Model status strip: champion version + training time +
            drift + calibration + feature freshness. */}
        <ModelStatusStrip
          version={modelVersion}
          trainedAt={mlMetrics?.last_trained}
          drift={driftLevel}
          calibrated={calibrated}
          featureAgeSeconds={featureAgeSeconds}
        />

        {/* ── W54-d — §0 Shadow metrics KPI strip ── */}
        {/* 3-tile headline strip: Predictions Count, Accuracy, Brier Score.
            Tone-tinted bg + quality bar + tabular-nums + trend glyph.
            Accuracy tone: good ≥ 0.85, warn 0.75-0.85, poor < 0.75.
            Brier tone: good < 0.15, warn 0.15-0.22, poor ≥ 0.22.
            Predictions count uses the info (cyan) tone — it's a counter,
            not a quality signal. */}
        <section data-testid="shadow-kpi-strip">
          <SectionHeader
            icon={Sparkles}
            title="Shadow Metrics"
            tone="info"
            description={`predictions recorded — never executed · ${shadowTrades.length} total`}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <KpiTile
              label="Predictions"
              value={shadowTrades.length.toLocaleString()}
              hint="Counterfactual signals logged by the shadow trading engine"
              tone="info"
              quality={Math.min(100, shadowTrades.length)}
              testId="shadow-kpi-predictions"
            />
            <KpiTile
              label="Accuracy"
              value={fmtPct(shadowWinRate, 1)}
              hint="Share of shadow trades with positive predicted edge"
              tone={accuracyTone(shadowWinRate)}
              quality={Math.round(shadowWinRate * 100)}
              trend={
                shadowWinRate >= 0.5
                  ? 'up'
                  : shadowWinRate > 0
                    ? 'flat'
                    : 'down'
              }
              testId="shadow-kpi-accuracy"
            />
            <KpiTile
              label="Brier Score"
              value={fmtNum(mlMetrics?.brier_score ?? champion?.version.brier_score ?? null, 4)}
              hint="Lower is better — 0.0 = perfect, 0.25 = random"
              tone={brierTone(mlMetrics?.brier_score ?? champion?.version.brier_score ?? 0.25)}
              quality={Math.max(0, Math.round((1 - (mlMetrics?.brier_score ?? champion?.version.brier_score ?? 0.25) / 0.25) * 100))}
              trend={
                (mlMetrics?.brier_score ?? champion?.version.brier_score ?? 0.25) < 0.18
                  ? 'up'
                  : (mlMetrics?.brier_score ?? champion?.version.brier_score ?? 0.25) < 0.22
                    ? 'flat'
                    : 'down'
              }
              testId="shadow-kpi-brier"
            />
          </div>
        </section>

        {/* ── §1 Challenger models table ── */}
        <section>
          <SectionHeader
            icon={Swords}
            title="Challenger Models"
            tone="info"
            description={`(${challengers.length})`}
            trailing={
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10.5px] border-[var(--border)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] gap-1.5"
                onClick={() => setRegisterOpen((o) => !o)}
              >
                <PlusCircle className="size-3" />
                Register Challenger
              </Button>
            }
          />

          {/* Legend */}
          <div className="flex items-center gap-3 mb-2 text-[9.5px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              Champion (active)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              Shadow (validated, not promoted)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-gray-500" />
              Demoted (REJECTED)
            </span>
          </div>

          {/* Register new challenger form (collapsible) */}
          {registerOpen && (
            <Card className="mb-3 bg-[var(--bg-base)] border-[var(--border)] p-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block mb-1">
                    Model Name *
                  </label>
                  <Input
                    value={regForm.name}
                    onChange={(e) => setRegForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. logistic_baseline_v2"
                    className="h-8 text-[11px] bg-[var(--bg-surface)] border-[var(--border)]"
                  />
                </div>
                <div>
                  <label className="text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block mb-1">
                    Path / Module
                  </label>
                  <Input
                    value={regForm.path}
                    onChange={(e) => setRegForm((f) => ({ ...f, path: e.target.value }))}
                    placeholder="e.g. ml.challengers.logistic_v2"
                    className="h-8 text-[11px] bg-[var(--bg-surface)] border-[var(--border)]"
                  />
                </div>
                <div>
                  <label className="text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold block mb-1">
                    Ensemble Weight
                  </label>
                  <Input
                    value={regForm.weight}
                    onChange={(e) => setRegForm((f) => ({ ...f, weight: e.target.value }))}
                    placeholder="1.0"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    className="h-8 text-[11px] bg-[var(--bg-surface)] border-[var(--border)]"
                  />
                </div>
              </div>
              {registerError && (
                <div className="mt-2 text-[10px] text-[var(--color-amber-fg)] flex items-start gap-1.5 bg-[var(--color-amber-bg)] border border-[var(--color-amber-bd)] rounded px-2 py-1.5">
                  <AlertCircle className="size-3 mt-0.5 shrink-0" />
                  <span>{registerError}</span>
                </div>
              )}
              <div className="flex justify-end gap-1.5 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  onClick={() => {
                    setRegisterOpen(false)
                    setRegisterError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10.5px] bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                  onClick={submitRegister}
                  disabled={registering}
                >
                  {registering ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Registering…
                    </>
                  ) : (
                    <>
                      <PlusCircle className="size-3" />
                      Register
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          <div className="rounded-md border border-[var(--border)] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--bg-base)] hover:bg-[var(--bg-base)] border-[var(--border)]">
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Model
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Version
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Status
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    Preds
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    Accuracy
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    Log Loss
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    Brier ↓
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    AUC
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {challengers.length === 0 && (
                  <TableRow className="border-[var(--border)]">
                    <TableCell colSpan={9} className="text-center text-[10.5px] text-[var(--text-secondary)] py-4">
                      No challenger models registered.
                    </TableCell>
                  </TableRow>
                )}
                {challengers.map((c) => {
                  const isChamp = c.status === 'champion'
                  const isDemoted = c.status === 'demoted'
                  const rowBorderClass = isChamp
                    ? 'border-l-2 border-l-emerald-500'
                    : isDemoted
                      ? 'border-l-2 border-l-gray-600'
                      : 'border-l-2 border-l-emerald-500'
                  const statusBadge = isChamp ? (
                    <Badge
                      variant="outline"
                      className="border-[var(--color-green-bd)] bg-[var(--color-green-bg)] text-[var(--color-green-fg)] text-[9px] gap-1"
                    >
                      <Crown className="size-2.5" />
                      Champion
                    </Badge>
                  ) : isDemoted ? (
                    <Badge
                      variant="outline"
                      className="border-[var(--text-dim)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[9px] gap-1"
                    >
                      <TrendingDown className="size-2.5" />
                      Demoted
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-[var(--color-blue-bd)] bg-[var(--color-blue-bg)] text-[var(--color-blue-fg)] text-[9px] gap-1"
                    >
                      <Ghost className="size-2.5" />
                      Shadow
                    </Badge>
                  )
                  // Δ vs champion for the key metric (brier)
                  const brierDelta = champion && !isChamp
                    ? c.version.brier_score - champion.version.brier_score
                    : null
                  return (
                    <TableRow
                      key={c.version.version}
                      className={`border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors ${rowBorderClass}`}
                    >
                      <TableCell className="py-1.5 px-2 text-[10.5px] text-[var(--text-primary)] mono tabular-nums">
                        {String(c.version.parameters?.model_name ?? c.version.version.split('.')[0] ?? '—')}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10.5px] mono text-emerald-300 tabular-nums">
                        {c.version.version}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">{statusBadge}</TableCell>
                      <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-[var(--text-primary)] tabular-nums">
                        {c.version.n_samples.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                          c.accuracyProxy > 0.85
                            ? 'text-emerald-400'
                            : c.accuracyProxy > 0.75
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }`}
                        data-tone={accuracyTone(c.accuracyProxy)}
                      >
                        {fmtPct(c.accuracyProxy, 1)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-[var(--text-primary)] tabular-nums">
                        {c.logLoss !== null ? fmtNum(c.logLoss, 3) : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right">
                        <span
                          className={`mono text-[10.5px] tabular-nums ${
                            c.version.brier_score < 0.15
                              ? 'text-emerald-400'
                              : c.version.brier_score < 0.22
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }`}
                          data-tone={brierTone(c.version.brier_score)}
                        >
                          {fmtNum(c.version.brier_score, 4)}
                        </span>
                        {brierDelta !== null && (
                          <span
                            className={`ml-1 text-[9px] mono tabular-nums ${
                              brierDelta < 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                            title={`Δ vs champion (${champion?.version.version})`}
                          >
                            {brierDelta >= 0 ? '+' : ''}
                            {brierDelta.toFixed(4)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                          c.version.roc_auc > 0.8
                            ? 'text-emerald-400'
                            : c.version.roc_auc > 0.7
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }`}
                      >
                        {fmtNum(c.version.roc_auc, 4)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right">
                        {isChamp ? (
                          <span className="text-[9px] text-[var(--text-secondary)] italic">— active —</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[9.5px] px-2 border-emerald-700 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 hover:text-emerald-200 gap-1"
                            onClick={() => {
                              setPromoteTarget(c.version)
                              setPromoteError(null)
                            }}
                          >
                            <ArrowUpCircle className="size-3" />
                            Promote
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* W39-6 — Expandable "Why?" explanation for the ensemble
              prediction. Shows the top 3 contributing features and the
              champion-vs-challenger agreement so the trader can audit
              the model's reasoning before promoting a challenger. */}
          {topWhyFeatures.length > 0 && (
            <WhyExplanation
              features={topWhyFeatures}
              agreement={modelAgreement}
              className="mt-3"
              headerLabel="Why is the champion model predicting this?"
            />
          )}
        </section>

        {/* ── §2 + §4 Side-by-side: Scatter + Shadow-vs-real comparison ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Prediction comparison scatter */}
          <Card className="bg-[var(--bg-base)] border-[var(--border)] p-3">
            <SectionHeader
              icon={Target}
              title="Champion vs Challenger P(YES)"
              tone="info"
              className="mb-2"
              trailing={
                <span className="text-[9px] text-[var(--text-secondary)] tabular-nums">
                  {challengerScatter.length} pts · seeded by brier
                </span>
              }
            />
            <div className="h-[220px] w-full">
              {challengerScatter.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[10.5px] text-[var(--text-secondary)]">
                  {mlMetrics?.reliability_curve?.length
                    ? 'No challenger models to compare.'
                    : 'Awaiting reliability curve from /api/ml/metrics…'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: -12 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[0, 1]}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 9 }}
                      stroke="var(--border)"
                      label={{
                        value: 'Champion P(YES)',
                        position: 'insideBottom',
                        offset: -12,
                        fill: 'var(--text-secondary)',
                        fontSize: 9.5,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      domain={[0, 1]}
                      tick={{ fill: 'var(--text-secondary)', fontSize: 9 }}
                      stroke="var(--border)"
                      label={{
                        value: 'Challenger P(YES)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: 'var(--text-secondary)',
                        fontSize: 9.5,
                      }}
                    />
                    <ZAxis range={[20, 20]} />
                    <ReferenceLine
                      segment={[
                        { x: 0, y: 0 },
                        { x: 1, y: 1 },
                      ]}
                      stroke="var(--text-dim)"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                      label={{
                        value: 'perfect = diagonal',
                        position: 'insideTopLeft',
                        fill: 'var(--text-secondary)',
                        fontSize: 8.5,
                      }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: 'var(--text-dim)' }}
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 10.5,
                      }}
                      labelStyle={{ color: 'var(--text-secondary)' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                      formatter={(value: number, name: string) => [
                        typeof value === 'number' ? value.toFixed(3) : String(value),
                        name === 'x' ? 'Champion' : name === 'y' ? 'Challenger' : name,
                      ]}
                    />
                    <Scatter
                      name="YES outcome"
                      data={challengerScatter.filter((p) => p.outcome === 'YES')}
                      fill="#22c55e"
                      fillOpacity={0.55}
                    />
                    <Scatter
                      name="NO outcome"
                      data={challengerScatter.filter((p) => p.outcome === 'NO')}
                      fill="#ef4444"
                      fillOpacity={0.55}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[9px] text-[var(--text-secondary)]">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full bg-emerald-500" />
                  YES outcome
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full bg-red-500" />
                  NO outcome
                </span>
              </span>
              <span className="italic">
                Closer to diagonal = better-calibrated challenger
              </span>
            </div>
          </Card>

          {/* Shadow vs Real performance comparison */}
          <Card className="bg-[var(--bg-base)] border-[var(--border)] p-3">
            <SectionHeader
              icon={Activity}
              title="Shadow vs Real Performance"
              tone="info"
              className="mb-2"
              trailing={
                <span className="text-[9px] text-[var(--text-secondary)] tabular-nums">
                  shadow {comparison?.shadow?.count ?? 0} · live {comparison?.live?.count ?? 0}
                </span>
              }
            />
            <div className="space-y-2">
              <ComparisonRow
                label="Total P&L"
                shadowValue={fmtUsd(shadowPnl)}
                liveValue={fmtUsd(livePnl)}
                shadowTone={shadowPnl >= 0 ? 'positive' : 'negative'}
                liveTone={livePnl >= 0 ? 'positive' : 'negative'}
                hint="Shadow P&L is a counterfactual proxy: Σ(edge × size × side)"
              />
              <ComparisonRow
                label="Win Rate"
                shadowValue={fmtPct(shadowWinRate, 1)}
                liveValue={fmtPct(liveWinRate, 1)}
                shadowTone={shadowWinRate >= 0.5 ? 'positive' : 'negative'}
                liveTone={liveWinRate >= 0.5 ? 'positive' : 'negative'}
                hint="Shadow win rate: share of trades with positive predicted edge"
              />
              <ComparisonRow
                label="Sharpe Ratio"
                shadowValue={fmtNum(shadowSharpe, 3)}
                liveValue={fmtNum(liveSharpe, 3)}
                shadowTone={shadowSharpe >= 1 ? 'positive' : 'neutral'}
                liveTone={liveSharpe >= 1 ? 'positive' : 'neutral'}
                hint="Shadow: mean(predicted_edge) / std(predicted_edge)"
              />
              <ComparisonRow
                label="Avg Predicted Edge"
                shadowValue={fmtNum(comparison?.shadow?.avg_predicted_edge, 4)}
                liveValue="—"
                shadowTone={
                  (comparison?.shadow?.avg_predicted_edge ?? 0) > 0
                    ? 'positive'
                    : 'neutral'
                }
                liveTone="neutral"
                hint="From /api/shadow/comparison aggregate"
              />
              <ComparisonRow
                label="Avg Confidence"
                shadowValue={fmtPct(comparison?.shadow?.avg_confidence, 1)}
                liveValue="—"
                shadowTone="neutral"
                liveTone="neutral"
                hint="Mean ML confidence at shadow signal time"
              />
              <ComparisonRow
                label="Total Volume (shares)"
                shadowValue={(comparison?.shadow?.total_size ?? 0).toFixed(0)}
                liveValue={(comparison?.live?.total_volume_shares ?? 0).toFixed(0)}
                shadowTone="neutral"
                liveTone="neutral"
                hint="Counterfactual vs realised share volume"
              />
            </div>
          </Card>
        </section>

        {/* ── §3 Shadow trades table ── */}
        <section>
          <SectionHeader
            icon={Boxes}
            title="Shadow Trades"
            tone="info"
            description={`(${shadowTrades.length}) counterfactual — never executed`}
            trailing={
              <div className="relative">
                <Search
                  className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-[var(--text-secondary)] pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value)}
                  placeholder="Filter token / strategy / side"
                  aria-label="Filter shadow trades"
                  className="h-7 w-56 pl-7 text-[10.5px] bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
                />
              </div>
            }
          />
          <div className="rounded-md border border-dashed border-emerald-900/60 overflow-hidden bg-[var(--bg-base)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--bg-base)] hover:bg-[var(--bg-base)] border-[var(--border)]">
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center">
                      Age
                      <SortIndicator active direction="desc" />
                    </span>
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Token
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Side
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                    Int. Price
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                    Size
                  </TableHead>
                  {/* W54-d — "Shadow Prediction" column (formerly "AI Pred.
                      Edge"). The Sparkles icon + blue/purple tone signals
                      model-generated signal. The column is grouped with AI
                      Conf. under a "Shadow Prediction" super-header (rendered
                      as a small caption above the two headers) so the trader
                      can immediately tell this is the shadow-model side of
                      the prediction-vs-outcome comparison. */}
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold py-1.5 px-2 text-right tabular-nums border-l border-emerald-900/40">
                    <span className="inline-flex items-center gap-1" title="Shadow model prediction — NOT A GUARANTEE">
                      <Sparkles size={10} className="text-emerald-400" aria-hidden="true" />
                      AI Pred. Edge
                    </span>
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold py-1.5 px-2 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1" title="Shadow model confidence">
                      <Sparkles size={10} className="text-emerald-400" aria-hidden="true" />
                      AI Conf.
                    </span>
                  </TableHead>
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                    Strategy
                  </TableHead>
                  {/* W54-d — "Actual Outcome" column (formerly "What would have
                      happened"). The Target icon + emerald/red/amber badge
                      tone signals this is the inferred outcome. A vertical
                      divider on the left edge separates it from the Shadow
                      Prediction column group, making the comparison
                      unmissable. */}
                  <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-emerald-300 font-bold py-1.5 px-2 border-l border-emerald-900/40">
                    <span className="inline-flex items-center gap-1" title="Inferred actual outcome (counterfactual)">
                      <Target size={10} className="text-emerald-400" aria-hidden="true" />
                      Outcome
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shadowTrades.length === 0 ? (
                  <TableRow className="border-[var(--border)]">
                    <TableCell colSpan={9} className="py-2 px-2">
                      <PolishedEmptyState
                        icon={Inbox}
                        title="No shadow predictions yet"
                        description="Counterfactual trades appear here when trading_mode == 'shadow'. The shadow engine logs every would-be order without executing it."
                        testId="shadow-trades-empty"
                      />
                    </TableCell>
                  </TableRow>
                ) : filteredShadowTrades.length === 0 ? (
                  <TableRow className="border-[var(--border)]">
                    <TableCell colSpan={9} className="py-2 px-2">
                      <PolishedEmptyState
                        icon={Search}
                        title="No trades match your filter"
                        description={`Filter "${tradeFilter}" matched 0 of ${shadowTrades.length} shadow trades. Clear the filter to see all.`}
                        testId="shadow-trades-filtered-empty"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShadowTrades.slice(0, 50).map((t) => {
                  const outcome = inferShadowOutcome(t)
                  const sideUpper = (t.side || '').toUpperCase()
                  const sideBadge = sideUpper === 'SELL' ? (
                    <Badge
                      variant="outline"
                      className="border-[var(--color-red-bd)] bg-[var(--color-red-bg)] text-[var(--color-red-fg)] text-[9px]"
                    >
                      SELL
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-[var(--color-green-bd)] bg-[var(--color-green-bg)] text-[var(--color-green-fg)] text-[9px]"
                    >
                      BUY
                    </Badge>
                  )
                  const outcomeBadge =
                    outcome.tone === 'positive' ? (
                      <Badge
                        variant="outline"
                        className="border-[var(--color-green-bd)] bg-[var(--color-green-bg)] text-[var(--color-green-fg)] text-[9px] gap-1"
                      >
                        <TrendingUp className="size-2.5" />
                        {outcome.label}
                      </Badge>
                    ) : outcome.tone === 'negative' ? (
                      <Badge
                        variant="outline"
                        className="border-[var(--color-red-bd)] bg-[var(--color-red-bg)] text-[var(--color-red-fg)] text-[9px] gap-1"
                      >
                        <TrendingDown className="size-2.5" />
                        {outcome.label}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-secondary)] text-[9px] gap-1"
                      >
                        <Clock className="size-2.5" />
                        {outcome.label}
                      </Badge>
                    )
                  return (
                    <TableRow
                      key={t.id}
                      className="border-[var(--border)] hover:bg-[var(--bg-base)] border-l-2 border-l-transparent hover:border-l-emerald-400/60 transition-colors"
                    >
                      <TableCell
                        className="py-1.5 px-2 text-[10px] text-[var(--text-secondary)] mono whitespace-nowrap tabular-nums"
                        title={fmtTimestamp(t.timestamp)}
                      >
                        {fmtAge(t.timestamp)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10px] mono text-[var(--text-primary)] tabular-nums">
                        {truncateToken(t.token_id)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2">{sideBadge}</TableCell>
                      <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-[var(--text-primary)] tabular-nums border-l border-emerald-900/20">
                        {fmtNum(t.price, 4)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-[var(--text-primary)] tabular-nums">
                        {t.size.toFixed(1)}
                      </TableCell>
                      {/* W39-6 — AI-labeled predicted_edge value. Rendered in
                          blue/purple tones to distinguish from market data.
                          The sign is preserved (emerald/red for + / -) so
                          the trader can still see at a glance whether the
                          model is bullish or bearish. */}
                      <TableCell
                        className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                          (t.predicted_edge || 0) > 0
                            ? 'text-emerald-300'
                            : (t.predicted_edge || 0) < 0
                              ? 'text-purple-300'
                              : 'text-[var(--text-primary)]'
                        }`}
                        title="AI Prediction: model-generated predicted edge (NOT A GUARANTEE)"
                      >
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Sparkles size={9} className="text-emerald-400/70 shrink-0" aria-hidden="true" />
                          <span>
                            {(t.predicted_edge || 0) >= 0 ? '+' : ''}
                            {fmtNum(t.predicted_edge, 4)}
                          </span>
                        </span>
                      </TableCell>
                      {/* W39-6 — AI confidence rendered as a colored
                          ConfidenceBadge. Green ≥70%, amber 50-70%, red
                          <50% — so the trader sees model confidence at a
                          glance without reading the number. */}
                      <TableCell className="py-1.5 px-2 text-right">
                        <ConfidenceBadge value={t.confidence} showLabel={false} />
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-[10px] text-[var(--text-secondary)] mono">
                        {t.strategy || '—'}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 border-l border-emerald-900/20">{outcomeBadge}</TableCell>
                    </TableRow>
                  )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* ── §5 Strategy breakdown ── */}
        {comparison && comparison.strategies && comparison.strategies.length > 0 && (
          <section>
            <SectionHeader
              icon={Hash}
              title="Per-Strategy Breakdown"
              tone="info"
              description={`${comparison.strategies.length} strategies`}
            />
            <div className="rounded-md border border-[var(--border)] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--bg-base)] hover:bg-[var(--bg-base)] border-[var(--border)]">
                    <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                      Strategy
                    </TableHead>
                    <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                      Shadow #  / Live #
                    </TableHead>
                    <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                      Shadow Avg Edge
                    </TableHead>
                    <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                      Live Avg P&L
                    </TableHead>
                    <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right tabular-nums">
                      Shadow Size  / Live P&L
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.strategies.map((s) => (
                    <TableRow key={s.strategy} className="border-[var(--border)] hover:bg-[var(--bg-base)] border-l-2 border-l-transparent hover:border-l-emerald-400/60 transition-colors">
                      <TableCell className="py-1.5 px-2 text-[10.5px] mono text-[var(--text-primary)] tabular-nums">
                        {s.strategy}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right text-[10.5px] tabular-nums">
                        <span className="mono text-emerald-300">{s.shadow_count}</span>
                        <span className="text-[var(--text-dim)] mx-1">/</span>
                        <span className="mono text-[var(--text-primary)]">{s.live_count}</span>
                      </TableCell>
                      <TableCell
                        className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                          s.shadow_avg_edge > 0 ? 'text-emerald-400' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {s.shadow_avg_edge >= 0 ? '+' : ''}
                        {fmtNum(s.shadow_avg_edge, 4)}
                      </TableCell>
                      <TableCell
                        className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                          s.live_avg_pnl > 0
                            ? 'text-emerald-400'
                            : s.live_avg_pnl < 0
                              ? 'text-red-400'
                              : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {fmtUsd(s.live_avg_pnl)}
                      </TableCell>
                      <TableCell className="py-1.5 px-2 text-right text-[10.5px] tabular-nums">
                        <span className="mono text-emerald-300">
                          {s.shadow_total_size.toFixed(0)}
                        </span>
                        <span className="text-[var(--text-dim)] mx-1">/</span>
                        <span
                          className={`mono tabular-nums ${
                            s.live_total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {fmtUsd(s.live_total_pnl)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* ── Footer note ── */}
        <div className="text-[9px] text-[var(--text-dim)] italic border-t border-[var(--border)] pt-2">
          Shadow inference registry: <code>ml/shadow_inference.py</code> ·
          Counterfactual trades: <code>core/shadow_trading.py</code> ·
          Promote via <code>POST /api/ml/rollback</code> ·
          Auto-refresh every 20s · pauses when tab hidden
        </div>
      </div>

      {/* ── Promote confirmation dialog ── */}
      <AlertDialog
        open={promoteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPromoteTarget(null)
            setPromoteError(null)
          }
        }}
      >
        <AlertDialogContent className="bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-primary)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <ArrowUpCircle className="size-4 text-emerald-400" />
              Promote challenger to champion?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] text-[var(--text-secondary)]">
              {promoteTarget && (
                <>
                  This will roll the active model version from{' '}
                  <code className="mono text-emerald-300">
                    {activeVersionId || '(unset)'}
                  </code>{' '}
                  to{' '}
                  <code className="mono text-emerald-300">
                    {promoteTarget.version}
                  </code>
                  . The next predict() cycle will use the promoted model. The
                  change is recorded in the durable audit log.
                  <br />
                  <br />
                  <span className="text-[var(--text-primary)]">Target metrics:</span>
                  <br />
                  Brier ={' '}
                  <span className="mono text-[var(--text-primary)]">
                    {promoteTarget.brier_score.toFixed(4)}
                  </span>{' '}
                  · AUC ={' '}
                  <span className="mono text-[var(--text-primary)]">
                    {promoteTarget.roc_auc.toFixed(4)}
                  </span>{' '}
                  · ECE ={' '}
                  <span className="mono text-[var(--text-primary)]">
                    {promoteTarget.ece.toFixed(4)}
                  </span>
                  {promoteTarget.status === 'REJECTED' && (
                    <span className="block mt-2 text-[var(--color-amber-fg)]">
                      ⚠ This model was REJECTED by the safety gate (Brier &gt;
                      0.22 or AUC &lt; 0.70). Promotion is an operator-explicit
                      override and will be flagged in the audit log.
                    </span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {promoteError && (
            <div className="mt-2 text-[10.5px] text-[var(--color-red-fg)] bg-[var(--color-red-bg)] border border-[var(--color-red-bd)] rounded px-2 py-1.5 flex items-start gap-1.5">
              <XCircle className="size-3 mt-0.5 shrink-0" />
              <span className="break-all">{promoteError}</span>
            </div>
          )}
          <AlertDialogFooter className="mt-3">
            <AlertDialogCancel className="h-8 text-[11px] bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white gap-1.5"
              disabled={promoting || !promoteTarget}
              onClick={(e) => {
                e.preventDefault()
                if (promoteTarget) confirmPromote(promoteTarget)
              }}
            >
              {promoting ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Promoting…
                </>
              ) : (
                <>
                  <ArrowUpCircle className="size-3" />
                  Promote to Champion
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface ComparisonRowProps {
  label: string
  shadowValue: string
  liveValue: string
  shadowTone: 'positive' | 'negative' | 'neutral'
  liveTone: 'positive' | 'negative' | 'neutral'
  hint?: string
}

function ComparisonRow({
  label,
  shadowValue,
  liveValue,
  shadowTone,
  liveTone,
  hint,
}: ComparisonRowProps) {
  // W54-d — Refined tone vocabulary for the side-by-side shadow vs real
  // comparison display. Shadow column is tinted cyan (model-side), Real
  // column is tinted emerald (live-side). The tone classes also drive the
  // `data-tone` hooks so the downstream CSS layer can target them.
  const toneText = (tone: ComparisonRowProps['shadowTone']) =>
    tone === 'positive'
      ? 'text-emerald-400'
      : tone === 'negative'
        ? 'text-red-400'
        : 'text-[var(--text-primary)]'

  const toneAttr = (tone: ComparisonRowProps['shadowTone']) =>
    tone === 'positive' ? 'positive' : tone === 'negative' ? 'negative' : 'neutral'

  return (
    <div
      className="grid grid-cols-[1fr_1fr_1fr] items-stretch gap-px bg-[var(--border)] rounded-md overflow-hidden border border-[var(--border)]"
      title={hint}
      data-testid="shadow-comparison-row"
    >
      {/* Label column */}
      <div className="flex flex-col justify-center bg-[var(--bg-base)] px-2 py-1.5">
        <span className="text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
          {label}
        </span>
        {hint && <span className="text-[8.5px] text-[var(--text-dim)] truncate mt-0.5">{hint}</span>}
      </div>
      {/* Shadow prediction column (cyan tint) */}
      <div
        className="text-right px-2 py-1.5 bg-emerald-950/20 border-l border-emerald-900/30"
        data-tone={toneAttr(shadowTone)}
        data-side="shadow"
      >
        <div className="flex items-center justify-end gap-1 text-[8px] uppercase text-emerald-400 tracking-wider font-bold">
          <Sparkles size={8} className="text-emerald-400/80" aria-hidden="true" />
          <span>Shadow</span>
        </div>
        <div className={`mono text-[12px] font-bold tabular-nums ${toneText(shadowTone)}`}>
          {shadowValue}
        </div>
      </div>
      {/* Real outcome column (emerald tint) */}
      <div
        className="text-right px-2 py-1.5 bg-emerald-950/20 border-l border-emerald-900/30"
        data-tone={toneAttr(liveTone)}
        data-side="real"
      >
        <div className="flex items-center justify-end gap-1 text-[8px] uppercase text-emerald-400 tracking-wider font-bold">
          <Target size={8} className="text-emerald-400/80" aria-hidden="true" />
          <span>Real</span>
        </div>
        <div className={`mono text-[12px] font-bold tabular-nums ${toneText(liveTone)}`}>
          {liveValue}
        </div>
      </div>
    </div>
  )
}
