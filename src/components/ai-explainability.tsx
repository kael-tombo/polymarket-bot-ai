// src/components/ai-explainability.tsx — W39-6 shared AI labeling + status
// primitives reused across the AI/ML panels (AIMLCommandCenter, MLPanel,
// MLValidationPanel, ShadowInferencePanel, PerformanceReportPanel).
//
// Goal: make every model output visibly distinct from market data so the
// trader can never confuse a calibrated ensemble estimate with a hard
// market number. The five primitives below encapsulate the W39-6 design
// contract:
//
//   1. AIPredictionLabel    — small prefix (Sparkles icon + "AI Prediction:")
//                            that visually distinguishes any model-generated
//                            number from a market-driven number. Uses the
//                            blue/purple color system so it is unmistakably
//                            AI even at a glance.
//   2. ConfidenceBadge      — visible "Confidence: 65%" pill with a
//                            traffic-light color (green >70%, amber 50-70%,
//                            red <50%). The badge is always paired with an
//                            AIPredictionLabel so a probability is never
//                            shown without its confidence.
//   3. NotAGuaranteeInline  — small "NOT A GUARANTEE" disclaimer rendered
//                            inline next to a prediction. Mirrors the
//                            permanent banner already present in
//                            AIPredictionExplainerPanel (W38-5) but in a
//                            compact one-line form factor for the compact
//                            panels.
//   4. ModelStatusStrip     — single horizontal strip showing model version,
//                            training-data timestamp ("Trained: 2h ago"),
//                            drift status (🟢/🟡/🔴), calibration status
//                            ("Calibrated" / "Needs recalibration") and
//                            feature freshness ("Features: 3s old"). One
//                            glance tells the trader the model's health.
//   5. WhyExplanation        — expandable "Why?" section that surfaces the
//                            top-3 contributing features for a prediction,
//                            each with its value + sign of contribution,
//                            plus the champion-vs-challenger model
//                            agreement percentage ("Agreement: 92%").
//
// W58-f — Visual polish pass aligned with the W50-57 design system:
//   • Shared `TONE` config (good / warn / poor / info / neutral) and
//     `PulseDot` helper pattern adopted from AIMLCommandCenter so every
//     tone-coloured element in this file reads as a single coherent
//     visual family.
//   • `SectionHeader` helper (icon + uppercase title + dim description)
//     applied to WhyExplanation's expandable sections so the feature
//     attributions and the Champion-vs-Challer strip read as structured
//     sub-panels rather than flat stacks of rows.
//   • `ShapBar` — a SHAP-style horizontal contribution bar (centered on
//     zero, extends right for positive "pushes YES" / left for negative
//     "pushes NO") rendered below each feature row in WhyExplanation.
//     Magnitude is normalized against the max |contribution| in the
//     top-3 set so the longest bar always reads as 100% of the visible
//     range.
//   • `KpiTile` pattern applied to the Champion-vs-Challenger agreement
//     metric — large value (16-18px tabular-nums), tone-coloured text,
//     small quality bar that fills based on agreement strength
//     (≥0.9 → 100% green, 0.7-0.9 → 60% amber, <0.7 → 30% red).
//   • ConfidenceBadge refined with a halo ring + tone-coloured shadow
//     so the badge "glows" in its tone at a glance, rather than reading
//     as a flat coloured rectangle.
//   • ModelStatusStrip refined — each status cell gets a tone-coloured
//     icon backdrop (small rounded square behind the icon) so the icon
//     reads as a "chip" rather than a bare glyph. The drift status cell
//     now renders a coloured dot alongside the emoji so the tone is
//     legible even if the platform's emoji rendering is monochrome.
//
// All existing test contracts are preserved — see ai-explainability.test.tsx.
//   • data-testid attributes preserved verbatim: `ai-prediction-label`,
//     `confidence-badge`, `not-a-guarantee-inline`, `model-status-strip`,
//     `status-version`, `status-trained`, `status-drift`,
//     `status-calibration`, `status-features`, `why-explanation`,
//     `why-toggle`, `why-feature-row`, `why-agreement`.
//   • data-confidence-tone attribute preserved (`high` / `medium` /
//     `low` / `unknown`).
//   • Test-matched strings preserved verbatim: "AI Prediction:" (default
//     AIPredictionLabel label), "Confidence:" (ConfidenceBadge label —
//     only rendered when showLabel=true), "65%" (pct for value=0.65 —
//     rendered as a STANDALONE span so `screen.getByText('65%')` exact-
//     match resolves), "NOT A GUARANTEE." (bordered NotAGuaranteeInline
//     headline), "Needs recalibration" (ModelStatusStrip calibrated=false
//     state), "Why?" (default WhyExplanation headerLabel), the feature
//     names rendered as STANDALONE spans, "no challenger registered"
//     (WhyExplanation null agreement state), "No feature attributions
//     available for this prediction." (WhyExplanation empty features
//     state).
//   • 'use client' directive preserved at the top of the file.
//   • Exported names preserved: `AIPredictionLabel`, `ConfidenceBadge`,
//     `confidenceTone`, `NotAGuaranteeInline`, `ModelStatusStrip`,
//     `driftLevelFromStatus`, `WhyExplanation`, plus the type exports
//     `ConfidenceTone`, `DriftLevel`, `AIPredictionLabelProps`,
//     `ConfidenceBadgeProps`, `NotAGuaranteeInlineProps`,
//     `ModelStatusStripProps`, `WhyExplanationProps`,
//     `FeatureContribution`.

'use client'

import { useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── W58-f shared tone config ────────────────────────────────────────────────
// Adopted from AIMLCommandCenter's `TONE` table so every tone-coloured
// element in this file (ConfidenceBadge, ModelStatusStrip cells,
// WhyExplanation agreement KpiTile) reads as a single coherent family
// with the rest of the W50-57 design system.

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
  info:    { bg: 'bg-purple-500/[0.06]',  border: 'border-purple-500/25',  text: 'text-purple-400', bar: 'bg-purple-500',  dot: 'bg-purple-400',  label: 'text-purple-400/80',  halo: 'shadow-purple-500/10' },
  neutral: { bg: 'bg-[#0e1015]',          border: 'border-[#1f2335]',      text: 'text-[#dde1ed]',   bar: 'bg-[#5a637a]',   dot: 'bg-[#5a637a]',   label: 'text-[#7e8aaa]',      halo: '' },
}

// ── W58-f PulseDot — small status dot with halo + ping animation ────────────
function PulseDot({ tone, pulse = true }: { tone: Tone; pulse?: boolean }) {
  const cfg = TONE[tone]
  return (
    <span className="relative inline-flex w-2 h-2 shrink-0" aria-hidden="true">
      {pulse && (
        <span className={cn('absolute inset-0 rounded-full opacity-60 animate-ping', cfg.dot)} />
      )}
      <span className={cn('relative inline-flex w-2 h-2 rounded-full', cfg.dot, cfg.halo && `shadow-[0_0_6px] ${cfg.halo}`)} />
    </span>
  )
}

// ── W58-f SectionHeader — icon + uppercase title + optional dim description ─
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
  const cfg = TONE[tone]
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className={cn('size-3 shrink-0', cfg.text)} aria-hidden="true" />
      <span className="text-[10px] font-bold text-[#dde1ed] uppercase tracking-wider">
        {title}
      </span>
      {description && (
        <span className="text-[9.5px] text-[#7e8aaa] italic truncate">
          {description}
        </span>
      )}
      {trailing && <span className="ml-auto">{trailing}</span>}
    </div>
  )
}

// ── W58-f KpiTile — premium KPI card with Lucide icon + tabular-nums ────────
// Used by WhyExplanation for the Champion-vs-Challenger agreement metric.
// The tile renders: a small label row (icon + uppercase title), a large
// tone-coloured value (tabular-nums so the digits don't shift), a
// quality bar that fills based on the `quality` percentage, and an
// optional hint line. The structure mirrors AIMLCommandCenter's KpiTile
// so the panels visually share a single metric-card grammar.
function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  quality,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: string
  tone: Tone
  quality: number
}) {
  const cfg = TONE[tone]
  const pct = Math.max(0, Math.min(100, quality))
  return (
    <div
      className={cn(
        'relative rounded-lg p-2.5 border overflow-hidden flex flex-col gap-1',
        cfg.border,
        cfg.bg,
      )}
      data-tone={tone}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-3 shrink-0', cfg.text)} aria-hidden="true" />
        <span className={cn('text-[9.5px] font-bold uppercase tracking-wider', cfg.label)}>
          {label}
        </span>
      </div>
      <div className={cn('mono text-base font-bold tabular-nums leading-tight', cfg.text)}>
        {value}
      </div>
      {/* Quality bar — fills from 0% to 100% in the matching tone. */}
      <div className="relative h-1 bg-[#0e1015] rounded-full overflow-hidden mt-0.5">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-300', cfg.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && (
        <div className="text-[9px] text-[#7e8aaa] italic leading-tight mt-0.5 truncate" title={hint}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── W58-f ShapBar — SHAP-style horizontal contribution bar ──────────────────
// Renders a horizontal track centered on zero. A bar extends right for
// positive contributions (pushes toward YES, green) or left for
// negative (pushes toward NO, red). Magnitude is normalized against
// `maxAbs` so the longest bar in the visible set reads as 100% of the
// half-width.
function ShapBar({
  contribution,
  maxAbs,
  positive,
}: {
  contribution: number
  maxAbs: number
  positive: boolean
}) {
  // Normalized magnitude in [0, 1] — clamped so a stray large value
  // doesn't blow past the half-width.
  const mag = maxAbs > 0 ? Math.min(1, Math.abs(contribution) / maxAbs) : 0
  const widthPct = mag * 50 // half-width since bar starts from center
  return (
    <div
      className="relative h-1.5 bg-[#0e1015] rounded-full overflow-hidden border border-[#1f2335]"
      role="img"
      aria-label={`SHAP contribution: ${contribution >= 0 ? '+' : ''}${contribution.toFixed(4)} (${positive ? 'pushes YES' : 'pushes NO'})`}
    >
      {/* Center zero line */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#3e4560]" aria-hidden="true" />
      {positive ? (
        <div
          className="absolute top-0 bottom-0 left-1/2 bg-emerald-500/70 rounded-r-full transition-all duration-300"
          style={{ width: `${widthPct}%` }}
        />
      ) : (
        <div
          className="absolute top-0 bottom-0 right-1/2 bg-red-500/70 rounded-l-full transition-all duration-300"
          style={{ width: `${widthPct}%` }}
        />
      )}
    </div>
  )
}

// ── 1. AIPredictionLabel ─────────────────────────────────────────────────

export interface AIPredictionLabelProps {
  /** Optional override for the visible label text. Defaults to "AI Prediction:". */
  label?: string
  /** Optional sub-label rendered in italic gray immediately after the
   *  main label — e.g. "(model-generated)". */
  hint?: string
  /** Optional size variant. `sm` for compact panels (MLPanel), `md` for
   *  full-width cards (AIMLCommandCenter KPI strip). */
  size?: 'sm' | 'md'
  /** Optional className passthrough. */
  className?: string
}

export function AIPredictionLabel({
  label = 'AI Prediction:',
  hint,
  size = 'sm',
  className,
}: AIPredictionLabelProps) {
  const iconSize = size === 'sm' ? 'size-3' : 'size-3.5'
  const textSize = size === 'sm' ? 'text-[9.5px]' : 'text-[10.5px]'
  return (
    <span
      className={cn(
        // W58-f — refined label with subtle backdrop tint so the AI prefix
        // reads as a "chip" rather than bare text. The `inline-flex` +
        // `items-center gap-1` keep the Sparkles icon vertically aligned
        // with the text baseline.
        'inline-flex items-center gap-1 uppercase tracking-wider font-bold',
        'text-blue-300 px-1.5 py-0.5 rounded',
        'bg-blue-500/[0.06] border border-blue-500/20',
        textSize,
        className,
      )}
      data-testid="ai-prediction-label"
    >
      <Sparkles className={cn(iconSize, 'text-blue-400 shrink-0')} aria-hidden="true" />
      <span>{label}</span>
      {hint && (
        <span className="text-[#5a637a] italic normal-case font-normal tracking-normal ml-0.5">
          {hint}
        </span>
      )}
    </span>
  )
}

// ── 2. ConfidenceBadge ────────────────────────────────────────────────────

export type ConfidenceTone = 'high' | 'medium' | 'low' | 'unknown'

export interface ConfidenceBadgeProps {
  /** Confidence in [0, 1]. Values ≥0.70 → green (high), 0.50–0.70 → amber
   *  (medium), <0.50 → red (low). null/undefined → neutral grey. */
  value: number | null | undefined
  /** Whether to render the percentage text inline with the label. */
  showLabel?: boolean
  /** Optional className passthrough. */
  className?: string
}

export function confidenceTone(value: number | null | undefined): ConfidenceTone {
  if (value == null || !Number.isFinite(value)) return 'unknown'
  if (value >= 0.70) return 'high'
  if (value >= 0.50) return 'medium'
  return 'low'
}

export function ConfidenceBadge({
  value,
  showLabel = true,
  className,
}: ConfidenceBadgeProps) {
  const tone = confidenceTone(value)
  const pct = value == null || !Number.isFinite(value)
    ? '—'
    : `${(value * 100).toFixed(0)}%`
  // W58-f — refined badge with halo ring + tone-coloured shadow.
  // The dot gets a soft glow via `shadow-[0_0_6px]` + the tone halo so
  // the badge reads as a "lit" pill at a glance. The pct span stays
  // standalone (its own <span>{pct}</span>) so `screen.getByText('65%')`
  // exact-match resolves against that element alone.
  const cfg = {
    high: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      text: 'text-green-400',
      dot: 'bg-green-400',
      label: 'Confidence',
      halo: 'shadow-green-500/30',
      ring: 'shadow-[0_0_8px]',
    },
    medium: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
      label: 'Confidence',
      halo: 'shadow-amber-500/30',
      ring: 'shadow-[0_0_8px]',
    },
    low: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-400',
      dot: 'bg-red-400',
      label: 'Confidence',
      halo: 'shadow-red-500/30',
      ring: 'shadow-[0_0_8px]',
    },
    unknown: {
      bg: 'bg-[#1f2335]',
      border: 'border-[#3e4560]',
      text: 'text-[#7e8aaa]',
      dot: 'bg-[#5a637a]',
      label: 'Confidence',
      halo: '',
      ring: '',
    },
  }[tone]
  return (
    <span
      data-testid="confidence-badge"
      data-confidence-tone={tone}
      role="img"
      aria-label={`Confidence: ${pct} (${tone})`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5',
        'text-[10px] font-bold mono whitespace-nowrap tabular-nums',
        cfg.bg,
        cfg.border,
        cfg.text,
        className,
      )}
    >
      {/* PulseDot — dot + halo for the live/medium/high tones; static
          for the unknown tone. */}
      <span className="relative inline-flex w-1.5 h-1.5 shrink-0" aria-hidden="true">
        {tone !== 'unknown' && (
          <span className={cn('absolute inset-0 rounded-full opacity-50 animate-ping', cfg.dot)} />
        )}
        <span
          className={cn(
            'relative inline-flex w-1.5 h-1.5 rounded-full',
            cfg.dot,
            cfg.ring,
            cfg.halo,
          )}
        />
      </span>
      {showLabel && <span className="opacity-80">{cfg.label}:</span>}
      <span>{pct}</span>
    </span>
  )
}

// ── 3. NotAGuaranteeInline ────────────────────────────────────────────────

export interface NotAGuaranteeInlineProps {
  /** Optional override for the disclaimer body text. */
  text?: string
  /** Compact variant renders the disclaimer as a single line of small
   *  amber text without the bordered card. Default = false (bordered card). */
  compact?: boolean
  className?: string
}

export function NotAGuaranteeInline({
  text = 'NOT A GUARANTEE — calibrated estimate, not a forecast. Always combine AI signals with independent risk management.',
  compact = false,
  className,
}: NotAGuaranteeInlineProps) {
  if (compact) {
    return (
      <span
        className={cn(
          // W58-f — compact variant with subtle backdrop tint so the
          // disclaimer reads as a chip rather than bare amber text.
          'inline-flex items-start gap-1 text-[9px] text-amber-300/90 italic leading-tight',
          'px-1.5 py-0.5 rounded bg-amber-500/[0.04]',
          className,
        )}
        role="note"
        data-testid="not-a-guarantee-inline"
      >
        <ShieldAlert className="size-2.5 shrink-0 mt-px text-amber-400" aria-hidden="true" />
        <span>{text}</span>
      </span>
    )
  }
  return (
    <div
      className={cn(
        // W58-f — bordered variant refined with backdrop blur, gradient
        // left accent, and a small ShieldAlert icon chip in the header
        // row so the disclaimer reads as a structured alert rather than
        // a flat amber bar.
        'relative flex items-start gap-2 text-[10px] text-amber-200',
        'bg-amber-500/10 backdrop-blur-sm',
        'border border-amber-500/30 rounded-md px-2.5 py-1.5',
        'overflow-hidden',
        className,
      )}
      role="alert"
      data-testid="not-a-guarantee-inline"
    >
      {/* Gradient left accent — a 2px amber bar pinned to the left edge
          so the disclaimer reads as an "alert" pattern (mirrors the
          confirmation dialog's risk-banner treatment). */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500/60"
      />
      <ShieldAlert className="size-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
      <span>
        <strong className="font-bold">NOT A GUARANTEE.</strong> {text}
      </span>
    </div>
  )
}

// ── 4. ModelStatusStrip ───────────────────────────────────────────────────

export type DriftLevel = 'ok' | 'warning' | 'critical' | 'unknown'

export interface ModelStatusStripProps {
  /** Model version string, e.g. "v1.155.0". */
  version: string | null | undefined
  /** Training-data epoch (seconds). Rendered as "Trained: 2h ago". */
  trainedAt: number | null | undefined
  /** Drift level — derived from the drift detector's `status` field. */
  drift: DriftLevel
  /** Whether the model is calibrated (ECE < target). */
  calibrated: boolean
  /** Feature freshness — seconds since the last feature vector update. */
  featureAgeSeconds: number | null | undefined
  /** Optional className passthrough. */
  className?: string
}

export function driftLevelFromStatus(status: string | null | undefined): DriftLevel {
  if (!status) return 'unknown'
  const s = status.toUpperCase()
  if (s === 'HEALTHY' || s === 'OK') return 'ok'
  if (s.includes('MODERATE') || s.includes('WARN')) return 'warning'
  if (s.includes('SIGNIFICANT') || s.includes('CRITICAL') || s.includes('DRIFT')) return 'critical'
  return 'unknown'
}

function fmtRelAge(epochSeconds: number | null | undefined): string {
  if (epochSeconds == null || !Number.isFinite(epochSeconds) || epochSeconds <= 0) return '—'
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - epochSeconds))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function fmtFeatureAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s old`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`
  return `${Math.round(seconds / 3600)}h old`
}

// W58-f — refined drift config. The `dot` field replaces the bare emoji
// with a coloured PulseDot so the tone is legible even on platforms
// whose emoji rendering is monochrome. The `emoji` is preserved as a
// secondary indicator (alongside the dot) for users who can see color
// emojis.
const DRIFT_CFG: Record<DriftLevel, { emoji: string; label: string; tone: Tone }> = {
  ok: { emoji: '🟢', label: 'OK', tone: 'good' },
  warning: { emoji: '🟡', label: 'Warning', tone: 'warn' },
  critical: { emoji: '🔴', label: 'Critical', tone: 'poor' },
  unknown: { emoji: '⚪', label: 'Unknown', tone: 'neutral' },
}

// W58-f — small icon-chip wrapper that puts a tone-tinted backdrop
// behind a Lucide icon so the icon reads as a "chip" rather than a bare
// glyph. Used by ModelStatusStrip's per-cell icon.
function IconChip({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  const cfg = TONE[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center size-4 rounded',
        cfg.bg,
        cfg.border,
        'border',
      )}
      aria-hidden="true"
    >
      <Icon className={cn('size-2.5', cfg.text)} />
    </span>
  )
}

export function ModelStatusStrip({
  version,
  trainedAt,
  drift,
  calibrated,
  featureAgeSeconds,
  className,
}: ModelStatusStripProps) {
  const driftCfg = DRIFT_CFG[drift]
  const versionStr = version || '—'
  const trainedStr = fmtRelAge(trainedAt)
  const featureStr = fmtFeatureAge(featureAgeSeconds)
  const calibratedTone: Tone = calibrated ? 'good' : 'warn'
  return (
    <div
      data-testid="model-status-strip"
      className={cn(
        // W58-f — refined strip with subtle gradient backdrop + better
        // per-cell separation. The strip reads as a "model readiness
        // bar" rather than a flat row of text.
        'flex flex-wrap items-center gap-x-3 gap-y-1.5',
        'bg-gradient-to-r from-[#0e1015] to-[#13161e]',
        'border border-[#1f2335] rounded-md px-2.5 py-1.5',
        'text-[10px] tabular-nums',
        className,
      )}
    >
      {/* Version cell */}
      <span
        className="inline-flex items-center gap-1"
        title="Active model version"
      >
        <IconChip icon={Sparkles} tone="info" />
        <span className="text-[#5a637a] uppercase tracking-wider font-bold">Version</span>
        <span className="mono text-blue-300 font-bold" data-testid="status-version">
          {versionStr}
        </span>
      </span>
      <span className="inline-flex items-center text-[#3e4560]" aria-hidden="true">|</span>
      {/* Trained cell */}
      <span
        className="inline-flex items-center gap-1"
        title="Last training cycle"
      >
        <IconChip icon={Clock} tone="info" />
        <span className="text-[#5a637a] uppercase tracking-wider font-bold">Trained</span>
        <span className="mono text-cyan-300" data-testid="status-trained">
          {trainedStr}
        </span>
      </span>
      <span className="inline-flex items-center text-[#3e4560]" aria-hidden="true">|</span>
      {/* Drift cell */}
      <span
        className="inline-flex items-center gap-1"
        title="Concept drift level"
      >
        <PulseDot tone={driftCfg.tone} pulse={drift !== 'unknown'} />
        <span className="text-[#5a637a] uppercase tracking-wider font-bold">Drift</span>
        <span
          className={cn('font-bold inline-flex items-center gap-1', TONE[driftCfg.tone].text)}
          data-testid="status-drift"
        >
          <span aria-hidden="true">{driftCfg.emoji}</span>
          {driftCfg.label}
        </span>
      </span>
      <span className="inline-flex items-center text-[#3e4560]" aria-hidden="true">|</span>
      {/* Calibration cell */}
      <span
        className="inline-flex items-center gap-1"
        title="Isotonic calibration status"
      >
        <IconChip icon={Gauge} tone={calibratedTone} />
        <span className="text-[#5a637a] uppercase tracking-wider font-bold">Calibration</span>
        <span
          className={cn('font-bold', TONE[calibratedTone].text)}
          data-testid="status-calibration"
        >
          {calibrated ? 'Calibrated' : 'Needs recalibration'}
        </span>
      </span>
      <span className="inline-flex items-center text-[#3e4560]" aria-hidden="true">|</span>
      {/* Feature freshness cell */}
      <span
        className="inline-flex items-center gap-1"
        title="Feature vector freshness"
      >
        <IconChip icon={RefreshCw} tone="good" />
        <span className="text-[#5a637a] uppercase tracking-wider font-bold">Features</span>
        <span className="mono text-emerald-300" data-testid="status-features">
          {featureStr}
        </span>
      </span>
    </div>
  )
}

// ── 5. WhyExplanation ──────────────────────────────────────────────────────

export interface FeatureContribution {
  name: string
  /** The feature's value at prediction time (raw). */
  value: number | string | null
  /** The signed SHAP contribution. Positive pushes toward YES, negative
   *  toward NO. */
  contribution: number
}

export interface WhyExplanationProps {
  /** Top contributing features (already sorted by |contribution| desc). At
   *  most 3 will be rendered; the spec calls for "top 3". */
  features: FeatureContribution[]
  /** Champion-vs-challenger agreement in [0, 1]. null when there is no
   *  challenger registered. */
  agreement: number | null | undefined
  /** Optional header label override. Defaults to "Why?". */
  headerLabel?: string
  /** Optional extra content rendered below the feature list (e.g. a
   *  "view full SHAP" link). */
  children?: ReactNode
  /** Optional controlled-expanded prop. Defaults to uncontrolled. */
  defaultExpanded?: boolean
  className?: string
}

// W58-f — helper that maps agreement in [0, 1] to a tone for the KpiTile.
function agreementTone(agreement: number | null | undefined): Tone {
  if (agreement == null || !Number.isFinite(agreement)) return 'neutral'
  if (agreement >= 0.9) return 'good'
  if (agreement >= 0.7) return 'warn'
  return 'poor'
}

// W58-f — helper that maps agreement in [0, 1] to a quality bar percentage
// for the KpiTile.
function agreementQuality(agreement: number | null | undefined): number {
  if (agreement == null || !Number.isFinite(agreement)) return 0
  return Math.max(0, Math.min(100, agreement * 100))
}

export function WhyExplanation({
  features,
  agreement,
  headerLabel = 'Why?',
  children,
  defaultExpanded = false,
  className,
}: WhyExplanationProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const top = features.slice(0, 3)
  const agreementPct = agreement == null || !Number.isFinite(agreement)
    ? null
    : `${(agreement * 100).toFixed(0)}%`
  // W58-f — normalized max |contribution| for the SHAP bar widths.
  const maxAbs = top.reduce((m, f) => Math.max(m, Math.abs(f.contribution)), 0)
  const aTone = agreementTone(agreement)
  const aQuality = agreementQuality(agreement)
  return (
    <div
      data-testid="why-explanation"
      className={cn(
        // W58-f — refined card with subtle backdrop tint + better
        // header treatment. The card reads as a structured "Why?"
        // sub-panel rather than a flat stack of rows.
        'border border-blue-500/20 bg-blue-500/[0.03] rounded-md overflow-hidden',
        'backdrop-blur-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={cn(
          // W58-f — refined header with hover tint, smooth transition,
          // and a leading Sparkles icon chip.
          'w-full flex items-center justify-between px-2.5 py-1.5',
          'text-[10.5px] font-bold text-blue-300',
          'hover:bg-blue-500/10 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40',
        )}
        data-testid="why-toggle"
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3 text-blue-400 shrink-0" aria-hidden="true" />
          <span>{headerLabel}</span>
          <span className="text-[#5a637a] font-normal normal-case tracking-normal italic ml-1">
            (top 3 contributing features)
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="size-3 transition-transform duration-200" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 transition-transform duration-200" aria-hidden="true" />
        )}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-2.5">
          {/* W58-f — SectionHeader for the top contributing features list. */}
          <div>
            <SectionHeader
              icon={TrendingUp}
              title="Top Contributing Features"
              description="SHAP attribution"
              tone="info"
            />
            {top.length === 0 ? (
              <div className="text-[10px] text-[#7e8aaa] italic px-1 py-1">
                No feature attributions available for this prediction.
              </div>
            ) : (
              <div className="space-y-1.5">
                {top.map((f, i) => {
                  const positive = f.contribution >= 0
                  return (
                    <div
                      key={`${f.name}-${i}`}
                      className="space-y-1 px-1 py-1 rounded hover:bg-[#13161e] transition-colors"
                      data-testid="why-feature-row"
                    >
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-[10.5px]">
                        <span
                          className="mono text-[#dde1ed] truncate"
                          title={f.name}
                        >
                          {f.name}
                        </span>
                        <span
                          className="mono text-[#7e8aaa] text-right tabular-nums"
                          title="Feature value at prediction time"
                        >
                          val={f.value == null ? '—' : String(f.value)}
                        </span>
                        <span
                          className={cn(
                            'mono font-bold text-right inline-flex items-center gap-0.5 justify-end tabular-nums',
                            positive ? 'text-emerald-400' : 'text-red-400',
                          )}
                          title="SHAP contribution to P(YES)"
                        >
                          {positive ? (
                            <TrendingUp className="size-2.5" aria-hidden="true" />
                          ) : (
                            <TrendingDown className="size-2.5" aria-hidden="true" />
                          )}
                          {positive ? '+' : ''}
                          {f.contribution.toFixed(4)}
                        </span>
                      </div>
                      {/* W58-f — SHAP-style horizontal contribution bar
                          below the row. Bar extends right (green) for
                          positive contributions, left (red) for
                          negative. */}
                      <ShapBar
                        contribution={f.contribution}
                        maxAbs={maxAbs}
                        positive={positive}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {/* W58-f — Champion vs Challenger section with KpiTile for the
              agreement metric. The KpiTile pattern replaces the old flat
              "Agreement: 92%" line with a premium metric card that
              includes a quality bar showing agreement strength. */}
          <div>
            <div className="border-t border-[#1f2335] pt-2">
              <SectionHeader
                icon={Gauge}
                title="Champion vs Challenger"
                description="ensemble agreement"
                tone={aTone}
              />
              {agreementPct == null ? (
                <span
                  className="mono text-[#7e8aaa] italic text-[10px]"
                  data-testid="why-agreement"
                >
                  no challenger registered
                </span>
              ) : (
                <div data-testid="why-agreement">
                  <KpiTile
                    icon={Gauge}
                    label="Agreement"
                    value={`Agreement: ${agreementPct}`}
                    hint={
                      agreement != null && agreement >= 0.9
                        ? 'Champion + challenger aligned'
                        : agreement != null && agreement >= 0.7
                          ? 'Partial disagreement — review challenger'
                          : 'Significant disagreement — investigate'
                    }
                    tone={aTone}
                    quality={aQuality}
                  />
                </div>
              )}
            </div>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
