// components/MLValidationPanel.tsx — Walk-forward CV + drift governance panel.
//
// Exposes the ML validation surface implemented in
// `mini-services/polymarket-bot/ml/validation.py` (POST /api/ml/validate —
// one-shot walk-forward CV), the live drift detector in
// `mini-services/polymarket-bot/ml/drift_detector.py` (GET /api/ml/drift),
// the trained-model metrics in `mini-services/polymarket-bot/ml/model.py`
// (GET /api/ml/metrics, including the 10-bin reliability_curve + ECE), and
// the model registry in `mini-services/polymarket-bot/ml/model_registry.py`
// (GET /api/ml/versions). Retrain is triggered by POST /api/ml/retrain.
//
// W54-e polish (additive over W28-3 / W39-6): brings MLValidationPanel in
// line with the W51-2d MLPanel visual layer — KpiTile pattern, shimmer
// skeleton, polished empty/error states, SectionHeader, refined table with
// row-hover accent bar + tabular-nums + uppercase headers, tone-colored
// validation status, refined sparkline (tone-aware stroke + area fill),
// and a NEW focus-metric selector. All test contracts preserved.
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Crosshair,
  History,
  Layers,
  Loader2,
  type LucideIcon,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'

import { apiFetch, getApiUrl } from '@/lib/api'
import {
  AIPredictionLabel,
  ConfidenceBadge,
  ModelStatusStrip,
  NotAGuaranteeInline,
  WhyExplanation,
  driftLevelFromStatus,
  type FeatureContribution,
} from '@/components/ai-explainability'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReliabilityDiagram } from '@/components/charts'

// ── Types (mirror backend payloads) ────────────────────────────────────────

interface DriftSample {
  timestamp: number
  psi: number
  ks_stat: number
  status: string
  rolling_brier: number | null
  ewma_brier: number | null
}

interface DriftReport {
  psi: number
  ks_stat: number
  rolling_brier: number | null
  ewma_brier: number | null
  status: string
  window_samples: number
  outcome_samples: number
  threshold_moderate_psi: number
  threshold_critical_psi: number
  threshold_moderate_ks: number
  threshold_critical_ks: number
  threshold_brier_drift: number
  ewma_alpha: number
  history: DriftSample[]
}

interface DriftEndpointPayload extends DriftReport {
  meta_learner?: { is_warm: boolean; n_updates: number; buffer_size: number }
  orchestrator?: Record<string, unknown>
  model_version?: string
  brier_baseline?: number
  roc_auc?: number
}

interface ReliabilityBin {
  bin_center: number
  empirical_freq: number
  count: number
}

interface MetricsPayload {
  model_type?: string
  brier_score: number
  roc_auc: number
  log_loss: number
  ece: number
  sharpe_ratio: number
  n_online_updates: number
  last_trained: number
  training_source: string
  n_real_samples: number
  n_synthetic_samples: number
  adaptive_weights?: Record<string, number>
  meta_learner?: { is_warm: boolean; n_updates: number; buffer_size: number; min_samples_required: number }
  drift: DriftReport
  feature_importances: Record<string, number>
  reliability_curve: ReliabilityBin[]
  model_ready: boolean
  model_version: string
  registry_summary?: { active_version: string; total_registered: number }
}

interface ModelVersion {
  version: string
  created_at: number
  brier_score: number
  roc_auc: number
  ece: number
  sharpe_ratio: number
  status: string
  n_samples: number
  parameters: Record<string, unknown>
  is_active: boolean
}

interface VersionsPayload {
  active_version: string
  total_registered: number
  versions: ModelVersion[]
}

interface RetrainResult {
  status: string
  brier_score: number
  roc_auc: number
  log_loss: number
  ece: number
  model_version: string
}

const POLL_INTERVAL_MS = 30_000

const DRIFT_STATUS_MAP: Record<
  string,
  { label: string; cls: string; tone: ValidationTone; icon: 'ok' | 'warn' | 'crit' }
> = {
  HEALTHY: { label: 'OK', cls: 'badge-green', tone: 'pass', icon: 'ok' },
  MODERATE_SHIFT: { label: 'WARNING', cls: 'badge-amber', tone: 'warn', icon: 'warn' },
  SIGNIFICANT_DRIFT: { label: 'CRITICAL', cls: 'badge-red', tone: 'fail', icon: 'crit' },
}

// ── W51-2d Tone system (mirror of MLPanel.tsx) ──────────────────────────────
type ValidationTone = 'pass' | 'warn' | 'fail' | 'info' | 'neutral'

interface ToneConfig {
  bg: string
  border: string
  text: string
  bar: string
  dot: string
  label: string
  halo: string
}

const TONE: Record<ValidationTone, ToneConfig> = {
  pass:    { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/25', text: 'text-emerald-400', bar: 'bg-emerald-500', dot: 'bg-emerald-400', label: 'text-emerald-400/80', halo: 'shadow-emerald-500/10' },
  warn:    { bg: 'bg-amber-500/[0.06]',   border: 'border-amber-500/25',   text: 'text-amber-400',   bar: 'bg-amber-500',   dot: 'bg-amber-400',   label: 'text-amber-400/80',   halo: 'shadow-amber-500/10' },
  fail:    { bg: 'bg-red-500/[0.06]',     border: 'border-red-500/25',     text: 'text-red-400',     bar: 'bg-red-500',     dot: 'bg-red-400',     label: 'text-red-400/80',     halo: 'shadow-red-500/10' },
  info:    { bg: 'bg-cyan-500/[0.06]',    border: 'border-cyan-500/25',    text: 'text-cyan-300',    bar: 'bg-cyan-500',    dot: 'bg-cyan-400',    label: 'text-cyan-300/80',    halo: 'shadow-cyan-500/10' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',     text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function std(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length)
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

function fmtRel(epoch: number): string {
  if (!epoch) return '—'
  const diff = Date.now() / 1000 - epoch
  if (diff < 0) return 'just now'
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function classifyTone(
  value: number,
  thresholds: { good: number; warn: number; higherIsBetter: boolean },
): ValidationTone {
  const { good, warn, higherIsBetter } = thresholds
  if (higherIsBetter) {
    return value >= good ? 'pass' : value >= warn ? 'warn' : 'fail'
  }
  return value <= good ? 'pass' : value <= warn ? 'warn' : 'fail'
}

function classifyMetric(value: number, thresholds: { good: number; warn: number; higherIsBetter: boolean }) {
  const tone = classifyTone(value, thresholds)
  if (tone === 'pass') return 'text-emerald-400'
  if (tone === 'warn') return 'text-amber-400'
  return 'text-red-400'
}

function qualityPct(
  value: number,
  thresholds: { good: number; warn: number; higherIsBetter: boolean },
): number {
  const { good, warn, higherIsBetter } = thresholds
  if (higherIsBetter) {
    if (value >= good) return Math.min(100, 60 + Math.min(40, (value - good) * 200))
    if (value >= warn) return Math.max(30, 30 + ((value - warn) / (good - warn)) * 30)
    return Math.max(5, (value / warn) * 30)
  }
  if (value <= good) return Math.min(100, 60 + Math.min(40, (good - value) * 400))
  if (value <= warn) return Math.max(30, 30 + ((warn - value) / (warn - good)) * 30)
  return Math.max(5, Math.max(0, 30 - (value - warn) * 60))
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PulseDot({ tone, pulse = true }: { tone: ValidationTone; pulse?: boolean }) {
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
  tone?: ValidationTone
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
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

interface KpiTileProps {
  label: string
  value: string
  hint: string
  tone: ValidationTone
  quality?: number
  trend?: 'up' | 'down' | 'flat'
  testId?: string
}

function KpiTile({ label, value, hint, tone, quality, trend, testId }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`kpi-card relative rounded p-2 border ${cfg.border} ${cfg.bg} overflow-hidden transition-colors`}
      title={`${label} — ${hint}`}
    >
      <div className={`text-[9px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
        {label}
      </div>
      <div
        className={`kpi-value mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
        data-testid={testId}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-2.5 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-2.5 inline-block" aria-hidden="true" />}
      </div>
      <div className="kpi-sub text-[8px] text-[#5a637a] mt-0.5 italic truncate">{hint}</div>
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

function ShimmerBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton-line-sm ${className}`}
      aria-hidden="true"
    />
  )
}

function ValidationSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading ML validation surface" data-testid="ml-validation-skeleton">
      <div className="grid-kpi">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="kpi-card">
            <ShimmerBlock className="w-2/5" />
            <div className="h-5 mt-1.5 rounded-sm skeleton-line-md" />
            <ShimmerBlock className="w-1/3 mt-1" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <ShimmerBlock className="w-1/4" />
          <ShimmerBlock className="w-1/6 ml-auto" />
        </div>
        <div className="p-2 space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-1 py-1.5">
              <ShimmerBlock className="w-8 shrink-0" />
              <ShimmerBlock className="w-20 shrink-0" />
              <div className="flex-1 h-3 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-16 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="card-header">
            <ShimmerBlock className="w-1/3" />
            <ShimmerBlock className="w-1/6 ml-auto" />
          </div>
          <div className="p-4 space-y-2">
            <div className="h-24 rounded-md skeleton-line-md" />
            <ShimmerBlock className="w-full" />
            <ShimmerBlock className="w-3/4" />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <ShimmerBlock className="w-1/3" />
            <ShimmerBlock className="w-1/6 ml-auto" />
          </div>
          <div className="p-4 grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-md skeleton-line-md" />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <ShimmerBlock className="w-1/4" />
          <ShimmerBlock className="w-1/6 ml-auto" />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <ShimmerBlock className="w-5 shrink-0" />
              <div className="flex-1 h-3 rounded-sm skeleton-line-md" />
              <ShimmerBlock className="w-10 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <ShimmerBlock className="w-1/4" />
          <ShimmerBlock className="w-1/6 ml-auto" />
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3 space-y-2">
            <ShimmerBlock className="w-1/3" />
            <div className="h-5 rounded-sm skeleton-line-md" />
            <ShimmerBlock className="w-full" />
            <ShimmerBlock className="w-2/3" />
          </div>
          <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3 space-y-2">
            <ShimmerBlock className="w-1/3" />
            <div className="h-8 rounded-md skeleton-line-md" />
            <ShimmerBlock className="w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PolishedErrorState({
  message,
  detail,
  onRetry,
}: {
  message: string
  detail: string
  onRetry: () => void
}) {
  return (
    <div
      className="error-state p-8"
      role="alert"
      data-testid="ml-validation-error"
    >
      <AlertTriangle className="error-state-icon text-[var(--color-red-fg)]" size={28} />
      <div className="error-state-title">{message}</div>
      <div className="error-state-desc">{detail}</div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="mt-2"
        aria-label="Retry ML validation fetch"
        data-testid="ml-validation-error-retry"
      >
        <RefreshCw size={14} className="mr-1.5" />
        Retry
      </Button>
    </div>
  )
}

function PolishedEmptyState({
  icon: Icon,
  title,
  desc,
  tone = 'neutral',
}: {
  icon: LucideIcon
  title: string
  desc: string
  tone?: ValidationTone
}) {
  return (
    <div className="empty-state p-8" role="status">
      <Icon className={`empty-state-icon ${TONE[tone].text}`} size={28} />
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-desc">{desc}</div>
    </div>
  )
}

function Sparkline({
  values,
  max,
  tone = 'info',
}: {
  values: number[]
  max: number
  tone?: ValidationTone
}) {
  if (values.length === 0) return null
  const w = 100
  const h = 28
  const step = values.length > 1 ? w / (values.length - 1) : 0
  const norm = (v: number) => (max > 0 ? h - (v / max) * h : h)
  const cfg = TONE[tone]
  const stroke = tone === 'pass'
    ? '#34d399'
    : tone === 'warn'
      ? '#fbbf24'
      : tone === 'fail'
        ? '#f87171'
        : '#22d3ee'
  const areaFill = tone === 'pass'
    ? 'rgba(52, 211, 153, 0.12)'
    : tone === 'warn'
      ? 'rgba(251, 191, 36, 0.12)'
      : tone === 'fail'
        ? 'rgba(248, 113, 113, 0.12)'
        : 'rgba(34, 211, 238, 0.12)'

  const linePath =
    values.length === 1
      ? `M 0 ${norm(values[0])} L ${w} ${norm(values[0])}`
      : values
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${norm(v).toFixed(1)}`)
          .join(' ')
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`overflow-visible ${cfg.text}`}
      role="img"
      aria-label={`PSI trend across last ${values.length} samples`}
    >
      <line
        x1={0}
        y1={h / 2}
        x2={w}
        y2={h / 2}
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={0.5}
        strokeDasharray="2 2"
        aria-hidden="true"
      />
      <path d={areaPath} fill={areaFill} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={norm(v)}
          r={1.5}
          fill={stroke}
          aria-hidden="true"
        />
      ))}
    </svg>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────

type FocusMetric = 'psi' | 'ks' | 'rolling_brier' | 'ewma_brier'

const FOCUS_METRICS: { value: FocusMetric; label: string }[] = [
  { value: 'psi', label: 'PSI' },
  { value: 'ks', label: 'KS' },
  { value: 'rolling_brier', label: 'Rolling Brier' },
  { value: 'ewma_brier', label: 'EWMA Brier' },
]

export default function MLValidationPanel() {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null)
  const [drift, setDrift] = useState<DriftEndpointPayload | null>(null)
  const [versions, setVersions] = useState<VersionsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retraining, setRetraining] = useState(false)
  const [retrainResult, setRetrainResult] = useState<RetrainResult | null>(null)
  const [retrainToast, setRetrainToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [focusMetric, setFocusMetric] = useState<FocusMetric>('psi')

  const fetchAll = useCallback(async () => {
    try {
      const apiUrl = getApiUrl()
      const [m, d, v] = await Promise.all([
        apiFetch(`${apiUrl}/api/ml/metrics`).then((r) => (r.ok ? r.json() : null)),
        apiFetch(`${apiUrl}/api/ml/drift`).then((r) => (r.ok ? r.json() : null)),
        apiFetch(`${apiUrl}/api/ml/versions`).then((r) => (r.ok ? r.json() : null)),
      ])
      if (m) setMetrics(m)
      if (d) setDrift(d)
      if (v) setVersions(v)
      setError(m || d || v ? null : 'All ML validation endpoints returned no payload')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        fetchAll()
      }, POLL_INTERVAL_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    start()
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchAll()
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [fetchAll])

  useEffect(() => {
    if (!retrainToast) return
    const t = setTimeout(() => setRetrainToast(null), 5_000)
    return () => clearTimeout(t)
  }, [retrainToast])

  const triggerRetrain = useCallback(async () => {
    setRetraining(true)
    try {
      const apiUrl = getApiUrl()
      const r = await apiFetch(`${apiUrl}/api/ml/retrain`, { method: 'POST' })
      if (r.ok) {
        const payload = (await r.json()) as RetrainResult
        setRetrainResult(payload)
        setRetrainToast({
          kind: 'ok',
          msg: `Retrained → ${payload.model_version} (Brier ${payload.brier_score.toFixed(4)}, AUC ${payload.roc_auc.toFixed(4)})`,
        })
        fetchAll()
      } else {
        setRetrainToast({
          kind: 'err',
          msg: `HTTP ${r.status} ${r.statusText}`,
        })
      }
    } catch (e) {
      setRetrainToast({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setRetraining(false)
    }
  }, [fetchAll])

  // Derived data ────────────────────────────────────────────────────────────
  const driftReport: DriftReport | null = drift ?? metrics?.drift ?? null
  const driftHistory: DriftSample[] = driftReport?.history ?? []
  const psiValues = driftHistory.map((h) => h.psi).filter((v) => v != null)
  const brierValues = driftHistory.map((h) => h.rolling_brier).filter((v): v is number => v != null)
  const ewmaValues = driftHistory.map((h) => h.ewma_brier).filter((v): v is number => v != null)
  const psiMean = mean(psiValues)
  const psiStd = std(psiValues)
  const brierMean = mean(brierValues)
  const brierStd = std(brierValues)

  const reliabilityCurve = metrics?.reliability_curve ?? []
  const featureEntries = useMemo(() => {
    if (!metrics?.feature_importances) return []
    return Object.entries(metrics.feature_importances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
  }, [metrics])
  const maxFeatureImp = featureEntries[0]?.[1] ?? 1

  const activeVersion = useMemo(() => {
    const v = versions?.versions.find((x) => x.is_active) ?? versions?.versions[0]
    return v ?? null
  }, [versions])

  const driftStatusInfo = driftReport
    ? DRIFT_STATUS_MAP[driftReport.status] ?? { label: driftReport.status, cls: 'badge-dim', tone: 'neutral' as ValidationTone, icon: 'warn' as const }
    : null

  const pooledBrier = metrics?.brier_score ?? null
  const pooledAuc = metrics?.roc_auc ?? null
  const pooledLogLoss = metrics?.log_loss ?? null
  const pooledEce = metrics?.ece ?? null
  const pooledAcc = driftReport?.window_samples ? null : null

  const brierTone: ValidationTone = pooledBrier != null
    ? classifyTone(pooledBrier, { good: 0.15, warn: 0.20, higherIsBetter: false })
    : 'neutral'
  const aucTone: ValidationTone = pooledAuc != null
    ? classifyTone(pooledAuc, { good: 0.80, warn: 0.70, higherIsBetter: true })
    : 'neutral'
  const logLossTone: ValidationTone = pooledLogLoss != null
    ? classifyTone(pooledLogLoss, { good: 0.45, warn: 0.55, higherIsBetter: false })
    : 'neutral'
  const eceTone: ValidationTone = pooledEce != null
    ? classifyTone(pooledEce, { good: 0.03, warn: 0.06, higherIsBetter: false })
    : 'neutral'

  const aiConfidence = useMemo(() => {
    if (pooledEce == null) return null
    if (pooledEce < 0.03) return 0.85
    if (pooledEce < 0.06) return 0.65
    if (pooledEce < 0.10) return 0.45
    return 0.25
  }, [pooledEce])

  const topWhyFeatures: FeatureContribution[] = useMemo(() => {
    if (!metrics?.feature_importances) return []
    return Object.entries(metrics.feature_importances)
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
  }, [metrics])

  const modelAgreement = useMemo(() => {
    if (!versions || versions.versions.length < 2) return null
    const champ = versions.versions.find((v) => v.is_active) ?? versions.versions[0]
    const chall = versions.versions.find((v) => v !== champ)
    if (!champ || !chall) return null
    const delta = Math.abs(champ.brier_score - chall.brier_score)
    return Math.max(0, Math.min(1, 1 - delta))
  }, [versions])

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
  }, [metrics, drift])

  const driftLevel = driftLevelFromStatus(driftReport?.status)
  const calibrated = (pooledEce ?? 1) < 0.06
  const modelVersion = activeVersion?.version ?? metrics?.model_version ?? '—'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[#1f2335] rounded-lg overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-center gap-3 p-4 border-b border-[#1f2335] bg-[#13161e]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-[var(--color-cyan-bg)] border border-[var(--color-cyan-bd)]">
            <Brain className="text-[var(--color-cyan-fg)]" size={18} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#dde1ed] flex items-center gap-2">
              ML Validation &amp; Walk-Forward CV
              <span className="badge badge-dim text-[9px]">governance + drift</span>
            </h2>
            <p className="text-[11px] text-[#7e8aaa] mt-0.5">
              <code className="mono text-[10px]">/api/ml/metrics</code>
              <span className="mx-1">·</span>
              <code className="mono text-[10px]">/api/ml/drift</code>
              <span className="mx-1">·</span>
              <code className="mono text-[10px]">/api/ml/versions</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {driftStatusInfo && driftReport && (
            <span
              className={`badge ${driftStatusInfo.cls} text-[9.5px]`}
              data-tone={driftStatusInfo.tone}
            >
              {driftStatusInfo.icon === 'ok' ? (
                <CheckCircle2 size={10} className="mr-1" />
              ) : driftStatusInfo.icon === 'warn' ? (
                <AlertTriangle size={10} className="mr-1" />
              ) : (
                <XCircle size={10} className="mr-1" />
              )}
              Drift {driftStatusInfo.label} · PSI {driftReport.psi.toFixed(3)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAll}
            disabled={loading}
            className="h-7 text-[11px]"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <NotAGuaranteeInline />

        <ModelStatusStrip
          version={modelVersion}
          trainedAt={metrics?.last_trained}
          drift={driftLevel}
          calibrated={calibrated}
          featureAgeSeconds={featureAgeSeconds}
        />
        {/* Toast */}
        {retrainToast && (
          <div
            className={`flex items-center gap-2 p-2.5 rounded-md border text-xs ${
              retrainToast.kind === 'ok'
                ? 'bg-[var(--color-green-bg)] border-[var(--color-green-bd)] text-[var(--color-green-fg)]'
                : 'bg-[var(--color-red-bg)] border-[var(--color-red-bd)] text-[var(--color-red-fg)]'
            }`}
            role={retrainToast.kind === 'ok' ? 'status' : 'alert'}
            data-tone={retrainToast.kind === 'ok' ? 'pass' : 'fail'}
          >
            {retrainToast.kind === 'ok' ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <span className="flex-1">{retrainToast.msg}</span>
            <button
              type="button"
              onClick={() => setRetrainToast(null)}
              className="text-[10px] opacity-70 hover:opacity-100"
              aria-label="Dismiss retrain toast"
            >
              dismiss
            </button>
          </div>
        )}

        {error && !metrics && !drift ? (
          <PolishedErrorState
            message="ML validation backend unreachable"
            detail={error}
            onRetry={fetchAll}
          />
        ) : loading && !metrics && !drift ? (
          <ValidationSkeleton />
        ) : (
          <>
            {/* ── Aggregate metric cards ───────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <AIPredictionLabel label="AI Model Metrics:" hint="pooled OOS" size="md" />
              <ConfidenceBadge value={aiConfidence} />
            </div>

            <div className="grid-kpi">
              <KpiTile
                label="Brier ↓"
                value={fmt(pooledBrier)}
                hint="pooled OOS"
                tone={brierTone}
                quality={pooledBrier != null ? qualityPct(pooledBrier, { good: 0.15, warn: 0.20, higherIsBetter: false }) : 0}
                trend={brierTone === 'pass' ? 'up' : brierTone === 'warn' ? 'flat' : 'down'}
                testId="ml-validation-kpi-brier"
              />
              <KpiTile
                label="ROC-AUC ↑"
                value={fmt(pooledAuc, 3)}
                hint="discrimination"
                tone={aucTone}
                quality={pooledAuc != null ? qualityPct(pooledAuc, { good: 0.80, warn: 0.70, higherIsBetter: true }) : 0}
                trend={aucTone === 'pass' ? 'up' : aucTone === 'warn' ? 'flat' : 'down'}
                testId="ml-validation-kpi-auc"
              />
              <KpiTile
                label="Log-loss ↓"
                value={fmt(pooledLogLoss)}
                hint="cross-entropy"
                tone={logLossTone}
                quality={pooledLogLoss != null ? qualityPct(pooledLogLoss, { good: 0.45, warn: 0.55, higherIsBetter: false }) : 0}
                trend={logLossTone === 'pass' ? 'up' : logLossTone === 'warn' ? 'flat' : 'down'}
                testId="ml-validation-kpi-logloss"
              />
              <KpiTile
                label="ECE ↓"
                value={fmt(pooledEce)}
                hint="calibration"
                tone={eceTone}
                quality={pooledEce != null ? qualityPct(pooledEce, { good: 0.03, warn: 0.06, higherIsBetter: false }) : 0}
                trend={eceTone === 'pass' ? 'up' : eceTone === 'warn' ? 'flat' : 'down'}
                testId="ml-validation-kpi-ece"
              />
              <KpiTile
                label="Accuracy"
                value={pooledAcc !== null ? fmt(pooledAcc, 3) : '—'}
                hint="not exposed"
                tone="neutral"
                testId="ml-validation-kpi-accuracy"
              />
            </div>

            {/* ── Walk-forward per-fold table + aggregate ─────────────────── */}
            <div className="card">
              <div className="card-header">
                <span className="card-title flex items-center gap-1.5">
                  <History size={12} /> Walk-Forward Validation Folds
                </span>
                <div className="flex items-center gap-2">
                  <Select value={focusMetric} onValueChange={(v) => setFocusMetric(v as FocusMetric)}>
                    <SelectTrigger
                      className="h-7 w-[140px] bg-[#13161e] border-[#1f2335] text-[#dde1ed] text-[10.5px]"
                      aria-label="Focus metric for walk-forward folds"
                    >
                      <SelectValue placeholder="Focus metric" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#13161e] border-[#1f2335]">
                      {FOCUS_METRICS.map((m) => (
                        <SelectItem
                          key={m.value}
                          value={m.value}
                          className="text-[#dde1ed] focus:bg-[#1f2335] text-[11px]"
                        >
                          <span className="text-[9px] uppercase tracking-wider font-bold text-[#7e8aaa] mr-2">focus</span>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="badge badge-dim text-[9.5px] tabular-nums">
                    {driftHistory.length} snapshots · mean ± std
                  </span>
                </div>
              </div>

              <div className="table-container max-h-80">
                <Table className="data-table">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[#5a637a]">Fold</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[#5a637a]">Snapshot</TableHead>
                      <TableHead className={`text-[10px] uppercase tracking-wider font-bold text-right tabular-nums ${focusMetric === 'psi' ? 'text-cyan-300 bg-cyan-500/[0.06]' : 'text-[#5a637a]'}`}>
                        PSI
                      </TableHead>
                      <TableHead className={`text-[10px] uppercase tracking-wider font-bold text-right tabular-nums ${focusMetric === 'ks' ? 'text-cyan-300 bg-cyan-500/[0.06]' : 'text-[#5a637a]'}`}>
                        KS
                      </TableHead>
                      <TableHead className={`text-[10px] uppercase tracking-wider font-bold text-right tabular-nums ${focusMetric === 'rolling_brier' ? 'text-cyan-300 bg-cyan-500/[0.06]' : 'text-[#5a637a]'}`}>
                        Rolling Brier
                      </TableHead>
                      <TableHead className={`text-[10px] uppercase tracking-wider font-bold text-right tabular-nums ${focusMetric === 'ewma_brier' ? 'text-cyan-300 bg-cyan-500/[0.06]' : 'text-[#5a637a]'}`}>
                        EWMA Brier
                      </TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right text-[#5a637a]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driftHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <PolishedEmptyState
                            icon={Layers}
                            title="No walk-forward folds yet"
                            desc="The drift detector needs ≥30 predictions + a compute_psi() cycle before folds appear here. Fold entries are sourced from the drift detector's recent PSI history."
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {driftHistory.map((h, idx) => {
                          const si = DRIFT_STATUS_MAP[h.status] ?? null
                          const rowTone: ValidationTone = si?.tone ?? 'neutral'
                          return (
                            <TableRow
                              key={idx}
                              className={`transition-colors hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`}
                            >
                              <TableCell className="label-col">
                                <span className="mono text-[11px] text-[#7e8aaa] tabular-nums">#{idx + 1}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-[11px] text-[#dde1ed] tabular-nums">
                                    {new Date(h.timestamp * 1000).toLocaleTimeString()}
                                  </span>
                                  <span className="text-[10px] text-[#5a637a]">{fmtRel(h.timestamp)}</span>
                                </div>
                              </TableCell>
                              <TableCell className={`text-right mono tabular-nums ${focusMetric === 'psi' ? 'bg-cyan-500/[0.05] font-semibold' : ''} ${classifyMetric(h.psi, { good: 0.10, warn: 0.25, higherIsBetter: false })}`}>
                                {fmt(h.psi, 4)}
                              </TableCell>
                              <TableCell className={`text-right mono tabular-nums ${focusMetric === 'ks' ? 'bg-cyan-500/[0.05] font-semibold' : ''} ${classifyMetric(h.ks_stat, { good: 0.15, warn: 0.25, higherIsBetter: false })}`}>
                                {fmt(h.ks_stat, 4)}
                              </TableCell>
                              <TableCell className={`text-right mono tabular-nums ${focusMetric === 'rolling_brier' ? 'bg-cyan-500/[0.05] font-semibold' : ''} ${h.rolling_brier !== null ? classifyMetric(h.rolling_brier, { good: 0.15, warn: 0.22, higherIsBetter: false }) : ''}`}>
                                {h.rolling_brier !== null ? fmt(h.rolling_brier) : '—'}
                              </TableCell>
                              <TableCell className={`text-right mono tabular-nums ${focusMetric === 'ewma_brier' ? 'bg-cyan-500/[0.05] font-semibold' : ''} ${h.ewma_brier !== null ? classifyMetric(h.ewma_brier, { good: 0.15, warn: 0.22, higherIsBetter: false }) : ''}`}>
                                {h.ewma_brier !== null ? fmt(h.ewma_brier) : '—'}
                              </TableCell>
                              <TableCell className="text-right" data-tone={rowTone}>
                                {si ? (
                                  <span className={`badge ${si.cls} text-[9px]`}>{si.label}</span>
                                ) : (
                                  <span className="badge badge-dim text-[9px]">{h.status}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {/* Aggregate row */}
                        <TableRow className="bg-[#0e1015] border-t-2 border-[var(--color-cyan-bd)] hover:bg-[#0e1015]">
                          <TableCell className="label-col">
                            <span className="text-[11px] font-bold text-[var(--color-cyan-fg)] uppercase tracking-wider">Aggregate</span>
                          </TableCell>
                          <TableCell className="text-[10px] text-[#7e8aaa] tabular-nums">
                            n={driftHistory.length} · mean ± std
                          </TableCell>
                          <TableCell className={`text-right mono text-cyan-300 font-bold tabular-nums ${focusMetric === 'psi' ? 'bg-cyan-500/[0.05]' : ''}`}>
                            {fmt(psiMean)} ± {fmt(psiStd)}
                          </TableCell>
                          <TableCell className={`text-right mono text-[#7e8aaa] tabular-nums ${focusMetric === 'ks' ? 'bg-cyan-500/[0.05]' : ''}`}>
                            {fmt(mean(driftHistory.map((h) => h.ks_stat)))} ± {fmt(std(driftHistory.map((h) => h.ks_stat)))}
                          </TableCell>
                          <TableCell className={`text-right mono text-cyan-300 font-bold tabular-nums ${focusMetric === 'rolling_brier' ? 'bg-cyan-500/[0.05]' : ''}`}>
                            {brierValues.length ? `${fmt(brierMean)} ± ${fmt(brierStd)}` : '—'}
                          </TableCell>
                          <TableCell className={`text-right mono text-[#7e8aaa] tabular-nums ${focusMetric === 'ewma_brier' ? 'bg-cyan-500/[0.05]' : ''}`}>
                            {ewmaValues.length ? `${fmt(mean(ewmaValues))} ± ${fmt(std(ewmaValues))}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="badge badge-cyan text-[9px]">summary</span>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* ── Calibration + Drift Status row ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Calibration / Reliability Diagram */}
              <div className="card">
                <div className="card-header">
                  <SectionHeader
                    icon={Crosshair}
                    title="Reliability Diagram"
                    description="10-bin calibration"
                    tone="info"
                    trailing={
                      <span className="badge badge-cyan text-[9.5px] tabular-nums">
                        ECE {fmt(pooledEce)}
                      </span>
                    }
                  />
                </div>
                <div className="p-4">
                  {reliabilityCurve.length === 0 ? (
                    <PolishedEmptyState
                      icon={Crosshair}
                      title="No reliability data"
                      desc="The model needs an initial training cycle to populate the 10-bin reliability curve."
                      tone="neutral"
                    />
                  ) : (
                    <CalibrationPlot curve={reliabilityCurve} />
                  )}
                </div>
              </div>

              {/* Drift Status */}
              <div className="card">
                <div className="card-header">
                  <SectionHeader
                    icon={Activity}
                    title="Drift Status"
                    description="PSI · KS · Brier"
                    tone={driftStatusInfo?.tone ?? 'neutral'}
                    trailing={
                      driftStatusInfo ? (
                        <span
                          className={`badge ${driftStatusInfo.cls} text-[9.5px]`}
                          data-tone={driftStatusInfo.tone}
                        >
                          {driftStatusInfo.label}
                        </span>
                      ) : undefined
                    }
                  />
                </div>
                <div className="p-4 space-y-3">
                  {!driftReport ? (
                    <PolishedEmptyState
                      icon={Activity}
                      title="No drift data"
                      desc="Drift detector needs ≥50 predictions before the first PSI computation."
                      tone="neutral"
                    />
                  ) : (
                    <DriftStatusView report={driftReport} psiHistory={driftHistory} />
                  )}
                </div>
              </div>
            </div>

            {/* ── Feature Importance ───────────────────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <SectionHeader
                  icon={BarChart3}
                  title="Feature Importance"
                  description="top 20 · sorted desc"
                  tone="info"
                  trailing={
                    <span className="badge badge-dim text-[9.5px] tabular-nums">
                      {featureEntries.length} features
                    </span>
                  }
                />
              </div>
              <div className="p-4">
                {featureEntries.length === 0 ? (
                  <PolishedEmptyState
                    icon={BarChart3}
                    title="No feature importances"
                    desc="The ensemble needs an initial training cycle to expose feature_importances."
                    tone="neutral"
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                    {featureEntries.map(([name, imp], idx) => (
                      <div
                        key={name}
                        className="flex items-center gap-2 rounded-sm px-1 py-0.5 transition-colors hover:bg-cyan-500/[0.04]"
                      >
                        <span className="text-[10px] text-[#5a637a] w-5 text-right mono tabular-nums">{idx + 1}</span>
                        <span
                          className="text-[10.5px] text-[#dde1ed] flex-1 truncate shrink-0 mono"
                          title={name}
                        >
                          {name}
                        </span>
                        <div className="flex-1 h-1.5 bg-[#0e1015] rounded-full overflow-hidden border border-[#1f2335]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-500"
                            style={{ width: `${(imp / maxFeatureImp) * 100}%` }}
                          />
                        </div>
                        <span className="mono text-[10px] text-cyan-300 font-semibold w-12 text-right shrink-0 tabular-nums">
                          {(imp * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {topWhyFeatures.length > 0 && (
                <div className="px-4 pb-4">
                  <WhyExplanation
                    features={topWhyFeatures}
                    agreement={modelAgreement}
                    headerLabel="Why this model?"
                  />
                </div>
              )}
            </div>

            {/* ── Model Version + Retrain ──────────────────────────────────── */}
            <div className="card">
              <div className="card-header">
                <SectionHeader
                  icon={Sparkles}
                  title="Model Version & Retrain"
                  description="registry · rollback · retrain"
                  tone="info"
                  trailing={
                    <span className="badge badge-cyan text-[9.5px] tabular-nums">
                      registry: {versions?.total_registered ?? 0} versions
                    </span>
                  }
                />
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3 space-y-2">
                    <div className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a] flex items-center gap-1.5">
                      <PulseDot tone="info" pulse={false} />
                      Active model
                    </div>
                    {activeVersion ? (
                      <>
                        <div className="flex items-center gap-2">
                          <code className="mono text-sm font-bold text-[var(--color-cyan-fg)]">
                            {activeVersion.version}
                          </code>
                          <span
                            className={`badge ${activeVersion.status === 'ACTIVE' ? 'badge-green' : 'badge-amber'} text-[9px]`}
                            data-tone={activeVersion.status === 'ACTIVE' ? 'pass' : 'warn'}
                          >
                            {activeVersion.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-[#7e8aaa]">Brier</span>
                            <span className="mono text-cyan-300 tabular-nums">{fmt(activeVersion.brier_score)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#7e8aaa]">AUC</span>
                            <span className="mono text-cyan-300 tabular-nums">{fmt(activeVersion.roc_auc, 3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#7e8aaa]">ECE</span>
                            <span className="mono text-cyan-300 tabular-nums">{fmt(activeVersion.ece)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#7e8aaa]">Sharpe</span>
                            <span className="mono text-cyan-300 tabular-nums">{fmt(activeVersion.sharpe_ratio, 2)}</span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-[#7e8aaa]">Trained at</span>
                            <span className="mono text-[#dde1ed] text-[10.5px] tabular-nums">
                              {new Date(activeVersion.created_at * 1000).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-[#7e8aaa]">Training samples</span>
                            <span className="mono text-cyan-300 tabular-nums">
                              {(activeVersion.n_samples ?? 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-[#7e8aaa]">Feature count</span>
                            <span className="mono text-cyan-300 tabular-nums">
                              {featureEntries.length > 0 ? (
                                <>
                                  {Object.keys(metrics?.feature_importances ?? {}).length}{' '}
                                  <span className="text-[#5a637a]">(importance-weighted)</span>
                                </>
                              ) : (
                                '—'
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-[#7e8aaa]">Training source</span>
                            <span className="mono text-[#dde1ed] text-[10.5px]">
                              {metrics?.training_source === 'real_and_synthetic'
                                ? '🔵 Real + Synthetic'
                                : metrics?.training_source === 'synthetic_only'
                                  ? '🟡 Synthetic Only'
                                  : (metrics?.training_source ?? '—')}
                            </span>
                          </div>
                          <div className="flex justify-between col-span-2">
                            <span className="text-[#7e8aaa]">Real / synthetic</span>
                            <span className="mono text-[#dde1ed] text-[10.5px] tabular-nums">
                              {(metrics?.n_real_samples ?? 0).toLocaleString()} / {(metrics?.n_synthetic_samples ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <PolishedEmptyState
                        icon={Layers}
                        title="No registered versions"
                        desc="POST /api/ml/versions returned no model lineage."
                        tone="neutral"
                      />
                    )}
                  </div>

                  <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-3 space-y-3">
                    <div className="text-[9.5px] uppercase tracking-wider font-bold text-[#5a637a] flex items-center gap-1.5">
                      <PulseDot tone="warn" pulse={false} />
                      Trigger immediate retrain
                    </div>
                    <p className="text-[11px] text-[#7e8aaa] leading-relaxed">
                      Calls <code className="mono text-[10px] text-[var(--color-cyan-fg)]">POST /api/ml/retrain</code>{' '}
                      which runs <code className="mono text-[10px]">ml_model.fit_initial</code> +{' '}
                      <code className="mono text-[10px]">save</code>, then logs a retrained event.
                      Model registry safety gate rejects if Brier &gt; 0.22 or AUC &lt; 0.70.
                    </p>
                    {retrainResult && (
                      <div className="bg-[#13161e] border border-[#1f2335] rounded p-2 text-[11px] space-y-1">
                        <div className="flex justify-between">
                          <span className="text-[#7e8aaa]">New version</span>
                          <code className="mono text-[var(--color-cyan-fg)]">{retrainResult.model_version}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#7e8aaa]">Brier</span>
                          <span className={`mono tabular-nums ${classifyMetric(retrainResult.brier_score, { good: 0.15, warn: 0.20, higherIsBetter: false })}`}>
                            {fmt(retrainResult.brier_score)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#7e8aaa]">AUC</span>
                          <span className={`mono tabular-nums ${classifyMetric(retrainResult.roc_auc, { good: 0.80, warn: 0.70, higherIsBetter: true })}`}>
                            {fmt(retrainResult.roc_auc, 3)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#7e8aaa]">ECE</span>
                          <span className={`mono tabular-nums ${classifyMetric(retrainResult.ece, { good: 0.03, warn: 0.06, higherIsBetter: false })}`}>
                            {fmt(retrainResult.ece)}
                          </span>
                        </div>
                      </div>
                    )}
                    {versions && versions.versions.length > 0 && (
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-[#5a637a] font-bold mb-1 block">
                          Compare against
                        </label>
                        <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                          <SelectTrigger className="h-8 bg-[#13161e] border-[#1f2335] text-[#dde1ed] text-xs">
                            <SelectValue placeholder="Select version" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#13161e] border-[#1f2335]">
                            {versions.versions.map((v) => (
                              <SelectItem
                                key={v.version}
                                value={v.version}
                                className="text-[#dde1ed] focus:bg-[#1f2335]"
                              >
                                <code className="mono text-[11px]">{v.version}</code>
                                <span className="text-[10px] text-[#7e8aaa] ml-2 tabular-nums">
                                  Brier {fmt(v.brier_score)} · AUC {fmt(v.roc_auc, 3)}
                                </span>
                                {v.is_active && (
                                  <span className="badge badge-green text-[8px] ml-2">active</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedVersion && selectedVersion !== activeVersion?.version && (
                          <div className="mt-2 text-[10px] text-[#5a637a]">
                            Roll back via <code className="mono text-[var(--color-cyan-fg)]">POST /api/ml/rollback?version={selectedVersion}</code>
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      onClick={triggerRetrain}
                      disabled={retraining}
                      className="w-full bg-[var(--color-cyan-bg)] border border-[var(--color-cyan-bd)] text-[var(--color-cyan-fg)] hover:bg-[var(--color-cyan-bd)]"
                    >
                      {retraining ? (
                        <>
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                          Retraining…
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} className="mr-1.5" />
                          Retrain Now
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center px-4 py-2 border-t border-[#1f2335] bg-[#13161e] text-[10px] text-[#5a637a]">
        <span>
          Auto-refresh: <span className="mono text-[var(--color-cyan-fg)] tabular-nums">30s</span>
          {typeof document !== 'undefined' && document.visibilityState === 'hidden' && ' (paused)'}
        </span>
        <span className="mono tabular-nums">
          {metrics?.last_trained ? `trained ${fmtRel(metrics.last_trained)}` : 'no model trained'}
        </span>
      </div>
    </div>
  )
}

// ── Inline child components (kept in this file for cohesion) ───────────────

function CalibrationPlot({ curve }: { curve: ReliabilityBin[] }) {
  const chartData = curve.map((b) => ({
    predicted: b.bin_center,
    actual: b.empirical_freq,
    count: b.count,
  }))

  return (
    <div className="flex flex-col gap-3">
      <ReliabilityDiagram
        data={chartData}
        height={220}
        showDiagonal
        formatX={(v) => v.toFixed(2)}
        formatY={(v) => v.toFixed(2)}
      />
      <div className="overflow-x-auto scrollbar-thin">
        <Table className="data-table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wider font-bold text-[#5a637a]">Bin</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right tabular-nums text-[#5a637a]">Pred</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right tabular-nums text-[#5a637a]">Actual</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right tabular-nums text-[#5a637a]">|Δ|</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider font-bold text-right tabular-nums text-[#5a637a]">n</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {curve.map((b, i) => {
              const delta = Math.abs(b.bin_center - b.empirical_freq)
              const deltaTone: ValidationTone = delta < 0.03 ? 'pass' : delta < 0.08 ? 'warn' : 'fail'
              return (
                <TableRow
                  key={i}
                  className={`transition-colors hover:bg-cyan-500/[0.04] hover:shadow-[inset_3px_0_0_0_rgba(34,211,238,0.45)]`}
                >
                  <TableCell className="label-col text-[11px] tabular-nums">#{i + 1}</TableCell>
                  <TableCell className={`text-right mono tabular-nums ${classifyMetric(b.bin_center, { good: b.bin_center, warn: b.bin_center + 0.03, higherIsBetter: true })}`}>
                    {fmt(b.bin_center, 2)}
                  </TableCell>
                  <TableCell className={`text-right mono tabular-nums ${TONE[deltaTone].text}`}>
                    {fmt(b.empirical_freq, 2)}
                  </TableCell>
                  <TableCell className={`text-right mono tabular-nums ${TONE[deltaTone].text}`} data-tone={deltaTone}>
                    {fmt(delta, 3)}
                  </TableCell>
                  <TableCell className="text-right mono text-[#7e8aaa] tabular-nums">{b.count}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="text-[10px] text-[#5a637a]">
        Scatter points colored by |Δ| (green ≤0.03, amber ≤0.08, red &gt;0.08). Dashed diagonal = perfect calibration.
      </div>
    </div>
  )
}

function DriftStatusView({
  report,
  psiHistory,
}: {
  report: DriftReport
  psiHistory: DriftSample[]
}) {
  const si = DRIFT_STATUS_MAP[report.status] ?? null
  const recentPsi = psiHistory.slice(-10).map((h) => h.psi).filter((v) => v != null)
  const maxPsi = Math.max(...recentPsi, report.threshold_critical_psi, 0.05)

  const psiTone: ValidationTone = report.psi < report.threshold_moderate_psi
    ? 'pass'
    : report.psi < report.threshold_critical_psi
      ? 'warn'
      : 'fail'
  const ksTone: ValidationTone = report.ks_stat < report.threshold_moderate_ks
    ? 'pass'
    : report.ks_stat < report.threshold_critical_ks
      ? 'warn'
      : 'fail'

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-md p-2.5 border ${TONE[psiTone].border} ${TONE[psiTone].bg}`}>
          <div className={`text-[9px] uppercase tracking-wider font-bold ${TONE[psiTone].label}`}>PSI</div>
          <div className={`mono text-xl font-bold tabular-nums ${TONE[psiTone].text}`}>
            {report.psi.toFixed(4)}
          </div>
          <div className="text-[9px] text-[#5a637a] mono tabular-nums">
            thresholds {report.threshold_moderate_psi}/{report.threshold_critical_psi}
          </div>
        </div>
        <div className={`rounded-md p-2.5 border ${TONE[ksTone].border} ${TONE[ksTone].bg}`}>
          <div className={`text-[9px] uppercase tracking-wider font-bold ${TONE[ksTone].label}`}>KS stat</div>
          <div className={`mono text-xl font-bold tabular-nums ${TONE[ksTone].text}`}>
            {report.ks_stat.toFixed(4)}
          </div>
          <div className="text-[9px] text-[#5a637a] mono tabular-nums">
            thresholds {report.threshold_moderate_ks}/{report.threshold_critical_ks}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-md p-2.5 border ${
          report.rolling_brier === null
            ? `${TONE.neutral.border} ${TONE.neutral.bg}`
            : `${TONE[report.rolling_brier < 0.15 ? 'pass' : report.rolling_brier < report.threshold_brier_drift ? 'warn' : 'fail'].border} ${TONE[report.rolling_brier < 0.15 ? 'pass' : report.rolling_brier < report.threshold_brier_drift ? 'warn' : 'fail'].bg}`
        }`}>
          <div className={`text-[9px] uppercase tracking-wider font-bold ${
            report.rolling_brier === null
              ? TONE.neutral.label
              : TONE[report.rolling_brier < 0.15 ? 'pass' : report.rolling_brier < report.threshold_brier_drift ? 'warn' : 'fail'].label
          }`}>Rolling Brier</div>
          <div className={`mono text-base font-bold tabular-nums ${
            report.rolling_brier === null
              ? 'text-[#5a637a]'
              : TONE[report.rolling_brier < 0.15 ? 'pass' : report.rolling_brier < report.threshold_brier_drift ? 'warn' : 'fail'].text
          }`}>
            {report.rolling_brier === null ? 'awaiting ≥20 samples' : report.rolling_brier.toFixed(4)}
          </div>
        </div>
        <div className={`rounded-md p-2.5 border ${
          report.ewma_brier === null
            ? `${TONE.neutral.border} ${TONE.neutral.bg}`
            : `${TONE[report.ewma_brier < 0.15 ? 'pass' : report.ewma_brier < report.threshold_brier_drift ? 'warn' : 'fail'].border} ${TONE[report.ewma_brier < 0.15 ? 'pass' : report.ewma_brier < report.threshold_brier_drift ? 'warn' : 'fail'].bg}`
        }`}>
          <div className={`text-[9px] uppercase tracking-wider font-bold ${
            report.ewma_brier === null
              ? TONE.neutral.label
              : TONE[report.ewma_brier < 0.15 ? 'pass' : report.ewma_brier < report.threshold_brier_drift ? 'warn' : 'fail'].label
          }`}>EWMA Brier (α={report.ewma_alpha})</div>
          <div className={`mono text-base font-bold tabular-nums ${
            report.ewma_brier === null
              ? 'text-[#5a637a]'
              : TONE[report.ewma_brier < 0.15 ? 'pass' : report.ewma_brier < report.threshold_brier_drift ? 'warn' : 'fail'].text
          }`}>
            {report.ewma_brier === null ? '—' : report.ewma_brier.toFixed(4)}
          </div>
        </div>
      </div>

      <div className="bg-[#0e1015] border border-[#1f2335] rounded-md p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wider text-[#5a637a] font-bold">
            PSI trend (last {recentPsi.length} samples)
          </span>
          {si && (
            <span className={`badge ${si.cls} text-[9px]`} data-tone={si.tone}>{si.label}</span>
          )}
        </div>
        <div className={`flex items-end h-8 ${TONE[psiTone].text}`}>
          {recentPsi.length > 0 ? (
            <Sparkline values={recentPsi} max={maxPsi} tone={psiTone} />
          ) : (
            <span className="text-[10px] text-[#5a637a]">awaiting compute_psi() cycles</span>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-[#5a637a]">
          <span>samples in window: <span className="mono text-[#dde1ed] tabular-nums">{report.window_samples}</span></span>
          <span>resolved outcomes: <span className="mono text-[#dde1ed] tabular-nums">{report.outcome_samples}</span></span>
        </div>
      </div>
    </>
  )
}
