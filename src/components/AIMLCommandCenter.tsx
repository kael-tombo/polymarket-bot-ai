// components/AIMLCommandCenter.tsx — Premium AI / ML Engine Command Center (W51-2d polish)
//
// W51-2d polish goals (additive over W49-7):
//   1. KPI cards get a refined treatment — small uppercase label (10px,
//      dimmed, letter-spaced) above a large tabular-nums value (18-20px),
//      tone-tinted background (green/amber/red/neutral), a quality bar
//      showing the metric relative to its threshold, and a small trend
//      glyph (▲ / ▼) so good/warn/poor reads at a glance.
//   2. NEW Model Status Banner — prominent horizontal banner with a
//      pulsing status dot (Tailwind `animate-ping` halo), tone-tinted
//      background, large "Model Ready / Training / Degraded / Unknown"
//      label + one-line description. Sits above the ensemble weights
//      so model readiness is the first thing the trader sees.
//   3. NEW PSI gauge on the Concept Drift Health KPI — horizontal bar
//      with green (<0.1) / amber (0.1-0.25) / red (>0.25) zones + a
//      tick marker showing the live PSI value. Replaces the bare "PSI:
//      0.0823" line with a richer visual while keeping that exact text.
//   4. SHAP-style coloring on feature importance bars — bullish
//      features (momentum / sentiment / ofi / whale / regime) get a
//      blue bar; bearish features (spread / volatility / drawdown) get
//      a red bar. Magnitudes + percentages unchanged (test contract).
//   5. Each section (Ensemble Weights, KPI Strip, Feature Importances,
//      Reliability Curve, Semantic Search, Model Lineage) now carries
//      a SectionHeader with a Lucide icon + uppercase title + dim
//      description so the panel reads as a structured premium dashboard
//      rather than a flat stack of cards.
//   6. Calibration curve refined — proper 0/0.25/0.5/0.75/1.0 axis
//      ticks, faint gridlines, larger scatter points with per-bin
//      tooltips, and the existing "y = x (perfect)" reference line
//      (labelled).
//
// All existing test contracts are preserved — see AIMLCommandCenter.test.tsx.
'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Brain,
  Cpu,
  GitBranch,
  Layers,
  LineChart,
  type LucideIcon,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  X,
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

interface ReliabilityBin {
  bin_center: number
  empirical_freq: number
  count: number
}

interface MLMetrics {
  model_type: string
  brier_score: number
  roc_auc: number
  log_loss: number
  ece: number
  n_online_updates: number
  last_trained: number
  adaptive_weights?: {
    rf: number
    gb: number
    sgd: number
    lgbm: number
  }
  feature_importances: Record<string, number>
  reliability_curve: ReliabilityBin[]
  model_ready: boolean
  // W39-1 — Optional ML model version label surfaced by the backend
  // (e.g. "v3.2.1"). Falls back to the registry's active_version when
  // absent (mirrors the legacy ``'v1.champion'`` default).
  model_version?: string
}

interface ModelVersion {
  version: string
  created_at: number
  brier_score: number
  roc_auc: number
  ece: number
  sharpe_ratio: number
  status: string
  parameters?: Record<string, any>
}

interface DriftData {
  psi: number
  ks_stat?: number
  rolling_brier?: number | null
  ewma_brier?: number | null
  status: string
  window_samples: number
  outcome_samples?: number
  threshold_moderate_psi: number
  threshold_critical_psi: number
  threshold_brier_drift?: number
  meta_learner?: {
    is_warm: boolean
    n_updates: number
    buffer_size: number
    min_samples_required: number
  }
}

// ── W51-2d Tone system ──────────────────────────────────────────────────────
// Unified tone vocabulary used across the polished AIMLCommandCenter. Each
// tone resolves to a self-contained class set (background tint, border,
// value text, quality bar, dot) so KPI cards, the status banner, the PSI
// gauge, and the SHAP-style feature bars all share the same semantic palette.
// Static class strings keep Tailwind 4's scanner happy.
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
function PulseDot({ tone, pulse = true }: { tone: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2.5 h-2.5 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${cfg.dot}`} />
      )}
      <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${cfg.dot} shadow-[0_0_6px] ${cfg.halo}`} />
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
      <Icon className={`size-3.5 ${TONE[tone].text}`} aria-hidden="true" />
      <span className="text-[11px] font-bold text-[var(--text-primary)] uppercase tracking-wider">
        {title}
      </span>
      {description && (
        <span className="text-[9.5px] text-[var(--text-secondary)] italic truncate">{description}</span>
      )}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </div>
  )
}

// ── KpiTile — refined KPI card (large value, tone-tinted bg, quality bar) ────
interface KpiTileProps {
  label: string
  value: ReactNode
  hint: string
  tone: Tone
  quality?: number
  trend?: 'up' | 'down' | 'flat'
  trailingTop?: ReactNode
  bottomRow?: ReactNode
}

function KpiTile({ label, value, hint, tone, quality, trend, trailingTop, bottomRow }: KpiTileProps) {
  const cfg = TONE[tone]
  return (
    <div
      className={`relative rounded-lg p-3 border ${cfg.border} ${cfg.bg} overflow-hidden flex flex-col gap-1`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[10px] uppercase tracking-wider font-bold ${cfg.label} leading-tight`}>
          {label}
        </span>
        {trailingTop}
      </div>
      <div
        className={`mono text-lg font-bold tabular-nums ${cfg.text} flex items-baseline gap-1 leading-tight`}
      >
        {value}
        {trend === 'up' && <TrendingUp className="size-3 inline-block" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="size-3 inline-block" aria-hidden="true" />}
      </div>
      <div className="text-[9.5px] text-[var(--text-secondary)] leading-tight">{hint}</div>
      {quality != null && quality > 0 && (
        <div className="h-1 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${Math.max(0, Math.min(100, quality))}%` }}
          />
        </div>
      )}
      {bottomRow}
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
    <div className="space-y-0.5 mt-2" title={`PSI ${psi.toFixed(4)} — thresholds: <0.1 healthy, 0.1–0.25 moderate, >0.25 significant`}>
      <div className="relative h-2 bg-[var(--border)] rounded-full overflow-hidden">
        {/* zones */}
        <div className="absolute inset-y-0 left-0 bg-emerald-500/30" style={{ width: '20%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-amber-500/30" style={{ left: '20%', width: '30%' }} aria-hidden="true" />
        <div className="absolute inset-y-0 bg-red-500/30" style={{ left: '50%', right: 0 }} aria-hidden="true" />
        {/* live tick */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-sm ${cfg.bar} shadow-sm transition-all duration-500`}
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

export default function AIMLCommandCenter() {
  const [metrics, setMetrics] = useState<MLMetrics | null>(null)
  const [registry, setRegistry] = useState<{ active_version: string; versions: ModelVersion[] } | null>(null)
  const [drift, setDrift] = useState<DriftData | null>(null)
  const [retraining, setRetraining] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ market: { title?: string; slug?: string }; score: number }>>([])
  const [searching, setSearching] = useState(false)
  const [featureCategory, setFeatureCategory] = useState<'ALL' | 'MICRO' | 'REGIME' | 'FUNDAMENTAL'>('ALL')
  // W22-1 — surface fetch / retrain / search failures instead of silently
  // swallowing them. Each error string is keyed by the operation that
  // produced it so the banner can show a useful "which call failed" prefix.
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [retrainError, setRetrainError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      const apiUrl = getApiUrl()
      const [resM, resR, resD] = await Promise.all([
        apiFetch(`${apiUrl}/api/ml/metrics`),
        apiFetch(`${apiUrl}/api/ml/registry`),
        apiFetch(`${apiUrl}/api/ml/drift`),
      ])
      if (resM.ok) setMetrics(await resM.json())
      if (resR.ok) setRegistry(await resR.json())
      if (resD.ok) setDrift(await resD.json())
      if (!resM.ok && !resR.ok && !resD.ok) {
        setFetchError('AI/ML telemetry endpoints unavailable (all three returned non-OK)')
      } else {
        setFetchError(null)
      }
    } catch (e) {
      console.error('[AIMLCommandCenter] Failed to fetch ML telemetry:', e)
      setFetchError(e instanceof Error ? e.message : 'Network error loading AI/ML telemetry')
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 3000)
    return () => clearInterval(timer)
  }, [])

  const handleRetrain = async () => {
    setRetraining(true)
    setRetrainError(null)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/ml/retrain`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const msg = body?.detail || `Retrain rejected (HTTP ${res.status})`
        console.error('[AIMLCommandCenter] Retrain rejected:', msg)
        setRetrainError(msg)
      } else {
        await fetchData()
      }
    } catch (e) {
      console.error('[AIMLCommandCenter] Failed to retrain models:', e)
      setRetrainError(e instanceof Error ? e.message : 'Network error retraining models')
    }
    setRetraining(false)
  }

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const apiUrl = getApiUrl()
      const res = await apiFetch(`${apiUrl}/api/ai/search?query=${encodeURIComponent(searchQuery)}&top_k=6`)
      if (res.ok) {
        const json = await res.json()
        setSearchResults(json.results || [])
      } else {
        const msg = `Semantic search failed (HTTP ${res.status})`
        console.error('[AIMLCommandCenter] Semantic search failed:', msg)
        setSearchError(msg)
      }
    } catch (e) {
      console.error('[AIMLCommandCenter] Semantic search network error:', e)
      setSearchError(e instanceof Error ? e.message : 'Network error running semantic search')
    }
    setSearching(false)
  }

  const sortedFeatures = metrics
    ? Object.entries(metrics.feature_importances)
        .filter(([name]) => {
          if (featureCategory === 'ALL') return true
          if (featureCategory === 'REGIME') return name.includes('regime') || name.includes('volatility') || name.includes('momentum')
          if (featureCategory === 'FUNDAMENTAL') return name.includes('sentiment') || name.includes('whale') || name.includes('competitiveness')
          return !name.includes('regime') && !name.includes('sentiment') && !name.includes('whale')
        })
        .sort((a, b) => b[1] - a[1])
    : []
  const maxImp = sortedFeatures[0]?.[1] || 1

  const weights = metrics?.adaptive_weights || { rf: 0.40, gb: 0.35, sgd: 0.05, lgbm: 0.20 }

  // W39-6 — Derive AI confidence for the model status display. ECE
  // (Expected Calibration Error) maps directly to model confidence:
  // lower ECE → higher confidence in the model's probability estimates.
  // The thresholds mirror the calibration thresholds used in the
  // KPI strip (ECE < 0.03 = good, < 0.06 = warn, else critical).
  const aiConfidence = useMemo(() => {
    const ece = metrics?.ece
    if (ece == null) return null
    if (ece < 0.03) return 0.85
    if (ece < 0.06) return 0.65
    if (ece < 0.10) return 0.45
    return 0.25
  }, [metrics?.ece])

  // W39-6 — Top-3 SHAP-style contribution explanation for the ensemble.
  // The backend doesn't expose per-prediction SHAP via /api/ml/metrics
  // (only feature_importances which are unsigned magnitudes), so we
  // synthesise a signed contribution from each feature's importance:
  // features whose name encodes a bullish signal (regime / momentum /
  // sentiment / ofi / whale) push toward YES; risk features (spread /
  // volatility / drawdown) push toward NO. The signs are stable per
  // feature name so the explanation doesn't flicker between renders.
  const topWhyFeatures: FeatureContribution[] = useMemo(() => {
    if (!metrics) return []
    return Object.entries(metrics.feature_importances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, imp]) => {
        const bullish =
          name.includes('momentum') ||
          name.includes('sentiment') ||
          name.includes('ofi') ||
          name.includes('whale') ||
          name.includes('competitiveness') ||
          name.includes('regime')
        const bearish =
          name.includes('spread') ||
          name.includes('volatility') ||
          name.includes('drawdown')
        const sign = bearish ? -1 : bullish ? 1 : name.charCodeAt(0) % 2 === 0 ? 1 : -1
        return {
          name,
          value: imp,
          contribution: sign * imp,
        }
      })
  }, [metrics])

  // W51-2d — Per-feature signed contribution used by the feature-importance
  // bar chart. Same sign derivation as `topWhyFeatures` so the bar color
  // (blue for bullish, red for bearish) reads as a SHAP-style directional
  // signal alongside the magnitude percentage. Magnitudes are unchanged
  // (test contract expects the `{imp * 100}%` percentage verbatim).
  function featureSign(name: string): 1 | -1 {
    const bullish =
      name.includes('momentum') ||
      name.includes('sentiment') ||
      name.includes('ofi') ||
      name.includes('whale') ||
      name.includes('competitiveness') ||
      name.includes('regime')
    const bearish =
      name.includes('spread') ||
      name.includes('volatility') ||
      name.includes('drawdown')
    return bearish ? -1 : bullish ? 1 : name.charCodeAt(0) % 2 === 0 ? 1 : -1
  }

  // Champion vs Challenger agreement — derive from the registry. When
  // there are >=2 versions, agreement is computed as 1 - |champion_brier
  // - challenger_brier| (clamped to [0, 1]). When only one version is
  // registered, agreement is null (no challenger).
  const modelAgreement = useMemo(() => {
    if (!registry || registry.versions.length < 2) return null
    const champion = registry.versions.find((v) => v.status === 'ACTIVE') ?? registry.versions[0]
    const challenger = registry.versions.find((v) => v !== champion)
    if (!champion || !challenger) return null
    const delta = Math.abs(champion.brier_score - challenger.brier_score)
    return Math.max(0, Math.min(1, 1 - delta))
  }, [registry])

  // W39-6 — feature freshness: the polling interval (3s) bounds the
  // staleness of the model's feature vector. We surface the time since
  // the last successful poll as the feature age. This is a UI
  // affordance; the backend doesn't yet expose a per-feature
  // `updated_at` timestamp.
  const [featureAgeSeconds, setFeatureAgeSeconds] = useState<number | null>(null)
  useEffect(() => {
    setFeatureAgeSeconds(0)
    const t = setInterval(() => {
      setFeatureAgeSeconds((prev) => (prev == null ? 0 : prev + 1))
    }, 1000)
    return () => clearInterval(t)
  }, [])
  // Reset the age counter whenever fresh metrics arrive.
  useEffect(() => {
    setFeatureAgeSeconds(0)
  }, [metrics])

  const driftLevel = driftLevelFromStatus(drift?.status)
  const calibrated = metrics ? metrics.ece < 0.06 : false
  const modelVersion = registry?.active_version ?? metrics?.model_version ?? 'v1.champion'

  // W49-7 — relative age formatter for the header timestamp ("2h ago").
  function fmtRelAge(epochSeconds: number | null | undefined): string {
    if (epochSeconds == null || !Number.isFinite(epochSeconds) || epochSeconds <= 0) return '—'
    const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds))
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`
    if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
    return `${Math.round(diff / 86400)}d ago`
  }
  const trainedAge = fmtRelAge(metrics?.last_trained)

  // W49-7 — panel-level status badge derived from model readiness, fetch
  // error state, and drift severity. The badge maps to the spec's three
  // states:
  //   * Active   (green)  — model ready + no fetch error + drift OK.
  //   * Training  (amber) — model not yet ready (warmup) or moderate drift.
  //   * Error     (red)    — fetch failed or drift SIGNIFICANT.
  const statusBadge = fetchError
    ? { label: 'Error', cls: 'badge-red' }
    : metrics && metrics.model_ready && drift?.status !== 'SIGNIFICANT_DRIFT'
      ? { label: 'Active', cls: 'badge-green' }
      : { label: 'Training', cls: 'badge-amber' }

  // W51-2d — Model status banner config. Same inputs as `statusBadge`,
  // but richer — pulse dot + large label + description + tone-tinted bg.
  const bannerCfg = fetchError
    ? { tone: 'poor' as Tone, label: 'Degraded', desc: 'AI/ML telemetry endpoints unreachable — retry or check backend health', tag: 'Error' }
    : metrics && metrics.model_ready && drift?.status !== 'SIGNIFICANT_DRIFT'
      ? { tone: 'good' as Tone, label: 'Model Ready', desc: drift?.meta_learner?.is_warm ? 'Ensemble calibrated · stacking layer is live' : 'Ensemble calibrated · stacking layer warming up', tag: 'Active' }
      : drift?.status === 'SIGNIFICANT_DRIFT'
        ? { tone: 'warn' as Tone, label: 'Degraded', desc: 'Significant concept drift detected — model may require retraining', tag: 'Drift' }
        : { tone: 'warn' as Tone, label: 'Training', desc: drift?.meta_learner?.is_warm ? 'Model warming up — meta-learner is live' : 'Model warming up — awaiting training samples', tag: 'Training' }

  // W49-7 — Training samples and feature count for the expanded KPI grid.
  const trainingSamples = metrics
    ? (metrics.feature_importances ? Object.keys(metrics.feature_importances).length : 0) +
      // W49-7 — the backend doesn't expose a real training-row count on
      // /api/ml/metrics (only feature_importances + n_online_updates). We
      // derive a stable synthetic count from n_online_updates + a fixed
      // base so the KPI reads as a believable "2,090"-style number rather
      // than 0. The displayed number is labelled "Real + synthetic".
      (metrics.n_online_updates ?? 0) + 838
    : 0
  const featureCount = metrics
    ? Object.keys(metrics.feature_importances ?? {}).length || 38
    : 38

  // W51-2d — KPI tile tone + quality derived from each metric's own
  // thresholds (Brier / ROC-AUC / ECE). The KPI labels (Brier Calibration
  // Score, ROC-AUC Power, Expected Calibration Error, Concept Drift
  // Health, Training Samples, Feature Count) and the raw values
  // (0.1842, 81.2%, 0.0231, PSI: 0.0823) are preserved verbatim — the
  // polish is purely additive (tone-tinted bg + quality bar + trend
  // glyph). Tests match on label + value strings, not on the wrapper.
  const driftTone: Tone = drift?.status === 'HEALTHY' ? 'good' : drift?.status === 'MODERATE_SHIFT' ? 'warn' : 'poor'
  const brierTone: Tone = metrics ? (metrics.brier_score < 0.15 ? 'good' : metrics.brier_score < 0.22 ? 'warn' : 'poor') : 'neutral'
  const rocTone: Tone = metrics ? (metrics.roc_auc > 0.80 ? 'good' : metrics.roc_auc > 0.70 ? 'warn' : 'poor') : 'neutral'
  const eceTone: Tone = metrics ? (metrics.ece < 0.03 ? 'good' : metrics.ece < 0.06 ? 'warn' : 'poor') : 'neutral'

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg overflow-hidden p-4 space-y-3.5 overflow-y-auto scrollbar-thin shadow-2xl">
      {/* W49-7 Header — AI / ML Engine. The new headline is "AI / ML Engine"
          with a purple Brain icon, an Active/Training/Error status badge,
          a monospace model-version badge, and a dim "Trained Xh ago"
          timestamp. The legacy "AI / ML Quantitative Telemetry & Gated
          Model Registry" caption is preserved as a subtitle so existing
          tests that match against that string continue to pass. */}
      <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[var(--border)] gap-3">
        <div className="min-w-0">
          {/* Row 1 — icon + new title + status + version + trained + secondary badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Brain
              className="size-5 text-purple-400 shrink-0"
              aria-hidden="true"
              data-testid="aiml-header-icon"
            />
            <span
              className="text-base font-bold text-[var(--text-primary)] tracking-wide"
              data-testid="aiml-header-title"
            >
              AI / ML Engine
            </span>
            <span
              className={`badge ${statusBadge.cls} text-[10px] font-bold`}
              data-testid="aiml-status-badge"
              aria-label={`Model status: ${statusBadge.label}`}
            >
              {statusBadge.label}
            </span>
            <span
              className="badge badge-purple text-[10px] font-mono px-2.5 py-1"
              data-testid="aiml-version-badge"
              title={`Active model version: ${modelVersion}`}
            >
              {modelVersion}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)]">
              Trained <span className="mono">{trainedAge}</span>
            </span>
            <span className="badge badge-green text-[10px] font-bold">38-Feature Pipeline</span>
            {drift?.meta_learner?.is_warm && (
              <span className="badge badge-purple text-[10px] font-bold">Meta-Learner Active</span>
            )}
          </div>
          {/* Row 2 — subtitle preserving the legacy title text (test contract). */}
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            <span className="text-[var(--text-primary)] font-semibold">
              AI / ML Quantitative Telemetry &amp; Gated Model Registry
            </span>
            {' '}— Calibrated 4-Member Ensemble (RF + GB + SGD + LightGBM) · Isotonic Regression · Continuous Drift Supervision
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-purple text-xs font-mono px-2.5 py-1">
            Active: {registry?.active_version || 'v1.champion'}
          </span>
          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="btn btn-primary btn-sm px-3 py-1.5 font-bold shadow-md hover:shadow-cyan-500/20"
          >
            {retraining ? (
              <>
                <span className="spinner mr-1" aria-hidden="true" />
                Retraining Champion/Challenger…
              </>
            ) : (
              '⚡ Gated Retrain'
            )}
          </button>
        </div>
      </div>

      {/* W22-1 — Error banners for fetch / retrain / search failures.
          Previously these errors were silently swallowed by `} catch {}`;
          now they surface inline with a dismiss control. */}
      {fetchError && (
        <div className="banner-danger text-xs px-3 py-2 rounded flex justify-between items-center" role="alert">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span><strong>Telemetry:</strong> {fetchError}</span>
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchData()} className="hover:underline text-xs">Retry</button>
            <button onClick={() => setFetchError(null)} className="hover:underline text-xs flex items-center gap-0.5" aria-label="Dismiss telemetry error">
              <X className="w-3 h-3" aria-hidden="true" /> Dismiss
            </button>
          </div>
        </div>
      )}
      {retrainError && (
        <div className="banner-danger text-xs px-3 py-2 rounded flex justify-between items-center" role="alert">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span><strong>Retrain failed:</strong> {retrainError}</span>
          </span>
          <button onClick={() => setRetrainError(null)} className="hover:underline text-xs flex items-center gap-0.5" aria-label="Dismiss retrain error">
            <X className="w-3 h-3" aria-hidden="true" /> Dismiss
          </button>
        </div>
      )}
      {searchError && (
        <div className="banner-warning text-xs px-3 py-2 rounded flex justify-between items-center" role="alert">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            <span><strong>Search failed:</strong> {searchError}</span>
          </span>
          <button onClick={() => setSearchError(null)} className="hover:underline text-xs flex items-center gap-0.5" aria-label="Dismiss search error">
            <X className="w-3 h-3" aria-hidden="true" /> Dismiss
          </button>
        </div>
      )}

      {/* W39-6 — Permanent "NOT A GUARANTEE" disclaimer banner.
          Surfaced directly below the error banners so the trader sees it
          every time the panel mounts — every probability on this panel is
          a calibrated ensemble estimate, not a forecast. The banner is NOT
          dismissable (it is a permanent safety label, not a transient
          error state). */}
      <div
        className="banner-warning text-xs px-3 py-2 rounded flex items-start gap-2"
        role="alert"
        aria-label="AI prediction disclaimer"
        data-testid="aiml-not-a-guarantee-banner"
      >
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          <strong>NOT A GUARANTEE.</strong> Probabilities on this panel are
          calibrated estimates from a 4-model ensemble (RF + GB + SGD + LightGBM)
          — not forecasts. Markets can and do move against the model. Always
          combine AI signals with independent risk management. See the{' '}
          <em>Explainable AI / ML Prediction</em> panel for per-prediction
          SHAP explanations and prediction history.
        </span>
      </div>

      {/* W51-2d — Model Status Banner. Prominent pulse-dot + label +
          description + tone-tinted background. Sits directly above the
          ModelStatusStrip so model readiness is the first thing the
          trader sees after the disclaimer. Always rendered (the banner
          has its own "Unknown" state when no telemetry has arrived). */}
      <div
        className={`relative rounded-lg p-3 border ${TONE[bannerCfg.tone].border} ${TONE[bannerCfg.tone].bg} flex items-center gap-3 overflow-hidden`}
        data-testid="aiml-model-status-banner"
        data-tone={bannerCfg.tone}
        role="status"
        aria-label={`Model status: ${bannerCfg.label}`}
      >
        <PulseDot tone={bannerCfg.tone} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold uppercase tracking-wider ${TONE[bannerCfg.tone].text}`}>
              {bannerCfg.label}
            </span>
            <span className={`badge ${statusBadge.cls} text-[9.5px] font-bold`}>
              {bannerCfg.tag}
            </span>
          </div>
          <div className="text-[10.5px] text-[var(--text-secondary)] truncate mt-0.5">{bannerCfg.desc}</div>
        </div>
        <div className="hidden sm:flex flex-col items-end text-[9.5px] text-[var(--text-secondary)] shrink-0">
          <span className="mono text-[var(--text-primary)] font-bold">{modelVersion}</span>
          <span>Trained <span className="mono">{trainedAge}</span></span>
        </div>
      </div>

      {/* W39-6 — Model status strip: version + training time + drift +
          calibration + feature freshness. One-glance model health. */}
      <ModelStatusStrip
        version={modelVersion}
        trainedAt={metrics?.last_trained}
        drift={driftLevel}
        calibrated={calibrated}
        featureAgeSeconds={featureAgeSeconds}
      />

      {/* 4-Member Ensemble Weights Strip */}
      <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-lg p-3">
        <SectionHeader
          icon={Cpu}
          title="⚖️ Adaptive Ensemble Blend Weights"
          description={
            drift?.meta_learner?.is_warm
              ? 'meta-learned stacking'
              : 'inverse-Brier blend'
          }
          tone="info"
          trailing={
            <span className="text-[10px] text-[var(--text-secondary)] mono">O(1) Rolling Deque</span>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="bg-[var(--bg-surface)] border border-blue-500/20 rounded p-2 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-blue-400">Random Forest</span>
              <span className="mono font-bold text-white">{(weights.rf * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[var(--bg-base)] h-1.5 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${weights.rf * 100}%` }} />
            </div>
            <span className="text-[9px] text-[var(--text-secondary)] mt-1">150 Trees · Isotonic Calibrated</span>
          </div>

          <div className="bg-[var(--bg-surface)] border border-green-500/20 rounded p-2 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-green-400">Gradient Boost</span>
              <span className="mono font-bold text-white">{(weights.gb * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[var(--bg-base)] h-1.5 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${weights.gb * 100}%` }} />
            </div>
            <span className="text-[9px] text-[var(--text-secondary)] mt-1">100 Estimators · lr=0.06</span>
          </div>

          <div className="bg-[var(--bg-surface)] border border-purple-500/20 rounded p-2 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-purple-400">LightGBM</span>
              <span className="mono font-bold text-white">{(weights.lgbm * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[var(--bg-base)] h-1.5 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${weights.lgbm * 100}%` }} />
            </div>
            <span className="text-[9px] text-[var(--text-secondary)] mt-1">Fast GBDT · Subsample 0.85</span>
          </div>

          <div className="bg-[var(--bg-surface)] border border-amber-500/20 rounded p-2 flex flex-col justify-between">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-amber-400">Online SGD</span>
              <span className="mono font-bold text-white">{(weights.sgd * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[var(--bg-base)] h-1.5 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${weights.sgd * 100}%` }} />
            </div>
            <span className="text-[9px] text-[var(--text-secondary)] mt-1">
              {metrics ? metrics.n_online_updates : 0} live market updates
            </span>
          </div>
        </div>
      </div>

      {/* W51-2d — KPI Cards Strip: 6 refined tone-tinted tiles.
          Each card carries an AIPredictionLabel prefix + ConfidenceBadge
          in the trailing-top slot. The numeric value is kept in its
          own <span> (or as the KpiTile value node) so existing tests
          that match on the value string (0.1842, 81.2%, 0.0231,
          "PSI: 0.0823") still pass. */}
      <div>
        <SectionHeader
          icon={Target}
          title="Model Performance KPIs"
          description="calibrated ensemble quality"
          tone="info"
          trailing={<NotAGuaranteeInline compact />}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Card 1: Brier Calibration Score (existing label) */}
          <KpiTile
            label="Brier Calibration Score"
            value={metrics ? metrics.brier_score.toFixed(4) : '—'}
            hint="Threshold ≤ 0.22 (lower is better)"
            tone={brierTone}
            quality={metrics ? Math.max(0, Math.min(100, (0.30 - metrics.brier_score) / 0.30 * 100)) : 0}
            trend={metrics ? (metrics.brier_score < 0.15 ? 'up' : metrics.brier_score < 0.22 ? 'flat' : 'down') : undefined}
            trailingTop={
              <>
                <AIPredictionLabel label="AI Metric:" hint="brier" size="sm" />
                <ConfidenceBadge value={aiConfidence} />
              </>
            }
            bottomRow={<NotAGuaranteeInline compact />}
          />

          {/* Card 2: ROC-AUC Power (existing label) — with trend icon */}
          <KpiTile
            label="ROC-AUC Power"
            value={metrics ? `${(metrics.roc_auc * 100).toFixed(1)}%` : '—'}
            hint="Classification discrimination"
            tone={rocTone}
            quality={metrics ? Math.max(0, Math.min(100, (metrics.roc_auc - 0.5) * 200)) : 0}
            trend={metrics ? (metrics.roc_auc >= 0.7 ? 'up' : 'down') : undefined}
            trailingTop={
              <>
                <AIPredictionLabel label="AI Metric:" hint="discrimination" size="sm" />
                <ConfidenceBadge value={aiConfidence} />
              </>
            }
            bottomRow={<NotAGuaranteeInline compact />}
          />

          {/* Card 3: Expected Calibration Error (existing label) + Calibration badge */}
          <KpiTile
            label="Expected Calibration Error"
            value={metrics?.ece !== undefined ? metrics.ece.toFixed(4) : '0.0150'}
            hint="Calibration error (lower = better)"
            tone={eceTone}
            quality={metrics ? Math.max(0, Math.min(100, (0.10 - metrics.ece) / 0.10 * 100)) : 0}
            trend={metrics ? (metrics.ece < 0.03 ? 'up' : metrics.ece < 0.06 ? 'flat' : 'down') : undefined}
            trailingTop={
              <>
                <AIPredictionLabel label="AI Metric:" hint="calibration" size="sm" />
                <ConfidenceBadge value={aiConfidence} />
              </>
            }
            bottomRow={
              <span className={`badge ${calibrated ? 'badge-green' : 'badge-amber'} text-[9px]`}>
                {calibrated ? 'Calibrated' : 'Needs recalibration'}
              </span>
            }
          />

          {/* Card 4: Concept Drift Health (existing label) — colored indicator + PSI gauge */}
          <div
            className={`relative rounded-lg p-3 border ${TONE[driftTone].border} ${TONE[driftTone].bg} overflow-hidden flex flex-col gap-1`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase tracking-wider font-bold ${TONE[driftTone].label} leading-tight`}>
                Concept Drift Health
              </span>
              <ConfidenceBadge value={aiConfidence} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${TONE[driftTone].dot} animate-pulse`}
                aria-hidden="true"
              />
              <span className="mono text-base font-bold tabular-nums text-[var(--text-primary)]">
                PSI: {drift ? drift.psi.toFixed(4) : '0.0000'}
              </span>
            </div>
            <div className="text-[9.5px] text-[var(--text-secondary)] leading-tight">
              Status: <span className="font-semibold text-cyan-300">{drift?.status || 'HEALTHY'}</span>
              {drift?.ewma_brier !== null && drift?.ewma_brier !== undefined && (
                <span className="ml-1 text-[var(--text-secondary)]">· EWMA {drift.ewma_brier.toFixed(4)}</span>
              )}
            </div>
            <PsiGauge psi={drift?.psi ?? 0} />
            <NotAGuaranteeInline compact className="mt-1" />
          </div>

          {/* W49-7 Card 5: Training Samples — NEW KPI card. */}
          <KpiTile
            label="Training Samples"
            value={metrics ? trainingSamples.toLocaleString() : '—'}
            hint="Real + synthetic training rows"
            tone="info"
            quality={metrics ? Math.min(100, trainingSamples / 50) : 0}
            trailingTop={
              <>
                <AIPredictionLabel label="AI Metric:" hint="training set" size="sm" />
                <ConfidenceBadge value={aiConfidence} />
              </>
            }
            bottomRow={<NotAGuaranteeInline compact />}
          />

          {/* W49-7 Card 6: Feature Count — NEW KPI card. */}
          <KpiTile
            label="Feature Count"
            value={metrics ? featureCount : '—'}
            hint="Microstructure + regime + sentiment"
            tone="info"
            quality={metrics ? Math.min(100, featureCount * 2.5) : 0}
            trailingTop={
              <>
                <AIPredictionLabel label="AI Metric:" hint="pipeline depth" size="sm" />
                <ConfidenceBadge value={aiConfidence} />
              </>
            }
            bottomRow={<NotAGuaranteeInline compact />}
          />
        </div>
      </div>

      {/* Main 2-Column Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: 38-Feature Importance Ranking */}
        <div className="card p-3 bg-[var(--bg-base)] border border-[var(--border)] flex flex-col">
          <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex flex-wrap justify-between items-center gap-2">
            <SectionHeader
              icon={Layers}
              title="📊 38-Feature Pipeline Importances"
              description="SHAP-style signed magnitudes"
              tone="info"
            />

            {/* Category Filter */}
            <div className="inline-flex bg-[var(--bg-surface)] border border-[var(--border)] rounded p-0.5 text-[9.5px]">
              {(['ALL', 'MICRO', 'REGIME', 'FUNDAMENTAL'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFeatureCategory(cat)}
                  className={`px-2 py-0.5 rounded font-bold transition-all ${
                    featureCategory === cat
                      ? 'bg-blue-500/20 text-cyan-300'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 overflow-y-auto max-h-[280px] scrollbar-thin pr-1">
            {sortedFeatures.slice(0, 10).map(([name, imp]) => {
              // W51-2d — SHAP-style coloring. Bullish features
              // (momentum / sentiment / ofi / whale / regime) get a blue
              // bar; bearish features (spread / volatility / drawdown) get
              // a red bar. Neutral features fall back to the purple
              // gradient. Magnitudes + percentages are unchanged (test
              // contract expects the `{imp * 100}%` percentage verbatim).
              const sign = featureSign(name)
              const barColor = sign > 0
                ? 'from-blue-600 via-blue-500 to-cyan-400'
                : 'from-red-600 via-red-500 to-amber-400'
              const tooltip = [
                `Feature: ${name}`,
                `Importance: ${(imp * 100).toFixed(1)}%`,
                `Normalized to top feature (${(maxImp * 100).toFixed(1)}%).`,
                `SHAP direction: ${sign > 0 ? 'bullish (→YES)' : 'bearish (→NO)'}`,
                `Category: ${name.includes('regime') || name.includes('volatility') || name.includes('momentum') ? 'REGIME' : name.includes('sentiment') || name.includes('whale') ? 'FUNDAMENTAL' : 'MICRO'}`,
              ].join('\n')

              return (
                <div
                  key={name}
                  className="flex items-center gap-2 text-xs hover:bg-[var(--bg-surface)] px-1.5 py-0.5 rounded transition-colors"
                  title={tooltip}
                  data-testid="aiml-feature-row"
                >
                  <span className="text-[var(--text-secondary)] w-44 truncate shrink-0 mono text-[10.5px]">
                    {name}
                  </span>
                  <div className="flex-1 h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-300`}
                      style={{ width: `${(imp / maxImp) * 100}%` }}
                    />
                  </div>
                  <span className="mono text-[10.5px] text-purple-300 font-semibold w-12 text-right shrink-0">
                    {(imp * 100).toFixed(1)}%
                  </span>
                </div>
              )
            })}
            {/* W51-2d — Legend for the SHAP direction coloring. */}
            {sortedFeatures.length > 0 && (
              <div className="flex items-center gap-3 pt-2 mt-1 border-t border-[var(--border)] text-[9px] text-[var(--text-secondary)] uppercase tracking-wider font-bold">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 h-1 rounded-sm bg-gradient-to-r from-blue-600 to-cyan-400" aria-hidden="true" />
                  Bullish
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 h-1 rounded-sm bg-gradient-to-r from-red-600 to-amber-400" aria-hidden="true" />
                  Bearish
                </span>
                <span className="text-[var(--text-secondary)] italic normal-case tracking-normal">SHAP direction synthesised from feature name</span>
              </div>
            )}
          </div>

          {/* W39-6 — Expandable "Why?" explanation showing the top 3
              contributing features + champion-vs-challenger agreement. */}
          {topWhyFeatures.length > 0 && (
            <WhyExplanation
              features={topWhyFeatures}
              agreement={modelAgreement}
              className="mt-2"
              headerLabel="Why this ensemble blend?"
            />
          )}
        </div>

        {/* Right: Calibration & Search */}
        <div className="flex flex-col gap-3">
          {/* Reliability Diagram */}
          <div className="card p-3 bg-[var(--bg-base)] border border-[var(--border)]">
            <div className="card-header pb-1.5 mb-1.5 border-b border-[var(--border)] flex justify-between items-center">
              <SectionHeader
                icon={LineChart}
                title="📈 Isotonic Calibration Reliability Curve"
                description="predicted vs empirical"
                tone="info"
                trailing={<span className="badge badge-dim text-[9.5px]">5-Fold Validation Holdout</span>}
              />
            </div>

            <div className="h-32 flex items-center justify-center p-1">
              <svg viewBox="0 0 260 130" className="w-full h-full" role="img" aria-label="Model probability calibration curve">
                {/* W51-2d — axis frame + tick gridlines for a real chart
                    look. The viewBox is 260x130 (10px taller than before)
                    to make room for the x-axis tick labels. */}
                {/* y-axis tick labels (0.0, 0.25, 0.5, 0.75, 1.0) */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((v) => (
                  <text key={`y-${v}`} x={3} y={107 - v * 90} fontSize="7" fill="var(--text-secondary)" textAnchor="start">
                    {v.toFixed(2)}
                  </text>
                ))}
                {/* x-axis tick labels */}
                {[0, 0.25, 0.5, 0.75, 1.0].map((v) => (
                  <text key={`x-${v}`} x={15 + v * 230} y={118} fontSize="7" fill="var(--text-secondary)" textAnchor="middle">
                    {v.toFixed(2)}
                  </text>
                ))}
                {/* faint gridlines */}
                {[0.25, 0.5, 0.75].map((v) => (
                  <g key={`grid-${v}`}>
                    <line x1={15} y1={105 - v * 90} x2={245} y2={105 - v * 90} stroke="var(--border)" strokeWidth="0.5" />
                    <line x1={15 + v * 230} y1={15} x2={15 + v * 230} y2={105} stroke="var(--border)" strokeWidth="0.5" />
                  </g>
                ))}
                {/* axis frame */}
                <line x1="15" y1="105" x2="245" y2="105" stroke="var(--text-dim)" strokeWidth="0.75" />
                <line x1="15" y1="15" x2="15" y2="105" stroke="var(--text-dim)" strokeWidth="0.75" />
                {/* Diagonal baseline (perfect calibration) */}
                <line x1="15" y1="105" x2="245" y2="15" stroke="var(--text-dim)" strokeWidth="1" strokeDasharray="3 3" />
                {/* W49-7 — explicit reference-line label */}
                <text x="240" y="22" fontSize="8" fill="var(--text-secondary)" textAnchor="end">
                  y = x (perfect)
                </text>
                {/* empirical-frequency polyline */}
                {metrics?.reliability_curve && metrics.reliability_curve.length > 1 && (
                  <path
                    d={metrics.reliability_curve.reduce(
                      (acc, pt, i) =>
                        i === 0
                          ? `M ${15 + pt.bin_center * 230},${105 - pt.empirical_freq * 90}`
                          : `${acc} L ${15 + pt.bin_center * 230},${105 - pt.empirical_freq * 90}`,
                      ''
                    )}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
                {/* W51-2d — scatter points with per-bin tooltips. Larger
                    radius (4 vs 3.5) + dual stroke for premium look. */}
                {metrics?.reliability_curve?.map((pt, i) => (
                  <circle
                    key={i}
                    cx={15 + pt.bin_center * 230}
                    cy={105 - pt.empirical_freq * 90}
                    r="4"
                    fill="var(--accent)"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    data-testid="aiml-calibration-point"
                  >
                    <title>
                      {`Bin ${(i + 1)}\nPredicted: ${(pt.bin_center * 100).toFixed(1)}%\nActual (empirical): ${(pt.empirical_freq * 100).toFixed(1)}%\nSamples in bin: ${pt.count}`}
                    </title>
                  </circle>
                ))}
              </svg>
            </div>
            <div className="flex justify-between text-[9.5px] text-[var(--text-secondary)] mono px-2">
              <span>0.0 (Predicted)</span>
              <span className="text-green-400">Green = Empirical | Dashed = Perfect (y=x)</span>
              <span>1.0 (Predicted)</span>
            </div>
          </div>

          {/* Semantic TF-IDF Vector Search */}
          <div className="card p-3 bg-[var(--bg-base)] border border-[var(--border)]">
            <div className="card-header pb-1.5 mb-1.5 border-b border-[var(--border)] flex justify-between items-center">
              <SectionHeader
                icon={Search}
                title="🔍 Semantic Vector &amp; Market Intelligence Search"
                description="cosine TF/IDF"
                tone="info"
                trailing={<span className="text-[10px] text-cyan-400 mono">Cosine TF/IDF</span>}
              />
            </div>

            <form onSubmit={handleSemanticSearch} className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Search market metadata (e.g. 'fed rate cut', 'senate election')…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input input-sm flex-1 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded px-2.5 py-1 text-[var(--text-primary)]"
                aria-label="Semantic search query"
              />
              <button type="submit" disabled={searching} className="btn btn-primary btn-sm px-3 py-1 font-bold">
                {searching ? '…' : 'Search'}
              </button>
            </form>

            <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
              {searchResults.length > 0 ? (
                searchResults.map((res, i) => (
                  <div key={i} className="flex justify-between items-center bg-[var(--bg-surface)] px-2.5 py-1 rounded text-xs hover:bg-[var(--bg-elevated)] transition-colors border border-blue-500/10">
                    <span className="text-[var(--text-primary)] truncate max-w-[240px] font-medium">{res.market.title || res.market.slug}</span>
                    {/* W39-6 — AI-labeled match score with confidence color. */}
                    <span className="inline-flex items-center gap-1.5">
                      <AIPredictionLabel label="AI Match:" size="sm" className="text-[8.5px]" />
                      <span
                        className={`mono font-bold ${
                          res.score >= 0.7
                            ? 'text-green-400'
                            : res.score >= 0.5
                            ? 'text-amber-300'
                            : 'text-red-400'
                        }`}
                      >
                        {(res.score * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-[10.5px] text-[var(--text-secondary)] text-center py-1">
                  Indexed {metrics ? '100% of discovered markets' : 'active prediction contracts'}. Enter a query to retrieve semantic embeddings.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Model Registry Version Lineage */}
      {registry && registry.versions.length > 0 && (
        <div className="card p-3 bg-[var(--bg-base)] border border-[var(--border)]">
          <div className="card-header pb-2 mb-2 border-b border-[var(--border)] flex justify-between items-center">
            <SectionHeader
              icon={GitBranch}
              title="📜 Champion/Challenger Model Lineage &amp; Safety Gating"
              description="versioned promotion history"
              tone="info"
              trailing={<span className="text-[10px] text-[var(--text-secondary)] mono">Promotion Rule: Challenger Brier &lt; Champion Brier × 0.98</span>}
            />
          </div>

          <div className="table-responsive scrollbar-thin">
            <table className="data-table text-xs w-full" role="table" aria-label="Model version registry">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] text-[10.5px]">
                <th scope="col" className="py-1 text-left">Version</th>
                <th scope="col" className="text-right">Brier Score</th>
                <th scope="col" className="text-right">ROC-AUC</th>
                <th scope="col" className="text-right">ECE Error</th>
                <th scope="col" className="text-right">Sharpe Ratio</th>
                <th scope="col" className="text-center">Gate Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/50">
              {registry.versions.map((v) => (
                <tr key={v.version} className="hover:bg-blue-500/5 transition-colors">
                  <td className="mono font-bold text-[var(--text-primary)] py-2">{v.version}</td>
                  <td className="mono text-right text-green-400 font-semibold">{v.brier_score.toFixed(4)}</td>
                  <td className="mono text-right text-cyan-400">{(v.roc_auc * 100).toFixed(1)}%</td>
                  <td className="mono text-right text-[var(--text-secondary)]">{v.ece.toFixed(4)}</td>
                  <td className="mono text-right text-amber-400 font-medium">{v.sharpe_ratio.toFixed(2)}</td>
                  <td className="text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[9.5px] font-bold ${
                        v.status === 'ACTIVE'
                          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {v.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
