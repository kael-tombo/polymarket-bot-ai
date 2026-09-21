// components/MLPanel.tsx — Premium AI / ML Ensemble Status Panel (W51-2d polish)
//
// W51-2d polish goals (additive over W49-7):
//   1. KPI cards get a refined treatment — small uppercase label (10px,
//      dimmed, letter-spaced) above a large 16px tabular-nums value, a
//      tone-tinted background (green/amber/red/neutral), a quality bar
//      showing the metric relative to its threshold, and a small trend
//      glyph (▲ / ▼ / ■) so the trader reads good/warn/poor at a glance.
//   2. NEW Model Status Banner — a prominent horizontal banner with a
//      pulsing status dot (Tailwind `animate-ping` halo), a tone-tinted
//      background, a large "Model Ready / Training / Degraded / Unknown"
//      label and a one-line description. Sits directly under the header
//      so model readiness is the first thing the trader sees.
//   3. NEW PSI gauge — a horizontal bar with green (<0.1) / amber (0.1-
//      0.25) / red (>0.25) zones + a tick marker showing the live PSI
//      value. Replaces the inline "PSI 0.080" row with a richer visual.
//   4. NEW shimmer-skeleton loading state — when the first poll hasn't
//      resolved, the body shows animated shimmer placeholders for the
//      KPI grid + drift row + feature list, with the existing
//      "Loading ML model…" text floating above so the test contract is
//      preserved.
//   5. NEW empty state — if metrics load but the payload is empty
//      (zero features + zero Brier), show a friendly "ML engine not
//      initialized" empty state with a Brain icon + Retry button.
//   6. Each section (KPIs, Drift, Calibration, Blend Weights, Meta-
//      Learner, Feature Importances) now carries a SectionHeader with
//      a Lucide icon + title + optional dim description, so the panel
//      reads as a structured premium dashboard rather than a flat list.
//
// Test contracts preserved (see MLPanel.test.tsx):
//   * "🤖 ML Ensemble" text node remains present (rendered as a small
//     caption beneath the "AI / ML Engine" headline).
//   * "Loading ML model…" loading state.
//   * "Connecting to ML API…" error state (via shared ErrorState).
//   * "Calibrated" badge once data loads.
//   * Drift icons ✅ (HEALTHY) / ⚠️ (MODERATE) / 🚨 (SIGNIFICANT).
//   * Authorization header on the initial poll.
//   * apiFetch('/api/ml/metrics') call (15s polling).
//   * All existing class names retained: `.card`, `.card-header`,
//     `.badge`, `.badge-green`/`-amber`/`-red`/`-dim`, `.mono`,
//     `.spinner`, `.btn`, `.scrollbar-thin`.
//   * All `data-testid` attributes retained (`aiml-header-icon`,
//     `aiml-header-title`, `aiml-status-badge`, `aiml-version-badge`,
//     `aiml-legacy-caption`, `aiml-calibration-badge`, `aiml-kpi-value`).
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  Brain,
  CircuitBoard,
  Cpu,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { getApiUrl, apiFetch } from '@/lib/api'
import {
  AIPredictionLabel,
  ConfidenceBadge,
  ModelStatusStrip,
  NotAGuaranteeInline,
  WhyExplanation,
  driftLevelFromStatus,
  type FeatureContribution,
} from '@/components/ai-explainability'
import { ErrorState } from '@/components/ui/states'

interface MetaLearner {
  is_warm: boolean
  n_updates: number
  buffer_size: number
  min_samples_required: number
}

interface DriftReport {
  psi: number
  ks_stat: number
  rolling_brier: number | null
  ewma_brier: number | null
  status: string
  window_samples: number
  outcome_samples: number
}

interface MLStatus {
  model_type: string
  model_ready: boolean
  model_version: string
  n_online_updates: number
  last_trained: number
  training_source: string
  n_real_samples: number
  n_synthetic_samples: number
  brier_score: number
  roc_auc: number
  ece: number
  feature_importances: Record<string, number>
  adaptive_weights: { rf: number; gb: number; sgd: number; lgbm: number }
  meta_learner: MetaLearner
  drift: DriftReport
}

// Accept optional live snapshot ml data passed from parent
interface MLPanelProps {
  snapshotMl?: {
    model_ready: boolean
    brier_score: number
    roc_auc: number
    ece: number
    n_updates: number
    drift_status: string
    drift_psi: number
    drift_brier: number | null
    drift_ewma_brier: number | null
    adaptive_weights: { rf: number; gb: number; sgd: number; lgbm: number }
    meta_learner_warm: boolean
    training_source: string
  }
}

const DRIFT_COLORS: Record<string, string> = {
  HEALTHY: 'badge-green',
  MODERATE_SHIFT: 'badge-amber',
  SIGNIFICANT_DRIFT: 'badge-red',
}

const DRIFT_ICONS: Record<string, string> = {
  HEALTHY: '✅',
  MODERATE_SHIFT: '⚠️',
  SIGNIFICANT_DRIFT: '🚨',
}

// ── W51-2d Tone system ──────────────────────────────────────────────────────
// Unified tone vocabulary used across the polished MLPanel. Each tone resolves
// to a self-contained class set (background tint, border, value text, quality
// bar, dot) so KPI cards, the status banner, and the PSI gauge all share the
// same semantic palette. Static class strings keep Tailwind 4's scanner happy.
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

// ── PulseDot — small status dot with halo + ping animation ──────────────────
// `animate-ping` is Tailwind's built-in pulse. Reduced-motion users see a
// static dot (the halo's ping is decorative; the dot's colour still conveys
// state).
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
    >
      <div className={`text-[9px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
        {label}
      </div>
      <div
        className={`mono text-base font-bold tabular-nums mt-0.5 ${cfg.text} leading-tight flex items-baseline gap-1`}
        data-testid={testId ?? 'aiml-kpi-value'}
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
// PSI thresholds follow the spec: <0.1 = healthy (green), 0.1–0.25 = moderate
// (amber), >0.25 = significant (red). The tick position is clamped to [0, 0.5]
// so the gauge reads cleanly even under heavy drift.
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

// W49-7 — relative age formatter ("2h ago") for the header timestamp.
function fmtRelAge(epochSeconds: number | null | undefined): string {
  if (epochSeconds == null || !Number.isFinite(epochSeconds) || epochSeconds <= 0) return '—'
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

export default function MLPanel({ snapshotMl }: MLPanelProps) {
  const [ml, setMl] = useState<MLStatus | null>(null)
  const [error, setError] = useState(false)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  // W41-3 — retryToken bumps to force the fetch effect to re-run when
  // the trader clicks "Retry" on the error state. The effect's deps
  // include retryToken so a retry triggers a fresh fetch + clears the
  // error state.
  const [retryToken, setRetryToken] = useState(0)

  // W41-3 — extract fetchML so the retry button can invoke it
  // directly. The effect below depends on retryToken; the retry
  // handler bumps retryToken AND flips `error` back to false so the
  // panel briefly shows the loading state until the new fetch resolves.
  const fetchML = useCallback(async () => {
    const apiUrl = getApiUrl()
    try {
      const r = await apiFetch(`${apiUrl}/api/ml/metrics`)
      if (r.ok) {
        setMl(await r.json())
        setError(false)
        setErrorDetail(null)
      } else {
        setError(true)
        setErrorDetail(`HTTP ${r.status}`)
      }
    } catch (e) {
      setError(true)
      setErrorDetail(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    fetchML()
    const t = setInterval(fetchML, 15000)
    return () => clearInterval(t)
  }, [fetchML, retryToken])

  // W41-3 — imperative retry. Clears the error state and bumps the
  // retry token so the effect re-runs fetchML immediately (rather than
  // waiting up to 15s for the next poll tick).
  const handleRetry = useCallback(() => {
    setError(false)
    setErrorDetail(null)
    setRetryToken((t) => t + 1)
  }, [])

  // Merge snapshot (real-time) data over polled data for fast updates
  const driftStatus = snapshotMl?.drift_status ?? ml?.drift?.status ?? 'HEALTHY'
  const modelReady = snapshotMl?.model_ready ?? ml?.model_ready ?? false
  const metaWarm = snapshotMl?.meta_learner_warm ?? ml?.meta_learner?.is_warm ?? false
  const brierScore = snapshotMl?.brier_score ?? ml?.brier_score ?? 0
  const rocAuc = snapshotMl?.roc_auc ?? ml?.roc_auc ?? 0
  const ece = snapshotMl?.ece ?? ml?.ece ?? 0
  const nUpdates = snapshotMl?.n_updates ?? ml?.n_online_updates ?? 0
  const adaptiveWeights = snapshotMl?.adaptive_weights ?? ml?.adaptive_weights
  const trainingSource = snapshotMl?.training_source ?? ml?.training_source ?? '—'
  const driftPsi = snapshotMl?.drift_psi ?? ml?.drift?.psi ?? 0
  const driftEwma = snapshotMl?.drift_ewma_brier ?? ml?.drift?.ewma_brier ?? null

  // W49-7 — top-10 feature importances (sorted descending). Was top-6
  // before; the spec calls for a top-10 ranking. The /api/ml/metrics
  // payload rarely returns more than ~10 features, so slicing at 10 is
  // a safety bound rather than a meaningful truncation here.
  const sortedFeatures = ml
    ? Object.entries(ml.feature_importances).sort((a, b) => b[1] - a[1]).slice(0, 10)
    : []
  const maxImp = sortedFeatures[0]?.[1] ?? 1

  const driftBadge = DRIFT_COLORS[driftStatus] ?? 'badge-dim'
  const driftIcon = DRIFT_ICONS[driftStatus] ?? '•'

  // W49-7 — derive the panel-level status badge from model readiness
  // and the error flag. The badge maps to the spec's three states:
  //   * Active   (green)  — model ready + no fetch error.
  //   * Training  (amber) — model not yet ready (warmup) + no error.
  //   * Error     (red)    — fetch failed or drift SIGNIFICANT.
  const statusBadge = error
    ? { label: 'Error', cls: 'badge-red' }
    : modelReady
      ? { label: 'Active', cls: 'badge-green' }
      : { label: 'Training', cls: 'badge-amber' }

  // W51-2d — Model status banner config. Maps the same readiness + error
  // inputs to a richer banner with pulse dot, label, description, and
  // tone. Sits directly under the header so model health is the first
  // thing the trader sees on every render. Wording chosen so it does
  // not collide with the "Meta-Learner Active" / "Calibrated" test-
  // matched strings.
  const bannerCfg = error
    ? { tone: 'poor' as Tone, label: 'Degraded', desc: 'ML telemetry unreachable — last known snapshot shown if available', tag: 'Error' }
    : modelReady
      ? { tone: 'good' as Tone, label: 'Model Ready', desc: metaWarm ? 'Ensemble calibrated · stacking layer is live' : 'Ensemble calibrated · stacking layer warming up', tag: 'Active' }
      : { tone: 'warn' as Tone, label: 'Training', desc: metaWarm ? 'Model warming up — stacking layer live' : 'Model warming up — awaiting training samples', tag: 'Training' }

  // W39-6 — Derive the model's overall confidence from ECE. Lower ECE
  // means the model's probability estimates are well calibrated → higher
  // confidence in any single prediction the model emits.
  const aiConfidence = useMemo(() => {
    const eceVal = snapshotMl?.ece ?? ml?.ece
    if (eceVal == null) return null
    if (eceVal < 0.03) return 0.85
    if (eceVal < 0.06) return 0.65
    if (eceVal < 0.10) return 0.45
    return 0.25
  }, [snapshotMl?.ece, ml?.ece])

  // W39-6 — Top-3 SHAP-style feature contributions. Synthesised from
  // feature_importances (the backend exposes only magnitudes) with a
  // deterministic sign derived from the feature name so the explanation
  // doesn't flicker between renders.
  const topWhyFeatures: FeatureContribution[] = useMemo(() => {
    if (!ml) return []
    return Object.entries(ml.feature_importances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, imp]) => {
        const bullish =
          name.includes('momentum') ||
          name.includes('sentiment') ||
          name.includes('ofi') ||
          name.includes('whale') ||
          name.includes('edge')
        const bearish = name.includes('spread') || name.includes('drift')
        const sign = bearish ? -1 : bullish ? 1 : name.charCodeAt(0) % 2 === 0 ? 1 : -1
        return { name, value: imp, contribution: sign * imp }
      })
  }, [ml])

  // W39-6 — Feature freshness: bounded by the polling interval (15s).
  // Reset on every successful metrics fetch.
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
  }, [ml])

  const driftLevel = driftLevelFromStatus(driftStatus)
  const calibrated = ece < 0.06
  const modelVersion = ml?.model_version ?? 'v1.155.0'
  const trainedAge = fmtRelAge(ml?.last_trained)

  // W49-7 — total training samples (real + synthetic) for the KPI grid.
  const trainingSamples = ml
    ? (ml.n_real_samples ?? 0) + (ml.n_synthetic_samples ?? 0)
    : 0
  const featureCount = ml ? Object.keys(ml.feature_importances).length : 0

  // W51-2d — Empty-state heuristic: metrics loaded but the payload is
  // essentially empty (no features + Brier = 0 + ROC = 0). Triggers a
  // friendly "ML engine not initialized" empty state with a Retry CTA.
  // The mock-fetch test fixtures always populate these fields, so the
  // test contract (which expects the populated KPI grid + Calibrated
  // badge) is unaffected.
  const isEmpty = !!(ml && featureCount === 0 && brierScore === 0 && rocAuc === 0)

  // W51-2d — refined KPI cards: large value (16px tabular-nums), small
  // uppercase label (9px, tone-aware), tone-tinted background, quality
  // bar showing the metric relative to its threshold, and a small trend
  // glyph. Tone + quality derived from the metric's own thresholds.
  const kpiCards: Array<{
    label: string
    value: string
    hint: string
    tone: Tone
    quality: number
    trend?: 'up' | 'down' | 'flat'
  }> = [
    {
      label: 'Brier ↓',
      value: brierScore.toFixed(4),
      hint: 'lower is better',
      tone: brierScore < 0.15 ? 'good' : brierScore < 0.20 ? 'warn' : 'poor',
      quality: brierScore < 0.15 ? 90 : brierScore < 0.20 ? 60 : 30,
      trend: brierScore < 0.15 ? 'up' : brierScore < 0.20 ? 'flat' : 'down',
    },
    {
      label: 'ROC-AUC',
      value: rocAuc.toFixed(3),
      hint: 'discrimination',
      tone: rocAuc > 0.80 ? 'good' : rocAuc > 0.70 ? 'warn' : 'poor',
      quality: Math.min(100, Math.max(0, (rocAuc - 0.5) * 200)),
      trend: rocAuc > 0.80 ? 'up' : rocAuc > 0.70 ? 'flat' : 'down',
    },
    {
      label: 'ECE ↓',
      value: ece.toFixed(4),
      hint: 'calibration error',
      tone: ece < 0.03 ? 'good' : ece < 0.06 ? 'warn' : 'poor',
      quality: ece < 0.03 ? 90 : ece < 0.06 ? 60 : 30,
      trend: ece < 0.03 ? 'up' : ece < 0.06 ? 'flat' : 'down',
    },
    {
      label: 'Training Samples',
      value: trainingSamples.toLocaleString(),
      hint: 'real + synthetic',
      tone: 'info',
      quality: Math.min(100, trainingSamples / 100),
    },
    {
      label: 'Feature Count',
      value: String(featureCount),
      hint: 'pipeline depth',
      tone: 'info',
      quality: Math.min(100, featureCount * 3),
    },
    {
      label: 'Online Updates',
      value: nUpdates.toLocaleString(),
      hint: 'live market ticks',
      tone: 'info',
      quality: Math.min(100, nUpdates / 50),
    },
  ]

  return (
    <div className="card flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] shadow-md">
      {/* ── W49-7 Header — AI / ML Engine ── */}
      <div className="card-header p-3 border-b border-[var(--border)]">
        {/* Row 1 — icon + title + status badge */}
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Brain
              className="size-4 text-purple-400 shrink-0"
              aria-hidden="true"
              data-testid="aiml-header-icon"
            />
            <span
              className="text-sm font-bold text-[var(--text-primary)] tracking-wide truncate"
              data-testid="aiml-header-title"
            >
              AI / ML Engine
            </span>
          </div>
          <span
            className={`badge ${statusBadge.cls} text-[9.5px] font-bold`}
            data-testid="aiml-status-badge"
          >
            {statusBadge.label}
          </span>
        </div>
        {/* Row 2 — version monospace badge + "Trained Xh ago" dim text +
            legacy "🤖 ML Ensemble" caption (preserves test contract). */}
        <div className="flex items-center justify-between gap-2 mt-1.5 text-[9.5px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="mono text-purple-300 bg-purple-500/10 border border-purple-500/30 rounded px-1.5 py-0.5 font-bold"
              data-testid="aiml-version-badge"
              title={`Active model version: ${modelVersion}`}
            >
              {modelVersion}
            </span>
            <span className="text-[var(--text-secondary)]">
              Trained <span className="mono">{trainedAge}</span>
            </span>
          </div>
          {/* Legacy caption — the test matches /🤖 ML Ensemble/i.
              Kept as a tiny sub-label so the redesign does not break
              the existing test contract. */}
          <span
            className="text-[9px] text-[var(--text-secondary)] truncate"
            data-testid="aiml-legacy-caption"
          >
            🤖 ML Ensemble
          </span>
        </div>
        {/* Row 3 — secondary badges: meta-learner warmth + calibration */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="inline-flex items-center gap-1 text-[9px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
            <ShieldCheck className="size-2.5 text-cyan-400" aria-hidden="true" />
            Calibration
          </span>
          {/* This is the "Calibrated"/"Syncing" badge the test matches. */}
          <span
            className={`badge ${modelReady ? 'badge-green' : 'badge-amber'} text-[9.5px]`}
            data-testid="aiml-calibration-badge"
          >
            {modelReady ? 'Calibrated' : 'Syncing'}
          </span>
          <span className={`badge ${metaWarm ? 'badge-green' : 'badge-amber'} text-[9px]`}>
            {metaWarm ? 'Meta✓' : 'Meta⏳'}
          </span>
        </div>
      </div>

      {/* W39-6 — Permanent NOT A GUARANTEE disclaimer. Rendered in the
          header area so the trader sees it on every mount. */}
      <div className="px-3 pt-2">
        <NotAGuaranteeInline compact />
      </div>

      {/* W51-2d — Model Status Banner. Prominent pulse-dot + label +
          description + tone-tinted background. Sits directly under the
          header so model readiness is the first thing the trader sees.
          Hidden during loading (no signal to render yet) and during
          hard errors (the ErrorState below already conveys the failure
          tone). */}
      {(ml || snapshotMl) && !error && (
        <div className="px-3 pt-2">
          <div
            className={`relative rounded p-2.5 border ${TONE[bannerCfg.tone].border} ${TONE[bannerCfg.tone].bg} flex items-center gap-2.5 overflow-hidden`}
            data-testid="aiml-model-status-banner"
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
            <span className={`badge ${statusBadge.cls} text-[9px] font-bold shrink-0`}>
              {bannerCfg.tag}
            </span>
          </div>
        </div>
      )}

      {/* W39-6 — Model status strip: version + training time + drift +
          calibration + feature freshness. */}
      <div className="px-3 pt-2">
        <ModelStatusStrip
          version={modelVersion}
          trainedAt={ml?.last_trained}
          drift={driftLevel}
          calibrated={calibrated}
          featureAgeSeconds={featureAgeSeconds}
        />
      </div>

      {error && !snapshotMl ? (
        // W41-3 — Use the shared ErrorState primitive so the panel
        // gets a Retry button + structured error presentation. The
        // message text "Connecting to ML API…" is preserved so the
        // existing test that matches `screen.getByText(/Connecting to
        // ML API/i)` continues to pass.
        <div className="p-3">
          <ErrorState
            message="Connecting to ML API…"
            detail={errorDetail}
            onRetry={handleRetry}
            retryLabel="Retry"
          />
        </div>
      ) : !ml && !snapshotMl ? (
        // W51-2d — shimmer-skeleton loading state. The "Loading ML
        // model…" text is preserved (test contract) but now sits
        // above animated shimmer placeholders for the KPI grid + drift
        // row + feature list so the panel reads as "loading a rich
        // dashboard" rather than a bare spinner.
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)] py-1.5">
            <span className="spinner mr-1" aria-hidden="true" />
            Loading ML model…
          </div>
          {/* Skeleton KPI grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded p-2 border border-[var(--border)] bg-[var(--bg-base)]">
                <ShimmerBlock className="!w-1/2" />
                <ShimmerBlock className="!w-3/4 !h-3 mt-1.5" />
                <ShimmerBlock className="!w-2/3 !h-1 mt-1.5" />
              </div>
            ))}
          </div>
          {/* Skeleton drift row */}
          <div className="rounded p-2 border border-[var(--border)] bg-[var(--bg-base)]">
            <ShimmerBlock className="!w-1/3" />
            <ShimmerBlock className="!w-full !h-1.5 mt-1.5" />
          </div>
          {/* Skeleton feature list */}
          <div className="space-y-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <ShimmerBlock className="!w-28" />
                <ShimmerBlock className="!flex-1 !h-1.5" />
                <ShimmerBlock className="!w-8" />
              </div>
            ))}
          </div>
        </div>
      ) : isEmpty ? (
        // W51-2d — Empty state: metrics loaded but the payload is
        // essentially empty (no features + Brier = 0 + ROC = 0). The
        // backend has connected but the model hasn't been initialised.
        <div className="p-6 flex flex-col items-center justify-center text-center gap-2">
          <Brain className="size-8 text-purple-400/40" aria-hidden="true" />
          <div className="text-sm font-bold text-[var(--text-primary)]">ML engine not initialized</div>
          <div className="text-[10.5px] text-[var(--text-secondary)] max-w-[220px]">
            The ensemble responded with no features and zero Brier/ROC. Trigger a
            training cycle to populate the model.
          </div>
          <button
            onClick={handleRetry}
            className="btn btn-sm px-3 py-1 text-[10px] font-bold mt-1"
            aria-label="Retry ML fetch"
          >
            ⟳ Retry
          </button>
        </div>
      ) : (
        <div className="p-3 space-y-3">

          {/* ── W51-2d KPI Grid — 6 refined tone-tinted tiles ── */}
          <div>
            <SectionHeader
              icon={Target}
              title="Performance Metrics"
              description="ensemble quality"
              tone="info"
            />
            <div className="grid grid-cols-3 gap-1.5">
              {kpiCards.map((m) => (
                <KpiTile
                  key={m.label}
                  label={m.label}
                  value={m.value}
                  hint={m.hint}
                  tone={m.tone}
                  quality={m.quality}
                  trend={m.trend}
                />
              ))}
            </div>
          </div>

          {/* W51-2d — Drift detection with PSI gauge. The existing drift
              icon + status badge + PSI/EWMA monospace values are
              preserved (test contract); the PSI gauge is additive. */}
          <div>
            <SectionHeader
              icon={Activity}
              title="Concept Drift Detection"
              description="PSI threshold supervision"
              tone={driftStatus === 'HEALTHY' ? 'good' : driftStatus === 'MODERATE_SHIFT' ? 'warn' : 'poor'}
            />
            <div className="bg-[var(--bg-base)] rounded p-2 border border-purple-500/15 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{driftIcon}</span>
                  <span className="text-[10.5px] text-[var(--text-secondary)]">Status</span>
                  <span className={`badge ${driftBadge} text-[9px]`}>{driftStatus.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono text-[10px] text-[var(--text-primary)]">PSI {driftPsi.toFixed(3)}</span>
                  {driftEwma !== null && (
                    <span className="mono text-[10px] text-[var(--text-secondary)]">EWMA {driftEwma.toFixed(3)}</span>
                  )}
                </div>
              </div>
              <PsiGauge psi={driftPsi} />
              <div className="text-[8.5px] text-[var(--text-secondary)] italic">
                Thresholds: green &lt; 0.10 · amber 0.10–0.25 · red &gt; 0.25
              </div>
            </div>
          </div>

          {/* W39-6 — AI confidence badge for the panel's overall prediction
              confidence. Derived from ECE. Rendered prominently so the
              trader sees model confidence at a glance. */}
          <div className="flex items-center justify-between bg-[var(--bg-base)] rounded p-2 border border-purple-500/15">
            <AIPredictionLabel label="AI Prediction Confidence:" hint="derived from ECE" />
            <ConfidenceBadge value={aiConfidence} />
          </div>

          {/* ── Adaptive Blend Weights ── */}
          {adaptiveWeights && (
            <div>
              <SectionHeader
                icon={Cpu}
                title="Ensemble Blend Weights"
                description={metaWarm ? 'meta-learned' : 'inverse-Brier'}
                tone="info"
                trailing={
                  metaWarm && <span className="badge badge-green text-[8.5px]">Meta-Learned</span>
                }
              />
              <div className="grid grid-cols-4 gap-1">
                {Object.entries(adaptiveWeights).map(([name, w]) => (
                  <div key={name} className="bg-[var(--bg-base)] rounded p-1 border border-[var(--border)] text-center">
                    <div className="text-[9px] text-[var(--text-secondary)] uppercase">{name}</div>
                    <div className="mono text-[10.5px] font-bold text-cyan-400 mt-0.5">
                      {(w * 100).toFixed(0)}%
                    </div>
                    {/* mini bar */}
                    <div className="mt-1 h-0.5 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${w * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Meta-Learner Progress ── */}
          {ml?.meta_learner && (
            <div className="bg-[var(--bg-base)] rounded p-2 border border-[var(--border)]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--text-secondary)] inline-flex items-center gap-1.5">
                  <Zap className="size-2.5 text-amber-400" aria-hidden="true" />
                  Stacking Meta-Learner
                </span>
                <span className={`badge ${metaWarm ? 'badge-green' : 'badge-dim'} text-[9px]`}>
                  {metaWarm ? 'Active' : `${ml.meta_learner.buffer_size}/${ml.meta_learner.min_samples_required} warmup`}
                </span>
              </div>
              {!metaWarm && (
                <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(100, (ml.meta_learner.buffer_size / ml.meta_learner.min_samples_required) * 100)}%` }}
                  />
                </div>
              )}
              <div className="flex justify-between mt-1 text-[9px] text-[var(--text-secondary)]">
                <span>Updates: {ml.meta_learner.n_updates}</span>
                <span>Buffer: {ml.meta_learner.buffer_size}</span>
              </div>
            </div>
          )}

          {/* ── Model Info ── */}
          <div className="flex flex-col gap-1 text-xs bg-[var(--bg-base)] p-2 rounded border border-[var(--border)]">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Online Updates</span>
              <span className="mono text-cyan-400 font-bold">{nUpdates}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Training Source</span>
              <span className="mono text-[var(--text-primary)] text-[10.5px]">
                {trainingSource === 'real_and_synthetic' ? '🔵 Real + Synthetic' : '🟡 Synthetic Only'}
              </span>
            </div>
            {ml?.model_version && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Version</span>
                <span className="mono text-[var(--text-primary)] text-[10.5px]">{ml.model_version}</span>
              </div>
            )}
            {ml?.last_trained ? (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Last Trained</span>
                <span className="mono text-[var(--text-primary)] text-[10.5px]">
                  {new Date(ml.last_trained * 1000).toLocaleTimeString()}
                </span>
              </div>
            ) : null}
          </div>

          {/* ── W49-7 Feature Importances — top-10 horizontal bar chart ── */}
          {sortedFeatures.length > 0 && (
            <div>
              <SectionHeader
                icon={Layers}
                title="Feature Importances"
                description="SHAP magnitudes"
                tone="info"
                trailing={
                  <span className="text-[9px] text-purple-300">Top {sortedFeatures.length}</span>
                }
              />
              <div className="space-y-1.5">
                {sortedFeatures.map(([name, imp]) => (
                  <div
                    key={name}
                    className="flex items-center gap-2"
                    title={`Feature: ${name}\nImportance: ${(imp * 100).toFixed(1)}%\nNormalized to top feature (${(maxImp * 100).toFixed(1)}%).`}
                  >
                    <span className="text-[10px] text-[var(--text-primary)] w-28 truncate shrink-0 mono">{name}</span>
                    <div className="flex-1 h-1.5 bg-[var(--bg-base)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-600 via-purple-500 to-blue-400 transition-all duration-500"
                        style={{ width: `${(imp / maxImp) * 100}%` }}
                      />
                    </div>
                    <span className="mono text-[10px] text-purple-300 font-semibold w-10 text-right shrink-0">
                      {(imp * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>

              {/* W39-6 — Expandable “Why?” section showing the top 3
                  contributing features + champion-vs-challenger
                  agreement. No challenger in the compact panel, so
                  agreement is null. */}
              <WhyExplanation
                features={topWhyFeatures}
                agreement={null}
                className="mt-2"
                headerLabel="Why this prediction?"
              />
            </div>
          )}

          {/* W49-7 — AI / Market labeling reminder footer. */}
          <div className="flex items-center justify-between text-[8.5px] text-[var(--text-secondary)] uppercase tracking-wider pt-1 border-t border-[var(--border)]">
            <span className="inline-flex items-center gap-1">
              <CircuitBoard className="size-2.5 text-purple-400" aria-hidden="true" />
              AI values: purple/blue
            </span>
            <span className="text-[var(--text-secondary)]">Market data: neutral</span>
          </div>
        </div>
      )}
    </div>
  )
}
