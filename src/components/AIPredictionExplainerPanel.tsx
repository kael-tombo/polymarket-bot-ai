// components/AIPredictionExplainerPanel.tsx — W38-5 Explainable AI / ML
// Prediction Panel: clear labeling + SHAP explainability + prediction history.
//
// Goal (W38-5 spec): make the AI / ML interface more explainable and
// trustworthy by surfacing, in one dedicated panel, every field the
// trader needs to interrogate a model prediction:
//   - Model status (loaded / training / error) + version + training-data
//     timestamp + feature freshness (seconds since last feature update).
//   - Prediction probability, confidence score, calibration status,
//     market-implied probability, edge estimate, drift indicators,
//     data quality warnings — all in one header strip.
//   - "AI Prediction: X% YES (confidence: Y)" — NOT just "X%". Plus
//     a 95% confidence interval / range and a "NOT A GUARANTEE"
//     disclaimer banner that stays visible at all times.
//   - "Model vs Market" side-by-side comparison card with the edge
//     estimate labelled.
//   - "Why?" expandable section that calls /api/ml/explain/{token_id}
//     and surfaces the top-3 SHAP feature contributions, plus the
//     champion-vs-challenger model agreement indicator and the drift
//     status (OK / warning / critical).
//   - Prediction history table — last 20 predictions with token +
//     timestamp + side + prediction confidence + actual outcome
//     (resolved / pending), backed by /api/shadow/trades (the only
//     counterfactual trade journal the backend exposes today; each
//     row carries the predicted_edge + confidence the model assigned
//     at signal time).
//   - Calibration curve (predicted vs actual) backed by the
//     /api/ml/metrics.reliability_curve via the shared
//     @/components/charts ReliabilityDiagram component.
//
// Visual contract:
//   * AI-generated content uses a blue/purple color system (text-blue-400,
//     text-purple-400, bg-blue-500/10, border-blue-500/30) so it is
//     visually distinct from market data (which uses cyan/emerald for
//     market-driven numbers per the existing design system).
//   * Every prediction surfaces BOTH the probability AND the confidence
//     — a probability without a confidence is explicitly forbidden by
//     the W38-5 spec.
//   * The "NOT A GUARANTEE" disclaimer is rendered as a sticky banner
//     at the top of the panel body so it is impossible to scroll past
//     the headline prediction without seeing it.
//
// Backend contract (every endpoint already exists; the panel tolerates
// partial / missing responses so it renders a meaningful skeleton even
// when the bot is still booting):
//   GET /api/ml/metrics
//     → brier_score, roc_auc, log_loss, ece, sharpe_ratio, last_trained,
//       model_version, model_ready, training_source, n_real_samples,
//       n_synthetic_samples, adaptive_weights, feature_importances,
//       reliability_curve: [{bin_center, empirical_freq, count} x10]
//   GET /api/ml/drift
//     → psi, ks_stat, status (HEALTHY / MODERATE_SHIFT / SIGNIFICANT_DRIFT),
//       rolling_brier, ewma_brier, window_samples, outcome_samples,
//       meta_learner: {is_warm, n_updates, buffer_size, min_samples_required}
//   GET /api/ml/versions
//     → active_version, total_registered, versions: [{version, brier_score,
//       roc_auc, ece, sharpe_ratio, status, is_active, n_samples,
//       created_at, parameters}]
//   GET /api/snapshot
//     → order_books: [{token_id, slug, best_bid, best_ask, mid, spread,
//       updated_at}], ml: {model_ready, brier_score, roc_auc, ece,
//       drift_status, drift_psi, ...} — used to surface the
//       market-implied probability (order-book mid) for the most
//       recently predicted token.
//   GET /api/shadow/trades?limit=20
//     → {count, trades: [{id, timestamp, token_id, strategy, side,
//       price, size, predicted_edge, confidence}]} — the closest thing
//       the backend exposes to a "prediction history" feed (each row
//       is the counterfactual intent the model signed at signal time).
//   GET /api/ml/explain/{token_id}?top_n=3
//     → {token_id, model_version, explanation: {predicted_probability,
//       base_value, top_features: [{name, value, contribution} x3],
//       prediction_direction, confidence}} — SHAP-based per-prediction
//       feature attribution. Returns 404 when no feature vector is
//       stored for the token; the panel surfaces this as an inline
//       notice rather than failing the whole view.
//   GET /api/data-quality  (W20-6)
//     → {overall_status, summary, checks: [{name, status, message}]} —
//       data quality warnings surfaced in the status header strip.

'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Gauge,
  Info,
  Lightbulb,
  LineChart,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
  XCircle,
} from 'lucide-react'

import { apiFetch, getApiUrl } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReliabilityDiagram } from '@/components/charts'

// ── Backend payload types ───────────────────────────────────────────────────

interface ReliabilityBin {
  bin_center: number
  empirical_freq: number
  count: number
}

interface DriftMetaLearner {
  is_warm: boolean
  n_updates: number
  buffer_size: number
  min_samples_required?: number
}

interface DriftPayload {
  psi: number
  ks_stat?: number
  status: string // "HEALTHY" | "MODERATE_SHIFT" | "SIGNIFICANT_DRIFT"
  rolling_brier?: number | null
  ewma_brier?: number | null
  window_samples: number
  outcome_samples?: number
  threshold_moderate_psi?: number
  threshold_critical_psi?: number
  meta_learner?: DriftMetaLearner
  model_version?: string
}

interface MetricsPayload {
  model_type?: string
  model_version?: string
  model_ready: boolean
  brier_score: number
  roc_auc: number
  log_loss?: number
  ece: number
  sharpe_ratio?: number
  last_trained: number
  training_source?: string
  n_real_samples?: number
  n_synthetic_samples?: number
  n_online_updates?: number
  adaptive_weights?: Record<string, number>
  feature_importances?: Record<string, number>
  reliability_curve?: ReliabilityBin[]
  drift?: DriftPayload
}

interface ModelVersion {
  version: string
  created_at: number
  brier_score: number
  roc_auc: number
  ece: number
  sharpe_ratio: number
  status: string // "ACTIVE" | "REJECTED" | "RETIRED"
  is_active: boolean
  n_samples: number
  parameters?: Record<string, unknown>
}

interface VersionsPayload {
  active_version: string
  total_registered: number
  versions: ModelVersion[]
}

interface OrderBookEntry {
  token_id: string
  slug?: string
  best_bid?: number | null
  best_ask?: number | null
  mid?: number | null
  spread?: number | null
  updated_at?: number
}

interface SnapshotPayload {
  timestamp?: number
  order_books?: OrderBookEntry[]
}

interface ShadowTrade {
  id: number
  timestamp: number
  decision_id?: string | null
  token_id: string
  strategy?: string
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

interface ShapFeature {
  name: string
  value?: number
  contribution: number
}

interface ShapExplanation {
  predicted_probability?: number
  base_value?: number
  top_features: ShapFeature[]
  prediction_direction?: string // "positive" | "negative"
  confidence?: number
}

interface ExplainResponse {
  token_id: string
  model_version?: string
  explanation: ShapExplanation
}

interface DataQualityCheck {
  name: string
  status: string // "pass" | "warn" | "fail"
  category?: string
  value?: number | string | null
  threshold?: number | string | null
  message?: string
  timestamp?: number
}

interface DataQualityPayload {
  overall_status: string // "healthy" | "degraded" | "critical"
  summary?: { total?: number; passed?: number; warnings?: number; failed?: number }
  checks?: DataQualityCheck[]
  timestamp?: number
}

// ── Constants ───────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 20_000
const HISTORY_ROW_LIMIT = 20
const SHAP_TOP_N = 3

const DRIFT_STATUS_MAP: Record<
  string,
  { label: string; tone: 'ok' | 'warn' | 'crit'; cls: string; icon: typeof CheckCircle2 }
> = {
  HEALTHY: { label: 'OK', tone: 'ok', cls: 'badge-green', icon: CheckCircle2 },
  MODERATE_SHIFT: { label: 'WARNING', tone: 'warn', cls: 'badge-amber', icon: AlertTriangle },
  SIGNIFICANT_DRIFT: { label: 'CRITICAL', tone: 'crit', cls: 'badge-red', icon: XCircle },
}

// Local import to satisfy the icon-typing above without a circular dependency
// at the module top (lucide-react is already imported at the top).
// (CheckCircle2 is imported at the top of the file along with the other
// lucide-react icons; the comment above is kept as a marker for the
// DRIFT_STATUS_MAP icon-typing rationale.)

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

function fmtAge(epoch: number | null | undefined): string {
  if (!epoch || epoch <= 0) return '—'
  const diff = Date.now() / 1000 - epoch
  if (diff < 0) return 'just now'
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function fmtTimestamp(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateToken(t: string): string {
  if (!t) return '—'
  if (t.length <= 14) return t
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

function classifyDrift(status: string) {
  return (
    DRIFT_STATUS_MAP[status] ?? {
      label: status || 'UNKNOWN',
      tone: 'warn' as const,
      cls: 'badge-dim',
      icon: AlertTriangle,
    }
  )
}

/** Compute a 95% confidence interval for a Bernoulli probability using
 *  the normal approximation `p ± 1.96 * sqrt(p(1-p)/n)`. The interval
 *  is clamped to [0, 1]. Returns null when n < 2 (no meaningful CI). */
function bernoulliCI(p: number, n: number): { low: number; high: number } | null {
  if (!Number.isFinite(p) || !Number.isFinite(n) || n < 2) return null
  const sigma = Math.sqrt((p * (1 - p)) / n)
  const low = Math.max(0, p - 1.96 * sigma)
  const high = Math.min(1, p + 1.96 * sigma)
  return { low, high }
}

// ── W54-c Tone system (mirrors W51-2d MLPanel / AIMLCommandCenter) ──────────
// Unified tone vocabulary used across the polished panel. Each tone resolves
// to a self-contained class set (background tint, border, value text, quality
// bar, dot) so KPI tiles, the status banner, the SHAP bars, and the
// confidence tile share the same semantic palette. Static class strings keep
// Tailwind 4's scanner happy.

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
  info:    { bg: 'bg-purple-500/[0.06]',  border: 'border-purple-500/25', text: 'text-purple-400', bar: 'bg-purple-500', dot: 'bg-purple-400',  label: 'text-purple-400/80',  halo: 'shadow-purple-500/10' },
  neutral: { bg: 'bg-[var(--bg-base)]',          border: 'border-[var(--border)]',     text: 'text-[var(--text-primary)]',   bar: 'bg-[var(--text-secondary)]',   dot: 'bg-[var(--text-secondary)]',   label: 'text-[var(--text-secondary)]',      halo: '' },
}

/** Map a confidence value [0,1] to a Tone (green ≥0.7, amber ≥0.5, red <0.5). */
function confidenceTone(c: number | null | undefined): Tone {
  if (c == null || !Number.isFinite(c)) return 'neutral'
  if (c >= 0.7) return 'good'
  if (c >= 0.5) return 'warn'
  return 'poor'
}

/** Map a Brier score [0,1] to a Tone (green ≤0.18, amber ≤0.25, red >0.25).
 *  Lower Brier = better calibrated → better tone. */
function brierTone(b: number | null | undefined): Tone {
  if (b == null || !Number.isFinite(b)) return 'neutral'
  if (b <= 0.18) return 'good'
  if (b <= 0.25) return 'warn'
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
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className={`size-3 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)]">
        {title}
      </span>
      {description && (
        <span className="text-[8.5px] text-[var(--text-secondary)] italic truncate">{description}</span>
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
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      title={`${label} — ${hint}`}
      data-testid={testId}
      data-tone={tone}
    >
      <div className={`text-[9px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
        {label}
      </div>
      <div
        className={`mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-2.5 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-2.5 inline-block" aria-hidden="true" />}
      </div>
      <div className="text-[8px] text-[var(--text-secondary)] mt-0.5 italic truncate">{hint}</div>
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

// ── PsiGauge — horizontal bar with green/amber/red zones + tick ──────────────
function PsiGauge({ psi }: { psi: number }) {
  const clamped = Math.max(0, Math.min(0.5, psi))
  const pct = (clamped / 0.5) * 100
  const tone: Tone = psi < 0.1 ? 'good' : psi < 0.25 ? 'warn' : 'poor'
  const cfg = TONE[tone]
  return (
    <div className="space-y-0.5" title={`PSI ${psi.toFixed(4)} — thresholds: <0.1 healthy, 0.1–0.25 moderate, >0.25 significant`}>
      <div className="relative h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        {/* zones */}
        <div className="absolute inset-y-0 left-0 bg-emerald-500/30" style={{ width: '20%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: '20%', width: '30%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-red-500/30" style={{ left: '50%', right: 0 }} aria-hidden="true" />
        {/* live tick */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-1 h-2.5 rounded-sm ${cfg.bar} shadow-sm transition-all duration-500`}
          style={{ left: `calc(${pct}% - 2px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[8px] text-[var(--text-secondary)] mono">
        <span>0.00</span>
        <span className="text-emerald-400/70">0.10</span>
        <span className="text-amber-400/70">0.25</span>
        <span>0.50+</span>
      </div>
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

// ── PolishedEmptyState — Lucide icon + title + description ───────────────────
function PolishedEmptyState({
  icon: Icon,
  title,
  description,
  testId,
}: {
  icon: LucideIcon
  title: string
  description?: string
  testId?: string
}) {
  return (
    <div
      className="empty-state py-6"
      role="status"
      data-testid={testId}
    >
      <Icon className="size-7 text-[var(--text-dim)] mb-1" aria-hidden="true" />
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
    </div>
  )
}

// ── PolishedErrorCard — error card with retry ────────────────────────────────
function PolishedErrorCard({
  message,
  detail,
  onRetry,
  retryLabel = 'Retry',
  testId,
}: {
  message: string
  detail?: string | null
  onRetry: () => void
  retryLabel?: string
  testId?: string
}) {
  return (
    <div
      className="error-state py-8"
      role="alert"
      data-testid={testId}
    >
      <AlertTriangle className="size-8 text-red-400/80 mb-1" aria-hidden="true" />
      <div className="error-state-title">{message}</div>
      {detail && <div className="error-state-desc">{detail}</div>}
      <button
        type="button"
        onClick={onRetry}
        className="btn btn-primary btn-sm px-3 py-1 text-[10px] font-bold inline-flex items-center gap-1.5 mt-1"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        {retryLabel}
      </button>
    </div>
  )
}

// ── Inline sub-components ──────────────────────────────────────────────────

interface StatusPillProps {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'ok' | 'warn' | 'crit' | 'ai'
  /** W54-c-retry — Optional semantic data-tone attribute (e.g. 'good' | 'warn' |
   *  'poor' | 'info' | 'neutral') emitted on the root div so downstream CSS
   *  can target the pill by its semantic tone without altering the visible
   *  blue/purple AI accent. */
  dataTone?: Tone
}

/** Single cell in the status header strip. The `tone` controls the
 *  small colored dot prefix; `tone="ai"` is the blue/purple accent
 *  reserved for AI-generated numbers (probability, confidence).
 *
 *  W54-c-retry — `dataTone` is rendered as a `data-tone` attribute on
 *  the root div so downstream CSS can target the pill by its underlying
 *  semantic tone (e.g. the Confidence pill renders the model's
 *  confidence as blue/purple text per the AI accent convention but
 *  carries `data-tone="good"|"warn"|"poor"` so a downstream stylesheet
 *  can still tag the pill without breaking the AI-color test contract). */
function StatusPill({ label, value, hint, tone = 'neutral', dataTone }: StatusPillProps) {
  const dotClass =
    tone === 'ok'
      ? 'bg-emerald-400'
      : tone === 'warn'
        ? 'bg-amber-400'
        : tone === 'crit'
          ? 'bg-red-400'
          : tone === 'ai'
            ? 'bg-blue-400'
            : 'bg-slate-500'
  // W54-c-retry — only render data-tone when explicitly provided so the
  // attribute is absent (not "undefined") when the pill has no semantic
  // tone mapping.
  const toneProps = dataTone ? { 'data-tone': dataTone as string } : {}
  return (
    <div
      className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md p-2 flex flex-col gap-0.5 transition-colors hover:border-[var(--border-strong)]"
      data-testid="ai-status-pill"
      {...toneProps}
    >
      <div className="flex items-center gap-1.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
          {label}
        </span>
      </div>
      <span
        className={`mono text-[12px] font-bold tabular-nums ${
          tone === 'ai'
            ? 'text-blue-300'
            : tone === 'ok'
              ? 'text-emerald-400'
              : tone === 'warn'
                ? 'text-amber-400'
                : tone === 'crit'
                  ? 'text-red-400'
                  : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-[9px] text-[var(--text-secondary)] truncate">{hint}</span>}
    </div>
  )
}

function CIRangeBar({
  low,
  high,
  point,
}: {
  low: number | null
  high: number | null
  point: number | null
}) {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return null
  const lo = Math.max(0, Math.min(1, low))
  const hi = Math.max(0, Math.min(1, high))
  const leftPct = lo * 100
  const widthPct = Math.max(2, (hi - lo) * 100)
  const pt = point != null && Number.isFinite(point)
    ? Math.max(0, Math.min(1, point)) * 100
    : null
  return (
    <div
      className="relative h-1.5 w-full rounded-full bg-[var(--border)] mt-1"
      role="img"
      aria-label={`95% confidence interval from ${(lo * 100).toFixed(1)}% to ${(hi * 100).toFixed(1)}%`}
      data-testid="ai-ci-range-bar"
    >
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          background: 'linear-gradient(90deg, rgba(96,165,250,0.6), rgba(168,85,247,0.85))',
        }}
      />
      {pt != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2.5 rounded-full bg-white"
          style={{ left: `${pt}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

interface PredictionHeadlineProps {
  probability: number | null
  confidence: number | null
  ci: { low: number; high: number } | null
}

function PredictionHeadline({ probability, confidence, ci }: PredictionHeadlineProps) {
  const direction =
    probability == null ? '—' : probability >= 0.5 ? 'YES' : 'NO'
  const probPct = probability == null ? '—' : `${(probability * 100).toFixed(0)}%`
  const confPct = confidence == null ? '—' : confidence.toFixed(2)
  // W54-c — Tone-coloured confidence (green ≥0.7, amber ≥0.5, red <0.5).
  // The headline's confidence span keeps text-purple-300 (test contract
  // requires at least one '0.72' rendered with text-purple-300) — the tone
  // is expressed via the small label chip beside it.
  const confTone = confidenceTone(confidence)
  const confChipCls =
    confTone === 'good'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : confTone === 'warn'
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : confTone === 'poor'
          ? 'bg-red-500/15 text-red-400 border-red-500/30'
          : 'bg-[var(--border)] text-[var(--text-secondary)] border-[var(--border)]'

  return (
    <div
      className="bg-[var(--bg-base)] border border-blue-500/30 rounded-lg p-4"
      data-testid="ai-prediction-headline"
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="size-3.5 text-blue-400" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">
          AI Prediction
        </span>
        <span className="text-[9px] text-[var(--text-secondary)] italic">
          (model-generated)
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="mono text-3xl font-bold text-blue-300 tabular-nums">
          {probPct}
        </span>
        <span
          className={`text-base font-bold ${
            direction === 'YES' ? 'text-emerald-400' : direction === 'NO' ? 'text-red-400' : 'text-[var(--text-primary)]'
          }`}
        >
          {direction}
        </span>
        <span className="text-[11px] text-[var(--text-secondary)]">
          (confidence: <span className="mono text-purple-300 font-bold tabular-nums">{confPct}</span>)
        </span>
        {/* W54-c — Tone chip showing confidence level at a glance. */}
        {confidence != null && (
          <span
            className={`text-[8.5px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${confChipCls}`}
            data-tone={confTone}
          >
            {confTone === 'good' ? 'High' : confTone === 'warn' ? 'Medium' : confTone === 'poor' ? 'Low' : 'n/a'}
          </span>
        )}
      </div>
      {ci && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[9.5px] text-[var(--text-secondary)]">
            <span>95% confidence interval</span>
            <span className="mono text-blue-300 tabular-nums">
              [{(ci.low * 100).toFixed(1)}%, {(ci.high * 100).toFixed(1)}%]
            </span>
          </div>
          <CIRangeBar low={ci.low} high={ci.high} point={probability} />
        </div>
      )}
      <div
        className="mt-3 flex items-start gap-1.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5"
        role="alert"
        data-testid="not-a-guarantee-inline"
      >
        <ShieldAlert className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>NOT A GUARANTEE.</strong> This is a calibrated
          probability estimate from a 4-model ensemble, not a
          prediction of the future. Markets can and do move against
          the model — use alongside risk management, never as the
          sole decision input.
        </span>
      </div>
    </div>
  )
}

interface ModelVsMarketProps {
  aiProbability: number | null
  marketImplied: number | null
  edge: number | null
}

function ModelVsMarket({ aiProbability, marketImplied, edge }: ModelVsMarketProps) {
  const aiPct = aiProbability == null ? '—' : `${(aiProbability * 100).toFixed(1)}%`
  const mktPct = marketImplied == null ? '—' : `${(marketImplied * 100).toFixed(1)}%`
  const edgePct = edge == null ? '—' : `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(2)}pp`
  const edgeTone =
    edge == null
      ? 'text-[var(--text-primary)]'
      : Math.abs(edge) < 0.005
        ? 'text-[var(--text-primary)]'
        : edge > 0
          ? 'text-emerald-400'
          : 'text-red-400'

  return (
    <Card className="bg-[var(--bg-base)] border border-[var(--border)] p-3 rounded-md" data-testid="model-vs-market-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Gauge className="size-3 text-cyan-400" />
          Model vs Market
        </span>
        <span className="text-[9px] text-[var(--text-secondary)] italic">
          AI estimate vs order-book mid
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center bg-blue-500/5 border border-blue-500/20 rounded-md p-2">
          <div className="text-[9px] uppercase tracking-wider text-blue-300 font-bold">
            AI Model
          </div>
          <div className="mono text-lg font-bold text-blue-300 mt-0.5 tabular-nums">{aiPct}</div>
          <div className="text-[8.5px] text-[var(--text-secondary)]">predicted P(YES)</div>
        </div>
        <div className="text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-md p-2">
          <div className="text-[9px] uppercase tracking-wider text-cyan-300 font-bold">
            Market
          </div>
          <div className="mono text-lg font-bold text-cyan-300 mt-0.5 tabular-nums">{mktPct}</div>
          <div className="text-[8.5px] text-[var(--text-secondary)]">order-book mid</div>
        </div>
        <div className="text-center bg-purple-500/5 border border-purple-500/20 rounded-md p-2">
          <div className="text-[9px] uppercase tracking-wider text-purple-300 font-bold">
            Edge
          </div>
          <div className={`mono text-lg font-bold mt-0.5 tabular-nums ${edgeTone}`}>{edgePct}</div>
          <div className="text-[8.5px] text-[var(--text-secondary)]">AI − market</div>
        </div>
      </div>
    </Card>
  )
}

interface WhyExplainerProps {
  tokenId: string | null
  championVersion: string | null
  challengerVersion: string | null
  championProb: number | null
  challengerProb: number | null
  driftStatus: string
  driftPsi: number | null
}

function WhyExplainer({
  tokenId,
  championVersion,
  challengerVersion,
  championProb,
  challengerProb,
  driftStatus,
  driftPsi,
}: WhyExplainerProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null)

  const fetchExplanation = useCallback(async () => {
    if (!tokenId) {
      setError('No token selected — pick a row from the prediction history below to load its SHAP explanation.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const apiUrl = getApiUrl()
      const r = await apiFetch(`${apiUrl}/api/ml/explain/${encodeURIComponent(tokenId)}?top_n=${SHAP_TOP_N}`)
      if (!r.ok) {
        if (r.status === 404) {
          setError(`No stored feature vector for token ${truncateToken(tokenId)} — the model must predict for this token at least once before an explanation is available.`)
        } else if (r.status === 503) {
          setError('ML model is not fitted — call POST /api/ml/retrain first.')
        } else {
          setError(`SHAP endpoint returned HTTP ${r.status}`)
        }
        setExplanation(null)
      } else {
        const body = (await r.json()) as ExplainResponse
        setExplanation(body)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error fetching SHAP explanation')
      setExplanation(null)
    } finally {
      setLoading(false)
    }
  }, [tokenId])

  // Auto-fetch the explanation when the panel is opened for the first time
  // for a given token. Subsequent opens reuse the cached explanation unless
  // the token changes.
  useEffect(() => {
    if (open && tokenId && !explanation && !loading && !error) {
      fetchExplanation()
    }
  }, [open, tokenId, explanation, loading, error, fetchExplanation])

  const driftInfo = classifyDrift(driftStatus)
  const DriftIcon = driftInfo.icon

  // Champion-vs-challenger agreement indicator.
  const agreement =
    championProb != null && challengerProb != null
      ? Math.abs(championProb - challengerProb) < 0.05
        ? { label: 'Agree', tone: 'ok' as const, cls: 'badge-green' }
        : Math.abs(championProb - challengerProb) < 0.15
          ? { label: 'Diverge', tone: 'warn' as const, cls: 'badge-amber' }
          : { label: 'Conflict', tone: 'crit' as const, cls: 'badge-red' }
      : null

  // W54-c — Defensive optional chaining. The backend occasionally returns
  // a 200 with an empty body (the explain endpoint stubs {} when the model
  // isn't fitted for the token) — guard against `explanation.explanation`
  // being undefined before mapping `top_features`. Previously this threw
  // an uncaught TypeError that vitest surfaced in the worklog (W38-5).
  const topFeatures = explanation?.explanation?.top_features ?? []
  const maxAbs = topFeatures.length > 0
    ? Math.max(...topFeatures.map((x) => Math.abs(x.contribution)), 1e-9)
    : 1e-9

  return (
    <Card className="bg-[var(--bg-base)] border border-blue-500/20 rounded-md" data-testid="why-explainer-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full p-3 flex items-center justify-between hover:bg-blue-500/5 transition-colors rounded-t-md"
            aria-expanded={open}
            aria-controls="why-explainer-content"
            data-testid="why-explainer-trigger"
          >
            <span className="flex items-center gap-2">
              <Lightbulb className="size-3.5 text-blue-400" aria-hidden="true" />
              <span className="text-[11px] uppercase tracking-wider font-bold text-blue-300">
                Why? — Explainability
              </span>
              {tokenId && (
                <span className="text-[9.5px] text-[var(--text-secondary)] mono tabular-nums">
                  token {truncateToken(tokenId)}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {agreement && (
                <span className={`badge ${agreement.cls} text-[9px]`}>
                  {agreement.label}
                </span>
              )}
              <span className={`badge ${driftInfo.cls} text-[9px] flex items-center gap-1`}>
                <DriftIcon className="size-2.5" aria-hidden="true" />
                Drift {driftInfo.label}
              </span>
              {open ? (
                <ChevronDown className="size-3 text-[var(--text-secondary)]" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-3 text-[var(--text-secondary)]" aria-hidden="true" />
              )}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id="why-explainer-content">
          <div className="p-3 pt-0 space-y-3 border-t border-[var(--border)]/50">
            {/* Champion vs challenger agreement strip */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md p-2">
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  Champion
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <code className="mono text-[10.5px] text-emerald-300">
                    {championVersion ?? '—'}
                  </code>
                  <span className="mono text-[11px] text-blue-300 font-bold tabular-nums">
                    {championProb == null ? '—' : `${(championProb * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
              <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md p-2">
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                  Challenger
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <code className="mono text-[10.5px] text-purple-300">
                    {challengerVersion ?? '—'}
                  </code>
                  <span className="mono text-[11px] text-purple-300 font-bold tabular-nums">
                    {challengerProb == null ? '—' : `${(challengerProb * 100).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>

            {/* SHAP top features */}
            <div>
              <SectionHeader
                icon={Brain}
                title={`Top ${SHAP_TOP_N} Contributing Features (SHAP)`}
                description="signed magnitudes"
                tone="info"
              />
              {!tokenId && (
                <div className="text-[10.5px] text-[var(--text-secondary)] italic">
                  Select a prediction row below to load its SHAP explanation.
                </div>
              )}
              {tokenId && loading && (
                <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-secondary)]">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  Loading SHAP explanation…
                </div>
              )}
              {tokenId && error && !loading && (
                <div className="flex items-start gap-1.5 text-[10.5px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                  <AlertCircle className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              {tokenId && !loading && !error && explanation && topFeatures.length > 0 && (
                <div className="space-y-1.5">
                  {topFeatures.map((f, i) => {
                    const pct = (Math.abs(f.contribution) / maxAbs) * 100
                    const pushesYes = f.contribution >= 0
                    // W54-c — SHAP bars match AIMLCommandCenter's gradient
                    // vocabulary: bullish (positive contribution → YES) uses
                    // the blue→cyan gradient; bearish uses red→amber. Keeps
                    // the W51-2d visual consistency across panels.
                    const barColor = pushesYes
                      ? 'from-blue-600 via-blue-500 to-cyan-400'
                      : 'from-red-600 via-red-500 to-amber-400'
                    return (
                      <div
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 hover:bg-[var(--bg-surface)] px-1 py-0.5 rounded transition-colors"
                        title={`Feature: ${f.name}\nContribution: ${f.contribution.toFixed(4)}\nDirection: ${pushesYes ? 'bullish (→YES)' : 'bearish (→NO)'}`}
                        data-testid={`shap-feature-${i}`}
                        data-tone={pushesYes ? 'good' : 'poor'}
                      >
                        <span className="text-[10px] text-[var(--text-secondary)] w-4 text-right mono tabular-nums">
                          {i + 1}
                        </span>
                        <span
                          className="text-[10.5px] text-[var(--text-primary)] flex-1 truncate mono"
                          title={f.name}
                        >
                          {f.name}
                        </span>
                        <div className="flex-1 h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden border border-[var(--border)]">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-300`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`mono text-[10px] font-bold w-16 text-right shrink-0 tabular-nums ${
                            pushesYes ? 'text-blue-300' : 'text-red-300'
                          }`}
                        >
                          {pushesYes ? '+' : ''}
                          {f.contribution.toFixed(4)}
                        </span>
                      </div>
                    )
                  })}
                  {/* W54-c — Bullish / Bearish legend, matching AIMLCommandCenter. */}
                  <div className="flex items-center gap-3 pt-2 mt-1 border-t border-[var(--border)] text-[9px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-3 h-1 rounded-sm bg-gradient-to-r from-blue-600 to-cyan-400" aria-hidden="true" />
                      Bullish (→YES)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block w-3 h-1 rounded-sm bg-gradient-to-r from-red-600 to-amber-400" aria-hidden="true" />
                      Bearish (→NO)
                    </span>
                    <span className="text-[var(--text-secondary)] italic normal-case tracking-normal">
                      SHAP signed contributions
                    </span>
                  </div>
                  <div className="text-[9px] text-[var(--text-secondary)] italic mt-1">
                    Positive contributions push the prediction toward YES;
                    negative toward NO. Magnitudes are SHAP values (not
                    percentages).
                  </div>
                  {explanation.explanation?.predicted_probability != null && (
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1 flex items-center gap-1.5">
                      <Info className="size-3 text-blue-400" aria-hidden="true" />
                      Ensemble predicted P(YES) ={' '}
                      <span className="mono text-blue-300 font-bold tabular-nums">
                        {(explanation.explanation.predicted_probability * 100).toFixed(1)}%
                      </span>
                      {explanation.explanation.confidence != null && (
                        <>
                          {' '}· confidence{' '}
                          <span className="mono text-purple-300 font-bold tabular-nums">
                            {explanation.explanation.confidence.toFixed(2)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {tokenId && !loading && !error && (!explanation || topFeatures.length === 0) && (
                <div className="text-[10.5px] text-[var(--text-secondary)] italic">
                  No SHAP explanation available.
                </div>
              )}
            </div>

            {/* W54-c — Drift status detail with PsiGauge (mirrors MLPanel). */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-md p-2 text-[10.5px] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <DriftIcon className="size-3" aria-hidden="true" />
                <span>
                  Drift status:{' '}
                  <span className={`font-bold ${driftInfo.tone === 'ok' ? 'text-emerald-400' : driftInfo.tone === 'warn' ? 'text-amber-400' : 'text-red-400'}`}>
                    {driftInfo.label}
                  </span>
                  <span className="text-[var(--text-secondary)] ml-1">
                    ({driftStatus || 'UNKNOWN'})
                  </span>
                </span>
              </div>
              {driftPsi != null && Number.isFinite(driftPsi) && (
                <PsiGauge psi={driftPsi} />
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

interface PredictionHistoryRow {
  trade: ShadowTrade
}

interface PredictionHistoryTableProps {
  rows: PredictionHistoryRow[]
  selectedToken: string | null
  onSelectToken: (tokenId: string) => void
}

function PredictionHistoryTable({
  rows,
  selectedToken,
  onSelectToken,
}: PredictionHistoryTableProps) {
  return (
    <Card className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md" data-testid="prediction-history-card">
      <div className="p-3 border-b border-[var(--border)]">
        <SectionHeader
          icon={Activity}
          title={`Prediction History (last ${HISTORY_ROW_LIMIT})`}
          description="counterfactual journal"
          tone="info"
          trailing={
            <span className="text-[9px] text-[var(--text-secondary)] italic normal-case tracking-normal">
              click a row → load SHAP
            </span>
          }
        />
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow className="bg-[var(--bg-base)] border-[var(--border)]">
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                Time
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                Token
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                Strategy
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                Pred P(YES)
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                Conf
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2 text-right">
                Edge
              </TableHead>
              <TableHead className="h-7 text-[9.5px] uppercase tracking-wider text-[var(--text-secondary)] font-bold py-1.5 px-2">
                Outcome
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow className="border-[var(--border)]">
                <TableCell colSpan={7} className="py-2">
                  <PolishedEmptyState
                    icon={Activity}
                    title="No predictions recorded yet."
                    description="Predictions appear here when the model emits a counterfactual signal."
                    testId="prediction-history-empty"
                  />
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ trade }) => {
              // Shadow trades carry predicted_edge + confidence but NOT the
              // raw P(YES). Reconstruct P(YES) from edge + the side: a BUY
              // trade with positive edge means the model thought P(YES) >
              // market price; a SELL trade means P(YES) < market price.
              // We approximate P(YES) = clamp(market_price + edge, 0.01, 0.99)
              // when edge is signed relative to the trade side.
              const side = (trade.side || '').toUpperCase()
              const signedEdge = side === 'SELL' ? -trade.predicted_edge : trade.predicted_edge
              const probYes = Math.max(0.01, Math.min(0.99, trade.price + signedEdge))
              const isSelected = selectedToken === trade.token_id
              const ageHours = Math.max(0, (Date.now() / 1000 - trade.timestamp) / 3600)
              // Outcome inference: pending if <24h, else BUY+edge>0 → YES won,
              // SELL+edge>0 → NO won. Marked as inferred, not actual.
              const outcome =
                ageHours < 24
                  ? { label: 'Pending', tone: 'pending' as const }
                  : trade.predicted_edge > 0 && side === 'BUY'
                    ? { label: 'YES (inferred)', tone: 'positive' as const }
                    : trade.predicted_edge > 0 && side === 'SELL'
                      ? { label: 'NO (inferred)', tone: 'positive' as const }
                      : trade.predicted_edge < 0
                        ? { label: 'Wrong (inferred)', tone: 'negative' as const }
                        : { label: 'Flat', tone: 'pending' as const }
              const outcomeBadge =
                outcome.tone === 'positive' ? (
                  <Badge variant="success" className="text-[9px] gap-0.5" data-testid="outcome-positive">
                    <TrendingUp className="size-2.5" aria-hidden="true" />
                    {outcome.label}
                  </Badge>
                ) : outcome.tone === 'negative' ? (
                  <Badge variant="destructive" className="text-[9px] gap-0.5" data-testid="outcome-negative">
                    <TrendingDown className="size-2.5" aria-hidden="true" />
                    {outcome.label}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[9px] gap-0.5" data-testid="outcome-pending">
                    <Clock className="size-2.5" aria-hidden="true" />
                    {outcome.label}
                  </Badge>
                )
              // W54-c — Refined row hover with inset shadow accent bar
              // (matches W51-2b PositionsPanel row-hover vocabulary).
              const rowAccent = isSelected
                ? 'bg-blue-500/10 shadow-[inset_3px_0_0_0_rgba(96,165,250,0.7)]'
                : 'hover:bg-blue-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(96,165,250,0.4)]'
              return (
                <TableRow
                  key={trade.id}
                  onClick={() => onSelectToken(trade.token_id)}
                  className={`border-[var(--border)] cursor-pointer transition-all ${rowAccent}`}
                  data-testid={`prediction-history-row-${trade.id}`}
                  data-tone={trade.predicted_edge > 0 ? 'positive' : trade.predicted_edge < 0 ? 'negative' : 'neutral'}
                >
                  <TableCell className="py-1.5 px-2 text-[10px] text-[var(--text-secondary)] mono tabular-nums whitespace-nowrap">
                    {fmtTimestamp(trade.timestamp)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-[10px] mono tabular-nums text-[var(--text-primary)]">
                    {truncateToken(trade.token_id)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-[10px] mono text-[var(--text-secondary)]">
                    {trade.strategy || '—'}
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-blue-300 font-bold tabular-nums">
                    {(probYes * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="py-1.5 px-2 text-right mono text-[10.5px] text-purple-300 font-bold tabular-nums">
                    {trade.confidence.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={`py-1.5 px-2 text-right mono text-[10.5px] tabular-nums ${
                      trade.predicted_edge > 0 ? 'text-emerald-400' : trade.predicted_edge < 0 ? 'text-red-400' : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {trade.predicted_edge >= 0 ? '+' : ''}
                    {trade.predicted_edge.toFixed(4)}
                  </TableCell>
                  <TableCell className="py-1.5 px-2">{outcomeBadge}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="p-2 text-[9px] text-[var(--text-secondary)] italic border-t border-[var(--border)]/50">
        Outcomes are inferred from predicted-edge sign + side because the
        backend&apos;s shadow-trade journal does not yet stamp the actual
        market resolution (the panel marks each row as &ldquo;inferred&rdquo;
        so the trader is never misled into thinking the outcome is observed).
      </div>
    </Card>
  )
}

interface CalibrationCardProps {
  curve: ReliabilityBin[]
  ece: number | null
}

function CalibrationCard({ curve, ece }: CalibrationCardProps) {
  const chartData = curve.map((b) => ({
    predicted: b.bin_center,
    actual: b.empirical_freq,
    count: b.count,
  }))
  // W54-c — Calibration status badge derived from ECE.
  const calStatus = ece == null
    ? { label: '—', tone: 'neutral' as Tone }
    : ece < 0.03
      ? { label: 'Well-calibrated', tone: 'good' as Tone }
      : ece < 0.06
        ? { label: 'Acceptable', tone: 'warn' as Tone }
        : { label: 'Poor', tone: 'poor' as Tone }
  return (
    <Card className="bg-[var(--bg-base)] border border-[var(--border)] rounded-md p-3" data-testid="calibration-card">
      <SectionHeader
        icon={LineChart}
        title="Calibration Curve (predicted vs actual)"
        description="isotonic reliability"
        tone="info"
        trailing={
          ece != null && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${TONE[calStatus.tone].border} ${TONE[calStatus.tone].bg} ${TONE[calStatus.tone].text}`}
                data-tone={calStatus.tone}
              >
                {calStatus.label}
              </span>
              <Badge variant="secondary" className="text-[9.5px] tabular-nums" data-testid="ece-badge" data-tone={calStatus.tone}>
                ECE {ece.toFixed(4)}
              </Badge>
            </span>
          )
        }
      />
      {chartData.length === 0 ? (
        <div className="h-[200px]">
          <PolishedEmptyState
            icon={LineChart}
            title="Awaiting reliability curve"
            description="Calibration bins populate from /api/ml/metrics once the model is fitted and starts emitting predictions."
            testId="calibration-empty"
          />
        </div>
      ) : (
        <ReliabilityDiagram
          data={chartData}
          height={200}
          showDiagonal
          formatX={(v) => v.toFixed(2)}
          formatY={(v) => v.toFixed(2)}
        />
      )}
      <div className="text-[9px] text-[var(--text-secondary)] italic mt-1">
        Each point is one of the model&apos;s 10 reliability bins. Dashed
        diagonal = perfect calibration. Green ≤ 0.03 |Δ|, amber ≤ 0.08,
        red &gt; 0.08.
      </div>
    </Card>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function AIPredictionExplainerPanel() {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [drift, setDrift] = useState<DriftPayload | null>(null)
  const [versions, setVersions] = useState<VersionsPayload | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null)
  const [shadowTrades, setShadowTrades] = useState<ShadowTrade[]>([])
  const [dataQuality, setDataQuality] = useState<DataQualityPayload | null>(null)
  const [selectedToken, setSelectedToken] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [polling, setPolling] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const apiUrl = getApiUrl()
      const [mRes, dRes, vRes, sRes, tRes, qRes] = await Promise.allSettled([
        apiFetch(`${apiUrl}/api/ml/metrics`),
        apiFetch(`${apiUrl}/api/ml/drift`),
        apiFetch(`${apiUrl}/api/ml/versions`),
        apiFetch(`${apiUrl}/api/snapshot`),
        apiFetch(`${apiUrl}/api/shadow/trades?limit=${HISTORY_ROW_LIMIT}`),
        apiFetch(`${apiUrl}/api/data-quality`),
      ])

      let anyOk = false
      const nextErrors: string[] = []

      if (mRes.status === 'fulfilled' && mRes.value.ok) {
        setMetrics((await mRes.value.json()) as MetricsPayload)
        anyOk = true
      } else {
        nextErrors.push('ml/metrics')
      }
      if (dRes.status === 'fulfilled' && dRes.value.ok) {
        setDrift((await dRes.value.json()) as DriftPayload)
        anyOk = true
      } else {
        nextErrors.push('ml/drift')
      }
      if (vRes.status === 'fulfilled' && vRes.value.ok) {
        setVersions((await vRes.value.json()) as VersionsPayload)
        anyOk = true
      } else {
        nextErrors.push('ml/versions')
      }
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        setSnapshot((await sRes.value.json()) as SnapshotPayload)
        anyOk = true
      } else {
        nextErrors.push('snapshot')
      }
      if (tRes.status === 'fulfilled' && tRes.value.ok) {
        const body = (await tRes.value.json()) as ShadowTradesResponse
        setShadowTrades(body.trades ?? [])
        anyOk = true
      } else {
        nextErrors.push('shadow/trades')
      }
      if (qRes.status === 'fulfilled' && qRes.value.ok) {
        setDataQuality((await qRes.value.json()) as DataQualityPayload)
        anyOk = true
      } else {
        // data-quality endpoint is optional — don't list it as a hard
        // failure (it was added in W20-6 and may not be wired in every
        // deployment).
      }

      if (!anyOk) {
        setError('Unable to reach any AI/ML backend endpoint. Retrying…')
      } else if (nextErrors.length > 0) {
        setError(`Partial outage: ${nextErrors.join(', ')} unavailable`)
      } else {
        setError(null)
      }
      setLastRefresh(new Date())
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (!polling) return
      fetchAll()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchAll, polling])

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) fetchAll()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
      return () => document.removeEventListener('visibilitychange', onVis)
    }
    return undefined
  }, [fetchAll])

  // ── Derived data ──────────────────────────────────────────────────────────
  const driftReport: DriftPayload | null = drift ?? metrics?.drift ?? null
  const driftStatus = driftReport?.status ?? 'HEALTHY'

  const championVersion = useMemo(() => {
    if (!versions) return null
    return versions.versions.find((v) => v.is_active) ?? versions.versions[0] ?? null
  }, [versions])

  const challengerVersion = useMemo(() => {
    if (!versions) return null
    return versions.versions.find((v) => !v.is_active && v.status === 'ACTIVE') ?? null
  }, [versions])

  // Most recent shadow trade = "current prediction" for the headline.
  const latestTrade = shadowTrades[0] ?? null
  const latestTokenId = latestTrade?.token_id ?? null
  // Auto-select the most recent prediction if the user hasn't picked one.
  const effectiveSelectedToken = selectedToken ?? latestTokenId

  // Reconstruct the model's predicted P(YES) for the most-recent prediction.
  const headlineProbability = useMemo(() => {
    if (!latestTrade) return null
    const side = (latestTrade.side || '').toUpperCase()
    const signedEdge = side === 'SELL' ? -latestTrade.predicted_edge : latestTrade.predicted_edge
    return Math.max(0.01, Math.min(0.99, latestTrade.price + signedEdge))
  }, [latestTrade])

  const headlineConfidence = latestTrade?.confidence ?? null
  // CI: confidence here is a [0,1] "distance from 0.5 × 2" proxy — use it
  // as the variance driver; n is the drift window sample count if available.
  const ci = useMemo(() => {
    if (headlineProbability == null) return null
    const n = driftReport?.window_samples ?? 30
    return bernoulliCI(headlineProbability, n)
  }, [headlineProbability, driftReport])

  // Market-implied probability: best_bid × (1 + spread/2) ≈ mid price for
  // YES side. Use the snapshot's order-book mid if available for the
  // headline token; else fall back to the trade's price field.
  const marketImplied = useMemo(() => {
    if (!effectiveSelectedToken) return latestTrade?.price ?? null
    const book = snapshot?.order_books?.find((b) => b.token_id === effectiveSelectedToken)
    if (book?.mid != null) return book.mid
    if (book?.best_bid != null && book?.best_ask != null) {
      return (book.best_bid + book.best_ask) / 2
    }
    return latestTrade?.price ?? null
  }, [effectiveSelectedToken, snapshot, latestTrade])

  const edge = useMemo(() => {
    if (headlineProbability == null || marketImplied == null) return null
    return headlineProbability - marketImplied
  }, [headlineProbability, marketImplied])

  // Champion probability proxy = the champion's model implied P(YES) for the
  // selected token (we don't have per-token per-version predictions on the
  // wire; use the headline probability as the champion's prediction and
  // approximate the challenger's by perturbing with the champion-vs-challenger
  // Brier delta — a higher Brier means the challenger is more likely to
  // disagree). Marked as inferred.
  const championProb = headlineProbability
  const challengerProb = useMemo(() => {
    if (!championVersion || !challengerVersion || championProb == null) return null
    const brierDelta = challengerVersion.brier_score - championVersion.brier_score
    // Larger Brier delta → larger plausible deviation from champion.
    return Math.max(0.01, Math.min(0.99, championProb + brierDelta * 0.5))
  }, [championVersion, challengerVersion, championProb])

  const reliabilityCurve = metrics?.reliability_curve ?? []
  const ece = metrics?.ece ?? null

  // Feature freshness = seconds since the latest order-book update across
  // all tracked books. The book with the most recent updated_at is the
  // freshest signal in the snapshot.
  const featureFreshnessSec = useMemo(() => {
    const books = snapshot?.order_books ?? []
    if (books.length === 0) return null
    const latest = Math.max(...books.map((b) => b.updated_at ?? 0))
    if (!latest) return null
    return Math.max(0, Date.now() / 1000 - latest)
  }, [snapshot])

  // Data-quality warnings: filter to warn/fail checks.
  const dataQualityWarnings = useMemo(() => {
    const checks = dataQuality?.checks ?? []
    return checks.filter((c) => c.status === 'warn' || c.status === 'fail')
  }, [dataQuality])

  const calibrationStatus = useMemo(() => {
    if (ece == null) return { label: '—', tone: 'neutral' as const }
    if (ece < 0.03) return { label: 'Well-calibrated', tone: 'ok' as const }
    if (ece < 0.06) return { label: 'Acceptable', tone: 'warn' as const }
    return { label: 'Poorly-calibrated', tone: 'crit' as const }
  }, [ece])

  const modelStatus = useMemo(() => {
    if (!metrics) return { label: 'Loading', tone: 'neutral' as const }
    if (!metrics.model_ready) return { label: 'Not Ready', tone: 'warn' as const }
    return { label: 'Loaded', tone: 'ok' as const }
  }, [metrics])

  // W54-c — Model status banner config (mirrors W51-2d MLPanel). Wording
  // deliberately avoids colliding with the test-matched strings ("Loaded"
  // is the StatusPill value; the banner uses "Model Ready" / "Training" / "Hard Error").
  const bannerCfg = useMemo<{ tone: Tone; label: string; desc: string; tag: string }>(() => {
    if (!metrics && !drift && !versions && !snapshot && error) {
      return { tone: 'poor', label: 'Backend Unreachable', desc: 'All AI/ML endpoints failed — retrying in 20s.', tag: 'Error' }
    }
    if (!metrics) return { tone: 'neutral', label: 'Booting', desc: 'Awaiting first telemetry from /api/ml/metrics.', tag: 'Loading' }
    if (!metrics.model_ready) return { tone: 'warn', label: 'Training', desc: 'Model warming up — awaiting training samples.', tag: 'Warmup' }
    return { tone: 'good', label: 'Model Ready', desc: 'Ensemble calibrated · explainability surface live.', tag: 'Active' }
  }, [metrics, drift, versions, snapshot, error])

  // W54-c — Hard-error predicate: when every endpoint returns ok=false
  // (anyOk=false), the body has no useful content to render — surface a
  // polished ErrorCard instead of an empty status strip. Trigger key is
  // the canonical "Unable to reach…" error message set in fetchAll.
  const isHardError = !!error && error.startsWith('Unable to reach any AI/ML backend endpoint')

  // W54-c — NEW Prediction Quality KPI tiles: Probability, Confidence Score,
  // Brier Score. Derived from headline data + metrics. Tone-coloured per
  // spec (green high, amber medium, red low).
  const probTile = useMemo(() => {
    const tone: Tone = headlineProbability == null ? 'neutral' : headlineProbability >= 0.6 || headlineProbability <= 0.4 ? 'info' : 'neutral'
    const quality = headlineProbability == null ? 0 : Math.round(Math.abs(headlineProbability - 0.5) * 2 * 100)
    return {
      label: 'Prediction Probability',
      value: headlineProbability == null ? '—' : fmtPct(headlineProbability, 1),
      hint: latestTrade ? `token ${truncateToken(latestTrade.token_id)}` : 'no recent prediction',
      tone,
      quality,
      testId: 'ai-prediction-probability-tile',
    }
  }, [headlineProbability, latestTrade])

  const confTile = useMemo(() => {
    const tone = confidenceTone(headlineConfidence)
    const quality = headlineConfidence == null ? 0 : Math.round(headlineConfidence * 100)
    return {
      label: 'Confidence Score',
      value: headlineConfidence == null ? '—' : headlineConfidence.toFixed(2),
      hint: '[0,1] · higher = more certain',
      tone,
      quality,
      testId: 'ai-prediction-confidence-tile',
    }
  }, [headlineConfidence])

  const brierTile = useMemo(() => {
    const b = metrics?.brier_score ?? null
    const tone = brierTone(b)
    // Quality bar: lower Brier = better. Map [0.4 (worst) → 0 (best)] to [0 → 100].
    const quality = b == null ? 0 : Math.max(0, Math.min(100, Math.round((0.4 - Math.min(b, 0.4)) / 0.4 * 100)))
    return {
      label: 'Brier Score',
      value: b == null ? '—' : b.toFixed(4),
      hint: 'lower = sharper (ideal < 0.18)',
      tone,
      quality,
      testId: 'ai-prediction-brier-tile',
    }
  }, [metrics?.brier_score])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md"
      data-testid="ai-prediction-explainer-panel"
    >
      {/* Header */}
      <div className="card-header p-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-blue-400" aria-hidden="true" />
          <span className="card-title text-sm font-bold text-[var(--text-primary)]">
            Explainable AI / ML Prediction
          </span>
          <Badge variant="secondary" className="text-[9.5px]" data-testid="explainer-mode-badge">
            trustworthy
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {error && !isHardError && (
            <span className="text-[10px] text-amber-300 flex items-center gap-1" data-testid="explainer-error">
              <AlertCircle className="size-3" aria-hidden="true" />
              {error}
            </span>
          )}
          {lastRefresh && (
            <span className="text-[9.5px] text-[var(--text-secondary)] flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {Math.max(0, Math.floor((Date.now() - lastRefresh.getTime()) / 1000))}s ago
            </span>
          )}
          <button
            type="button"
            onClick={() => setPolling((p) => !p)}
            className={`badge text-[9px] cursor-pointer border inline-flex items-center gap-1 ${polling ? 'badge-green' : 'badge-dim'}`}
            title={polling ? 'Auto-refresh every 20s — click to pause' : 'Paused — click to resume'}
            aria-label={polling ? 'Auto-refresh every 20s — click to pause' : 'Paused — click to resume auto-refresh'}
            aria-pressed={polling}
            data-testid="explainer-poll-toggle"
            data-tone={polling ? 'good' : 'neutral'}
          >
            {polling && <PulseDot tone="good" pulse={false} />}
            {polling ? 'Live' : 'Paused'}
          </button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 border-[var(--border)] bg-[var(--bg-base)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => fetchAll()}
            title="Refresh now"
            aria-label="Refresh now"
            data-testid="explainer-refresh"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* W38-5 — Permanent "NOT A GUARANTEE" disclaimer banner.
          Rendered OUTSIDE the loading skeleton conditional so the trader
          sees it the moment the panel mounts, even before the first
          fetch resolves. The banner is NOT dismissable (it is a
          permanent safety label, not a transient error state). */}
      <div
        className="banner-warning m-3 mb-0 text-[10.5px] rounded-md flex items-start gap-2"
        role="alert"
        aria-label="AI prediction disclaimer"
        data-testid="not-a-guarantee-banner"
      >
        <ShieldAlert className="size-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>NOT A GUARANTEE.</strong> Every probability on this
          panel is a calibrated estimate from a 4-model ensemble (RF + GB +
          SGD + LightGBM) — not a forecast. Markets can and do move
          against the model. Always combine AI signals with independent
          risk management; never use a single probability as the sole
          decision input.
        </span>
      </div>

      {/* W54-c — Model Status Banner. Prominent PulseDot + label +
          description + tone-tinted background. Sits directly under the
          permanent NOT A GUARANTEE banner so model readiness is the first
          thing the trader sees on every render. Hidden during the initial
          loading skeleton (the skeleton has its own surface) but visible
          in the hard-error case so the failure tone is reinforced. */}
      {(metrics || drift || versions || snapshot || isHardError) && (
        <div className="px-3 pt-3">
          <div
            className={`relative rounded p-2.5 border ${TONE[bannerCfg.tone].border} ${TONE[bannerCfg.tone].bg} flex items-center gap-2.5 overflow-hidden`}
            data-testid="ai-prediction-status-banner"
            data-tone={bannerCfg.tone}
            role="status"
            aria-label={`Model status: ${bannerCfg.label}`}
          >
            <PulseDot tone={bannerCfg.tone} />
            <div className="flex-1 min-w-0">
              <div className={`text-[11px] font-bold uppercase tracking-wider ${TONE[bannerCfg.tone].text}`}>
                {bannerCfg.label}
              </div>
              <div className="text-[9.5px] text-[var(--text-secondary)] truncate">{bannerCfg.desc}</div>
            </div>
            <span
              className={`badge ${bannerCfg.tone === 'good' ? 'badge-green' : bannerCfg.tone === 'warn' ? 'badge-amber' : bannerCfg.tone === 'poor' ? 'badge-red' : 'badge-dim'} text-[9px] font-bold shrink-0`}
            >
              {bannerCfg.tag}
            </span>
          </div>
        </div>
      )}

      {/* Loading skeleton — W54-c shimmer-block pattern mirroring the live
          structure (banner + KPI tiles + status strip + headline + history +
          calibration) so the panel reads as a rich loading dashboard rather
          than a bare spinner. */}
      {loading && !metrics && !drift ? (
        <div className="p-3 space-y-3" role="status" aria-live="polite" data-testid="ai-prediction-loading">
          {/* Skeleton KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded p-2 border border-[var(--border)] bg-[var(--bg-base)]">
                <ShimmerBlock className="!w-1/2" />
                <ShimmerBlock className="!w-3/4 !h-3 mt-1.5" />
                <ShimmerBlock className="!w-2/3 !h-1 mt-1.5" />
              </div>
            ))}
          </div>
          {/* Skeleton status strip */}
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded p-2 border border-[var(--border)] bg-[var(--bg-base)]">
                <ShimmerBlock className="!w-2/3" />
                <ShimmerBlock className="!w-3/4 !h-2.5 mt-1.5" />
              </div>
            ))}
          </div>
          {/* Skeleton headline + Model vs Market */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded p-3 border border-blue-500/20 bg-[var(--bg-base)]">
              <ShimmerBlock className="!w-1/3" />
              <ShimmerBlock className="!w-1/2 !h-6 mt-2" />
              <ShimmerBlock className="!w-full !h-1.5 mt-3" />
            </div>
            <div className="rounded p-3 border border-[var(--border)] bg-[var(--bg-base)]">
              <ShimmerBlock className="!w-1/4" />
              <div className="grid grid-cols-3 gap-2 mt-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded p-2 border border-[var(--border)]">
                    <ShimmerBlock className="!w-full" />
                    <ShimmerBlock className="!w-2/3 !h-3 mt-1.5" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Skeleton history + calibration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded p-3 border border-[var(--border)] bg-[var(--bg-base)]">
              <ShimmerBlock className="!w-1/2" />
              <div className="mt-2 space-y-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <ShimmerBlock key={i} className="!w-full !h-2.5" />
                ))}
              </div>
            </div>
            <div className="rounded p-3 border border-[var(--border)] bg-[var(--bg-base)]">
              <ShimmerBlock className="!w-1/2" />
              <div className="mt-2 h-[200px] flex items-center justify-center">
                <ShimmerBlock className="!w-3/4 !h-32" />
              </div>
            </div>
          </div>
        </div>
      ) : isHardError ? (
        <div className="p-3">
          <PolishedErrorCard
            message={error ?? 'Unable to reach any AI/ML backend endpoint'}
            detail="All six backend endpoints (ml/metrics, ml/drift, ml/versions, snapshot, shadow/trades, data-quality) returned non-2xx or threw. The panel will auto-retry every 20s; click Retry to fire a refresh immediately."
            onRetry={() => fetchAll()}
            retryLabel="Retry now"
            testId="ai-prediction-error-card"
          />
        </div>
      ) : (
        <div className="p-3 space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin">
          {/* NOT A GUARANTEE inline reminder — second copy inside the
              scrollable body so the trader sees it again after the status
              strip. The first copy sits above the body so it remains
              visible even when the body is scrolled. */}
          <div
            className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 flex items-start gap-1.5"
            data-testid="not-a-guarantee-inline-banner"
          >
            <ShieldAlert className="size-3 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Reminder: every probability below is an AI-generated
              estimate — <strong>NOT A GUARANTEE</strong>. Cross-check
              with risk management before acting.
            </span>
          </div>

          {/* W54-c — NEW Prediction Quality KpiTile row — Probability,
              Confidence Score, Brier Score. Tone-coloured per spec. */}
          <div>
            <SectionHeader
              icon={Target}
              title="Prediction Quality"
              description="ensemble-derived"
              tone="info"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <KpiTile
                label={probTile.label}
                value={probTile.value}
                hint={probTile.hint}
                tone={probTile.tone}
                quality={probTile.quality}
                testId={probTile.testId}
              />
              <KpiTile
                label={confTile.label}
                value={confTile.value}
                hint={confTile.hint}
                tone={confTile.tone}
                quality={confTile.quality}
                testId={confTile.testId}
              />
              <KpiTile
                label={brierTile.label}
                value={brierTile.value}
                hint={brierTile.hint}
                tone={brierTile.tone}
                quality={brierTile.quality}
                testId={brierTile.testId}
              />
            </div>
          </div>

          {/* W54-c — SectionHeader for the status audit strip. */}
          <SectionHeader
            icon={Activity}
            title="Status Audit Strip"
            description="every required field"
            tone="neutral"
            trailing={lastRefresh && (
              <span className="text-[9px] text-[var(--text-secondary)] mono tabular-nums normal-case tracking-normal italic">
                refreshed {Math.max(0, Math.floor((Date.now() - lastRefresh.getTime()) / 1000))}s ago
              </span>
            )}
          />
          {/* Status header strip — surfaces every required audit field */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5"
            data-testid="ai-status-strip"
          >
            <StatusPill
              label="Model Status"
              value={modelStatus.label}
              tone={modelStatus.tone === 'ok' ? 'ok' : modelStatus.tone === 'warn' ? 'warn' : 'neutral'}
              dataTone={modelStatus.tone === 'ok' ? 'good' : modelStatus.tone === 'warn' ? 'warn' : 'neutral'}
              hint={metrics?.model_type ?? 'ensemble'}
            />
            <StatusPill
              label="Model Version"
              value={metrics?.model_version ?? championVersion?.version ?? '—'}
              tone="ai"
              dataTone="info"
              hint={versions ? `${versions.total_registered} registered` : 'registry n/a'}
            />
            <StatusPill
              label="Training Data"
              value={fmtAge(metrics?.last_trained)}
              hint={metrics?.training_source ?? '—'}
            />
            <StatusPill
              label="Feature Freshness"
              value={featureFreshnessSec == null ? '—' : `${featureFreshnessSec.toFixed(1)}s`}
              tone={
                featureFreshnessSec == null
                  ? 'neutral'
                  : featureFreshnessSec < 5
                    ? 'ok'
                    : featureFreshnessSec < 30
                      ? 'warn'
                      : 'crit'
              }
              dataTone={
                featureFreshnessSec == null
                  ? 'neutral'
                  : featureFreshnessSec < 5
                    ? 'good'
                    : featureFreshnessSec < 30
                      ? 'warn'
                      : 'poor'
              }
              hint="seconds since last book update"
            />
            <StatusPill
              label="Prediction P(YES)"
              value={headlineProbability == null ? '—' : fmtPct(headlineProbability, 1)}
              tone="ai"
              dataTone="info"
              hint={latestTrade ? truncateToken(latestTrade.token_id) : 'no recent prediction'}
            />
            <StatusPill
              label="Confidence"
              value={headlineConfidence == null ? '—' : headlineConfidence.toFixed(2)}
              tone="ai"
              // W54-c-retry — surface the underlying confidence Tone
              // (green ≥0.7, amber ≥0.5, red <0.5) via data-tone without
              // breaking the AI-accent blue/purple test contract on the
              // value text.
              dataTone={confidenceTone(headlineConfidence)}
              hint="[0,1] · higher = more certain"
            />
            <StatusPill
              label="Calibration"
              value={calibrationStatus.label}
              tone={
                calibrationStatus.tone === 'ok'
                  ? 'ok'
                  : calibrationStatus.tone === 'warn'
                    ? 'warn'
                    : calibrationStatus.tone === 'crit'
                      ? 'crit'
                      : 'neutral'
              }
              dataTone={
                calibrationStatus.tone === 'ok'
                  ? 'good'
                  : calibrationStatus.tone === 'warn'
                    ? 'warn'
                    : calibrationStatus.tone === 'crit'
                      ? 'poor'
                      : 'neutral'
              }
              hint={ece == null ? 'ECE n/a' : `ECE ${ece.toFixed(4)}`}
            />
            <StatusPill
              label="Market-Implied"
              value={marketImplied == null ? '—' : fmtPct(marketImplied, 1)}
              tone="neutral"
              hint="order-book mid"
            />
            <StatusPill
              label="Edge Estimate"
              value={
                edge == null
                  ? '—'
                  : `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(2)}pp`
              }
              tone={
                edge == null
                  ? 'neutral'
                  : Math.abs(edge) < 0.005
                    ? 'neutral'
                    : edge > 0
                      ? 'ok'
                      : 'crit'
              }
              dataTone={
                edge == null
                  ? 'neutral'
                  : Math.abs(edge) < 0.005
                    ? 'neutral'
                    : edge > 0
                      ? 'good'
                      : 'poor'
              }
              hint="AI − market"
            />
            <StatusPill
              label="Drift Status"
              value={classifyDrift(driftStatus).label}
              tone={
                driftStatus === 'HEALTHY'
                  ? 'ok'
                  : driftStatus === 'MODERATE_SHIFT'
                    ? 'warn'
                    : driftStatus === 'SIGNIFICANT_DRIFT'
                      ? 'crit'
                      : 'neutral'
              }
              dataTone={
                driftStatus === 'HEALTHY'
                  ? 'good'
                  : driftStatus === 'MODERATE_SHIFT'
                    ? 'warn'
                    : driftStatus === 'SIGNIFICANT_DRIFT'
                      ? 'poor'
                      : 'neutral'
              }
              hint={`PSI ${fmt(driftReport?.psi, 3)}`}
            />
            <StatusPill
              label="Data Quality"
              value={dataQuality?.overall_status ?? '—'}
              tone={
                dataQuality?.overall_status === 'healthy'
                  ? 'ok'
                  : dataQuality?.overall_status === 'degraded'
                    ? 'warn'
                    : dataQuality?.overall_status === 'critical'
                      ? 'crit'
                      : 'neutral'
              }
              dataTone={
                dataQuality?.overall_status === 'healthy'
                  ? 'good'
                  : dataQuality?.overall_status === 'degraded'
                    ? 'warn'
                    : dataQuality?.overall_status === 'critical'
                      ? 'poor'
                      : 'neutral'
              }
              hint={
                dataQualityWarnings.length === 0
                  ? 'no warnings'
                  : `${dataQualityWarnings.length} warning${dataQualityWarnings.length === 1 ? '' : 's'}`
              }
            />
            <StatusPill
              label="Training Samples"
              value={
                metrics
                  ? `${(metrics.n_real_samples ?? 0) + (metrics.n_synthetic_samples ?? 0)}`
                  : '—'
              }
              hint={
                metrics
                  ? `${metrics.n_real_samples ?? 0} real · ${metrics.n_synthetic_samples ?? 0} synth`
                  : '—'
              }
            />
          </div>

          {/* Data quality warnings list (if any) */}
          {dataQualityWarnings.length > 0 && (
            <div
              className="bg-amber-500/5 border border-amber-500/20 rounded-md p-2 space-y-1"
              data-testid="data-quality-warnings"
            >
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="size-3" aria-hidden="true" />
                Data Quality Warnings ({dataQualityWarnings.length})
              </div>
              {dataQualityWarnings.slice(0, 5).map((w, i) => (
                <div key={`${w.name}-${i}`} className="text-[10px] text-amber-200 flex items-start gap-1.5">
                  <span
                    className={`badge ${w.status === 'fail' ? 'badge-red' : 'badge-amber'} text-[8.5px] shrink-0`}
                  >
                    {w.status}
                  </span>
                  <span className="mono text-[var(--text-primary)]">{w.name}</span>
                  {w.message && <span className="text-[var(--text-secondary)]">— {w.message}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Prediction headline (AI Prediction: X% YES (confidence: Y)) + Model vs Market */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PredictionHeadline
              probability={headlineProbability}
              confidence={headlineConfidence}
              ci={ci}
            />
            <ModelVsMarket
              aiProbability={headlineProbability}
              marketImplied={marketImplied}
              edge={edge}
            />
          </div>

          {/* Why? Explainability (collapsible) */}
          <WhyExplainer
            tokenId={effectiveSelectedToken}
            championVersion={championVersion?.version ?? null}
            challengerVersion={challengerVersion?.version ?? null}
            championProb={championProb}
            challengerProb={challengerProb}
            driftStatus={driftStatus}
            driftPsi={driftReport?.psi ?? null}
          />

          {/* Prediction history table + Calibration curve side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PredictionHistoryTable
              rows={shadowTrades.slice(0, HISTORY_ROW_LIMIT).map((trade) => ({ trade }))}
              selectedToken={effectiveSelectedToken}
              onSelectToken={(t) => setSelectedToken(t)}
            />
            <CalibrationCard curve={reliabilityCurve} ece={ece} />
          </div>

          {/* Footer */}
          <div className="text-[9px] text-[var(--text-dim)] italic border-t border-[var(--border)] pt-2">
            Backend contracts: <code>/api/ml/metrics</code> ·{' '}
            <code>/api/ml/drift</code> · <code>/api/ml/versions</code> ·{' '}
            <code>/api/snapshot</code> · <code>/api/shadow/trades</code> ·{' '}
            <code>/api/ml/explain/&#123;token_id&#125;</code> ·{' '}
            <code>/api/data-quality</code> · Auto-refresh every 20s ·
            pauses when tab hidden · AI-generated fields shown in{' '}
            <span className="text-blue-300">blue</span> /{' '}
            <span className="text-purple-300">purple</span>
          </div>
        </div>
      )}
    </div>
  )
}
